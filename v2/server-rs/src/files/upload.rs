//! One upload into the file store (`POST /files?ext=&format=`): the body is already in a temp
//! file (streamed, hashed on the way); here it is checked, converted when asked ("Store as"),
//! stored by content and given its thumbnail.
//!
//! - Pictures: PNG, JPEG and WebP are stored as they are, or converted (`format`). Other
//!   pictures the decoders read (GIF, TIFF, BMP) are always converted — to PNG when no format
//!   was asked for. A conversion that fails stores the upload as it came ("not converted: …").
//! - `json` must parse (checked streaming, without holding the parsed value); `pdf` must be a
//!   PDF. `.dd2vtt` files are split by the app at import and never uploaded whole.
//! - Memory: only picture work holds the file in memory, and only inside an image slot.

use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use image::DynamicImage;
use tokio::sync::Semaphore;

use super::convert::{self, PictureError, PictureExt, StoreFormat};
use super::sniff::{HEAD_BYTES, Sniffed, sniff};
use super::store::{Derived, FileStore};
use crate::wire::{FileExt, FileRef, UploadResult};

/// An upload the server refuses (400), with the reason for the app.
#[derive(Debug, thiserror::Error)]
pub enum UploadError {
    /// Refused, with a reason the app shows.
    #[error("{0}")]
    Bad(String),
    /// A failure of the server (disk, a worker that died).
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// The picture work: decoding and encoding hold an image slot and run off the async threads.
pub struct ImageWork {
    slots: Arc<Semaphore>,
    /// Largest picture decoded, in pixels.
    pub max_pixels: u64,
}

impl ImageWork {
    /// `slots` pictures at once, at most `max_pixels` each.
    pub fn new(slots: usize, max_pixels: u64) -> Self {
        Self {
            slots: Arc::new(Semaphore::new(slots.max(1))),
            max_pixels,
        }
    }

    /// Runs blocking picture work in a slot.
    ///
    /// # Errors
    /// When the worker panics.
    pub async fn run<T: Send + 'static>(&self, f: impl FnOnce() -> T + Send + 'static) -> anyhow::Result<T> {
        let _permit = self
            .slots
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| anyhow::anyhow!("image slots closed: {e}"))?;
        tokio::task::spawn_blocking(f)
            .await
            .map_err(|e| anyhow::anyhow!("image worker failed: {e}"))
    }
}

/// The first bytes of a file.
fn head_of(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut buf = Vec::with_capacity(HEAD_BYTES);
    std::fs::File::open(path)?.take(HEAD_BYTES as u64).read_to_end(&mut buf)?;
    Ok(buf)
}

/// Whether a file is one JSON value, read streaming.
fn json_error(path: &Path) -> Option<String> {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => return Some(e.to_string()),
    };
    serde_json::from_reader::<_, serde::de::IgnoredAny>(BufReader::new(file))
        .err()
        .map(|e| e.to_string())
}

/// Stores one upload. Takes the temp file `tmp` (moved into the store or removed).
///
/// - `hash` and `bytes`: the temp file's SHA-256 and size;
/// - `ext`: what the sender says it is, or `None` to go by the bytes alone;
/// - `format`: "Store as" (`Asis` keeps a PNG/JPEG/WebP as it came).
///
/// # Errors
/// [`UploadError::Bad`] when the bytes are empty or not what they claim to be (or over the
/// pixel limit); [`UploadError::Internal`] for disk failures.
pub async fn store_upload(
    store: &FileStore,
    images: &ImageWork,
    tmp: PathBuf,
    hash: &str,
    bytes: u64,
    ext: Option<FileExt>,
    format: StoreFormat,
) -> Result<UploadResult, UploadError> {
    let result = store_inner(store, images, &tmp, hash, bytes, ext, format).await;
    let _ = tokio::fs::remove_file(&tmp).await; // gone already when it was moved into the store
    result
}

