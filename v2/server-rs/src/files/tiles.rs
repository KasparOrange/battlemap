//! Tile sets for the TV (`GET /api/tiles/<hash>.<ext>?level=k`): a big map picture cut into
//! 512 px tiles, each a content-addressed file, so the TV box only ever decodes the tiles around
//! its window and never the whole picture (`docs/render.md` "Tile streaming for big maps").
//!
//! - The picture is decoded once (in an image slot), scaled by 2^-level, cut in picture space
//!   into `TILE` px tiles with an `APRON` px border from the neighbours (no seams under linear
//!   filtering), WebP q85, plus a ≤ `PREVIEW_SIDE` px preview of the whole picture.
//! - The manifest ([`TileManifest`]) is a JSON file in the store, remembered in `derived.json`
//!   as `<hash>:tiles<level>`; asking again answers it without decoding anything.
//! - One set is made at a time ([`MAKING`]): a second request for the same set waits and then
//!   finds it made.
//! - A picture big enough to stream is cut right after its upload ([`cut_at_upload`]), so the
//!   TV's first request finds its set made, or waits for that same cut.

use std::sync::LazyLock;
use std::time::Instant;

use axum::extract::{Query, Request, State};
use axum::http::StatusCode;
use axum::response::Response;
use image::DynamicImage;
use image::imageops::FilterType;
use serde::Deserialize;
use tokio::sync::Mutex;

use super::convert::{self, PictureError};
use super::store::{Derived, FILE_NAME, FileStore};
use crate::http::respond::{json, refuse};
use crate::state::Shared;
use crate::wire::{FileExt, FileRef, TileManifest};

/// Core tile side in pixels.
pub const TILE: u32 = 512;

/// Border each tile file carries from its neighbours, in pixels.
pub const APRON: u32 = 1;

/// Longest side of the preview.
pub const PREVIEW_SIDE: u32 = 1024;

/// Highest level asked for (2^-4 = a sixteenth).
pub const MAX_LEVEL: u32 = 4;

/// The TV streams a map whose texture at its density would pass this (app
/// `TV_BUDGET.streamAboveBytes`, 64 MiB) — keep the two equal.
pub const STREAM_ABOVE_BYTES: u64 = 64 << 20;

/// Bytes per texel of a map texture (RGBA8, app `BYTES_PER_TEXEL`).
const BYTES_PER_TEXEL: u64 = 4;

/// WebP quality of tiles and preview.
const QUALITY: f32 = 85.0;

/// Serialises the making of tile sets (each holds a whole decoded picture in memory).
static MAKING: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

/// A cut picture, before it is stored.
#[derive(Debug)]
pub struct Cut {
    /// Scaled width.
    pub width: u32,
    /// Scaled height.
    pub height: u32,
    /// Tiles across.
    pub cols: u32,
    /// Tiles down.
    pub rows: u32,
    /// Encoded tiles, row by row.
    pub tiles: Vec<Vec<u8>>,
    /// The encoded preview.
    pub preview: Vec<u8>,
}

/// One tile's file rectangle on the scaled picture: the core `[i·TILE, (i+1)·TILE)` clipped to
/// the picture, grown by the apron where a neighbour is.
///
/// # Returns
/// `(x, y, w, h)` in scaled pixels.
pub fn tile_rect(i: u32, j: u32, width: u32, height: u32) -> (u32, u32, u32, u32) {
    let axis = |k: u32, len: u32| {
        let start = k * TILE;
        let end = ((k + 1) * TILE).min(len);
        let a = start.saturating_sub(APRON);
        let b = (end + APRON).min(len);
        (a, b - a)
    };
    let (x, w) = axis(i, width);
    let (y, h) = axis(j, height);
    (x, y, w, h)
}

/// The scaled size of a picture at a level (rounded up, never 0).
pub fn level_size(w: u32, h: u32, level: u32) -> (u32, u32) {
    let d = 1u32 << level;
    (w.div_ceil(d).max(1), h.div_ceil(d).max(1))
}

