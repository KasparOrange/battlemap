//! The temp cleanup: link fetches in `uploads/` go after 7 days, deleted games in `trash/` after
//! 30, leftover `*.tmp` files of interrupted writes after a day. Runs at start and on a timer
//! (`CLEANUP_EVERY_MS`, 6 h). The file store, the library and the backups are never touched.

use std::path::Path;
use std::time::{Duration, SystemTime};

/// What one cleanup removed.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct CleanupResult {
    /// Link fetches removed.
    pub uploads: u32,
    /// Deleted games removed for good.
    pub trash: u32,
    /// Leftover temp files removed.
    pub tmp: u32,
}

/// Removes the entries of `dir` older than `max_age` that `pick` accepts; returns how many.
async fn sweep(dir: &Path, max_age: Duration, now: SystemTime, pick: impl Fn(&str) -> bool) -> u32 {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return 0;
    };
    let mut removed = 0;
    while let Ok(Some(e)) = entries.next_entry().await {
        let name = e.file_name().to_string_lossy().to_string();
        if !pick(&name) {
            continue;
        }
        let Ok(meta) = e.metadata().await else { continue };
        let age = meta.modified().ok().and_then(|m| now.duration_since(m).ok()).unwrap_or_default();
        if age <= max_age {
            continue;
        }
        let gone = if meta.is_dir() {
            tokio::fs::remove_dir_all(e.path()).await
        } else {
            tokio::fs::remove_file(e.path()).await
        };
        if gone.is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Runs the cleanup once and logs what it removed.
pub async fn cleanup(data_dir: &Path, upload_days: u64, trash_days: u64) -> CleanupResult {
    let day = Duration::from_secs(86_400);
    let now = SystemTime::now();
    let result = CleanupResult {
        uploads: sweep(&data_dir.join("uploads"), day * upload_days as u32, now, |_| true).await,
        trash: sweep(&data_dir.join("trash"), day * trash_days as u32, now, |_| true).await,
        tmp: sweep(&data_dir.join("files"), day, now, |n| n.ends_with(".tmp")).await
            + sweep(data_dir, day, now, |n| n.ends_with(".tmp")).await,
    };
    let total = result.uploads + result.trash + result.tmp;
    tracing::info!(target: "cleanup", uploads = result.uploads, trash = result.trash, tmp = result.tmp, "{}", if total > 0 { "Cleaned up" } else { "Nothing to clean up" });
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn age(path: &Path) {
        let old = SystemTime::now() - Duration::from_secs(40 * 86_400);
        fs::File::options()
            .write(true)
            .open(path)
            .or_else(|_| fs::File::open(path))
            .unwrap()
            .set_modified(old)
            .unwrap();
    }

    #[tokio::test]
    async fn old_temp_things_go_the_store_stays() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        for sub in ["uploads", "trash/game-old-1", "trash/game-new-2", "files"] {
            fs::create_dir_all(d.join(sub)).unwrap();
        }
        for (p, old) in [
            ("uploads/aaaaaaaaaaaa.png", true),
            ("uploads/bbbbbbbbbbbb.png", false),
            ("files/x.png.1.1.tmp", true),
            ("library.json.1.2.tmp", true),
        ] {
            fs::write(d.join(p), "x").unwrap();
            if old {
                age(&d.join(p));
            }
        }
        let store = d.join("files").join(format!("{}.png", "a".repeat(64)));
        fs::write(&store, "x").unwrap();
        age(&store);
        age(&d.join("trash/game-old-1"));
        assert_eq!(
            cleanup(d, 7, 30).await,
            CleanupResult {
                uploads: 1,
                trash: 1,
                tmp: 2
            }
        );
        assert!(d.join("uploads/bbbbbbbbbbbb.png").exists() && d.join("trash/game-new-2").exists() && store.exists());
    }
}
