//! The server's entry: settings, logger, start; a graceful stop on SIGTERM / SIGINT (every
//! socket gets 1001, open requests may finish for 10 s, the log is flushed).

use std::process::ExitCode;
use std::time::Duration;

use battlemap_server::config::Config;

#[tokio::main]
async fn main() -> ExitCode {
    let log = match battlemap_server::log::init(env!("CARGO_PKG_VERSION")) {
        Ok(g) => g,
        Err(e) => {
            eprintln!("battlemap-server: logging could not start: {e}");
            return ExitCode::FAILURE;
        }
    };
    let config = match Config::from_env() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(target: "lifecycle", error = format!("{e:#}"), "Bad settings");
            log.stop("bad settings");
            return ExitCode::FAILURE;
        }
    };
    tracing::info!(target: "lifecycle", max_upload_bytes = config.max_upload_bytes, max_game_bytes = config.max_game_bytes, max_pixels = config.max_pixels,
        image_slots = config.image_slots, fetch_slots = config.fetch_slots, hello_timeout_ms = config.hello_timeout.as_millis() as u64, "Settings");
    let server = match battlemap_server::start(config, log.shipper()).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(target: "lifecycle", error = format!("{e:#}"), "Could not start");
            log.stop("start failed");
            return ExitCode::FAILURE;
        }
    };
    let signal = wait_for_signal().await;
    tracing::info!(target: "lifecycle", signal, "Stopping");
    server.stop(Duration::from_secs(10)).await;
    log.stop(signal);
    ExitCode::SUCCESS
}

/// Waits for SIGTERM or SIGINT; returns its name.
#[cfg(unix)]
async fn wait_for_signal() -> &'static str {
    use tokio::signal::unix::{SignalKind, signal};
    let (Ok(mut term), Ok(mut int)) = (signal(SignalKind::terminate()), signal(SignalKind::interrupt())) else {
        let _ = tokio::signal::ctrl_c().await;
        return "sigint";
    };
    tokio::select! {
        _ = term.recv() => "sigterm",
        _ = int.recv() => "sigint",
    }
}

/// Waits for Ctrl-C.
#[cfg(not(unix))]
async fn wait_for_signal() -> &'static str {
    let _ = tokio::signal::ctrl_c().await;
    "sigint"
}