/// Cuts a decoded picture into the tiles of a level and its preview.
///
/// # Errors
/// [`PictureError::Encode`] when the WebP encoder fails.
pub fn cut(img: &DynamicImage, level: u32) -> Result<Cut, PictureError> {
    let (width, height) = level_size(img.width(), img.height(), level);
    let scaled;
    let pic = if (width, height) == (img.width(), img.height()) {
        img
    } else {
        scaled = img.resize_exact(width, height, FilterType::Triangle);
        &scaled
    };
    let cols = width.div_ceil(TILE);
    let rows = height.div_ceil(TILE);
    let mut tiles = Vec::with_capacity((cols * rows) as usize);
    for j in 0..rows {
        for i in 0..cols {
            let (x, y, w, h) = tile_rect(i, j, width, height);
            tiles.push(convert::webp_lossy(&pic.crop_imm(x, y, w, h), QUALITY)?);
        }
    }
    let preview = convert::webp_lossy(&pic.thumbnail(PREVIEW_SIDE, PREVIEW_SIDE), QUALITY)?;
    Ok(Cut {
        width,
        height,
        cols,
        rows,
        tiles,
        preview,
    })
}

/// Why a tile set can't be had.
#[derive(Debug, thiserror::Error)]
pub enum TilesError {
    /// The picture isn't in the store.
    #[error("no such picture")]
    Missing,
    /// The picture can't be decoded (or is over the pixel limit).
    #[error("{0}")]
    Bad(String),
    /// The server failed (disk, worker).
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// The tile set of a stored picture at a level, made on the first call.
///
/// # Errors
/// [`TilesError::Missing`] when the picture isn't stored, [`TilesError::Bad`] when it can't be
/// decoded, [`TilesError::Internal`] for disk and worker failures.
pub async fn tile_set(state: &Shared, source: &FileRef, level: u32) -> Result<TileManifest, TilesError> {
    let mut sets = tile_sets(state, source, &[level]).await?;
    sets.pop().ok_or_else(|| TilesError::Internal(anyhow::anyhow!("no tile set made")))
}

/// The tile sets of a stored picture at several levels, in the order asked; the missing ones are
/// cut from one decode of the picture.
///
/// Every cut holds [`MAKING`] and looks for a made set again once it has the lock, so a request
/// that comes while the same set is being cut (the cut at upload, another TV) waits for that cut
/// and answers its set — a set is never cut twice.
///
/// # Errors
/// As [`tile_set`].
pub async fn tile_sets(state: &Shared, source: &FileRef, levels: &[u32]) -> Result<Vec<TileManifest>, TilesError> {
    let key = |level: u32| format!("{}:tiles{level}", source.hash);
    let mut found = Vec::with_capacity(levels.len());
    for &level in levels {
        found.push(known(&state.files, &key(level)).await);
    }
    if found.iter().all(Option::is_some) {
        return Ok(found.into_iter().flatten().collect());
    }
    let _making = MAKING.lock().await;
    let mut missing = Vec::new();
    for (slot, &level) in found.iter_mut().zip(levels) {
        if slot.is_none() {
            *slot = known(&state.files, &key(level)).await;
            if slot.is_none() && !missing.contains(&level) {
                missing.push(level);
            }
        }
    }
    if missing.is_empty() {
        return Ok(found.into_iter().flatten().collect());
    }
    let path = state.files.path(&source.hash, source.ext);
    if !tokio::fs::try_exists(&path).await.unwrap_or(false) {
        return Err(TilesError::Missing);
    }
    let t0 = Instant::now();
    let max_pixels = state.images.max_pixels;
    let cut_levels = missing.clone();
    let made = state
        .images
        .run(move || -> Result<(u32, u32, Vec<Cut>), PictureError> {
            let data = std::fs::read(&path).map_err(|e| PictureError::Decode(e.to_string()))?;
            let img = convert::decode(&data, max_pixels)?;
            drop(data);
            let cuts = cut_levels.iter().map(|&level| cut(&img, level)).collect::<Result<Vec<_>, _>>()?;
            Ok((img.width(), img.height(), cuts))
        })
        .await?;
    let (source_w, source_h, cuts) = made.map_err(|e| TilesError::Bad(e.to_string()))?;
    for (level, cut) in missing.into_iter().zip(cuts) {
        let manifest = store_set(state, source, (source_w, source_h), level, cut, t0).await?;
        for (slot, &l) in found.iter_mut().zip(levels) {
            if l == level {
                *slot = Some(manifest.clone());
            }
        }
    }
    Ok(found.into_iter().flatten().collect())
}

/// Stores a cut's tiles, preview and manifest, and remembers the manifest in `derived.json`.
async fn store_set(
    state: &Shared,
    source: &FileRef,
    (source_w, source_h): (u32, u32),
    level: u32,
    cut: Cut,
    t0: Instant,
) -> Result<TileManifest, TilesError> {
    let key = format!("{}:tiles{level}", source.hash);
    let mut tiles = Vec::with_capacity(cut.tiles.len());
    let mut bytes = 0u64;
    for t in &cut.tiles {
        let r = state.files.put(t, FileExt::Webp).await?;
        bytes += r.bytes;
        tiles.push(r);
    }
    let preview = state.files.put(&cut.preview, FileExt::Webp).await?;
    let manifest = TileManifest {
        v: 1,
        source: source.clone(),
        source_w,
        source_h,
        level,
        width: cut.width,
        height: cut.height,
        tile: TILE,
        apron: APRON,
        cols: cut.cols,
        rows: cut.rows,
        tiles,
        preview,
    };
    let file = state
        .files
        .put(&serde_json::to_vec(&manifest).map_err(anyhow::Error::from)?, FileExt::Json)
        .await?;
    state
        .files
        .set_derived(
            &key,
            Derived {
                file,
                note: None,
                width: Some(cut.width),
                height: Some(cut.height),
            },
        )
        .await?;
    tracing::info!(target: "files", of = &source.hash[..12], level, width = cut.width, height = cut.height, tiles = manifest.tiles.len(),
        tile_bytes = bytes, ms = t0.elapsed().as_millis() as u64, "Tile set made");
    Ok(manifest)
}

/// The levels a TV can stream a `width × height` picture at — the ones [`cut_at_upload`] cuts.
///
/// The TV streams a map when its texture at the TV's density would pass
/// [`STREAM_ABOVE_BYTES`] (app `shouldStream`, `tile-window.ts`). That density is at most the
/// level picture's own, so the texture is at most the level's pixels × 4 bytes: a level under the
/// threshold is never streamed whatever the grid, and only the levels over it are worth cutting
/// before the grid is known — for most big maps just level 0.
pub fn stream_levels(width: u32, height: u32) -> Vec<u32> {
    (0..=MAX_LEVEL)
        .take_while(|&k| {
            let (w, h) = level_size(width, height, k);
            u64::from(w) * u64::from(h) * BYTES_PER_TEXEL > STREAM_ABOVE_BYTES
        })
        .collect()
}

/// Starts cutting a just-stored picture's tile sets in the background (the levels of
/// [`stream_levels`]; nothing for a picture too small to stream), so the TV's first
/// `GET /api/tiles` finds them made — or, coming during the cut, waits for this same cut
/// ([`tile_sets`]). Failures are only logged: the TV's request then cuts (or refuses) as before.
pub fn cut_at_upload(state: &Shared, source: FileRef, width: u32, height: u32) {
    if !matches!(source.ext, FileExt::Png | FileExt::Jpg | FileExt::Webp) {
        return;
    }
    let levels = stream_levels(width, height);
    if levels.is_empty() {
        return;
    }
    let state = state.clone();
    tracing::info!(target: "files", of = &source.hash[..12], levels = ?levels, width, height, "Tile cut started at upload");
    tokio::spawn(async move {
        let t0 = Instant::now();
        match tile_sets(&state, &source, &levels).await {
            Ok(sets) => tracing::info!(target: "files", of = &source.hash[..12], levels = ?levels,
                tiles = sets.iter().map(|m| m.tiles.len()).sum::<usize>(), ms = t0.elapsed().as_millis() as u64, "Tile cut at upload done"),
            Err(e) => {
                tracing::warn!(target: "files", of = &source.hash[..12], levels = ?levels, error = format!("{e:#}"), "Tile cut at upload failed")
            }
        }
    });
}

/// A manifest made before, when it and its files are still stored.
async fn known(store: &FileStore, key: &str) -> Option<TileManifest> {
    let d = store.get_derived(key).await.ok().flatten()?;
    let raw = tokio::fs::read(store.path(&d.file.hash, d.file.ext)).await.ok()?;
    let m: TileManifest = serde_json::from_slice(&raw).ok()?;
    for t in m.tiles.iter().chain(std::iter::once(&m.preview)) {
        if !store.has(t).await {
            return None;
        }
    }
    Some(m)
}

/// The query of `GET /api/tiles/…`.
#[derive(Debug, Deserialize)]
pub struct TilesQuery {
    /// The level (0 = the picture's own size), default 0.
    pub level: Option<u32>,
}

/// `GET /api/tiles/<hash>.<ext>?level=k` → [`TileManifest`].
pub async fn get_tiles(State(state): State<Shared>, Query(q): Query<TilesQuery>, req: Request) -> Response {
    let name = req.uri().path().trim_start_matches("/api/tiles/").to_string();
    let Some(m) = FILE_NAME.captures(&name) else {
        return refuse(StatusCode::NOT_FOUND, "no such picture");
    };
    let hash = m.get(1).map_or("", |h| h.as_str()).to_string();
    let ext = match FileExt::parse(m.get(2).map_or("", |e| e.as_str())) {
        Some(e @ (FileExt::Png | FileExt::Jpg | FileExt::Webp)) => e,
        _ => return refuse(StatusCode::BAD_REQUEST, "only pictures are cut into tiles"),
    };
    let level = q.level.unwrap_or(0);
    if level > MAX_LEVEL {
        return refuse(StatusCode::BAD_REQUEST, format!("level must be 0–{MAX_LEVEL}"));
    }
    let path = state.files.path(&hash, ext);
    if let Some(up) = &state.upstream
        && !tokio::fs::try_exists(&path).await.unwrap_or(false)
        && let Err(e) = up.pull_file(&state, &hash, ext).await
    {
        tracing::debug!(target: "upstream", file = %name, error = format!("{e:#}"), "Not pulled from upstream");
    }
    let bytes = match tokio::fs::metadata(&path).await {
        Ok(md) => md.len(),
        Err(_) => return refuse(StatusCode::NOT_FOUND, "no such picture"),
    };
    let source = FileRef { hash, ext, bytes };
    match tile_set(&state, &source, level).await {
        Ok(m) => json(StatusCode::OK, &m),
        Err(TilesError::Missing) => refuse(StatusCode::NOT_FOUND, "no such picture"),
        Err(TilesError::Bad(why)) => {
            tracing::warn!(target: "files", of = &source.hash[..12], level, reason = %why, "Tile set refused");
            refuse(StatusCode::BAD_REQUEST, why)
        }
        Err(TilesError::Internal(e)) => {
            tracing::error!(target: "files", of = &source.hash[..12], level, error = format!("{e:#}"), "Tile set failed");
            refuse(StatusCode::INTERNAL_SERVER_ERROR, "server error")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn rects_cover_the_picture_with_aprons_inside() {
        // 1100 × 600 → 3 × 2 tiles
        assert_eq!(tile_rect(0, 0, 1100, 600), (0, 0, 513, 513));
        assert_eq!(tile_rect(1, 0, 1100, 600), (511, 0, 514, 513));
        assert_eq!(tile_rect(2, 1, 1100, 600), (1023, 511, 77, 89));
        // a picture smaller than a tile: one tile, no apron
        assert_eq!(tile_rect(0, 0, 300, 200), (0, 0, 300, 200));
    }

    #[test]
    fn levels_round_up() {
        assert_eq!(level_size(7616, 4256, 0), (7616, 4256));
        assert_eq!(level_size(7617, 4257, 1), (3809, 2129));
        assert_eq!(level_size(1, 1, 4), (1, 1));
    }

    #[test]
    fn only_levels_a_tv_can_stream_are_cut_at_upload() {
        // 7616 × 4256 = 32 Mpx → 130 MB at level 0, 32 MB at level 1
        assert_eq!(stream_levels(7616, 4256), vec![0]);
        // 12000 × 8000 = 96 Mpx → 384 MB, 96 MB, 24 MB
        assert_eq!(stream_levels(12000, 8000), vec![0, 1]);
        // 4096 × 4096 is exactly 64 MiB → not over
        assert!(stream_levels(4096, 4096).is_empty());
        assert!(stream_levels(2000, 1200).is_empty());
    }

    #[test]
    fn cut_makes_every_tile_and_a_preview() {
        let img = DynamicImage::ImageRgb8(RgbImage::from_fn(1100, 600, |x, y| Rgb([(x % 256) as u8, (y % 256) as u8, 90])));
        let c = cut(&img, 0).unwrap();
        assert_eq!((c.width, c.height, c.cols, c.rows, c.tiles.len()), (1100, 600, 3, 2, 6));
        let last = image::load_from_memory(&c.tiles[5]).unwrap();
        assert_eq!((last.width(), last.height()), (77, 89));
        let p = image::load_from_memory(&c.preview).unwrap();
        assert_eq!((p.width(), p.height()), (1024, 559));
        let half = cut(&img, 1).unwrap();
        assert_eq!((half.width, half.height, half.cols, half.rows), (550, 300, 2, 1));
        let first = image::load_from_memory(&half.tiles[0]).unwrap();
        assert_eq!((first.width(), first.height()), (513, 300));
    }
}
