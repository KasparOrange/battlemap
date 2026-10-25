//! The shared map library: maps kept on the server for every game and every TV, in
//! `library.json` (`{entries: […]}`, newest first). An entry is the map only — name, squares,
//! picture grid, files — never fog, tokens or layers. Its files live in the file store and stay
//! when an entry is removed: games that use the map keep working.
//!
//! The entries are read once at start (ones that no longer pass the shared schema are left
//! out) and kept in memory; every change is written atomically before it is answered.
//!
//! See also `docs/parity.md` §19 "shared map library"; routes in [`routes`].

pub mod routes;

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::files::store::FileStore;
use crate::fsx::{iso, parse_iso_ms, read_json_file, write_atomic};
use crate::schema::{Def, check};
use crate::wire::{FileRef, LibraryEntry, MapInfoView};

/// A library change the server refuses (400), with the reason.
#[derive(Debug, thiserror::Error)]
pub enum EntryError {
    /// Refused, with a reason the app shows.
    #[error("{0}")]
    Bad(String),
    /// A failure of the server.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// The shared library.
pub struct Library {
    path: PathBuf,
    /// The entries (newest first), loaded on first use; the lock also serialises changes.
    entries: Mutex<Option<Vec<LibraryEntry>>>,
}

/// The file's shape.
#[derive(serde::Serialize)]
struct LibraryFileOut<'a> {
    entries: &'a [LibraryEntry],
}

impl Library {
    /// The library in `<data_dir>/library.json`.
    pub fn new(data_dir: &Path) -> Self {
        Self {
            path: data_dir.join("library.json"),
            entries: Mutex::new(None),
        }
    }

    /// Reads `library.json`, keeping the entries that pass the shared schema.
    async fn load(&self) -> Result<Vec<LibraryEntry>> {
        let Some(file) = read_json_file::<Value>(&self.path).await? else {
            return Ok(Vec::new());
        };
        let raw = file.get("entries").and_then(Value::as_array).cloned().unwrap_or_default();
        let total = raw.len();
        let entries: Vec<LibraryEntry> = raw
            .into_iter()
            .filter(|e| check(Def::LibraryEntry, e).is_ok())
            .filter_map(|e| serde_json::from_value(e).ok())
            .collect();
        if entries.len() < total {
            tracing::warn!(target: "library", kept = entries.len(), total, "Entries that fail the schema were left out");
        }
        Ok(entries)
    }

    /// Every entry, newest first.
    ///
    /// # Errors
    /// When `library.json` exists but can't be read.
    pub async fn list(&self) -> Result<Vec<LibraryEntry>> {
        let mut guard = self.entries.lock().await;
        if guard.is_none() {
            *guard = Some(self.load().await?);
        }
        Ok(guard.clone().unwrap_or_default())
    }

    /// How many entries there are.
    ///
    /// # Errors
    /// As [`Library::list`].
    pub async fn count(&self) -> Result<usize> {
        let mut guard = self.entries.lock().await;
        if guard.is_none() {
            *guard = Some(self.load().await?);
        }
        Ok(guard.as_ref().map_or(0, Vec::len))
    }

    /// One entry by its library id.
    ///
    /// # Errors
    /// As [`Library::list`].
    pub async fn get(&self, id: &str) -> Result<Option<LibraryEntry>> {
        Ok(self.list().await?.into_iter().find(|e| e.id() == id))
    }

