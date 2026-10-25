//! Game backups: the TV sends its game after every save; the server keeps the latest and the
//! previous ten, so a reset box (or a second TV) can open any game again. Games are opaque:
//! checked against the shared `Game` schema, summarised from a few fields ([`GameView`]),
//! stored as the bytes that came.
//!
//! Layout under the data folder (the Bun server's, so either server runs on the other's data):
//!
//! ```text
//! games/<id>/latest.json        {savedAt, game}
//! games/<id>/summary.json       the GameSummary the library lists (small, read for listings)
//! games/<id>/<savedAt ms>.json  previous versions, the newest ten
//! trash/game-<id>-<ms>/         a deleted game's folder, removed after 30 days
//! ```
//!
//! Routes in [`routes`]; see also `docs/architecture.md` "persistence".

pub mod routes;

use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use anyhow::{Context, Result};
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use serde_json::value::RawValue;
use tokio::sync::{Mutex, Semaphore};

use crate::files::store::FileStore;
use crate::fsx::{KeyedLock, iso, parse_iso_ms, read_json_file, write_atomic};
use crate::library::Library;
use crate::schema::{Def, check};
use crate::wire::{FileRef, GameSummary, GameView, VersionInfo};

/// Game ids the server stores (they become folder names).
pub static GAME_ID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9A-Za-z_-]{1,64}$").expect("valid pattern"));

/// Whether `id` is a game id the server takes: the shared `Id` rule (1–64 characters, any),
/// minus control characters (review #27 — an imported v1 id like `"Old game 1"` must not be
/// refused and retried forever).
pub fn valid_game_id(id: &str) -> bool {
    let n = id.chars().count();
    (1..=64).contains(&n) && !id.chars().any(char::is_control)
}

/// The folder name of a game: the id itself when it is plain (`GAME_ID`), else `~` + its
/// UTF-8 bytes in hex (no path tricks, no case clashes on case-insensitive disks).
pub fn folder_name(id: &str) -> String {
    if GAME_ID.is_match(id) { id.to_string() } else { format!("~{}", hex::encode(id.as_bytes())) }
}

/// The default version slot (`GAME_VERSION_SLOT_MS`): review #30 — the TV saves every few
/// seconds, so versions by count alone covered seconds of play. The newest version per
/// 10-minute slot is kept, the slots past the newest `GAME_VERSIONS` go (≈ the last 100 minutes
/// of play at least, longer across sessions).
pub const VERSION_SLOT_MS: u64 = 10 * 60 * 1000;

/// Which previous versions (`ms` stamps, any order) to delete: all but the newest one per
/// `slot_ms` slot (0 = every version is its own slot), and every slot past the newest `keep`.
pub fn versions_to_drop(stamps: &[u64], keep: usize, slot_ms: u64) -> Vec<u64> {
    let mut sorted = stamps.to_vec();
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    let mut slots_seen = 0usize;
    let mut last_slot: Option<u64> = None;
    let mut drop = Vec::new();
    for ms in sorted {
        let slot = if slot_ms == 0 { ms } else { ms / slot_ms };
        if last_slot == Some(slot) || slots_seen >= keep {
            drop.push(ms);
            continue;
        }
        last_slot = Some(slot);
        slots_seen += 1;
    }
    drop
}

/// A backup the server refuses (400), with the reason.
#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    /// Refused, with a reason the app shows.
    #[error("{0}")]
    Bad(String),
    /// A failure of the server.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// One stored version, as read back: its time and the game's bytes.
pub struct Stored {
    /// When the server received it (ISO).
    pub saved_at: String,
    /// The game, as JSON text.
    pub game: Box<RawValue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredFile {
    saved_at: String,
    game: Box<RawValue>,
}

/// The backups.
pub struct Backups {
    dir: PathBuf,
    trash: PathBuf,
    keep: usize,
    slot_ms: u64,
    lock: KeyedLock,
    /// Checks of big games at once (each holds the parsed game in memory).
    checks: Semaphore,
    /// How many games there are, counted once and kept up to date.
    count: Mutex<Option<usize>>,
}

impl Backups {
    /// Backups in `<data_dir>/games`, `keep` previous versions each.
    pub fn new(data_dir: &Path, keep: usize, slot_ms: u64) -> Self {
        Self {
            dir: data_dir.join("games"),
            trash: data_dir.join("trash"),
            keep,
            slot_ms,
            lock: KeyedLock::default(),
            checks: Semaphore::new(2),
            count: Mutex::new(None),
        }
    }

    fn folder(&self, id: &str) -> PathBuf {
        self.dir.join(folder_name(id))
    }

