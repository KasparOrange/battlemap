//! "Store as": re-encoding an uploaded picture, by the old dev server's measured rules
//! (`tools/dev_server.py` `convert_picture`, ported to the Bun server's `files/convert.ts`). The
//! pixels keep their size, so a picture grid (pixel positions) stays valid:
//!
//! - **webp**: lossy quality 90, or lossless when that is no more than 1.5 × the lossy size
//!   (line art: a third of the PNG; tried up to 50 MP); a picture over 16383 px a side becomes
//!   JPEG (WebP's limit); when the result isn't smaller than a PNG/JPEG/WebP original, the
//!   original stays ("already smaller as it was").
//! - **jpeg**: quality 90, transparency flattened onto black (the TV's background).
//! - **png**: lossless, maximum compression.
//!
//! A picture with an EXIF orientation is turned upright first. Pictures over the pixel limit are
//! refused from their header, before anything is decoded (review #5: a small file can claim a
//! gigapixel). Everything here is blocking CPU work: call it from `spawn_blocking`, holding an
//! image slot.
//!
//! Decoders: PNG, JPEG, WebP, GIF (first frame), TIFF, BMP. Encoders: libwebp (lossy and
//! lossless), the `image` crate's JPEG and PNG.

use std::io::{BufRead, Cursor, Read, Seek};

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageFormat, ImageReader, Limits};

/// What to store a picture as (`?format=`); `Asis` keeps the upload's bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreFormat {
    /// WebP (lossy q90 or lossless, see the rules).
    Webp,
    /// JPEG q90 on black.
    Jpeg,
    /// PNG, maximum compression.
    Png,
    /// As uploaded (PNG, JPEG, WebP); other pictures become PNG.
    Asis,
}

impl StoreFormat {
    /// Reads `?format=` (case-insensitive).
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "webp" => Some(Self::Webp),
            "jpeg" => Some(Self::Jpeg),
            "png" => Some(Self::Png),
            "asis" => Some(Self::Asis),
            _ => None,
        }
    }

    /// The name in `derived.json` keys (`<hash>:<name>`).
    pub fn name(self) -> &'static str {
        match self {
            Self::Webp => "webp",
            Self::Jpeg => "jpeg",
            Self::Png => "png",
            Self::Asis => "asis",
        }
    }
}

/// The picture kinds the server stores.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PictureExt {
    /// PNG.
    Png,
    /// JPEG.
    Jpg,
    /// WebP.
    Webp,
}

impl PictureExt {
    /// As a stored file kind.
    pub fn file_ext(self) -> crate::wire::FileExt {
        match self {
            Self::Png => crate::wire::FileExt::Png,
            Self::Jpg => crate::wire::FileExt::Jpg,
            Self::Webp => crate::wire::FileExt::Webp,
        }
    }
}

/// WebP's largest side.
pub const WEBP_MAX_SIDE: u32 = 16_383;
/// Above this many pixels only lossy WebP is tried (lossless takes long and needs ~40 bytes per
/// pixel: 12 MP ≈ 460 MB). The default of `LOSSLESS_MAX_PIXELS`; the TV box sets it lower.
pub const WEBP_LOSSLESS_MAX_PIXELS: u64 = 50_000_000;
/// The thumbnails' long side.
pub const THUMB_SIDE: u32 = 288;

/// Why a picture couldn't be read or converted.
#[derive(Debug, thiserror::Error)]
pub enum PictureError {
    /// Not a picture any decoder here reads.
    #[error("not a picture")]
    NotAPicture,
    /// More pixels than the limit (from the header; nothing was decoded).
    #[error("the picture has {megapixels} megapixels, battlemap takes at most {limit}")]
    TooManyPixels {
        /// Its size in megapixels.
        megapixels: u64,
        /// The limit in megapixels.
        limit: u64,
    },
    /// Decoding failed (a broken file).
    #[error("{0}")]
    Decode(String),
    /// Encoding failed.
    #[error("{0}")]
    Encode(String),
}

/// Facts about a picture, from its header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PictureInfo {
    /// Width in pixels (upright).
    pub width: u32,
    /// Height in pixels (upright).
    pub height: u32,
    /// Its format.
    pub format: ImageFormat,
    /// Whether it has an alpha channel.
    pub alpha: bool,
    /// Its EXIF orientation.
    pub orientation: Orientation,
}

