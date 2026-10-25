//! The server's settings: every one from the environment, with production defaults. The same
//! names as the Bun server's (`PORT`, `HOST`, `APP_DIR`, `DATA_DIR`) plus the limits, so the
//! contract suite (`server-contract/run.ts`) starts both servers alike.
//!
//! | Variable | Default | What |
//! |---|---|---|
//! | `PORT` | 5929 | HTTP + WebSocket port (0 = any free one) |
//! | `HOST` | `0.0.0.0` | interface to listen on |
//! | `APP_DIR` | `../app/dist` | the built app, served at `/app/` (relative to the working folder) |
//! | `DATA_DIR` | `./data` | files, shared library, game backups, temporary uploads |
//! | `HELLO_TIMEOUT_MS` | 8000 | how long a new socket may take to say `hello` |
//! | `BUILD_POLL_MS` | 10000 | how often `build.json` is re-read (0 = never) |
//! | `MAX_UPLOAD_BYTES` | 200 MiB | largest upload and link download |
//! | `MAX_GAME_BYTES` | 25 MiB | largest game backup |
//! | `GAME_VERSIONS` | 10 | previous versions kept per game |
//! | `FETCH_TIMEOUT_MS` | 30000 | link fetch: time allowed per socket operation |
//! | `CLEANUP_EVERY_MS` | 6 h | how often the temp cleanup runs (0 = only at start) |
//! | `MAX_PIXELS` | 150 000 000 | largest picture decoded (review #5) |
//! | `LOSSLESS_MAX_PIXELS` | 50 000 000 | largest picture tried as lossless WebP (~40 B per pixel while encoding) |
//! | `IMAGE_SLOTS` | 2 | pictures decoded / encoded at once |
//! | `FETCH_SLOTS` | 4 | link fetches at once (more are refused, 429) |
//! | `RELAY_*` | see [`RelayLimits`] | the relay's limits |
//! | `GAME_VERSION_SLOT_MS` | 600000 | one kept version per slot (0 = by count only) |
//! | `UPSTREAM_URL` | — | the internet server above a table server (LAN play, [`crate::upstream`]) |
//! | `UPSTREAM_SYNC_MS` | 600000 | how often the table server syncs with its upstream |
//! | `UPSTREAM_PREFETCH_MAX_BYTES` | 2 GiB | library files prefetched from upstream at most |
//! | `BATTLEMAP_SERVER_BUILD` | `dev` | this server's build, for `/health` |
//! | `BATTLEMAP_FETCH_TEST_ADDR` | — | tests only: names under `.test` resolve to this address |

use std::net::IpAddr;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result, bail};

/// Limits of the relay (per socket and per room).
#[derive(Debug, Clone)]
pub struct RelayLimits {
    /// A socket that sent nothing (not even a ping) for this long is closed as a zombie (`RELAY_ZOMBIE_MS`).
    pub zombie: Duration,
    /// How often the relay looks for zombies and slow consumers (`RELAY_SWEEP_MS`, 0 = never).
    pub sweep: Duration,
    /// Messages per second a socket may send on average (`RELAY_RATE_PER_S`).
    pub rate_per_s: f64,
    /// Messages a socket may send in one burst (`RELAY_RATE_BURST`).
    pub rate_burst: f64,
    /// A socket with more drops than this within a minute is closed (`RELAY_RATE_CLOSE_AFTER`).
    pub rate_close_after: u32,
    /// Companions per room (`RELAY_COMPANIONS_PER_ROOM`).
    pub companions_per_room: usize,
    /// Rooms on the server (`RELAY_MAX_ROOMS`).
    pub max_rooms: usize,
    /// Sockets that haven't said hello yet, per address (`RELAY_WAITING_PER_IP`).
    pub waiting_per_ip: usize,
    /// Bytes queued for one socket before it is closed as too slow (`RELAY_MAX_BUFFERED_BYTES`).
    pub max_buffered_bytes: usize,
    /// Largest frame in bytes; a bigger one closes the socket with 1009 (`RELAY_MAX_FRAME_BYTES`).
    pub max_frame_bytes: usize,
}

impl Default for RelayLimits {
    fn default() -> Self {
        Self {
            zombie: Duration::from_secs(45),
            sweep: Duration::from_secs(5),
            rate_per_s: 100.0,
            rate_burst: 400.0,
            rate_close_after: 2_000,
            companions_per_room: 16,
            max_rooms: 1_000,
            waiting_per_ip: 20,
            max_buffered_bytes: 32 * 1024 * 1024,
            max_frame_bytes: 16 * 1024 * 1024,
        }
    }
}

