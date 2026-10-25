//! The internet server above a table server (`UPSTREAM_URL`): on the TV box, the table server
//! hosts the table on the LAN and the VPS is its upstream. While the box is online it
//!
//! - **mirrors** the upstream's shared library and game-backup list (`/api/library`,
//!   `/api/games` answer local ∪ upstream; kept in `upstream.json`, so they survive a restart
//!   without internet) and **prefetches** the mirrored maps' files, so a game night at a place
//!   without internet still has every library map;
//! - **pulls** a file it lacks from upstream when asked for it (`GET /files/…`);
//! - **pushes** its own game backups (with the files they name that upstream lacks) and deletes
//!   them there too — the TV's storage stays authoritative, the VPS keeps a copy;
//! - **forwards** the page's log batches (`POST /log`) when it has no MwLog credentials itself
//!   (devices never hold them) — a refused forward answers 503 so the page's outbox keeps the
//!   batch for later.
//!
//! The relay never goes upstream: rooms on the box are the box's. Without `UPSTREAM_URL`
//! nothing here runs and every route behaves as on the VPS. See `../docs/server-rs.md` "LAN play".

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio::sync::{Mutex, Notify, RwLock};

use crate::fsx::{iso, now_ms, read_json_file, write_atomic};
use crate::schema::{Def, check};
use crate::state::Shared;
use crate::wire::{FileExt, GameSummary, LibraryEntry};

/// What `/api/upstream` answers.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamStatus {
    /// The upstream's base URL.
    pub url: String,
    /// The last sync reached it.
    pub online: bool,
    /// When the last sync succeeded (ISO).
    pub last_sync_at: Option<String>,
    /// Why the last sync failed.
    pub last_error: Option<String>,
    /// Library entries mirrored from upstream.
    pub library_mirrored: usize,
    /// Game backups listed from upstream.
    pub games_mirrored: usize,
    /// Files fetched from upstream (pulled on demand + prefetched) since start.
    pub files_pulled: u64,
    /// Game backups pushed upstream since start.
    pub games_pushed: u64,
    /// Log batches forwarded since start.
    pub logs_forwarded: u64,
}

/// The mirror kept on disk.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct Mirror {
    library: Vec<LibraryEntry>,
    games: Vec<GameSummary>,
    /// Game id → the local `savedAt` last pushed.
    pushed: HashMap<String, String>,
    /// Games deleted here that upstream still has to delete.
    deletes: Vec<String>,
}

/// The upstream link of a table server.
pub struct Upstream {
    /// Base URL, no trailing slash.
    pub base: String,
    client: reqwest::Client,
    path: PathBuf,
    mirror: RwLock<Mirror>,
    status: std::sync::Mutex<UpstreamStatus>,
    /// A local game was saved or deleted: sync soon.
    wake: Notify,
    sync_lock: Mutex<()>,
    prefetch_max: u64,
    files_pulled: AtomicU64,
    games_pushed: AtomicU64,
    logs_forwarded: AtomicU64,
}