/// A converted picture.
#[derive(Debug, Clone)]
pub struct Converted {
    /// The bytes to store, or `None` when the original stays ("already smaller as it was").
    pub bytes: Option<Vec<u8>>,
    /// Their kind.
    pub ext: PictureExt,
    /// What happened ("lossless", "over 16383 px, stored as JPEG", …), or `None`.
    pub note: Option<String>,
}

/// Decoder limits: no allocation beyond what `max_pixels` RGBA pixels need.
fn limits(max_pixels: u64) -> Limits {
    let mut l = Limits::default();
    l.max_alloc = Some(max_pixels.saturating_mul(8).max(64 * 1024 * 1024));
    l
}

/// A reader that guessed the format from the bytes (never the name).
fn reader<R: BufRead + Seek>(r: R) -> Option<ImageReader<R>> {
    let reader = ImageReader::new(r).with_guessed_format().ok()?;
    let format = reader.format()?;
    matches!(
        format,
        ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP | ImageFormat::Gif | ImageFormat::Tiff | ImageFormat::Bmp
    )
    .then_some(reader)
}

/// Reads a picture's size, format and orientation from its header, and refuses it when it has
/// more than `max_pixels` pixels.
///
/// # Errors
/// [`PictureError::NotAPicture`] when no decoder reads it, [`PictureError::TooManyPixels`] over
/// the limit.
pub fn picture_info<R: BufRead + Seek>(mut r: R, max_pixels: u64) -> Result<PictureInfo, PictureError> {
    // The header alone first: a file that claims too many pixels is refused even when the
    // decoder would want more of it (a bomb needs no valid pixel data to do harm).
    let mut head = Vec::with_capacity(64 * 1024);
    (&mut r)
        .take(64 * 1024)
        .read_to_end(&mut head)
        .map_err(|_| PictureError::NotAPicture)?;
    r.rewind().map_err(|_| PictureError::NotAPicture)?;
    if let Ok(size) = imagesize::blob_size(&head) {
        too_many(size.width as u64 * size.height as u64, max_pixels)?;
    }
    let reader = reader(r).ok_or(PictureError::NotAPicture)?;
    let format = reader.format().ok_or(PictureError::NotAPicture)?;
    let mut decoder = reader.into_decoder().map_err(|_| PictureError::NotAPicture)?;
    let (w, h) = decoder.dimensions();
    if w == 0 || h == 0 {
        return Err(PictureError::NotAPicture);
    }
    too_many(u64::from(w) * u64::from(h), max_pixels)?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let turned = matches!(
        orientation,
        Orientation::Rotate90 | Orientation::Rotate270 | Orientation::Rotate90FlipH | Orientation::Rotate270FlipH
    );
    let alpha = decoder.color_type().has_alpha();
    Ok(PictureInfo {
        width: if turned { h } else { w },
        height: if turned { w } else { h },
        format,
        alpha,
        orientation,
    })
}

/// Refuses `pixels` over `max_pixels`.
fn too_many(pixels: u64, max_pixels: u64) -> Result<(), PictureError> {
    if pixels > max_pixels {
        return Err(PictureError::TooManyPixels {
            megapixels: pixels.div_ceil(1_000_000),
            limit: max_pixels / 1_000_000,
        });
    }
    Ok(())
}

/// Decodes a picture upright (EXIF orientation applied), refusing it over the pixel limit.
///
/// # Errors
/// As [`picture_info`], plus [`PictureError::Decode`] for a broken file.
pub fn decode(data: &[u8], max_pixels: u64) -> Result<DynamicImage, PictureError> {
    let info = picture_info(Cursor::new(data), max_pixels)?;
    let mut reader = reader(Cursor::new(data)).ok_or(PictureError::NotAPicture)?;
    reader.limits(limits(max_pixels));
    let decoder = reader.into_decoder().map_err(|e| PictureError::Decode(e.to_string()))?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| PictureError::Decode(e.to_string()))?;
    img.apply_orientation(info.orientation);
    Ok(img)
}

/// Lossy WebP at `quality` (0–100).
fn webp_lossy(img: &DynamicImage, quality: f32) -> Result<Vec<u8>, PictureError> {
    webp_encode(img, Some(quality))
}

