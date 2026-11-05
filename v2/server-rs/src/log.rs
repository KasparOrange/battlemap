//! The server's logging: logbook (rust/), tenant `battlemap`, app `battlemap-v2-rs` (the Bun server is
//! `battlemap-v2`; both run side by side on the VPS). The UI's lines that come in at `POST /log`
//! are re-logged as `app=battlemap-v2-ui`, as the Bun server does. Credentials from
//! `~/.config/logbook/battlemap.env` (or the environment); `LOGBOOK_DISABLE=1` ships nothing (tests).
//!
//! Every module logs with `tracing` and a `target:` naming its area (`http`, `relay`, `files`,
//! `library`, `games`, `fetch`, `cleanup`, `lifecycle`). Hot paths (app files, file downloads,
//! health checks, log batches, relayed messages) are logbook tallies: one line per 10 s, written
//! by the shipper (the last window at stop).

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::Value;

use crate::http::respond::{BodyError, read_body};
use crate::relay::socket::client_ip;
use crate::state::Shared;

/// The app name of the server's own lines.
pub const APP: &str = "battlemap-v2-rs";
/// The app name of the UI's re-logged lines.
pub const UI_APP: &str = "battlemap-v2-ui";
/// Largest `/log` batch body (logbook (ts/)'s limit).
pub const UI_MAX_BYTES: u64 = 64 * 1024;

/// App files served (one line per 10 s).
pub static APP_FILES: logbook::Tally = logbook::Tally::new("http", "App files");
/// Stored files downloaded.
pub static FILE_DOWNLOADS: logbook::Tally = logbook::Tally::new("http", "File downloads");
/// `/health` answered.
pub static HEALTH_CHECKS: logbook::Tally = logbook::Tally::new("http", "Health checks");
/// `/log` batches taken.
pub static LOG_BATCHES: logbook::Tally = logbook::Tally::new("http", "Log batches");
/// Peer messages relayed.
pub static RELAY_MESSAGES: logbook::Tally = logbook::Tally::new("relay", "Messages");

/// Starts the logging stack. Never fails: problems are in the guard's `error()`.
pub fn init(version: &'static str) -> logbook::Guard {
    logbook::init(logbook::Init {
        app: APP,
        tenant: "battlemap",
        version,
        git: option_env!("GIT_HASH"),
        debug_targets: &[
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
        ui_app: Some(UI_APP),
        layers: stderr_layer(),
        ..Default::default()
    })
}

/// Starts the logging stack for the embedded server ([`crate::embed`]): daily files under
/// `state_dir/logs/`, plus the host's `layers` (the ring the shell drains, logcat).
/// Never fails: a second subscriber is reported in the guard's `error()`.
pub fn init_embedded(version: &'static str, state_dir: std::path::PathBuf, layers: Vec<logbook::parts::BoxLayer>) -> logbook::Guard {
    logbook::init(logbook::Init {
        app: APP,
        tenant: "battlemap",
        version,
        git: option_env!("GIT_HASH"),
        debug_targets: &["battlemap_server", "http", "relay", "files", "library", "games", "fetch", "cleanup", "lifecycle", "upstream"],
        tui: true, // a host process: never write to its stderr
        state_dir: Some(state_dir),
        ui_app: Some(UI_APP),
        layers,
        ..Default::default()
    })
}

/// With `BATTLEMAP_LOG_STDERR=1`, every line also goes to stderr as text (systemd's journal,
/// the contract runner's log files) — logbook only writes to stderr when it is a terminal.
fn stderr_layer() -> Vec<logbook::parts::BoxLayer> {
    if std::env::var("BATTLEMAP_LOG_STDERR").is_ok_and(|v| v == "1") {
        vec![Box::new(
            tracing_subscriber::fmt::layer().with_writer(std::io::stderr).with_ansi(false),
        )]
    } else {
        Vec::new()
    }
}

/// `POST /log`: a batch of the app's log lines (logbook (ts/) browser forwarder; `application/json`
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
    // A table server on the LAN holds no logbook credentials: its upstream ships the batch. When
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
    let fields = serde_json::json!({ "ip": client_ip(&headers, peer.ip()) });
    match logbook::ui::relog_with(&state.shipper, &batch, logbook::ui::Relog { fields, ..Default::default() }) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(reason @ "too many lines") => refuse_batch(StatusCode::PAYLOAD_TOO_LARGE, reason, text.len() as u64),
        Err(_) => refuse_batch(StatusCode::BAD_REQUEST, "not a JSON batch", text.len() as u64),
    }
}

fn refuse_batch(status: StatusCode, reason: &'static str, bytes: u64) -> Response {
    tracing::warn!(target: "log", reason, bytes, "Browser batch refused");
    (status, reason).into_response()
}
