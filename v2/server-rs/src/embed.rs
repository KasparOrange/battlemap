//! The server embedded in another program — the Android shell, through the JNI glue in
//! [`crate::android`] — instead of running as its own process. One server per process,
//! started and stopped by calls instead of signals; its log lines also go into a small ring
//! the host drains ([`take_logs`]) and writes into its own log (the shell forwards them to the
//! page, which ships them to MwLog like every other shell line).
//!
//! Settings come as `KEY=VALUE` lines with the same names as the environment of the standalone
//! binary ([`Config::from_lookup`]), plus `STATE_DIR` (mwlog's daily files, default
//! `<DATA_DIR>/../state`) and `HOME` (where mwlog looks for `.config/mwlog/battlemap.env`).
//!
//! See `../docs/server-rs.md` "Embedded in the shell".

use std::collections::{HashMap, VecDeque};
use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde_json::json;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::Context as LayerContext;

use crate::Running;
use crate::config::Config;

/// Log lines kept for the host at most (older ones are dropped and counted).
pub const RING_MAX: usize = 500;

/// Where a formatted line may go besides the ring (Android: logcat).
pub type LineSink = fn(Level, &str);

struct Ring {
    lines: VecDeque<serde_json::Value>,
    dropped: u64,
}

static RING: Mutex<Ring> = Mutex::new(Ring {
    lines: VecDeque::new(),
    dropped: 0,
});

/// The tracing layer that formats every `info`/`warn`/`error` line as `area: message k=v …`
/// into the ring, and hands every line (debug too) to the optional [`LineSink`]. Lines of
/// mwlog's own targets (`mwlog_ui`: the page's lines re-logged at `/log`) are skipped.
pub struct RingLayer {
    sink: Option<LineSink>,
}

impl RingLayer {
    /// A ring layer; `sink` also gets each formatted line (with its level).
    pub fn new(sink: Option<LineSink>) -> Self {
        Self { sink }
    }
}

/// Collects an event's message and fields as text.
#[derive(Default)]
struct Text {
    msg: String,
    fields: String,
}

impl Visit for Text {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.msg.push_str(value);
        } else {
            let _ = write!(self.fields, " {}={}", field.name(), value);
        }
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            let _ = write!(self.msg, "{value:?}");
        } else {
            let _ = write!(self.fields, " {}={:?}", field.name(), value);
        }
    }
}

impl<S: Subscriber> tracing_subscriber::Layer<S> for RingLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: LayerContext<'_, S>) {
        let meta = event.metadata();
        // The page's own lines re-logged at `/log` (mwlog's `mwlog_ui`): the shell forwards
        // ring lines to the page, which sends them back to `/log` — keeping them out of the
        // ring (and logcat, where the page's console already is) breaks that loop.
        if meta.target().starts_with("mwlog") {
            return;
        }
        let mut text = Text::default();
        event.record(&mut text);
        let line = format!("{}: {}{}", meta.target(), text.msg, text.fields);
        let level = *meta.level();
        if let Some(sink) = self.sink {
            sink(level, &line);
        }
        if level > Level::INFO {
            return; // debug/trace stay out of the ring
        }
        let level_name = match level {
            Level::ERROR => "error",
            Level::WARN => "warn",
            _ => "info",
        };
        let entry = json!({ "t": crate::fsx::now_ms(), "level": level_name, "msg": line });
        let mut ring = RING.lock().unwrap_or_else(|p| p.into_inner());
        ring.lines.push_back(entry);
        while ring.lines.len() > RING_MAX {
            ring.lines.pop_front();
            ring.dropped += 1;
        }
    }
}

/// The ring's lines since the last call, oldest first, as a JSON array of `{t, level, msg}`;
/// when lines were dropped for space, a first `warn` line says how many.
pub fn take_logs() -> String {
    let mut ring = RING.lock().unwrap_or_else(|p| p.into_inner());
    let mut out: Vec<serde_json::Value> = Vec::with_capacity(ring.lines.len() + 1);
    if ring.dropped > 0 {
        out.push(json!({ "t": crate::fsx::now_ms(), "level": "warn", "msg": format!("embed: {} server log lines dropped (ring full)", ring.dropped) }));
        ring.dropped = 0;
    }
    out.extend(ring.lines.drain(..));
    serde_json::Value::Array(out).to_string()
}

struct Embedded {
    runtime: tokio::runtime::Runtime,
    running: Running,
}

static LOG: OnceLock<mwlog::Guard> = OnceLock::new();
static SERVER: Mutex<Option<Embedded>> = Mutex::new(None);

/// Parses `KEY=VALUE` lines (blank lines and `#` comments skipped).
pub fn parse_settings(text: &str) -> HashMap<String, String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .collect()
}