/// WebP, lossless (`None`) or lossy.
fn webp_encode(img: &DynamicImage, quality: Option<f32>) -> Result<Vec<u8>, PictureError> {
    let (w, h) = (img.width(), img.height());
    let encode = |enc: webp::Encoder| match quality {
        Some(q) => enc.encode_simple(false, q),
        None => enc.encode_simple(true, 75.0),
    };
    // Borrow the pixels when they are already 8-bit RGB(A); copy only other layouts.
    let out = match img {
        DynamicImage::ImageRgb8(rgb) => encode(webp::Encoder::from_rgb(rgb.as_raw(), w, h)),
        DynamicImage::ImageRgba8(rgba) => encode(webp::Encoder::from_rgba(rgba.as_raw(), w, h)),
        other if other.color().has_alpha() => encode(webp::Encoder::from_rgba(other.to_rgba8().as_raw(), w, h)),
        other => encode(webp::Encoder::from_rgb(other.to_rgb8().as_raw(), w, h)),
    };
    out.map(|m| m.to_vec()).map_err(|e| PictureError::Encode(format!("webp: {e:?}")))
}

/// JPEG q90, transparency flattened onto black.
fn jpeg(img: &DynamicImage) -> Result<Vec<u8>, PictureError> {
    let rgb = if img.color().has_alpha() {
        let rgba = img.to_rgba8();
        let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
        for (o, p) in rgb.pixels_mut().zip(rgba.pixels()) {
            let a = u16::from(p[3]);
            *o = image::Rgb([0, 1, 2].map(|i| ((u16::from(p[i]) * a + 127) / 255) as u8));
        }
        rgb
    } else {
        img.to_rgb8()
    };
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 90)
        .write_image(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| PictureError::Encode(format!("jpeg: {e}")))?;
    Ok(out)
}

/// PNG, maximum compression, the picture's own colour type.
fn png(img: &DynamicImage) -> Result<Vec<u8>, PictureError> {
    let mut out = Vec::new();
    let enc = PngEncoder::new_with_quality(&mut out, CompressionType::Best, FilterType::Adaptive);
    let converted;
    let img = match img {
        DynamicImage::ImageLuma8(_) | DynamicImage::ImageLumaA8(_) | DynamicImage::ImageRgb8(_) | DynamicImage::ImageRgba8(_) => img,
        other if other.color().has_alpha() => {
            converted = DynamicImage::ImageRgba8(other.to_rgba8());
            &converted
        }
        other => {
            converted = DynamicImage::ImageRgb8(other.to_rgb8());
            &converted
        }
    };
    enc.write_image(img.as_bytes(), img.width(), img.height(), img.color().into())
        .map_err(|e| PictureError::Encode(format!("png: {e}")))?;
    Ok(out)
}

/// Re-encodes a decoded (upright) picture.
///
/// - `format` is what was asked (not `Asis`);
/// - `lossless_max_pixels`: above this, lossless WebP isn't tried;
/// - `original` is the upload's bytes and kind when it was a PNG/JPEG/WebP (they may stay as
///   they are), else `None` (GIF, TIFF, … are always converted).
///
/// # Errors
/// [`PictureError::Encode`] when an encoder fails.
pub fn convert(
    img: &DynamicImage,
    format: StoreFormat,
    original: Option<(usize, PictureExt)>,
    lossless_max_pixels: u64,
) -> Result<Converted, PictureError> {
    let mut target = format;
    let mut note = None;
    if target == StoreFormat::Webp && img.width().max(img.height()) > WEBP_MAX_SIDE {
        target = StoreFormat::Jpeg;
        note = Some(format!("over {WEBP_MAX_SIDE} px, stored as JPEG"));
    }
    match target {
        StoreFormat::Png | StoreFormat::Asis => {
            return Ok(Converted {
                bytes: Some(png(img)?),
                ext: PictureExt::Png,
                note,
            });
        }
        StoreFormat::Jpeg => {
            return Ok(Converted {
                bytes: Some(jpeg(img)?),
                ext: PictureExt::Jpg,
                note,
            });
        }
        StoreFormat::Webp => {}
    }
    let mut best = webp_lossy(img, 90.0)?;
    if u64::from(img.width()) * u64::from(img.height()) <= lossless_max_pixels {
        let lossless = webp_encode(img, None)?;
        if lossless.len() as f64 <= best.len() as f64 * 1.5 {
            best = lossless;
            note = Some("lossless".into());
        }
    }
    if let Some((len, ext)) = original
        && best.len() >= len
    {
        return Ok(Converted {
            bytes: None,
            ext,
            note: Some("already smaller as it was".into()),
        });
    }
    Ok(Converted {
        bytes: Some(best),
        ext: PictureExt::Webp,
        note,
    })
}

