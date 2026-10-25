//! The content-addressed file store: `files/<sha256>.<ext>` under the data folder. A file never
//! changes once written (its name is its content), so it is served as immutable and every device
//! caches it forever. Next to it, `derived.json` remembers what was made from a file — its
//! conversion for a "Store as" choice and its thumbnail — so the same upload is never
//! re-encoded. Same layout and `derived.json` format as the Bun server, so either can run on
//! the other's data.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

use crate::fsx::{move_into_place, read_json_file, write_atomic};
use crate::wire::{FileExt, FileRef};

/// File names the store serves: `<64 hex>.<ext>`.
pub static FILE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([0-9a-f]{64})\.(png|jpg|webp|json|pdf)$").expect("valid pattern"));

/// What was made from a source file, by key (`<hash>:<format>` or `<hash>:thumb`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Derived {
    /// The made file.
    #[serde(rename = "ref")]
    pub file: FileRef,
    /// What the conversion did, or null.
    pub note: Option<String>,
    /// Its picture width, when it is a picture.
    pub width: Option<u32>,
    /// Its picture height.
    pub height: Option<u32>,
}

/// The SHA-256 of bytes, as lowercase hex.
pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// The file store.
pub struct FileStore {
    /// The folder of the files.
    pub dir: PathBuf,
    derived_path: PathBuf,
    /// `derived.json`, loaded on first use; the lock also serialises its writes.
    derived: Mutex<Option<HashMap<String, Derived>>>,
}

impl FileStore {
    /// A store in `<data_dir>/files`.
    pub fn new(data_dir: &Path) -> Self {
        Self {
            dir: data_dir.join("files"),
            derived_path: data_dir.join("derived.json"),
            derived: Mutex::new(None),
        }
    }

    /// Where a file lives.
    pub fn path(&self, hash: &str, ext: FileExt) -> PathBuf {
        self.dir.join(format!("{hash}.{}", ext.as_str()))
    }

    /// A temp path in the store's folder (same file system, so it can be renamed into place).
    pub fn temp_path(&self) -> PathBuf {
        crate::fsx::temp_next_to(&self.dir.join("upload"))
    }

    /// Stores bytes (a no-op when the same content is already there).
    ///
    /// # Errors
    /// When the file can't be written.
    pub async fn put(&self, data: &[u8], ext: FileExt) -> Result<FileRef> {
        let hash = sha256_hex(data);
        let path = self.path(&hash, ext);
        if !tokio::fs::try_exists(&path).await.unwrap_or(false) {
            write_atomic(&path, data).await?;
        }
        Ok(FileRef {
            hash,
            ext,
            bytes: data.len() as u64,
        })
    }

    /// Stores a finished temp file whose hash is known (moved into place, or dropped when the
    /// same content is already stored).
    ///
    /// # Errors
    /// When the file can't be moved.
    pub async fn put_file(&self, tmp: &Path, hash: &str, bytes: u64, ext: FileExt) -> Result<FileRef> {
        let path = self.path(hash, ext);
        if tokio::fs::try_exists(&path).await.unwrap_or(false) {
            let _ = tokio::fs::remove_file(tmp).await;
        } else {
            move_into_place(tmp, &path).await?;
        }
        Ok(FileRef {
            hash: hash.to_string(),
            ext,
            bytes,
        })
    }

    /// Whether a file is stored with the size its reference claims.
    pub async fn has(&self, r: &FileRef) -> bool {
        tokio::fs::metadata(self.path(&r.hash, r.ext))
            .await
            .is_ok_and(|m| m.len() == r.bytes)
    }

    /// Something made from a file before (only when the made file is still there).
    ///
    /// # Errors
    /// When `derived.json` exists but can't be read.
    pub async fn get_derived(&self, key: &str) -> Result<Option<Derived>> {
        let found = {
            let mut guard = self.derived.lock().await;
            if guard.is_none() {
                *guard = Some(read_json_file(&self.derived_path).await?.unwrap_or_default());
            }
            guard.as_ref().and_then(|all| all.get(key).cloned())
        };
        match found {
            Some(d) if self.has(&d.file).await => Ok(Some(d)),
            _ => Ok(None),
        }
    }

    /// Remembers something made from a file.
    ///
    /// # Errors
    /// When `derived.json` can't be read or written.
    pub async fn set_derived(&self, key: &str, value: Derived) -> Result<()> {
        let mut guard = self.derived.lock().await;
        if guard.is_none() {
            *guard = Some(read_json_file(&self.derived_path).await?.unwrap_or_default());
        }
        let all = guard.get_or_insert_with(HashMap::new);
        all.insert(key.to_string(), value);
        write_atomic(&self.derived_path, serde_json::to_vec(all)?).await
    }

    /// The thumbnail made for a stored picture, if any.
    ///
    /// # Errors
    /// When `derived.json` can't be read.
    pub async fn known_thumbnail(&self, r: &FileRef) -> Result<Option<FileRef>> {
        Ok(self.get_derived(&format!("{}:thumb", r.hash)).await?.map(|d| d.file))
    }
}