/// The server's settings.
#[derive(Debug, Clone)]
pub struct Config {
    /// Port (0 = any free one).
    pub port: u16,
    /// Interface to listen on.
    pub host: IpAddr,
    /// The built app (`app/dist`), served at `/app/`.
    pub app_dir: PathBuf,
    /// Where the server keeps its data.
    pub data_dir: PathBuf,
    /// How long a new socket may take to say `hello`.
    pub hello_timeout: Duration,
    /// How often `build.json` is re-read (zero = never).
    pub build_poll: Duration,
    /// Largest upload and link download, bytes.
    pub max_upload_bytes: u64,
    /// Largest game backup, bytes.
    pub max_game_bytes: u64,
    /// Largest shared-library entry body, bytes.
    pub max_entry_bytes: u64,
    /// Previous versions kept per game backup.
    pub game_versions: usize,
    /// One kept version per slot of this many ms (0 = keep by count only).
    pub game_version_slot_ms: u64,
    /// The internet server above this one (LAN play), no trailing slash.
    pub upstream_url: Option<String>,
    /// How often to sync with the upstream.
    pub upstream_sync: Duration,
    /// Library files prefetched from the upstream at most, bytes.
    pub upstream_prefetch_max_bytes: u64,
    /// Link fetch: time allowed per socket operation.
    pub fetch_timeout: Duration,
    /// Link fetch: redirects followed at most.
    pub fetch_max_redirects: usize,
    /// Temporary uploads (link fetches) are removed after this many days.
    pub upload_max_age_days: u64,
    /// Deleted game backups stay in `trash/` this many days.
    pub trash_max_age_days: u64,
    /// How often the cleanup runs (zero = only at start).
    pub cleanup_every: Duration,
    /// A request slower than this is logged as slow.
    pub slow: Duration,
    /// Largest picture that is decoded, in pixels.
    pub max_pixels: u64,
    /// Largest picture tried as lossless WebP, in pixels (`LOSSLESS_MAX_PIXELS`).
    pub lossless_max_pixels: u64,
    /// Pictures decoded or encoded at once.
    pub image_slots: usize,
    /// Link fetches at once.
    pub fetch_slots: usize,
    /// This server's build (`/health` `serverBuild`).
    pub server_build: String,
    /// Tests only: names under `.test` resolve to this address and skip the address guard.
    pub fetch_test_addr: Option<IpAddr>,
    /// The relay's limits.
    pub relay: RelayLimits,
}