/// A small picture for lists: at most [`THUMB_SIDE`] pixels on its long side (never enlarged),
/// WebP q80.
///
/// # Errors
/// [`PictureError::Encode`] when the encoder fails.
pub fn thumbnail(img: &DynamicImage) -> Result<Vec<u8>, PictureError> {
    if img.width() <= THUMB_SIDE && img.height() <= THUMB_SIDE {
        return webp_lossy(img, 80.0);
    }
    webp_lossy(&img.thumbnail(THUMB_SIDE, THUMB_SIDE), 80.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(image::RgbImage::from_pixel(w, h, image::Rgb([0x28, 0x5a, 0xa0])))
    }

    fn noise(w: u32, h: u32) -> DynamicImage {
        let mut x: u32 = 2_463_534_242;
        DynamicImage::ImageRgb8(image::RgbImage::from_fn(w, h, |px, _| {
            let mut c = [0u8; 3];
            for v in &mut c {
                x ^= x << 13;
                x ^= x >> 17;
                x ^= x << 5;
                *v = ((x & 0x3f) + px / 2) as u8;
            }
            image::Rgb(c)
        }))
    }

    #[test]
    fn webp_rules() {
        let line_art = convert(&flat(400, 300), StoreFormat::Webp, None, WEBP_LOSSLESS_MAX_PIXELS).unwrap();
        assert_eq!((line_art.ext, line_art.note.as_deref()), (PictureExt::Webp, Some("lossless")));
        let painted = convert(&noise(300, 200), StoreFormat::Webp, None, WEBP_LOSSLESS_MAX_PIXELS).unwrap();
        assert_eq!((painted.ext, painted.note.as_deref()), (PictureExt::Webp, None));
        let wide = convert(&flat(16_400, 8), StoreFormat::Webp, None, WEBP_LOSSLESS_MAX_PIXELS).unwrap();
        assert_eq!(
            (wide.ext, wide.note.as_deref()),
            (PictureExt::Jpg, Some("over 16383 px, stored as JPEG"))
        );
        let kept = convert(
            &noise(200, 200),
            StoreFormat::Webp,
            Some((10, PictureExt::Webp)),
            WEBP_LOSSLESS_MAX_PIXELS,
        )
        .unwrap();
        assert!(kept.bytes.is_none());
        assert_eq!(kept.note.as_deref(), Some("already smaller as it was"));
    }

    #[test]
    fn decode_reads_the_header_first_and_refuses_bombs() {
        let png_bytes = png(&flat(20, 10)).unwrap();
        let info = picture_info(Cursor::new(&png_bytes), 1_000).unwrap();
        assert_eq!((info.width, info.height, info.format), (20, 10, ImageFormat::Png));
        assert!(matches!(
            picture_info(Cursor::new(&png_bytes), 100),
            Err(PictureError::TooManyPixels { .. })
        ));
        assert!(matches!(
            picture_info(Cursor::new(b"just text"), 100),
            Err(PictureError::NotAPicture)
        ));
        assert_eq!(decode(&png_bytes, 1_000).unwrap().width(), 20);
    }

    #[test]
    fn thumbnails_fit_and_never_grow() {
        let t = decode(&thumbnail(&flat(600, 400)).unwrap(), 10_000_000).unwrap();
        assert_eq!((t.width(), t.height()), (288, 192));
        let t = decode(&thumbnail(&flat(30, 20)).unwrap(), 10_000_000).unwrap();
        assert_eq!((t.width(), t.height()), (30, 20));
    }

    #[test]
    fn jpeg_flattens_onto_black() {
        let img = DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(16, 16, image::Rgba([40, 90, 160, 128])));
        let back = decode(&jpeg(&img).unwrap(), 1_000).unwrap().to_rgb8();
        let p = back.get_pixel(8, 8);
        assert!(p[0] < 30 && (70..95).contains(&p[2]), "{p:?}");
    }
}