/// Starts the embedded server (logging first, once per process).
///
/// `worker threads`: `WORKER_THREADS` (default 2 — the box has four cores and a WebView to feed).
///
/// # Returns
/// The port it listens on.
///
/// # Errors
/// When a server already runs in this process, a setting can't be read, or the server can't
/// start (data folder, port taken).
pub fn start(settings: &str, sink: Option<LineSink>) -> Result<u16> {
    let map = parse_settings(settings);
    let mut slot = SERVER.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(e) = slot.as_ref() {
        bail!("a server already runs on port {}", e.running.addr.port());
    }
    let config = Config::from_lookup(|k| map.get(k).cloned())?;
    if LOG.get().is_none() {
        let state_dir = map
            .get("STATE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| config.data_dir.join("../state"));
        if let Some(home) = map.get("HOME") {
            // SAFETY: called once, before the server's threads exist; the host (the shell's
            // JVM) doesn't read HOME. mwlog looks for its tenant file under HOME.
            unsafe { std::env::set_var("HOME", home) };
        }
        let guard = crate::log::init_embedded(env!("CARGO_PKG_VERSION"), state_dir, vec![Box::new(RingLayer::new(sink))])
            .context("logging could not start")?;
        let _ = LOG.set(guard);
    }
    let shipper = LOG.get().map(|g| g.shipper()).unwrap_or_else(|| mwlog::Shipper::inert(crate::log::APP));
    let threads = map.get("WORKER_THREADS").and_then(|v| v.parse().ok()).unwrap_or(2usize).max(1);
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(threads)
        .thread_name("bm-server")
        .enable_all()
        .build()
        .context("tokio runtime")?;
    tracing::info!(target: "lifecycle", threads, port = config.port, data_dir = %config.data_dir.display(), app_dir = %config.app_dir.display(),
        max_pixels = config.max_pixels, lossless_max_pixels = config.lossless_max_pixels, image_slots = config.image_slots, "Embedded server starting");
    let running = runtime.block_on(crate::start(config, shipper))?;
    let port = running.addr.port();
    *slot = Some(Embedded { runtime, running });
    Ok(port)
}

/// Stops the embedded server gracefully (sockets get 1001, requests may finish for `grace`).
/// Nothing happens when none runs.
///
/// # Returns
/// Whether a server was running.
pub fn stop(grace: Duration) -> bool {
    let taken = SERVER.lock().unwrap_or_else(|p| p.into_inner()).take();
    let Some(Embedded { runtime, running }) = taken else {
        return false;
    };
    runtime.block_on(running.stop(grace));
    runtime.shutdown_timeout(Duration::from_secs(2));
    if let Some(g) = LOG.get() {
        g.flush(Duration::from_secs(2));
    }
    true
}

/// The port of the running embedded server, if one runs.
pub fn port() -> Option<u16> {
    SERVER
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_ref()
        .map(|e| e.running.addr.port())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_lines() {
        let m = parse_settings("PORT=5930\n# note\n\n DATA_DIR = /x/y \nbad line\nA=b=c");
        assert_eq!(m.get("PORT").map(String::as_str), Some("5930"));
        assert_eq!(m.get("DATA_DIR").map(String::as_str), Some("/x/y"));
        assert_eq!(m.get("A").map(String::as_str), Some("b=c"));
        assert_eq!(m.len(), 3);
    }

    #[test]
    fn start_serve_stop() {
        let dir = tempfile::tempdir().unwrap();
        let settings = format!(
            "PORT=0\nHOST=127.0.0.1\nDATA_DIR={}\nAPP_DIR={}\nSTATE_DIR={}\nBUILD_POLL_MS=0\nCLEANUP_EVERY_MS=0\nMWLOG_DISABLE=1",
            dir.path().join("data").display(),
            dir.path().join("app").display(),
            dir.path().join("state").display()
        );
        // SAFETY: test-only, before the server's threads exist.
        unsafe { std::env::set_var("MWLOG_DISABLE", "1") };
        let port = start(&settings, None).unwrap();
        assert!(port > 0);
        assert_eq!(super::port(), Some(port));
        assert!(start(&settings, None).is_err(), "a second server in one process is refused");
        let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        use std::io::{Read, Write};
        s.write_all(b"GET /health HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n").unwrap();
        let mut body = String::new();
        s.read_to_string(&mut body).unwrap();
        assert!(body.starts_with("HTTP/1.1 200"), "{body}");
        assert!(stop(Duration::from_secs(1)));
        assert!(!stop(Duration::from_secs(1)));
        let logs = take_logs();
        assert!(logs.contains("Embedded server starting"), "{logs}");
        assert_eq!(take_logs(), "[]");
    }
}
