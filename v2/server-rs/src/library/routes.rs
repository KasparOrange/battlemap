//! The shared library routes:
//!
//! | Route | What |
//! |---|---|
//! | `GET /api/library` | `{entries: LibraryEntry[]}`, newest first |
//! | `GET /api/library/<id>` | one entry |
//! | `POST /api/library` | `{map, thumb?, originalBytes?, note?, addedAt?}` → `{entry, added}` (201 new, 200 replaced) |
//! | `DELETE /api/library/<id>` | → `{removed: entry}`; the files stay (games keep their maps) |

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{Method, StatusCode};
use axum::response::Response;
use serde_json::Value;

use super::EntryError;
use crate::fsx::now_ms;
use crate::http::respond::{BodyError, json, ok, over, read_body, refuse};
use crate::http::{decoded_tail, internal};
use crate::state::Shared;
use crate::wire::{LibraryList, LibraryPut, LibraryRemoved, MapInfoView};

/// `/api/library` (GET, POST).
pub async fn collection(State(state): State<Shared>, req: Request) -> Response {
    match *req.method() {
        Method::GET => match state.library.list().await {
            Ok(entries) => ok(&LibraryList { entries }),
            Err(e) => internal("library", &e),
        },
        Method::POST => {
            let (parts, body) = req.into_parts();
            add(&state, &parts.headers, body).await
        }
        _ => refuse(StatusCode::METHOD_NOT_ALLOWED, "GET or POST"),
    }
}

async fn add(state: &Shared, headers: &axum::http::HeaderMap, body: Body) -> Response {
    let bytes = match read_body(headers, body, state.config.max_entry_bytes).await {
        Ok(b) => b,
        Err(BodyError::TooLarge(limit)) => return refuse(StatusCode::PAYLOAD_TOO_LARGE, format!("the entry is {}", over(limit))),
        Err(e) => return refuse(StatusCode::BAD_REQUEST, e.to_string()),
    };
    let value: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(e) => return refuse(StatusCode::BAD_REQUEST, format!("not JSON: {e}")),
    };
    match state.library.put(&state.files, &value, now_ms()).await {
        Ok((entry, added)) => {
            if let Ok(m) = serde_json::from_value::<MapInfoView>(entry.map.clone()) {
                tracing::info!(target: "library", id = %m.id, name = %m.name, kind = %m.kind, squares = format!("{}x{}", m.grid.cols, m.grid.rows), bytes = m.picture.bytes, thumb = entry.thumb.is_some(), "{}", if added { "Map added" } else { "Map updated" });
            }
            json(
                if added { StatusCode::CREATED } else { StatusCode::OK },
                &LibraryPut { entry, added },
            )
        }
        Err(EntryError::Bad(reason)) => {
            tracing::warn!(target: "library", reason = %reason, "Entry refused");
            refuse(StatusCode::BAD_REQUEST, reason)
        }
        Err(EntryError::Internal(e)) => internal("library", &e),
    }
}

/// `/api/library/<id>` (GET, DELETE).
pub async fn item(State(state): State<Shared>, req: Request) -> Response {
    let Some(id) = decoded_tail(req.uri().path(), "/api/library/") else {
        return refuse(StatusCode::BAD_REQUEST, "bad id");
    };
    match *req.method() {
        Method::GET => match state.library.get(&id).await {
            Ok(Some(entry)) => ok(&entry),
            Ok(None) => refuse(StatusCode::NOT_FOUND, "no such map in the shared library"),
            Err(e) => internal("library", &e),
        },
        Method::DELETE => match state.library.remove(&id).await {
            Ok(Some(removed)) => {
                let name = removed.map.get("name").and_then(Value::as_str).unwrap_or("").to_string();
                tracing::info!(target: "library", id = %id, name = %name, "Map removed");
                ok(&LibraryRemoved { removed })
            }
            Ok(None) => refuse(StatusCode::NOT_FOUND, "no such map in the shared library"),
            Err(e) => internal("library", &e),
        },
        _ => refuse(StatusCode::METHOD_NOT_ALLOWED, "GET or DELETE"),
    }
}
