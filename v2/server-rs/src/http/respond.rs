//! Small helpers every route uses: the CORS headers, JSON answers, refusals with a reason the
//! app can show (`{error}`), and reading a request body with a size cap — into memory or
//! streamed to a file.

use axum::body::Body;
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use futures_util::StreamExt;
use http_body_util::BodyStream;
use serde::Serialize;
use std::path::Path;
use tokio::io::AsyncWriteExt;

/// The CORS headers every answer carries (the shell's bundle runs on its own origin).
pub const CORS: [(&str, &str); 4] = [
    ("access-control-allow-origin", "*"),
    ("access-control-allow-methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS"),
    ("access-control-allow-headers", "content-type, x-trace"),
    ("access-control-max-age", "86400"),
];

/// Adds the CORS headers to a header map (kept when already set).
pub fn add_cors(headers: &mut HeaderMap) {
    for (k, v) in CORS {
        headers.entry(HeaderName::from_static(k)).or_insert(HeaderValue::from_static(v));
    }
}

/// A JSON answer, never cached.
pub fn json<T: Serialize>(status: StatusCode, body: &T) -> Response {
    match serde_json::to_vec(body) {
        Ok(bytes) => (
            status,
            [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")],
            bytes,
        )
            .into_response(),
        Err(e) => {
            tracing::error!(target: "http", error = %e, "Answer not serialisable");
            refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error")
        }
    }
}

/// A 200 JSON answer.
pub fn ok<T: Serialize>(body: &T) -> Response {
    json(StatusCode::OK, body)
}

/// A refusal: `{error}` with a status.
pub fn refuse(status: StatusCode, error: impl Into<String>) -> Response {
    let body = crate::wire::ErrorBody { error: error.into() };
    match serde_json::to_vec(&body) {
        Ok(bytes) => (
            status,
            [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")],
            bytes,
        )
            .into_response(),
        Err(_) => status.into_response(),
    }
}

/// "over 2 MB" — the size words of a cap, as the Bun server says them.
pub fn over(limit: u64) -> String {
    format!("over {} MB", (limit as f64 / 1024.0 / 1024.0).round() as u64)
}

/// Why a body couldn't be read.
#[derive(Debug, thiserror::Error)]
pub enum BodyError {
    /// More bytes than the cap (declared or sent).
    #[error("over the limit of {0} bytes")]
    TooLarge(u64),
    /// The connection broke while reading.
    #[error("the body broke off: {0}")]
    Broken(String),
    /// The temp file couldn't be written.
    #[error("could not write the body: {0}")]
    Io(#[from] std::io::Error),
}

/// The declared `content-length`, if any.
fn declared(headers: &HeaderMap) -> Option<u64> {
    headers.get(header::CONTENT_LENGTH)?.to_str().ok()?.trim().parse().ok()
}

/// Reads a body into memory, refusing more than `limit` bytes without reading it all.
///
/// # Errors
/// [`BodyError::TooLarge`] over the cap, [`BodyError::Broken`] when the client went away.
pub async fn read_body(headers: &HeaderMap, body: Body, limit: u64) -> Result<Vec<u8>, BodyError> {
    if declared(headers).is_some_and(|n| n > limit) {
        return Err(BodyError::TooLarge(limit));
    }
    let mut out = Vec::with_capacity(declared(headers).unwrap_or(0).min(limit).min(16 * 1024 * 1024) as usize);
    let mut stream = BodyStream::new(body);
    while let Some(frame) = stream.next().await {
        let frame = frame.map_err(|e| BodyError::Broken(e.to_string()))?;
        if let Ok(data) = frame.into_data() {
            if out.len() as u64 + data.len() as u64 > limit {
                return Err(BodyError::TooLarge(limit));
            }
            out.extend_from_slice(&data);
        }
    }
    Ok(out)
}

/// Streams a body into a file, refusing more than `limit` bytes; memory stays at one chunk.
/// Returns the byte count. The caller removes the file on error.
///
/// # Errors
/// As [`read_body`], plus [`BodyError::Io`] when the file can't be written.
pub async fn body_to_file(headers: &HeaderMap, body: Body, limit: u64, path: &Path, mut each: impl FnMut(&[u8])) -> Result<u64, BodyError> {
    if declared(headers).is_some_and(|n| n > limit) {
        return Err(BodyError::TooLarge(limit));
    }
    let mut file = tokio::fs::File::create(path).await?;
    let mut total = 0u64;
    let mut stream = BodyStream::new(body);
    while let Some(frame) = stream.next().await {
        let frame = frame.map_err(|e| BodyError::Broken(e.to_string()))?;
        if let Ok(data) = frame.into_data() {
            total += data.len() as u64;
            if total > limit {
                return Err(BodyError::TooLarge(limit));
            }
            each(&data);
            file.write_all(&data).await?;
        }
    }
    file.flush().await?;
    Ok(total)
}

/// A response with the given status, content type and bytes, never cached.
pub fn bytes(status: StatusCode, content_type: &str, data: Vec<u8>) -> Response {
    let mut res = (status, data).into_response();
    if let Ok(v) = HeaderValue::from_str(content_type) {
        res.headers_mut().insert(header::CONTENT_TYPE, v);
    }
    res.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    res
}