    /// Stores a game as its latest backup; the one before becomes a previous version.
    ///
    /// Returns the game's summary.
    ///
    /// # Errors
    /// [`BackupError::Bad`] when the body isn't JSON, isn't a game, or its id isn't `id`.
    pub async fn put(&self, files: &FileStore, library: &Library, id: &str, body: &[u8], now_ms: u64) -> Result<GameSummary, BackupError> {
        let summary = {
            let _slot = self.checks.acquire().await.map_err(|e| anyhow::anyhow!("{e}"))?;
            let value: Value = serde_json::from_slice(body).map_err(|e| BackupError::Bad(format!("not JSON: {e}")))?;
            check(Def::Game, &value).map_err(|e| BackupError::Bad(format!("not a game: {e}")))?;
            let view = GameView::deserialize(&value).map_err(|e| BackupError::Bad(format!("not a game: {e}")))?;
            drop(value);
            if view.id != id {
                return Err(BackupError::Bad(format!("the game's id is {}, not {id}", view.id)));
            }
            summarize(files, library, &view, iso(now_ms)).await?
        };
        let folder = self.folder(id);
        let _guard = self.lock.lock(id).await;
        tokio::fs::create_dir_all(&folder)
            .await
            .with_context(|| format!("mkdir {}", folder.display()))?;
        let latest = folder.join("latest.json");
        let had = tokio::fs::try_exists(&latest).await.unwrap_or(false);
        if had {
            let before = self.latest_saved_at(&folder).await?;
            let ms = before
                .as_deref()
                .and_then(parse_iso_ms)
                .unwrap_or(i64::try_from(now_ms).unwrap_or(0));
            tokio::fs::rename(&latest, folder.join(format!("{ms}.json")))
                .await
                .context("keep the previous version")?;
        }
        let trimmed = body.trim_ascii();
        let mut text = Vec::with_capacity(trimmed.len() + 64);
        text.extend_from_slice(b"{\"savedAt\":");
        text.extend_from_slice(serde_json::to_string(&summary.saved_at).context("savedAt")?.as_bytes());
        text.extend_from_slice(b",\"game\":");
        text.extend_from_slice(trimmed);
        text.push(b'}');
        write_atomic(&latest, text).await?;
        write_atomic(&folder.join("summary.json"), serde_json::to_vec(&summary).context("summary")?).await?;
        for ms in versions_to_drop(&self.previous(&folder).await, self.keep, self.slot_ms) {
            let _ = tokio::fs::remove_file(folder.join(format!("{ms}.json"))).await;
        }
        if !had && let Some(n) = self.count.lock().await.as_mut() {
            *n += 1;
        }
        Ok(summary)
    }

    /// The latest version's `savedAt` (from the small summary, else the latest file).
    async fn latest_saved_at(&self, folder: &Path) -> Result<Option<String>> {
        if let Ok(Some(s)) = read_json_file::<GameSummary>(&folder.join("summary.json")).await {
            return Ok(Some(s.saved_at));
        }
        Ok(read_json_file::<StoredFile>(&folder.join("latest.json")).await?.map(|s| s.saved_at))
    }

    /// Every backed-up game, newest save first.
    ///
    /// # Errors
    /// When the games folder exists but can't be listed.
    pub async fn list(&self) -> Result<Vec<GameSummary>> {
        let mut out = Vec::new();
        let mut dir = match tokio::fs::read_dir(&self.dir).await {
            Ok(d) => d,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
            Err(e) => return Err(e).context("list games"),
        };
        while let Some(entry) = dir.next_entry().await.context("list games")? {
            let name = entry.file_name().to_string_lossy().to_string();
            if !GAME_ID.is_match(&name) && !name.starts_with('~') {
                continue;
            }
            if let Ok(Some(s)) = read_json_file::<GameSummary>(&entry.path().join("summary.json")).await {
                out.push(s);
            }
        }
        out.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
        Ok(out)
    }

    /// How many games are backed up (counted once, then kept up to date).
    ///
    /// # Errors
    /// As [`Backups::list`].
    pub async fn count(&self) -> Result<usize> {
        let mut guard = self.count.lock().await;
        if let Some(n) = *guard {
            return Ok(n);
        }
        let n = self.list().await?.len();
        *guard = Some(n);
        Ok(n)
    }

    /// A game's latest backup, or the version saved at `at` (a `savedAt` from
    /// [`Backups::versions`]).
    ///
    /// # Errors
    /// When a stored file exists but can't be read.
    pub async fn get(&self, id: &str, at: Option<&str>) -> Result<Option<Stored>> {
        let folder = self.folder(id);
        let latest = read_json_file::<StoredFile>(&folder.join("latest.json")).await?;
        match (at, latest) {
            (None, l) => Ok(l.map(|s| Stored {
                saved_at: s.saved_at,
                game: s.game,
            })),
            (Some(at), Some(l)) if l.saved_at == at => Ok(Some(Stored {
                saved_at: l.saved_at,
                game: l.game,
            })),
            (Some(at), _) => {
                let Some(ms) = parse_iso_ms(at) else { return Ok(None) };
                Ok(read_json_file::<StoredFile>(&folder.join(format!("{ms}.json")))
                    .await?
                    .map(|s| Stored {
                        saved_at: s.saved_at,
                        game: s.game,
                    }))
            }
        }
    }