impl Config {
    /// Reads the settings from the process environment.
    ///
    /// # Errors
    /// A variable that is set but isn't a number (or an address) where one is expected.
    pub fn from_env() -> Result<Self> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    /// Reads the settings through `get` (tests pass their own).
    ///
    /// # Errors
    /// A variable that is set but can't be read.
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self> {
        let get = |name: &str| get(name).filter(|v| !v.trim().is_empty());
        let num = |name: &str, fallback: u64| -> Result<u64> {
            match get(name) {
                None => Ok(fallback),
                Some(v) => v
                    .trim()
                    .parse::<f64>()
                    .ok()
                    .filter(|n| n.is_finite() && *n >= 0.0)
                    .map(|n| n as u64)
                    .with_context(|| format!("{name}={v} is not a number")),
            }
        };
        let ms = |name: &str, fallback: u64| num(name, fallback).map(Duration::from_millis);
        let defaults = RelayLimits::default();
        let relay = RelayLimits {
            zombie: ms("RELAY_ZOMBIE_MS", 45_000)?,
            sweep: ms("RELAY_SWEEP_MS", 5_000)?,
            rate_per_s: num("RELAY_RATE_PER_S", 100)? as f64,
            rate_burst: num("RELAY_RATE_BURST", 400)? as f64,
            rate_close_after: num("RELAY_RATE_CLOSE_AFTER", u64::from(defaults.rate_close_after))? as u32,
            companions_per_room: num("RELAY_COMPANIONS_PER_ROOM", defaults.companions_per_room as u64)? as usize,
            max_rooms: num("RELAY_MAX_ROOMS", defaults.max_rooms as u64)? as usize,
            waiting_per_ip: num("RELAY_WAITING_PER_IP", defaults.waiting_per_ip as u64)? as usize,
            max_buffered_bytes: num("RELAY_MAX_BUFFERED_BYTES", defaults.max_buffered_bytes as u64)? as usize,
            max_frame_bytes: num("RELAY_MAX_FRAME_BYTES", defaults.max_frame_bytes as u64)? as usize,
        };
        let port = num("PORT", 5929)?;
        if port > u64::from(u16::MAX) {
            bail!("PORT={port} is not a port");
        }
        let host = get("HOST").unwrap_or_else(|| "0.0.0.0".into());
        let fetch_test_addr = match get("BATTLEMAP_FETCH_TEST_ADDR") {
            None => None,
            Some(v) => Some(
                v.parse()
                    .with_context(|| format!("BATTLEMAP_FETCH_TEST_ADDR={v} is not an address"))?,
            ),
        };
        Ok(Self {
            port: port as u16,
            host: host.parse().with_context(|| format!("HOST={host} is not an address"))?,
            app_dir: PathBuf::from(get("APP_DIR").unwrap_or_else(|| "../app/dist".into())),
            data_dir: PathBuf::from(get("DATA_DIR").unwrap_or_else(|| "./data".into())),
            hello_timeout: ms("HELLO_TIMEOUT_MS", 8_000)?,
            build_poll: ms("BUILD_POLL_MS", 10_000)?,
            max_upload_bytes: num("MAX_UPLOAD_BYTES", 200 * 1024 * 1024)?,
            max_game_bytes: num("MAX_GAME_BYTES", 25 * 1024 * 1024)?,
            max_entry_bytes: 1024 * 1024,
            game_versions: num("GAME_VERSIONS", 10)? as usize,
            game_version_slot_ms: num("GAME_VERSION_SLOT_MS", crate::backups::VERSION_SLOT_MS)?,
            upstream_url: match get("UPSTREAM_URL") {
                None => None,
                Some(u) => {
                    let parsed = url::Url::parse(u.trim()).with_context(|| format!("UPSTREAM_URL={u} is not a URL"))?;
                    if !matches!(parsed.scheme(), "http" | "https") {
                        bail!("UPSTREAM_URL={u} is not http(s)");
                    }
                    Some(u.trim().trim_end_matches('/').to_string())
                }
            },
            upstream_sync: ms("UPSTREAM_SYNC_MS", 600_000)?,
            upstream_prefetch_max_bytes: num("UPSTREAM_PREFETCH_MAX_BYTES", 2 * 1024 * 1024 * 1024)?,
            fetch_timeout: ms("FETCH_TIMEOUT_MS", 30_000)?,
            fetch_max_redirects: 5,
            upload_max_age_days: 7,
            trash_max_age_days: 30,
            cleanup_every: ms("CLEANUP_EVERY_MS", 6 * 3_600_000)?,
            slow: Duration::from_secs(1),
            max_pixels: num("MAX_PIXELS", 150_000_000)?,
            lossless_max_pixels: num("LOSSLESS_MAX_PIXELS", crate::files::convert::WEBP_LOSSLESS_MAX_PIXELS)?,
            image_slots: num("IMAGE_SLOTS", 2)?.max(1) as usize,
            fetch_slots: num("FETCH_SLOTS", 4)?.max(1) as usize,
            server_build: get("BATTLEMAP_SERVER_BUILD").unwrap_or_else(|| "dev".into()),
            fetch_test_addr,
            relay,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_overrides() {
        let c = Config::from_lookup(|_| None).unwrap();
        assert_eq!(c.port, 5929);
        assert_eq!(c.max_upload_bytes, 200 * 1024 * 1024);
        assert_eq!(c.relay.zombie, Duration::from_secs(45));
        let c = Config::from_lookup(|n| match n {
            "PORT" => Some("6302".into()),
            "RELAY_RATE_PER_S" => Some("10".into()),
            "BATTLEMAP_FETCH_TEST_ADDR" => Some("127.0.0.1".into()),
            _ => None,
        })
        .unwrap();
        assert_eq!(c.port, 6302);
        assert_eq!(c.relay.rate_per_s, 10.0);
        assert!(c.fetch_test_addr.is_some());
        assert!(Config::from_lookup(|n| (n == "PORT").then(|| "lots".into())).is_err());
    }
}
