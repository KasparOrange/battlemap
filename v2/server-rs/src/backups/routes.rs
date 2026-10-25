//! The game backup routes:
//!
//! | Route | What |
//! |---|---|
//! | `GET /api/games` | `{games: GameSummary[]}` (`where: "server"`), newest save first |
//! | `PUT /api/games/<id>` | body: the `Game` (≤ 25 MB) → its `GameSummary`; the previous latest becomes a version |
//! | `GET /api/games/<id>[?at=<savedAt>]` | the `Game` (latest, or that version); header `x-saved-at` |
//! | `GET /api/games/<id>/versions` | `{versions: [{savedAt, bytes, latest}]}`, newest first |
//! | `DELETE /api/games/<id>` | moved to the trash (30 days) → 204 |

use std::collections::HashMap;
use std::time::Instant;

use axum::extract::{Query, Request, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use percent_encoding::percent_decode_str;

use super::{BackupError, GAME_ID};
use crate::fsx::now_ms;
use crate::http::internal;
use crate::http::respond::{BodyError, ok, over, read_body, refuse};
use crate::state::Shared;
use crate::wire::{GameList, Versions};

/// `/api/games` (GET).
pub async fn collection(State(state): State<Shared>, req: Request) -> Response {
    if req.method() != Method::GET {
        return refuse(StatusCode::METHOD_NOT_ALLOWED, "GET");
    }
    match state.backups.list().await {
        Ok(games) => ok(&GameList { games }),
        Err(e) => internal("games", &e),
    }
}

/// `/api/games/<id>[/versions]`.
pub async fn item(State(state): State<Shared>, Query(q): Query<HashMap<String, String>>, req: Request) -> Response {
    let rest = req.uri().path().trim_start_matches("/api/games/").to_string();
    let mut parts = rest.split('/');
    let raw_id = parts.next().unwrap_or("");
    let sub = parts.next();
    let more = parts.next().is_some();
    let id = percent_decode_str(raw_id).decode_utf8().map(|s| s.to_string()).unwrap_or_default();
    if !GAME_ID.is_match(&id) || more {
        return refuse(StatusCode::BAD_REQUEST, "game ids are 1–64 letters, digits, _ or -");
    }
    match sub {
        Some("versions") => {
            if req.method() != Method::GET {
                return refuse(StatusCode::METHOD_NOT_ALLOWED, "GET");
            }
            return match state.backups.versions(&id).await {
                Ok(v) if !v.is_empty() => ok(&Versions { versions: v }),
                Ok(_) => refuse(StatusCode::NOT_FOUND, "no backup of that game"),
                Err(e) => internal("games", &e),
            };
        }
        Some(_) => return refuse(StatusCode::NOT_FOUND, "not found"),
        None => {}
    }
    match *req.method() {
        Method::PUT => put(&state, &id, req).await,
        Method::GET => get(&state, &id, q.get("at").map(String::as_str)).await,
        Method::DELETE => match state.backups.remove(&id, now_ms()).await {
            Ok(true) => {
                tracing::info!(target: "games", id = %id, "Backup deleted");
                StatusCode::NO_CONTENT.into_response()
            }
            Ok(false) => refuse(StatusCode::NOT_FOUND, "no backup of that game"),
            Err(e) => internal("games", &e),
        },
        _ => refuse(StatusCode::METHOD_NOT_ALLOWED, "GET, PUT or DELETE"),
    }
}

async fn put(state: &Shared, id: &str, req: Request) -> Response {
    let t0 = Instant::now();
    let (parts, body) = req.into_parts();
    let bytes = match read_body(&parts.headers, body, state.config.max_game_bytes).await {
        Ok(b) => b,
        Err(BodyError::TooLarge(limit)) => return refuse(StatusCode::PAYLOAD_TOO_LARGE, format!("the game is {}", over(limit))),
        Err(e) => return refuse(StatusCode::BAD_REQUEST, e.to_string()),
    };
    match state.backups.put(&state.files, &state.library, id, &bytes, now_ms()).await {
        Ok(summary) => {
            tracing::info!(target: "games", id, name = %summary.name, maps = summary.map_names.len(), bytes = bytes.len(), ms = t0.elapsed().as_millis() as u64, "Backed up");
            ok(&summary)
        }
        Err(BackupError::Bad(reason)) => {
            tracing::warn!(target: "games", id, reason = %reason, "Backup refused");
            refuse(StatusCode::BAD_REQUEST, reason)
        }
        Err(BackupError::Internal(e)) => internal("games", &e),
    }
}

async fn get(state: &Shared, id: &str, at: Option<&str>) -> Response {
    match state.backups.get(id, at).await {
        Ok(Some(stored)) => {
            let mut res = String::from(stored.game.get()).into_response();
            let h = res.headers_mut();
            h.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
            h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            if let Ok(v) = HeaderValue::from_str(&stored.saved_at) {
                h.insert("x-saved-at", v);
            }
            h.insert("access-control-expose-headers", HeaderValue::from_static("x-saved-at"));
            res
        }
        Ok(None) => refuse(StatusCode::NOT_FOUND, "no backup of that game"),
        Err(e) => internal("games", &e),
    }
}