    /// A game's versions, newest first (the latest first of all); empty for an unknown game.
    ///
    /// # Errors
    /// When a stored file can't be read.
    pub async fn versions(&self, id: &str) -> Result<Vec<VersionInfo>> {
        let folder = self.folder(id);
        let latest_path = folder.join("latest.json");
        let Some(saved_at) = (if tokio::fs::try_exists(&latest_path).await.unwrap_or(false) {
            self.latest_saved_at(&folder).await?
        } else {
            None
        }) else {
            return Ok(Vec::new());
        };
        let size = |p: PathBuf| async move { tokio::fs::metadata(p).await.map(|m| m.len()).unwrap_or(0) };
        let mut out = vec![VersionInfo {
            saved_at,
            bytes: size(latest_path).await,
            latest: true,
        }];
        for ms in self.previous(&folder).await {
            out.push(VersionInfo {
                saved_at: iso(ms),
                bytes: size(folder.join(format!("{ms}.json"))).await,
                latest: false,
            });
        }
        Ok(out)
    }

    /// Deletes a game's backups (moved to the trash, removed after 30 days). Returns false when
    /// there was no such game.
    ///
    /// # Errors
    /// When the folder can't be moved.
    pub async fn remove(&self, id: &str, now_ms: u64) -> Result<bool> {
        let _guard = self.lock.lock(id).await;
        let folder = self.folder(id);
        if !tokio::fs::try_exists(folder.join("latest.json")).await.unwrap_or(false) {
            return Ok(false);
        }
        tokio::fs::create_dir_all(&self.trash).await.context("mkdir trash")?;
        tokio::fs::rename(&folder, self.trash.join(format!("game-{}-{now_ms}", folder_name(id))))
            .await
            .context("move to the trash")?;
        if let Some(n) = self.count.lock().await.as_mut() {
            *n = n.saturating_sub(1);
        }
        Ok(true)
    }

    /// The previous versions' times (ms), newest first.
    async fn previous(&self, folder: &Path) -> Vec<u64> {
        let mut out: Vec<u64> = Vec::new();
        if let Ok(mut dir) = tokio::fs::read_dir(folder).await {
            while let Ok(Some(e)) = dir.next_entry().await {
                let name = e.file_name().to_string_lossy().to_string();
                if let Some(ms) = name
                    .strip_suffix(".json")
                    .filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
                    .and_then(|s| s.parse().ok())
                {
                    out.push(ms);
                }
            }
        }
        out.sort_unstable_by(|a, b| b.cmp(a));
        out
    }
}

/// The summary of a game as the library lists it: the active map's thumbnail comes from its
/// library entry, else from the picture's (or table copy's) upload.
async fn summarize(files: &FileStore, library: &Library, game: &GameView, saved_at: String) -> Result<GameSummary> {
    let maps: Vec<_> = game.map_order.iter().filter_map(|id| game.maps.get(id)).collect();
    let active = game.maps.get(&game.active_map_id).or_else(|| maps.first().copied());
    let mut thumb: Option<FileRef> = None;
    if let Some(active) = active {
        let info = &active.info;
        if let Some(lib_id) = &info.library_id {
            thumb = library.get(lib_id).await?.and_then(|e| e.thumb);
        }
        if thumb.is_none() {
            thumb = files.known_thumbnail(&info.picture).await?;
        }
        if thumb.is_none()
            && let Some(copy) = &info.table_copy
        {
            thumb = files.known_thumbnail(copy).await?;
        }
    }
    Ok(GameSummary {
        id: game.id.clone(),
        name: game.name.clone(),
        created_at: game.created_at.clone(),
        saved_at,
        map_names: maps.iter().map(|m| m.info.name.clone()).collect(),
        active_map_name: active.map(|m| m.info.name.clone()).unwrap_or_default(),
        thumb,
        where_: "server".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_and_folders() {
        assert!(valid_game_id("g-1") && valid_game_id("Old game: 1.v1") && !valid_game_id("") && !valid_game_id(&"x".repeat(65)) && !valid_game_id("a\nb"));
        assert_eq!(folder_name("g-1"), "g-1");
        assert_eq!(folder_name("a.b"), "~612e62");
        assert_eq!(folder_name("../x"), "~2e2e2f78");
    }

    #[test]
    fn versions_by_slot() {
        let min = 60_000;
        // saves every 30 s for an hour: one per 10-minute slot survives, newest first
        let stamps: Vec<u64> = (0..120).map(|i| 1_000 * min + i * 30_000).collect();
        let drop = versions_to_drop(&stamps, 10, VERSION_SLOT_MS);
        let kept: Vec<u64> = stamps.iter().copied().filter(|s| !drop.contains(s)).collect();
        assert_eq!(kept.len(), 6, "{kept:?}"); // the hour fills 6 slots
        assert!(kept.contains(stamps.last().unwrap()));
        // by count only
        assert_eq!(versions_to_drop(&stamps, 10, 0).len(), 110);
    }
}
