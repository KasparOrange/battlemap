//! The file routes:
//!
//! | Route | What |
//! |---|---|
//! | `POST /files?ext=&format=` | store an upload → [`UploadResult`](crate::wire::UploadResult) (201); a picture big enough to stream starts its tile cut ([`cut_at_upload`](super::tiles::cut_at_upload)) |
//! | `GET /files/<hash>.<ext>` | a stored file, cached forever (`immutable`) |
//! | `GET /uploads/<name>` | a link fetch's file (temporary, 7 days) |
//!
//! The upload body streams to a temp file in the store's folder while it is hashed, so a
//! 200 MB upload costs one chunk of memory until picture work (in an image slot) needs it.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::LazyLock;

use axum::body::Body;
use axum::extract::{Query, Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use regex::Regex;
use sha2::{Digest, Sha256};
use tower::ServiceExt;
use tower_http::services::ServeFile;

use super::convert::StoreFormat;
use super::store::FILE_NAME;
use super::upload::{UploadError, store_upload};
use crate::http::respond::{BodyError, json, over, refuse};
use crate::state::Shared;
use crate::wire::{FileExt, FileRef};

/// Names of link-fetch files in `uploads/`.
pub static UPLOAD_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[0-9a-f]{12}\.(png|jpg|webp|pdf|dd2vtt|uvtt)$").expect("valid pattern"));

/// The content type of a stored or fetched file, by extension.
pub fn content_type(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "webp" => "image/webp",
        "json" | "dd2vtt" | "uvtt" => "application/json",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

/// `GET|HEAD /files/<hash>.<ext>`.
pub async fn get_file(State(state): State<Shared>, req: Request) -> Response {
    let name = req.uri().path().trim_start_matches("/files/").to_string();
    let Some(m) = FILE_NAME.captures(&name) else {
        return refuse(StatusCode::NOT_FOUND, "no such file");
    };
    let path = state.files.dir.join(&name);
    let ext = m.get(2).map_or("", |e| e.as_str());
    if let (Some(up), Some(file_ext)) = (&state.upstream, FileExt::parse(ext))
        && !tokio::fs::try_exists(&path).await.unwrap_or(false)
    {
        let hash = m.get(1).map_or("", |h| h.as_str());
        if let Err(e) = up.pull_file(&state, hash, file_ext).await {
            tracing::debug!(target: "upstream", file = %name, error = format!("{e:#}"), "Not pulled from upstream");
        }
    }
    serve(path, ext, "public, max-age=31536000, immutable", req).await
}

/// `GET|HEAD /uploads/<name>`.
pub async fn get_upload(State(state): State<Shared>, req: Request) -> Response {
    let name = req.uri().path().trim_start_matches("/uploads/").to_string();
    if !UPLOAD_NAME.is_match(&name) {
        return refuse(StatusCode::NOT_FOUND, "no such file");
    }
    let ext = name.rsplit('.').next().unwrap_or("").to_string();
    serve(
        state.config.data_dir.join("uploads").join(&name),
        &ext,
        "private, max-age=3600",
        req,
    )
    .await
}

/// A file from disk (tower-http: streaming, HEAD, ranges, conditional requests), or a 404.
pub async fn serve(path: PathBuf, ext: &str, cache: &'static str, req: Request) -> Response {
    if !tokio::fs::metadata(&path).await.is_ok_and(|m| m.is_file()) {
        return refuse(StatusCode::NOT_FOUND, "no such file");
    }
    match ServeFile::new(&path).oneshot(req).await {
        Ok(res) => {
            let mut res = res.map(Body::new);
            if res.status().is_success() || res.status() == StatusCode::NOT_MODIFIED {
                res.headers_mut()
                    .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type(ext)));
                res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
            }
            res
        }
        Err(e) => {
            tracing::error!(target: "files", path = %path.display(), error = %e, "File not served");
            refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error")
        }
    }
}

/// `POST /files?ext=&format=`.
pub async fn upload(State(state): State<Shared>, Query(q): Query<HashMap<String, String>>, headers: HeaderMap, body: Body) -> Response {
    let asked = q.get("ext").filter(|s| !s.is_empty());
    let ext = match asked {
        None => None,
        Some(raw) => match FileExt::parse(raw) {
            Some(e) => Some(e),
            None => {
                return refuse(
                    StatusCode::BAD_REQUEST,
                    format!("ext must be png, jpg, webp, json or pdf (got {raw})"),
                );
            }
        },
    };
    let format_raw = q.get("format").map_or("asis".to_string(), |f| f.to_ascii_lowercase());
    let Some(format) = StoreFormat::parse(&format_raw) else {
        return refuse(
            StatusCode::BAD_REQUEST,
            format!("format must be webp, jpeg, png or asis (got {format_raw})"),
        );
    };
    if let Err(e) = tokio::fs::create_dir_all(&state.files.dir).await {
        tracing::error!(target: "files", error = %e, "Store folder missing");
        return refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error");
    }
    let tmp = state.files.temp_path();
    let mut hasher = Sha256::new();
    let limit = state.config.max_upload_bytes;
    let bytes = match crate::http::respond::body_to_file(&headers, body, limit, &tmp, |chunk| hasher.update(chunk)).await {
        Ok(n) => n,
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp).await;
            return match e {
                BodyError::TooLarge(limit) => refuse(StatusCode::PAYLOAD_TOO_LARGE, format!("the file is {}", over(limit))),
                BodyError::Broken(why) => {
                    tracing::warn!(target: "files", reason = %why, "Upload broke off");
                    refuse(StatusCode::BAD_REQUEST, "the upload broke off")
                }
                BodyError::Io(io) => {
                    tracing::error!(target: "files", error = %io, "Upload not written");
                    refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error")
                }
            };
        }
    };
    let hash = hex::encode(hasher.finalize());
    match store_upload(&state.files, &state.images, tmp, &hash, bytes, ext, format).await {
        Ok(r) => {
            tracing::info!(target: "files", hash = &r.hash[..12], ext = r.ext.as_str(), bytes = r.bytes, asked = asked.map(String::as_str), format = format.name(),
                original_bytes = r.original_bytes, note = r.note.as_deref(), width = r.width, height = r.height, thumb = r.thumb.is_some(), "Stored");
            if let (Some(w), Some(h)) = (r.width, r.height) {
                let source = FileRef {
                    hash: r.hash.clone(),
                    ext: r.ext,
                    bytes: r.bytes,
                };
                super::tiles::cut_at_upload(&state, source, w, h);
            }
            json(StatusCode::CREATED, &r)
        }
        Err(UploadError::Bad(reason)) => {
            tracing::warn!(target: "files", bytes, asked = asked.map(String::as_str), format = format.name(), reason = %reason, "Upload refused");
            refuse(StatusCode::BAD_REQUEST, reason)
        }
        Err(UploadError::Internal(e)) => {
            tracing::error!(target: "files", bytes, error = format!("{e:#}"), "Upload failed");
            refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error")
        }
    }
}

/// A 405 for the file paths with another method.
pub async fn wrong_method() -> impl IntoResponse {
    refuse(StatusCode::METHOD_NOT_ALLOWED, "GET")
}