impl Upstream {
    /// The link to `base` for the data in `data_dir` (reads `upstream.json`).
    ///
    /// # Errors
    /// When the HTTP client can't be built.
    pub async fn new(base: &str, data_dir: &std::path::Path, prefetch_max: u64) -> Result<Self> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .read_timeout(Duration::from_secs(20))
            .user_agent(concat!("battlemap-table-server/", env!("CARGO_PKG_VERSION")))
            .build()
            .context("upstream client")?;
        let path = data_dir.join("upstream.json");
        let mirror: Mirror = read_json_file(&path).await.ok().flatten().unwrap_or_default();
        let base = base.trim_end_matches('/').to_string();
        let status = UpstreamStatus {
            url: base.clone(),
            library_mirrored: mirror.library.len(),
            games_mirrored: mirror.games.len(),
            ..Default::default()
        };
        Ok(Self {
            base,
            client,
            path,
            mirror: RwLock::new(mirror),
            status: std::sync::Mutex::new(status),
            wake: Notify::new(),
            sync_lock: Mutex::new(()),
            prefetch_max,
            files_pulled: AtomicU64::new(0),
            games_pushed: AtomicU64::new(0),
            logs_forwarded: AtomicU64::new(0),
        })
    }

    /// The status for `/api/upstream`.
    pub fn status(&self) -> UpstreamStatus {
        let mut s = self.status.lock().unwrap_or_else(|p| p.into_inner()).clone();
        s.files_pulled = self.files_pulled.load(Ordering::Relaxed);
        s.games_pushed = self.games_pushed.load(Ordering::Relaxed);
        s.logs_forwarded = self.logs_forwarded.load(Ordering::Relaxed);
        s
    }

    /// Asks for a sync soon (a game was saved or deleted here).
    pub fn poke(&self) {
        self.wake.notify_one();
    }

    /// Library entries from upstream that the local library doesn't have (by id).
    pub async fn library_extra(&self, local: &[LibraryEntry]) -> Vec<LibraryEntry> {
        let have: HashSet<&str> = local.iter().map(LibraryEntry::id).collect();
        self.mirror.read().await.library.iter().filter(|e| !have.contains(e.id())).cloned().collect()
    }

    /// Game summaries from upstream that aren't here and weren't deleted here.
    pub async fn games_extra(&self, local: &[GameSummary]) -> Vec<GameSummary> {
        let have: HashSet<&str> = local.iter().map(|g| g.id.as_str()).collect();
        let m = self.mirror.read().await;
        m.games
            .iter()
            .filter(|g| !have.contains(g.id.as_str()) && !m.deletes.contains(&g.id))
            .cloned()
            .collect()
    }

    /// A game was deleted here: delete it upstream at the next sync.
    pub async fn deleted(&self, id: &str) {
        {
            let mut m = self.mirror.write().await;
            if !m.deletes.iter().any(|d| d == id) {
                m.deletes.push(id.to_string());
            }
            m.pushed.remove(id);
            m.games.retain(|g| g.id != id);
        }
        self.save().await;
        self.poke();
    }

    /// One game backup from upstream: `(savedAt, body)`, or `None` when upstream doesn't have
    /// it or can't be reached.
    pub async fn game(&self, id: &str, at: Option<&str>) -> Option<(Option<String>, axum::body::Bytes)> {
        let mut url = format!("{}/api/games/{}", self.base, urlencode(id));
        if let Some(at) = at {
            url.push_str(&format!("?at={}", urlencode(at)));
        }
        let res = self.client.get(&url).send().await.ok()?;
        if !res.status().is_success() {
            return None;
        }
        let saved = res.headers().get("x-saved-at").and_then(|v| v.to_str().ok()).map(String::from);
        let body = res.bytes().await.ok()?;
        tracing::info!(target: "upstream", game = id, bytes = body.len(), "Game served from upstream");
        Some((saved, body))
    }

    /// Fetches `/files/<hash>.<ext>` from upstream into the local store, checking its hash.
    ///
    /// # Errors
    /// Upstream doesn't have it, can't be reached, sends more than `max_bytes`, or the content
    /// doesn't match the hash.
    pub async fn pull_file(&self, state: &Shared, hash: &str, ext: FileExt) -> Result<u64> {
        let url = format!("{}/files/{hash}.{}", self.base, ext.as_str());
        let t0 = std::time::Instant::now();
        let res = self.client.get(&url).send().await.context("request")?;
        if !res.status().is_success() {
            bail!("upstream answered {}", res.status());
        }
        let tmp = state.files.temp_path();
        let mut file = tokio::fs::File::create(&tmp).await.context("temp file")?;
        let mut hasher = Sha256::new();
        let mut bytes = 0u64;
        let mut stream = res.bytes_stream();
        let result: Result<()> = async {
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.context("download")?;
                bytes += chunk.len() as u64;
                if bytes > state.config.max_upload_bytes {
                    bail!("larger than {} bytes", state.config.max_upload_bytes);
                }
                hasher.update(&chunk);
                file.write_all(&chunk).await.context("write")?;
            }
            file.flush().await.context("flush")?;
            Ok(())
        }
        .await;
        drop(file);
        if let Err(e) = result {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(e);
        }
        let got = hex::encode(hasher.finalize());
        if got != hash {
            let _ = tokio::fs::remove_file(&tmp).await;
            bail!("content hash {got} doesn't match");
        }
        state.files.put_file(&tmp, hash, bytes, ext).await?;
        self.files_pulled.fetch_add(1, Ordering::Relaxed);
        tracing::info!(target: "upstream", file = %format!("{hash}.{}", ext.as_str()), bytes, ms = t0.elapsed().as_millis() as u64, "File pulled from upstream");
        Ok(bytes)
    }

    /// Forwards a `/log` batch upstream.
    ///
    /// # Errors
    /// Upstream can't be reached or refused the batch.
    pub async fn forward_log(&self, body: axum::body::Bytes, content_type: Option<&str>) -> Result<()> {
        let mut req = self.client.post(format!("{}/log", self.base)).body(body);
        if let Some(ct) = content_type {
            req = req.header(reqwest::header::CONTENT_TYPE, ct);
        }
        let res = req.timeout(Duration::from_secs(8)).send().await.context("request")?;
        if !res.status().is_success() {
            bail!("upstream answered {}", res.status());
        }
        self.logs_forwarded.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    async fn save(&self) {
        let bytes = match serde_json::to_vec(&*self.mirror.read().await) {
            Ok(b) => b,
            Err(e) => {
                tracing::error!(target: "upstream", error = %e, "Mirror not serialised");
                return;
            }
        };
        if let Err(e) = write_atomic(&self.path, bytes).await {
            tracing::error!(target: "upstream", error = format!("{e:#}"), "Mirror not saved");
        }
    }

    fn set_status(&self, f: impl FnOnce(&mut UpstreamStatus)) {
        f(&mut self.status.lock().unwrap_or_else(|p| p.into_inner()));
    }

    async fn get_json(&self, path: &str) -> Result<Value> {
        let res = self.client.get(format!("{}{path}", self.base)).send().await.context("request")?;
        if !res.status().is_success() {
            bail!("{path}: upstream answered {}", res.status());
        }
        let body = res.bytes().await.with_context(|| format!("{path}: body"))?;
        serde_json::from_slice(&body).with_context(|| format!("{path}: not JSON"))
    }

    /// One sync: mirror the lists, push games and deletes, prefetch library files.
    ///
    /// # Errors
    /// When upstream can't be reached (the status says so too).
    pub async fn sync(&self, state: &Shared) -> Result<()> {
        let _one = self.sync_lock.lock().await;
        let t0 = std::time::Instant::now();
        let library = self.get_json("/api/library").await?;
        let games = self.get_json("/api/games").await?;
        let library: Vec<LibraryEntry> = library
            .get("entries")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter(|e| check(Def::LibraryEntry, e).is_ok())
                    .filter_map(|e| serde_json::from_value(e.clone()).ok())
                    .collect()
            })
            .unwrap_or_default();
        let games: Vec<GameSummary> = games
            .get("games")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|g| serde_json::from_value(g.clone()).ok()).collect())
            .unwrap_or_default();
        {
            let mut m = self.mirror.write().await;
            m.library = library;
            m.games = games;
        }
        let deletes = self.push_deletes().await;
        let pushed = self.push_games(state).await;
        self.save().await;
        let (nl, ng) = {
            let m = self.mirror.read().await;
            (m.library.len(), m.games.len())
        };
        self.set_status(|s| {
            s.online = true;
            s.last_sync_at = Some(iso(now_ms()));
            s.last_error = None;
            s.library_mirrored = nl;
            s.games_mirrored = ng;
        });
        let (fetched, fetched_bytes) = self.prefetch(state).await;
        tracing::info!(target: "upstream", library = nl, games = ng, pushed, deletes, prefetched = fetched, prefetched_bytes = fetched_bytes,
            ms = t0.elapsed().as_millis() as u64, "Synced with upstream");
        Ok(())
    }

    async fn push_deletes(&self) -> usize {
        let ids = self.mirror.read().await.deletes.clone();
        let mut done = 0;
        for id in ids {
            let url = format!("{}/api/games/{}", self.base, urlencode(&id));
            match self.client.delete(&url).send().await {
                Ok(r) if r.status().is_success() || r.status() == reqwest::StatusCode::NOT_FOUND => {
                    self.mirror.write().await.deletes.retain(|d| d != &id);
                    done += 1;
                }
                Ok(r) => tracing::warn!(target: "upstream", game = %id, status = r.status().as_u16(), "Delete refused upstream"),
                Err(e) => tracing::warn!(target: "upstream", game = %id, error = %e, "Delete not sent"),
            }
        }
        done
    }

    /// Pushes every local backup whose latest save upstream hasn't seen, with its files.
    async fn push_games(&self, state: &Shared) -> usize {
        let Ok(local) = state.backups.list().await else { return 0 };
        let mut count = 0;
        for summary in local {
            let seen = self.mirror.read().await.pushed.get(&summary.id).cloned();
            if seen.as_deref() == Some(summary.saved_at.as_str()) {
                continue;
            }
            match self.push_game(state, &summary.id).await {
                Ok(()) => {
                    self.mirror.write().await.pushed.insert(summary.id.clone(), summary.saved_at.clone());
                    self.games_pushed.fetch_add(1, Ordering::Relaxed);
                    count += 1;
                }
                Err(e) => tracing::warn!(target: "upstream", game = %summary.id, error = format!("{e:#}"), "Game not pushed upstream"),
            }
        }
        count
    }

    async fn push_game(&self, state: &Shared, id: &str) -> Result<()> {
        let stored = state.backups.get(id, None).await?.context("gone")?;
        let game: Value = serde_json::from_str(stored.game.get()).context("stored game")?;
        let mut sent_files = 0;
        for (hash, ext, bytes) in file_refs(&game) {
            let url = format!("{}/files/{hash}.{}", self.base, ext.as_str());
            if self.client.head(&url).send().await.is_ok_and(|r| r.status().is_success()) {
                continue;
            }
            let path = state.files.path(&hash, ext);
            let Ok(data) = tokio::fs::read(&path).await else {
                continue; // not here either: the TV holds it; upstream may get it from another device
            };
            if data.len() as u64 != bytes {
                continue;
            }
            let res = self
                .client
                .post(format!("{}/files?ext={}&format=asis", self.base, ext.as_str()))
                .body(data)
                .timeout(Duration::from_secs(300))
                .send()
                .await
                .context("file upload")?;
            if !res.status().is_success() {
                bail!("file {hash}: upstream answered {}", res.status());
            }
            sent_files += 1;
        }
        let res = self
            .client
            .put(format!("{}/api/games/{}", self.base, urlencode(id)))
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(stored.game.get().to_string())
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .context("game upload")?;
        if !res.status().is_success() {
            bail!("upstream answered {}", res.status());
        }
        tracing::info!(target: "upstream", game = id, files = sent_files, "Game pushed upstream");
        Ok(())
    }

    /// Fetches the files of mirrored library entries that aren't here, up to `prefetch_max`
    /// bytes stored from upstream in total.
    async fn prefetch(&self, state: &Shared) -> (usize, u64) {
        let entries = self.mirror.read().await.library.clone();
        let mut wanted: Vec<(String, FileExt, u64)> = Vec::new();
        for e in &entries {
            if let Some(t) = &e.thumb {
                wanted.push((t.hash.clone(), t.ext, t.bytes));
            }
            wanted.extend(file_refs(&e.map));
        }
        let mut seen = HashSet::new();
        let (mut n, mut total) = (0usize, 0u64);
        for (hash, ext, bytes) in wanted {
            if !seen.insert(hash.clone()) {
                continue;
            }
            let path = state.files.path(&hash, ext);
            if tokio::fs::metadata(&path).await.is_ok_and(|m| m.len() == bytes) {
                continue;
            }
            if total + bytes > self.prefetch_max {
                tracing::warn!(target: "upstream", max = self.prefetch_max, "Prefetch stopped at its byte limit");
                break;
            }
            match self.pull_file(state, &hash, ext).await {
                Ok(b) => {
                    n += 1;
                    total += b;
                }
                Err(e) => tracing::warn!(target: "upstream", file = %hash, error = format!("{e:#}"), "Prefetch failed"),
            }
        }
        (n, total)
    }

    /// Runs forever: a sync at start, then every `every`, and 3 s after a [`Upstream::poke`].
    pub async fn run(state: Shared, every: Duration) {
        let Some(up) = state.upstream.as_ref() else { return };
        loop {
            if let Err(e) = up.sync(&state).await {
                let msg = format!("{e:#}");
                let was_online = up.status().online;
                up.set_status(|s| {
                    s.online = false;
                    s.last_error = Some(msg.clone());
                });
                if was_online {
                    tracing::warn!(target: "upstream", error = %msg, "Upstream unreachable");
                } else {
                    tracing::debug!(target: "upstream", error = %msg, "Upstream still unreachable");
                }
            }
            tokio::select! {
                _ = tokio::time::sleep(every) => {}
                _ = up.wake.notified() => tokio::time::sleep(Duration::from_secs(3)).await,
            }
        }
    }
}

