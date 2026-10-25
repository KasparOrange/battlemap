//! The server's HTTP side: the router and what every request goes through.
//!
//! | Route | What | Where |
//! |---|---|---|
//! | `GET /health` | ok, builds, uptime, rooms, sockets, library and backup counts, the log shipper | [`health`] |
//! | `POST /log` | log batches from the app (mwlog-ts browser forwarder) → MwLog | [`crate::log::browser_log`] |
//! | `GET /api/tables` | the rooms with a TV online (the companion's table picker) | [`tables`] |
//! | `GET /ws` | the relay (WebSocket) | [`crate::relay::socket`] |
//! | `POST /files`, `GET /files/…`, `GET /uploads/…` | the file store | [`crate::files::routes`] |
//! | `/api/library…` | the shared map library | [`crate::library::routes`] |
//! | `/api/games…` | game backups | [`crate::backups::routes`] |
//! | `GET /api/fetch?url=` | a link's map file | [`crate::fetch::routes`] |
//! | `GET /` → `/app/`, `GET /app/…` | the built app | [`app`] |
//!
//! Every answer carries the CORS headers; an `OPTIONS` anywhere is a 204 preflight; anything
//! else unknown is 404 `{error}`. Every request's outcome is logged ([`around`]): one line per
//! API call (warn for 4xx, error for 5xx, plus "slow" over a second); app files, file downloads,
//! health checks and log batches as 10-second counts with failures on their own line.

pub mod app;
pub mod respond;

use std::net::SocketAddr;
use std::time::Instant;

use axum::Router;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use percent_encoding::percent_decode_str;

use crate::fsx::{iso, now_ms};
use crate::relay::socket::client_ip;
use crate::state::Shared;
use crate::wire::{Health, Tables};
use respond::{add_cors, ok, refuse};

/// The whole router.
pub fn router(state: Shared) -> Router {
    Router::new()
        .route("/health", any(health))
        .route("/log", post(crate::log::browser_log))
        .route("/api/tables", get(tables))
        .route("/ws", get(crate::relay::socket::upgrade))
        .route("/files", post(crate::files::routes::upload))
        .route("/files/{*name}", get(crate::files::routes::get_file))
        .route("/uploads/{*name}", get(crate::files::routes::get_upload))
        .route("/api/library", any(crate::library::routes::collection))
        .route("/api/library/{*id}", any(crate::library::routes::item))
        .route("/api/games", any(crate::backups::routes::collection))
        .route("/api/games/{*rest}", any(crate::backups::routes::item))
        .route("/api/fetch", any(crate::fetch::routes::fetch))
        .route("/", get(to_app))
        .route("/app", get(to_app))
        .route("/app/", get(app::serve))
        .route("/app/{*path}", get(app::serve))
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        .layer(middleware::from_fn_with_state(state.clone(), around))
        .layer(tower_http::catch_panic::CatchPanicLayer::custom(|_| {
            tracing::error!(target: "http", "A request handler panicked");
            refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error")
        }))
        .with_state(state)
}

async fn not_found() -> Response {
    refuse(StatusCode::NOT_FOUND, "not found")
}

/// `/` and `/app` → 302 to `/app/`.
async fn to_app() -> Response {
    (StatusCode::FOUND, [(header::LOCATION, "/app/")]).into_response()
}

/// A 500 for a failure of the server, logged with its cause.
pub fn internal(area: &'static str, e: &anyhow::Error) -> Response {
    tracing::error!(target: "http", area, error = format!("{e:#}"), "Request failed");
    refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error")
}

/// The percent-decoded rest of a path after `prefix`, or `None` when it isn't UTF-8.
pub fn decoded_tail(path: &str, prefix: &str) -> Option<String> {
    percent_decode_str(path.strip_prefix(prefix)?)
        .decode_utf8()
        .ok()
        .map(|s| s.into_owned())
}

/// What every request goes through: the preflight, the CORS headers, the outcome log.
async fn around(State(_state): State<Shared>, ConnectInfo(peer): ConnectInfo<SocketAddr>, req: Request, next: Next) -> Response {
    if req.method() == Method::OPTIONS {
        let mut res = StatusCode::NO_CONTENT.into_response();
        add_cors(res.headers_mut());
        return res;
    }
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let ip = client_ip(req.headers(), peer.ip());
    let t0 = Instant::now();
    let mut res = next.run(req).await;
    add_cors(res.headers_mut());
    let elapsed = t0.elapsed();
    let ms = (elapsed.as_secs_f64() * 10_000.0).round() / 10.0;
    let status = res.status().as_u16();
    let get_like = method == Method::GET || method == Method::HEAD;
    let counter = if path.starts_with("/app/") {
        Some(&crate::log::APP_FILES)
    } else if get_like && path.starts_with("/files/") {
        Some(&crate::log::FILE_DOWNLOADS)
    } else if get_like && path == "/health" {
        Some(&crate::log::HEALTH_CHECKS)
    } else if path == "/log" {
        Some(&crate::log::LOG_BATCHES)
    } else {
        None
    };
    let short: String = if path.len() > 120 {
        format!("{}…", &path[..path.floor_char_boundary(120)])
    } else {
        path.clone()
    };
    match counter {
        Some(c) if status < 400 => c.record(elapsed),
        _ if path == "/ws" && status == 101 => tracing::debug!(target: "http", ip = %ip, "WebSocket upgraded"),
        _ if status >= 500 => tracing::error!(target: "http", method = %method, path = %short, status, ms, ip = %ip, "Request failed"),
        _ if status >= 400 => tracing::warn!(target: "http", method = %method, path = %short, status, ms, ip = %ip, "Request refused"),
        _ => tracing::info!(target: "http", method = %method, path = %short, status, ms, ip = %ip, "Request"),
    }
    if elapsed.as_millis() > 1_000 && path != "/ws" {
        tracing::warn!(target: "http", method = %method, path = %short, status, ms, "Slow request");
    }
    res
}

/// `GET /health`.
async fn health(State(state): State<Shared>) -> Response {
    let library = state.library.count().await.ok();
    let games = state.backups.count().await.ok();
    ok(&Health {
        ok: library.is_some() && games.is_some(),
        build: state.build(),
        server_build: state.config.server_build.clone(),
        server: "rust".into(),
        uptime_s: now_ms().saturating_sub(state.started_ms) / 1000,
        started_at: iso(state.started_ms),
        relay: state.relay.stats(),
        library: library.map(|n| n as u32),
        games: games.map(|n| n as u32),
        mwlog: state.shipper.health(),
    })
}

/// `GET /api/tables`.
async fn tables(State(state): State<Shared>) -> Response {
    ok(&Tables {
        tables: state.relay.tables(),
    })
}
