//! `GET /api/fetch?url=<link>` → [`Fetched`](crate::wire::Fetched) (`{url, name, bytes, kind,
//! ext}`; the app then downloads `url` from the server and imports it), or 422 `{error}` with a
//! reason the app shows ("Couldn't get the map: <error>"). At most `FETCH_SLOTS` fetches run at
//! once; more are refused with 429 (review #26: no authentication, so no unbounded work).

use std::collections::HashMap;
use std::time::Instant;

use axum::extract::{Query, Request, State};
use axum::http::{Method, StatusCode};
use axum::response::Response;

use super::link::fetch_link;
use crate::http::respond::{ok, refuse};
use crate::state::Shared;

/// `/api/fetch` (GET).
pub async fn fetch(State(state): State<Shared>, Query(q): Query<HashMap<String, String>>, req: Request) -> Response {
    if req.method() != Method::GET {
        return refuse(StatusCode::METHOD_NOT_ALLOWED, "GET");
    }
    let link = q.get("url").cloned().unwrap_or_default();
    let host = url::Url::parse(link.trim())
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_default();
    let Ok(_slot) = state.fetch_slots.clone().try_acquire_owned() else {
        tracing::warn!(target: "fetch", host = %host, "Too many link fetches at once, refused");
        return refuse(
            StatusCode::TOO_MANY_REQUESTS,
            "the server is fetching other links — try again in a moment",
        );
    };
    let t0 = Instant::now();
    match fetch_link(&link, &state.fetcher, &state.config.data_dir.join("uploads"), &state.images).await {
        Ok(got) => {
            tracing::info!(target: "fetch", host = %host, kind = ?got.kind, ext = %got.ext, bytes = got.bytes, name = %got.name, ms = t0.elapsed().as_millis() as u64, "Link fetched");
            ok(&got)
        }
        Err(e) => {
            tracing::warn!(target: "fetch", host = %host, reason = %e.0, ms = t0.elapsed().as_millis() as u64, "Link refused");
            refuse(StatusCode::UNPROCESSABLE_ENTITY, e.0)
        }
    }
}
