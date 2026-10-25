//! battlemap v2's server in Rust: one binary for the VPS and (next) the TV box's Android shell,
//! for LAN play. Same routes and behaviour as the Bun server in `../server` — the contract
//! suite in `../server-contract` checks both — plus the review's fixes (pixel limit before
//! decoding, streamed uploads and link fetches, caps on parallel work, graceful stop).
//!
//! | Module | Job |
//! |---|---|
//! | [`config`] | settings from the environment |
//! | [`http`] | the router, CORS, the outcome log, the built app, `/health`, `/api/tables` |
//! | [`relay`] | rooms, routing, hardening; the WebSocket glue |
//! | [`files`] | uploads, "Store as", thumbnails, the content-addressed store |
//! | [`library`] | the shared map library |
//! | [`backups`] | game backups and their versions |
//! | [`fetch`] | the link fetch with its address guard |
//! | [`log`] | mwlog setup, `/log`, counted hot paths |
//! | [`cleanup`] | the temp cleanup |
//! | [`schema`] | the shared types' JSON Schema (generated from `shared/`) |
//! | [`wire`] | every JSON type the server writes; TypeScript for the server-only ones |
//! | [`fsx`] | atomic writes, JSON files, per-key locks, times |
//!
//! See `../docs/server-rs.md`.

pub mod backups;
pub mod cleanup;
pub mod config;
pub mod fetch;
pub mod files;
pub mod fsx;
pub mod http;
pub mod library;
pub mod log;
pub mod relay;
pub mod schema;
pub mod state;
pub mod wire;

use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use anyhow::{Context, Result};
use tokio::sync::{Semaphore, oneshot};
use tokio::task::JoinHandle;

use crate::config::Config;
use crate::fetch::download::Fetcher;
use crate::fetch::guard::GuardedResolver;
use crate::files::store::FileStore;
use crate::files::upload::ImageWork;
use crate::state::{AppState, Shared};
use crate::wire::ServerMessage;

/// A running server.
pub struct Running {
    /// The address it listens on.
    pub addr: SocketAddr,
    /// The shared state (stores, relay).
    pub state: Shared,
    stop: Option<oneshot::Sender<()>>,
    serve: JoinHandle<()>,
    timers: Vec<JoinHandle<()>>,
}

impl Running {
    /// Stops gracefully: every socket gets 1001, open requests may finish for up to `grace`,
    /// the timers end.
    pub async fn stop(mut self, grace: Duration) {
        self.state.relay.shutdown();
        if let Some(tx) = self.stop.take() {
            let _ = tx.send(());
        }
        if tokio::time::timeout(grace, &mut self.serve).await.is_err() {
            tracing::warn!(target: "lifecycle", grace_s = grace.as_secs(), "Requests still open after the grace time, dropped");
            self.serve.abort();
        }
        for t in &self.timers {
            t.abort();
        }
        tracing::info!(target: "lifecycle", "Stopped");
    }
}

/// Reads the build id from the app's `build.json` (`{build}`), or `None`.
pub async fn read_build(app_dir: &std::path::Path) -> Option<String> {
    let bytes = tokio::fs::read(app_dir.join("build.json")).await.ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("build")?.as_str().map(String::from)
}

/// Starts the server: the stores in the data folder, the relay, the timers (cleanup, build
/// watch, relay sweep, log counts) and the HTTP + WebSocket listener.
///
/// # Errors
/// When the data folder can't be made, the link fetcher can't be built or the port can't be
/// bound.
pub async fn start(config: Config, shipper: mwlog::Shipper) -> Result<Running> {
    schema::warm_up();
    for sub in ["files", "games", "uploads", "trash"] {
        let dir = config.data_dir.join(sub);
        tokio::fs::create_dir_all(&dir)
            .await
            .with_context(|| format!("mkdir {}", dir.display()))?;
    }
    let build = Arc::new(RwLock::new(read_build(&config.app_dir).await));
    let relay = Arc::new(relay::Relay::new(config.relay.clone(), config.hello_timeout, build.clone()));
    let fetcher = Fetcher::new(
        GuardedResolver {
            test_addr: config.fetch_test_addr,
        },
        config.max_upload_bytes,
        config.fetch_timeout,
        config.fetch_max_redirects,
    )?;
    if config.fetch_test_addr.is_some() {
        tracing::warn!(target: "lifecycle", "BATTLEMAP_FETCH_TEST_ADDR is set: .test names go to the test address (tests only)");
    }
    let state: Shared = Arc::new(AppState {
        files: FileStore::new(&config.data_dir),
        images: ImageWork::new(config.image_slots, config.max_pixels),
        library: library::Library::new(&config.data_dir),
        backups: backups::Backups::new(&config.data_dir, config.game_versions),
        relay: relay.clone(),
        fetcher,
        fetch_slots: Arc::new(Semaphore::new(config.fetch_slots)),
        build: build.clone(),
        started_ms: fsx::now_ms(),
        shipper,
        config,
    });
    let c = &state.config;

    let mut timers = Vec::new();
    {
        let (dir, up, trash, every) = (c.data_dir.clone(), c.upload_max_age_days, c.trash_max_age_days, c.cleanup_every);
        timers.push(tokio::spawn(async move {
            cleanup::cleanup(&dir, up, trash).await;
            if every.is_zero() {
                return;
            }
            let mut tick = tokio::time::interval(every);
            tick.tick().await;
            loop {
                tick.tick().await;
                cleanup::cleanup(&dir, up, trash).await;
            }
        }));
    }
    if !c.build_poll.is_zero() {
        let (app_dir, every, relay, build) = (c.app_dir.clone(), c.build_poll, relay.clone(), build.clone());
        timers.push(tokio::spawn(async move {
            let mut tick = tokio::time::interval(every);
            loop {
                tick.tick().await;
                let Some(now) = read_build(&app_dir).await else { continue };
                let before = build.read().map(|b| b.clone()).unwrap_or(None);
                if before.as_deref() != Some(now.as_str()) {
                    tracing::info!(target: "lifecycle", from = before.as_deref(), to = %now, "New app build");
                    if let Ok(mut b) = build.write() {
                        *b = Some(now.clone());
                    }
                    relay.broadcast_all(&ServerMessage::ServerBuild { build: now });
                }
            }
        }));
    }
    if !c.relay.sweep.is_zero() {
        let (every, relay) = (c.relay.sweep, relay.clone());
        timers.push(tokio::spawn(async move {
            let mut tick = tokio::time::interval(every);
            loop {
                tick.tick().await;
                relay.sweep();
            }
        }));
    }
    timers.push(tokio::spawn(log::summaries()));

    let listener = tokio::net::TcpListener::bind((c.host, c.port))
        .await
        .with_context(|| format!("bind {}:{}", c.host, c.port))?;
    let addr = listener.local_addr()?;
    tracing::info!(target: "lifecycle", port = addr.port(), host = %c.host, app_dir = %c.app_dir.display(), data_dir = %c.data_dir.display(), build = state.build().as_deref(), server_build = %c.server_build, "Listening");
    let app = http::router(state.clone()).into_make_service_with_connect_info::<SocketAddr>();
    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    let serve = tokio::spawn(async move {
        let stopped = async {
            let _ = stop_rx.await;
        };
        if let Err(e) = axum::serve(listener, app).with_graceful_shutdown(stopped).await {
            tracing::error!(target: "lifecycle", error = %e, "The listener failed");
        }
    });
    Ok(Running {
        addr,
        state,
        stop: Some(stop_tx),
        serve,
        timers,
    })
}
