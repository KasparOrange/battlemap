//! The server's logging: mwlog-rs, tenant `battlemap`, app `battlemap-v2-rs` (the Bun server is
//! `battlemap-v2`; both run side by side on the VPS). The UI's lines that come in at `POST /log`
//! are re-logged as `app=battlemap-v2-ui`, as the Bun server does. Credentials from
//! `~/.config/mwlog/battlemap.env` (or the environment); `MWLOG_DISABLE=1` ships nothing (tests).
//!
//! Every module logs with `tracing` and a `target:` naming its area (`http`, `relay`, `files`,
//! `library`, `games`, `fetch`, `cleanup`, `lifecycle`). Hot paths (app files, file downloads,
//! health checks, log batches, relayed messages) are counted and logged as one line per 10 s.

use std::time::Duration;

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value};

use crate::http::respond::{BodyError, read_body};
use crate::relay::socket::client_ip;
use crate::state::Shared;

/// The app name of the server's own lines.
pub const APP: &str = "battlemap-v2-rs";
/// The app name of the UI's re-logged lines.
pub const UI_APP: &str = "battlemap-v2-ui";
/// Largest `/log` batch body (mwlog-ts's limit).
pub const UI_MAX_BYTES: u64 = 64 * 1024;

/// App files served (counted, one line per 10 s).
pub static APP_FILES: mwlog::Summary = mwlog::Summary::new();
/// Stored files downloaded.
pub static FILE_DOWNLOADS: mwlog::Summary = mwlog::Summary::new();
/// `/health` answered.
pub static HEALTH_CHECKS: mwlog::Summary = mwlog::Summary::new();
/// `/log` batches taken.
pub static LOG_BATCHES: mwlog::Summary = mwlog::Summary::new();
/// Peer messages relayed.
pub static RELAY_MESSAGES: mwlog::Summary = mwlog::Summary::new();

/// Starts the logging stack.
///
/// # Errors
/// When the local log folder can't be made.
pub fn init(version: &'static str) -> std::io::Result<mwlog::Guard> {
    mwlog::init(mwlog::Init {
        app: APP,
        tenant: "battlemap",
        version,
        git: option_env!("GIT_HASH"),
        crates: &[
            "battlemap_server",
            "http",
            "relay",
            "files",
            "library",
            "games",
            "fetch",
            "cleanup",
            "lifecycle",
        ],
        layers: stderr_layer(),
        ..Default::default()
    })
}

/// Starts the logging stack for the embedded server ([`crate::embed`]): daily files under
/// `state_dir/logs/`, plus the host's `layers` (the ring the shell drains, logcat).
///
/// # Errors
/// When a global subscriber is already installed.
pub fn init_embedded(version: &'static str, state_dir: std::path::PathBuf, layers: Vec<mwlog::BoxLayer>) -> std::io::Result<mwlog::Guard> {
    mwlog::init(mwlog::Init {
        app: APP,
        tenant: "battlemap",
        version,
        git: option_env!("GIT_HASH"),
        crates: &["battlemap_server", "http", "relay", "files", "library", "games", "fetch", "cleanup", "lifecycle", "upstream"],
        tui: true, // a host process: never write to its stderr
        state_dir: Some(state_dir),
        layers,
        ..Default::default()
    })
}

/// With `BATTLEMAP_LOG_STDERR=1`, every line also goes to stderr as text (systemd's journal,
/// the contract runner's log files) — mwlog only writes to stderr when it is a terminal.
fn stderr_layer() -> Vec<mwlog::BoxLayer> {
    if std::env::var("BATTLEMAP_LOG_STDERR").is_ok_and(|v| v == "1") {
        vec![Box::new(
            tracing_subscriber::fmt::layer().with_writer(std::io::stderr).with_ansi(false),
        )]
    } else {
        Vec::new()
    }
}

/// Logs the counted hot paths every 10 s (one line each when something happened).
pub async fn summaries() {
    let mut tick = tokio::time::interval(Duration::from_secs(10));
    loop {
        tick.tick().await;
        for (s, area, what) in [
            (&APP_FILES, "http", "App files"),
            (&FILE_DOWNLOADS, "http", "File downloads"),
            (&HEALTH_CHECKS, "http", "Health checks"),
            (&LOG_BATCHES, "http", "Log batches"),
            (&RELAY_MESSAGES, "relay", "Messages"),
        ] {
            if let Some(n) = s.take_due() {
                match area {
                    "relay" => tracing::info!(target: "relay", n = n.n, secs = n.secs, "{what}"),
                    _ => tracing::info!(target: "http", n = n.n, avg_ms = n.avg_ms, max_ms = n.max_ms, secs = n.secs, "{what}"),
                }
            }
        }
    }
}

/// `POST /log`: a batch of the app's log lines (mwlog-ts browser forwarder; `application/json`
/// or `text/plain` from `sendBeacon`) → 204; 400 for a batch that isn't JSON, 413 for one over
/// 64 kB or 200 lines.
pub async fn browser_log(
    State(state): State<Shared>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let text = match read_body(&headers, body, UI_MAX_BYTES).await {
        Ok(b) => b,
        Err(BodyError::TooLarge(_)) => return refuse_batch(StatusCode::PAYLOAD_TOO_LARGE, "too large", UI_MAX_BYTES),
        Err(_) => return (StatusCode::BAD_REQUEST, "bad request").into_response(),
    };
    let Ok(batch) = serde_json::from_slice::<Value>(&text) else {
        return refuse_batch(StatusCode::BAD_REQUEST, "not a JSON batch", text.len() as u64);
    };
    // A table server on the LAN holds no MwLog credentials: its upstream ships the batch. When
    // that fails the page's outbox keeps the batch (503) and tries again later.
    if !state.shipper.is_active()
        && let Some(up) = &state.upstream
    {
        let ct = headers.get(axum::http::header::CONTENT_TYPE).and_then(|v| v.to_str().ok());
        return match up.forward_log(text.into(), ct).await {
            Ok(()) => StatusCode::NO_CONTENT.into_response(),
            Err(e) => {
                tracing::debug!(target: "upstream", error = format!("{e:#}"), "Log batch not forwarded");
                (StatusCode::SERVICE_UNAVAILABLE, "upstream unreachable").into_response()
            }
        };
    }
    let mut extra = Map::new();
    extra.insert("ip".into(), Value::String(client_ip(&headers, peer.ip())));
    match mwlog::ui::relog_as(&state.shipper, &batch, &extra, Some(UI_APP)) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(reason @ "too many lines") => refuse_batch(StatusCode::PAYLOAD_TOO_LARGE, reason, text.len() as u64),
        Err(_) => refuse_batch(StatusCode::BAD_REQUEST, "not a JSON batch", text.len() as u64),
    }
}

fn refuse_batch(status: StatusCode, reason: &'static str, bytes: u64) -> Response {
    tracing::warn!(target: "log", reason, bytes, "Browser batch refused");
    (status, reason).into_response()
}
