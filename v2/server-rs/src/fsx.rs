//! File-system and small helpers for the server's data: atomic writes (a reader never sees half
//! a file, a crash never leaves one), JSON reads that tolerate a missing file, a per-key lock so
//! two requests never edit the same index at once, times as the app writes them, random names.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{Context, Result};
use chrono::{DateTime, NaiveDate, SecondsFormat, TimeZone, Utc};
use serde::de::DeserializeOwned;
use tokio::sync::{Mutex, OwnedMutexGuard};

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// A temp path next to `path`, unique in this process (`<path>.<pid>.<n>.tmp`; the cleanup
/// removes leftovers after a day).
pub fn temp_next_to(path: &Path) -> PathBuf {
    let n = TMP_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    let mut name = path.file_name().map(|s| s.to_os_string()).unwrap_or_default();
    name.push(format!(".{}.{n}.tmp", std::process::id()));
    path.with_file_name(name)
}

/// Writes a file atomically: into a temp file next to it, then renamed over it.
///
/// # Errors
/// When the folder can't be made or the file can't be written.
pub async fn write_atomic(path: &Path, data: impl AsRef<[u8]>) -> Result<()> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir)
            .await
            .with_context(|| format!("mkdir {}", dir.display()))?;
    }
    let tmp = temp_next_to(path);
    let written = async {
        tokio::fs::write(&tmp, data.as_ref()).await?;
        tokio::fs::rename(&tmp, path).await
    }
    .await;
    if let Err(e) = written {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(e).with_context(|| format!("write {}", path.display()));
    }
    Ok(())
}

/// Moves a finished temp file into place (rename; the temp file goes on failure).
///
/// # Errors
/// When the rename fails.
pub async fn move_into_place(tmp: &Path, path: &Path) -> Result<()> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir)
            .await
            .with_context(|| format!("mkdir {}", dir.display()))?;
    }
    if let Err(e) = tokio::fs::rename(tmp, path).await {
        let _ = tokio::fs::remove_file(tmp).await;
        return Err(e).with_context(|| format!("rename to {}", path.display()));
    }
    Ok(())
}

/// Reads a JSON file; a missing file reads as `None`.
///
/// # Errors
/// When the file exists but can't be read or isn't valid JSON of that shape — a broken index
/// must not be silently replaced by an empty one.
pub async fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<Option<T>> {
    match tokio::fs::read(path).await {
        Ok(bytes) => Ok(Some(
            serde_json::from_slice(&bytes).with_context(|| format!("{} is not valid", path.display()))?,
        )),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e).with_context(|| format!("read {}", path.display())),
    }
}

/// One-at-a-time sections per key: holding `lock("library")` makes every other holder of the
/// same key wait.
#[derive(Default)]
pub struct KeyedLock {
    locks: std::sync::Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl KeyedLock {
    /// Waits for the key's section and holds it until the guard drops.
    pub async fn lock(&self, key: &str) -> OwnedMutexGuard<()> {
        let lock = {
            let mut all = self.locks.lock().unwrap_or_else(|p| p.into_inner());
            all.retain(|_, l| Arc::strong_count(l) > 1);
            all.entry(key.to_string()).or_default().clone()
        };
        lock.lock_owned().await
    }
}

/// Now in epoch milliseconds.
pub fn now_ms() -> u64 {
    u64::try_from(Utc::now().timestamp_millis()).unwrap_or(0)
}

/// Epoch ms as ISO text the way JavaScript's `toISOString()` writes it (`…T18:00:00.000Z`).
pub fn iso(ms: u64) -> String {
    let dt = Utc
        .timestamp_millis_opt(i64::try_from(ms).unwrap_or(0))
        .single()
        .unwrap_or_default();
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Parses a time the way the app sends them (ISO 8601 / RFC 3339, or a bare date), like
/// JavaScript's `Date.parse`.
///
/// Returns epoch ms, or `None` for anything else.
pub fn parse_iso_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return d.and_hms_opt(0, 0, 0).map(|t| t.and_utc().timestamp_millis());
    }
    None
}

/// `bytes` random bytes as lowercase hex.
pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    // getrandom only fails without an OS source of randomness; a time-based fallback still
    // gives a fresh name.
    if getrandom::fill(&mut buf).is_err() {
        let t = now_ms().to_le_bytes();
        for (i, b) in buf.iter_mut().enumerate() {
            *b = t[i % t.len()] ^ (TMP_COUNTER.fetch_add(1, Ordering::Relaxed) as u8);
        }
    }
    hex::encode(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times_read_and_write_like_javascript() {
        assert_eq!(iso(1_761_415_200_000), "2025-10-25T18:00:00.000Z");
        assert_eq!(parse_iso_ms("2025-10-25T18:00:00.000Z"), Some(1_761_415_200_000));
        assert_eq!(parse_iso_ms("2025-10-25"), Some(1_761_350_400_000));
        assert_eq!(parse_iso_ms("yesterday"), None);
        assert_eq!(random_hex(6).len(), 12);
    }

    #[tokio::test]
    async fn atomic_writes_and_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a/b.json");
        write_atomic(&p, b"{\"x\":1}").await.unwrap();
        let v: Option<serde_json::Value> = read_json_file(&p).await.unwrap();
        assert_eq!(v.unwrap()["x"], 1);
        let none: Option<serde_json::Value> = read_json_file(&dir.path().join("nope.json")).await.unwrap();
        assert!(none.is_none());
        tokio::fs::write(&p, b"{broken").await.unwrap();
        assert!(read_json_file::<serde_json::Value>(&p).await.is_err());
    }
}