async fn store_inner(
    store: &FileStore,
    images: &ImageWork,
    tmp: &Path,
    hash: &str,
    bytes: u64,
    ext: Option<FileExt>,
    format: StoreFormat,
) -> Result<UploadResult, UploadError> {
    if bytes == 0 {
        return Err(UploadError::Bad("empty file".into()));
    }
    let head = head_of(tmp).map_err(|e| anyhow::anyhow!("read upload: {e}"))?;
    let kind = sniff(&head);
    let plain = |r: FileRef| UploadResult {
        hash: r.hash,
        ext: r.ext,
        bytes: r.bytes,
        width: None,
        height: None,
        thumb: None,
        original_bytes: None,
        note: None,
    };

    let is_json = matches!(kind, Some(Sniffed::Json | Sniffed::Uvtt));
    if ext == Some(FileExt::Json) || (ext.is_none() && is_json) {
        if !is_json {
            return Err(UploadError::Bad("that is not a JSON file".into()));
        }
        let path = tmp.to_path_buf();
        if let Some(e) = tokio::task::spawn_blocking(move || json_error(&path))
            .await
            .map_err(|e| anyhow::anyhow!("json check failed: {e}"))?
        {
            return Err(UploadError::Bad(format!("not JSON: {e}")));
        }
        return Ok(plain(store.put_file(tmp, hash, bytes, FileExt::Json).await?));
    }
    if ext == Some(FileExt::Pdf) || (ext.is_none() && kind == Some(Sniffed::Pdf)) {
        if kind != Some(Sniffed::Pdf) {
            return Err(UploadError::Bad("that is not a PDF".into()));
        }
        return Ok(plain(store.put_file(tmp, hash, bytes, FileExt::Pdf).await?));
    }

    // A picture.
    let sniffed = match kind {
        Some(Sniffed::Png) => Some(PictureExt::Png),
        Some(Sniffed::Jpg) => Some(PictureExt::Jpg),
        Some(Sniffed::Webp) => Some(PictureExt::Webp),
        _ => None,
    };
    if let Some(k @ (Sniffed::Pdf | Sniffed::Json | Sniffed::Uvtt | Sniffed::Html)) = kind {
        return Err(UploadError::Bad(format!("that is a {}, not a picture", k.label())));
    }
    let max_pixels = images.max_pixels;
    let file = std::fs::File::open(tmp).map_err(|e| anyhow::anyhow!("open upload: {e}"))?;
    let info = match convert::picture_info(BufReader::new(file), max_pixels) {
        Ok(info) => info,
        Err(PictureError::TooManyPixels { megapixels, limit }) => {
            return Err(UploadError::Bad(format!(
                "the picture has {megapixels} megapixels — battlemap takes at most {limit} megapixels"
            )));
        }
        Err(_) => {
            return Err(UploadError::Bad(
                "not a picture battlemap can read (PNG, JPEG, WebP, GIF, TIFF, BMP)".into(),
            ));
        }
    };

    let target = match (format, sniffed) {
        (StoreFormat::Asis, Some(_)) => None,
        (StoreFormat::Asis, None) => Some(StoreFormat::Png),
        (f, _) => Some(f),
    };
    let mut decoded: Option<Arc<DynamicImage>> = None;
    let (stored, note, original_bytes) = match target {
        None => (
            store
                .put_file(tmp, hash, bytes, sniffed.map_or(FileExt::Png, PictureExt::file_ext))
                .await?,
            None,
            None,
        ),
        Some(target) => {
            let key = format!("{hash}:{}", target.name());
            match store.get_derived(&key).await? {
                Some(before) if before.width.is_some() && before.height.is_some() => (before.file, before.note, Some(bytes)),
                _ => {
                    let t0 = Instant::now();
                    let data = tokio::fs::read(tmp).await.map_err(|e| anyhow::anyhow!("read upload: {e}"))?;
                    let original = sniffed.map(|e| (data.len(), e));
                    let work = images
                        .run(move || -> Result<(Arc<DynamicImage>, convert::Converted, Vec<u8>), PictureError> {
                            let img = Arc::new(convert::decode(&data, max_pixels)?);
                            let c = convert::convert(&img, target, original)?;
                            Ok((img, c, data))
                        })
                        .await?;
                    match work {
                        Ok((img, c, data)) => {
                            decoded = Some(img);
                            let file = match &c.bytes {
                                Some(out) => store.put(out, c.ext.file_ext()).await?,
                                None => store.put(&data, c.ext.file_ext()).await?,
                            };
                            tracing::info!(target: "files", format = target.name(), from = bytes, to = file.bytes, ext = file.ext.as_str(), note = c.note.as_deref(), ms = t0.elapsed().as_millis() as u64, width = info.width, height = info.height, "Converted");
                            store
                                .set_derived(
                                    &key,
                                    Derived {
                                        file: file.clone(),
                                        note: c.note.clone(),
                                        width: Some(info.width),
                                        height: Some(info.height),
                                    },
                                )
                                .await?;
                            (file, c.note, Some(bytes))
                        }
                        Err(e) => {
                            let Some(ext) = sniffed else {
                                return Err(UploadError::Bad(format!("could not convert the picture: {e}")));
                            };
                            let mut note = format!("not converted: {e}");
                            note.truncate(note.floor_char_boundary(200));
                            tracing::warn!(target: "files", format = target.name(), bytes, error = %note, "Conversion failed, stored as is");
                            (store.put_file(tmp, hash, bytes, ext.file_ext()).await?, Some(note), Some(bytes))
                        }
                    }
                }
            }
        }
    };
    let thumb = thumbnail_of(store, images, &stored, decoded).await;
    Ok(UploadResult {
        hash: stored.hash,
        ext: stored.ext,
        bytes: stored.bytes,
        width: Some(info.width),
        height: Some(info.height),
        thumb,
        original_bytes,
        note,
    })
}