/// Every `FileRef` (`{hash, ext, bytes}`) anywhere inside `v`.
pub fn file_refs(v: &Value) -> Vec<(String, FileExt, u64)> {
    let mut out = Vec::new();
    fn walk(v: &Value, out: &mut Vec<(String, FileExt, u64)>) {
        match v {
            Value::Object(o) => {
                if let (Some(Value::String(h)), Some(Value::String(e)), Some(b)) = (o.get("hash"), o.get("ext"), o.get("bytes").and_then(Value::as_u64))
                    && h.len() == 64
                    && h.bytes().all(|c| c.is_ascii_hexdigit())
                    && let Some(ext) = FileExt::parse(e)
                {
                    out.push((h.clone(), ext, b));
                }
                o.values().for_each(|c| walk(c, out));
            }
            Value::Array(a) => a.iter().for_each(|c| walk(c, out)),
            _ => {}
        }
    }
    walk(v, &mut out);
    out
}

fn urlencode(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_file_refs_anywhere() {
        let h = "a".repeat(64);
        let v = serde_json::json!({ "maps": [{ "info": { "picture": { "hash": h, "ext": "webp", "bytes": 10 }, "x": { "hash": "short", "ext": "png", "bytes": 1 } } }] });
        let refs = file_refs(&v);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].2, 10);
    }
}
