//! Serves the built app at `/app/`: files from `APP_DIR`, `index.html` for a path without an
//! extension (client-side routes), 404 for a missing file. Hashed assets (`assets/…`) are
//! cached forever, everything else never (a new build must reach the next load). Paths are
//! percent-decoded and must stay inside the app folder.

use std::path::{Component, Path, PathBuf};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use percent_encoding::percent_decode_str;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::state::Shared;

/// A relative path that can't leave its folder (no `..`, no root, no drive), or `None`.
fn safe_relative(rel: &str) -> Option<PathBuf> {
    let p = Path::new(rel);
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    Some(out)
}

/// `GET|HEAD /app/…`.
pub async fn serve(State(state): State<Shared>, req: Request) -> Response {
    let raw = req.uri().path().strip_prefix("/app/").unwrap_or("");
    let Ok(decoded) = percent_decode_str(raw).decode_utf8() else {
        return (StatusCode::BAD_REQUEST, "bad path").into_response();
    };
    let mut rel = decoded.into_owned();
    if rel.is_empty() || rel.ends_with('/') {
        rel.push_str("index.html");
    }
    let Some(rel_path) = safe_relative(&rel) else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    let root = &state.config.app_dir;
    let mut path = root.join(&rel_path);
    if !tokio::fs::metadata(&path).await.is_ok_and(|m| m.is_file()) {
        if rel_path.extension().is_some() {
            return (StatusCode::NOT_FOUND, "not found").into_response();
        }
        path = root.join("index.html");
        if !tokio::fs::try_exists(&path).await.unwrap_or(false) {
            return (StatusCode::NOT_FOUND, "the app is not built (bun run build)").into_response();
        }
    }
    let immutable = rel.starts_with("assets/");
    match ServeFile::new(&path).oneshot(req).await {
        Ok(res) => {
            let mut res = res.map(Body::new);
            let cache = if immutable {
                "public, max-age=31536000, immutable"
            } else {
                "no-cache"
            };
            res.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
            res
        }
        Err(e) => {
            tracing::error!(target: "http", path = %path.display(), error = %e, "App file not served");
            (StatusCode::INTERNAL_SERVER_ERROR, "server error").into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_stay_inside() {
        assert_eq!(safe_relative("assets/a.js"), Some(PathBuf::from("assets/a.js")));
        assert_eq!(safe_relative("./index.html"), Some(PathBuf::from("index.html")));
        assert_eq!(safe_relative("../../package.json"), None);
        assert_eq!(safe_relative("/etc/passwd"), None);
    }
}
