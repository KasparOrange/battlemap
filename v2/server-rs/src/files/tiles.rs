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
    let key = format!("{}:tiles{level}", source.hash);
    if let Some(m) = known(&state.files, &key).await {
        return Ok(m);
    }
    let _making = MAKING.lock().await;
    if let Some(m) = known(&state.files, &key).await {
        return Ok(m);
    }
    let path = state.files.path(&source.hash, source.ext);
    if !tokio::fs::try_exists(&path).await.unwrap_or(false) {
        return Err(TilesError::Missing);
    }
    let t0 = Instant::now();
    let max_pixels = state.images.max_pixels;
    let made = state
        .images
        .run(move || -> Result<(u32, u32, Cut), PictureError> {
            let data = std::fs::read(&path).map_err(|e| PictureError::Decode(e.to_string()))?;
            let img = convert::decode(&data, max_pixels)?;
            drop(data);
            let cut = cut(&img, level)?;
            Ok((img.width(), img.height(), cut))
        })
        .await?;
    let (source_w, source_h, cut) = made.map_err(|e| TilesError::Bad(e.to_string()))?;
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