    /// Adds a map, or replaces the entry with the same id (keeping when it was added).
    ///
    /// `body` is `{map: MapInfo, thumb?, originalBytes?, note?, addedAt?}` as the app sends it
    /// (`addedAt` counts for a new entry only — the v1 import keeps the old dates). Every named
    /// file must be on the server; a missing `thumb` becomes the one made at the picture's (or
    /// the table copy's) upload; `map.libraryId` becomes `map.id`.
    ///
    /// Returns the stored entry and whether it was new.
    ///
    /// # Errors
    /// [`EntryError::Bad`] when the body isn't a map or names files the server doesn't have.
    pub async fn put(&self, files: &FileStore, body: &Value, now_ms: u64) -> Result<(LibraryEntry, bool), EntryError> {
        let bad = |s: String| EntryError::Bad(s);
        if !(body.is_object() || body.is_array()) {
            return Err(bad("send {map, thumb?, originalBytes?, note?}".into()));
        }
        let map_value = body.get("map").cloned().unwrap_or(Value::Null);
        check(Def::MapInfo, &map_value).map_err(|e| bad(format!("map: {e}")))?;
        let thumb: Option<FileRef> = match body.get("thumb") {
            None | Some(Value::Null) => None,
            Some(t) => {
                check(Def::FileRef, t).map_err(|e| bad(format!("thumb: {e}")))?;
                Some(serde_json::from_value(t.clone()).map_err(|e| bad(format!("thumb: {e}")))?)
            }
        };
        let original_bytes = body
            .get("originalBytes")
            .and_then(Value::as_f64)
            .filter(|n| *n >= 0.0 && n.fract() == 0.0 && *n <= 9e15)
            .map(|n| n as u64);
        let note = body
            .get("note")
            .and_then(Value::as_str)
            .map(|s| s.chars().take(200).collect::<String>());
        let added_at = body
            .get("addedAt")
            .and_then(Value::as_str)
            .and_then(parse_iso_ms)
            .and_then(|ms| u64::try_from(ms).ok())
            .map_or_else(|| iso(now_ms), iso);

        let mut map = map_value;
        let id = map.get("id").cloned().unwrap_or(Value::Null);
        if let Some(obj) = map.as_object_mut() {
            obj.insert("libraryId".into(), id);
        }
        let view: MapInfoView = serde_json::from_value(map.clone()).map_err(|e| bad(format!("map: {e}")))?;
        for (what, r) in [
            ("picture", Some(&view.picture)),
            ("tableCopy", view.table_copy.as_ref()),
            ("geometry", view.geometry.as_ref()),
            ("thumb", thumb.as_ref()),
        ] {
            if let Some(r) = r
                && !files.has(r).await
            {
                return Err(bad(format!(
                    "{what} {}….{} is not on the server — upload it first",
                    &r.hash[..r.hash.len().min(12)],
                    r.ext.as_str()
                )));
            }
        }
        let thumb = match thumb {
            Some(t) => Some(t),
            None => match files.known_thumbnail(&view.picture).await? {
                Some(t) => Some(t),
                None => match &view.table_copy {
                    Some(copy) => files.known_thumbnail(copy).await?,
                    None => None,
                },
            },
        };

        let mut guard = self.entries.lock().await;
        if guard.is_none() {
            *guard = Some(self.load().await?);
        }
        let entries = guard.get_or_insert_with(Vec::new);
        let mut next = entries.clone();
        let existing = next.iter().position(|e| e.id() == view.id);
        let entry = LibraryEntry {
            map,
            thumb,
            added_at: existing.map_or(added_at, |i| next[i].added_at.clone()),
            original_bytes,
            note,
        };
        match existing {
            Some(i) => next[i] = entry.clone(),
            None => next.insert(0, entry.clone()),
        }
        self.write(&next).await?;
        *entries = next;
        Ok((entry, existing.is_none()))
    }

    /// Removes an entry (its files stay). Returns it, or `None` when there was none.
    ///
    /// # Errors
    /// When `library.json` can't be read or written.
    pub async fn remove(&self, id: &str) -> Result<Option<LibraryEntry>> {
        let mut guard = self.entries.lock().await;
        if guard.is_none() {
            *guard = Some(self.load().await?);
        }
        let entries = guard.get_or_insert_with(Vec::new);
        let Some(i) = entries.iter().position(|e| e.id() == id) else {
            return Ok(None);
        };
        let mut next = entries.clone();
        let gone = next.remove(i);
        self.write(&next).await?;
        *entries = next;
        Ok(Some(gone))
    }

    async fn write(&self, entries: &[LibraryEntry]) -> Result<()> {
        let text = serde_json::to_vec_pretty(&LibraryFileOut { entries }).context("library.json")?;
        write_atomic(&self.path, text).await
    }
}