/// The thumbnail of a stored picture, made once and remembered.
///
/// `decoded` is the picture when it was decoded already (a conversion), else it is read from
/// the store. Returns `None` when it couldn't be made (logged).
pub async fn thumbnail_of(store: &FileStore, images: &ImageWork, file: &FileRef, decoded: Option<Arc<DynamicImage>>) -> Option<FileRef> {
    let key = format!("{}:thumb", file.hash);
    match store.get_derived(&key).await {
        Ok(Some(before)) => return Some(before.file),
        Ok(None) => {}
        Err(e) => tracing::warn!(target: "files", error = %e, "derived.json unreadable"),
    }
    let t0 = Instant::now();
    let max_pixels = images.max_pixels;
    let made = match decoded {
        Some(img) => images.run(move || convert::thumbnail(&img)).await,
        None => {
            let path = store.path(&file.hash, file.ext);
            images
                .run(move || -> Result<Vec<u8>, PictureError> {
                    let data = std::fs::read(&path).map_err(|e| PictureError::Decode(e.to_string()))?;
                    convert::thumbnail(&convert::decode(&data, max_pixels)?)
                })
                .await
        }
    };
    let bytes = match made {
        Ok(Ok(b)) => b,
        Ok(Err(e)) => {
            tracing::warn!(target: "files", of = &file.hash[..12], error = %e, "Thumbnail failed");
            return None;
        }
        Err(e) => {
            tracing::error!(target: "files", of = &file.hash[..12], error = %e, "Thumbnail worker failed");
            return None;
        }
    };
    let thumb = match store.put(&bytes, FileExt::Webp).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(target: "files", error = %e, "Thumbnail not stored");
            return None;
        }
    };
    if let Err(e) = store
        .set_derived(
            &key,
            Derived {
                file: thumb.clone(),
                note: None,
                width: None,
                height: None,
            },
        )
        .await
    {
        tracing::error!(target: "files", error = %e, "derived.json not written");
    }
    tracing::info!(target: "files", of = &file.hash[..12], bytes = thumb.bytes, ms = t0.elapsed().as_millis() as u64, "Thumbnail made");
    Some(thumb)
}
