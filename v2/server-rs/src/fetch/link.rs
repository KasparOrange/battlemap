//! The link fetch: what a link points to — a picture, a PDF, a `.dd2vtt`, or the main picture
//! of a web page — downloaded into `uploads/` (removed after 7 days) for the app to import like
//! a file from the device. Ported from the Bun server (`server/src/fetch/link.ts`), itself
//! from the old dev server's `/fetch` (`tools/dev_server.py`):
//!
//! - Google Drive (`file/d/<id>`, `open?id=`, `uc?id=`) and Dropbox (`dl=1`) share links become
//!   direct downloads; Drive's "can't scan for viruses" page is answered by its confirm form.
//! - A web page gives its `og:image` / `twitter:image`, `image_src`, else its first `<img>`.
//! - The kind is read from the bytes; other pictures (GIF, TIFF, BMP) become PNG.

use std::io::Read;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use url::Url;

use super::download::{Download, Fetcher};
use super::guard::Refused;
use crate::files::convert::{self, PictureError, StoreFormat};
use crate::files::sniff::{HEAD_BYTES, Sniffed, sniff};
use crate::files::upload::ImageWork;
use crate::fsx::{move_into_place, random_hex, temp_next_to};
use crate::wire::{FetchKind, Fetched};

static DRIVE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})").expect("valid pattern"));
static DROPBOX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^https?://([^/]*\.)?dropbox\.com/").expect("valid pattern"));
static FORM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<form[^>]+action="([^"]*download[^"]*)"([\s\S]*?)</form>"#).expect("valid pattern"));
static FIELD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"name="([^"]+)"\s+value="([^"]*)""#).expect("valid pattern"));
static PAGE_PICTURE: LazyLock<[Regex; 4]> = LazyLock::new(|| {
    [
        r#"(?i)<meta[^>]+(?:property|name)="(?:og:image|twitter:image)(?::src)?"[^>]+content="([^"]+)""#,
        r#"(?i)<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="(?:og:image|twitter:image)(?::src)?""#,
        r#"(?i)<link[^>]+rel="image_src"[^>]+href="([^"]+)""#,
        r#"(?i)<img[^>]+src="([^"]+)""#,
    ]
    .map(|p| Regex::new(p).expect("valid pattern"))
});
static ENTITY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"&#(\d+);").expect("valid pattern"));

/// Turns a share link into a direct download (else the link, trimmed).
pub fn resolve_share_link(link: &str) -> String {
    let u = link.trim();
    if let Some(id) = DRIVE.captures(u).and_then(|c| c.get(1)) {
        return format!("https://drive.google.com/uc?export=download&id={}", id.as_str());
    }
    if DROPBOX.is_match(u)
        && let Ok(mut parsed) = Url::parse(u)
    {
        let pairs: Vec<(String, String)> = parsed
            .query_pairs()
            .filter(|(k, _)| k != "dl")
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        parsed.query_pairs_mut().clear().extend_pairs(pairs).append_pair("dl", "1");
        return parsed.to_string();
    }
    u.to_string()
}

/// Undoes HTML's entity escapes in an attribute value.
fn unescape_html(s: &str) -> String {
    let s = s
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    ENTITY
        .replace_all(&s, |c: &regex::Captures| {
            c[1].parse::<u32>()
                .ok()
                .and_then(char::from_u32)
                .map(String::from)
                .unwrap_or_default()
        })
        .into_owned()
}

/// The main picture of a web page (or Drive's confirm form), resolved against `base`; `None`
/// when there is none.
pub fn picture_in_page(html: &str, base: &Url) -> Option<Url> {
    if let Some(form) = FORM.captures(html) {
        let mut fields = url::form_urlencoded::Serializer::new(String::new());
        for f in FIELD.captures_iter(&form[2]) {
            fields.append_pair(&f[1], &unescape_html(&f[2]));
        }
        return base.join(&format!("{}?{}", unescape_html(&form[1]), fields.finish())).ok();
    }
    PAGE_PICTURE
        .iter()
        .find_map(|p| p.captures(html).and_then(|m| base.join(&unescape_html(&m[1])).ok()))
}

/// A file name without characters that break paths or headers (no extension, ≤ 120 chars).
fn clean_stem(name: &str) -> String {
    let stem = match name.rfind('.') {
        Some(i) => &name[..i],
        None => name,
    };
    let cleaned: String = stem
        .chars()
        .map(|c| if r#"\/:*?"<>|"#.contains(c) || (c as u32) < 0x20 { ' ' } else { c })
        .collect();
    let cleaned = cleaned.trim();
    let stem = if cleaned.is_empty() { "map" } else { cleaned };
    stem.chars().take(120).collect()
}

/// The first bytes of a file.
fn head_of(path: &Path, n: usize) -> Vec<u8> {
    let mut buf = Vec::new();
    if let Ok(f) = std::fs::File::open(path) {
        let _ = f.take(n as u64).read_to_end(&mut buf);
    }
    buf
}

/// Fetches a link into `uploads_dir`.
///
/// Returns where the app gets it and what it is.
///
/// # Errors
/// [`Refused`] with a reason the app shows ("no picture found on that page", …).
pub async fn fetch_link(link: &str, fetcher: &Fetcher, uploads_dir: &Path, images: &ImageWork) -> Result<Fetched, Refused> {
    if link.trim().is_empty() {
        return Err(Refused("type or paste a link first".into()));
    }
    tokio::fs::create_dir_all(uploads_dir)
        .await
        .map_err(|e| Refused(format!("the download failed: {e}")))?;
    let tmp = temp_next_to(&uploads_dir.join("fetch"));
    let result = fetch_into(link, fetcher, uploads_dir, images, &tmp).await;
    let _ = tokio::fs::remove_file(&tmp).await;
    result
}

async fn fetch_into(link: &str, fetcher: &Fetcher, uploads_dir: &Path, images: &ImageWork, tmp: &Path) -> Result<Fetched, Refused> {
    let mut got: Download = fetcher.download(&resolve_share_link(link), tmp).await?;
    let mut kind = sniff(&head_of(tmp, HEAD_BYTES));
    let page_type = matches!(got.content_type.as_str(), "text/html" | "application/xhtml+xml");
    if matches!(kind, Some(Sniffed::Html) | None) && (page_type || kind == Some(Sniffed::Html)) {
        let page = String::from_utf8_lossy(&head_of(tmp, 2_000_000)).into_owned();
        let picture = picture_in_page(&page, &got.final_url).ok_or_else(|| Refused("no picture found on that page".into()))?;
        got = fetcher.download(picture.as_str(), tmp).await?;
        kind = sniff(&head_of(tmp, HEAD_BYTES));
    }
    let (ext, out, converted): (String, FetchKind, Option<Vec<u8>>) = match kind {
        Some(k @ (Sniffed::Png | Sniffed::Jpg | Sniffed::Webp)) => (k.label().to_ascii_lowercase(), FetchKind::Picture, None),
        Some(Sniffed::Pdf) => ("pdf".into(), FetchKind::Pdf, None),
        Some(Sniffed::Uvtt) => (
            (if got.name.to_ascii_lowercase().ends_with(".uvtt") {
                "uvtt"
            } else {
                "dd2vtt"
            })
            .into(),
            FetchKind::Uvtt,
            None,
        ),
        _ => {
            let file = std::fs::File::open(tmp).map_err(|e| Refused(format!("the download failed: {e}")))?;
            match convert::picture_info(std::io::BufReader::new(file), images.max_pixels) {
                Err(PictureError::TooManyPixels { megapixels, limit }) => {
                    return Err(Refused(format!(
                        "the picture has {megapixels} megapixels — battlemap takes at most {limit} megapixels"
                    )));
                }
                Err(_) => {
                    return Err(Refused(format!(
                        "not a map file ({})",
                        if got.content_type.is_empty() {
                            "unknown kind"
                        } else {
                            &got.content_type
                        }
                    )));
                }
                Ok(_) => {
                    let data = tokio::fs::read(tmp)
                        .await
                        .map_err(|e| Refused(format!("the download failed: {e}")))?;
                    let max = images.max_pixels;
                    let png = images
                        .run(move || -> Result<Vec<u8>, PictureError> {
                            let img = convert::decode(&data, max)?;
                            convert::convert(&img, StoreFormat::Png, None)?
                                .bytes
                                .ok_or(PictureError::Encode("no bytes".into()))
                        })
                        .await
                        .map_err(|e| Refused(format!("the download failed: {e}")))?
                        .map_err(|e| Refused(format!("could not convert the picture: {e}")))?;
                    ("png".into(), FetchKind::Picture, Some(png))
                }
            }
        }
    };
    let file = format!("{}.{ext}", random_hex(6));
    let dest = uploads_dir.join(&file);
    let bytes = match converted {
        Some(png) => {
            crate::fsx::write_atomic(&dest, &png)
                .await
                .map_err(|e| Refused(format!("the download failed: {e:#}")))?;
            png.len() as u64
        }
        None => {
            move_into_place(tmp, &dest)
                .await
                .map_err(|e| Refused(format!("the download failed: {e:#}")))?;
            got.bytes
        }
    };
    Ok(Fetched {
        url: format!("/uploads/{file}"),
        name: format!("{}.{ext}", clean_stem(&got.name)),
        bytes,
        kind: out,
        ext,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn share_links_become_downloads() {
        assert_eq!(
            resolve_share_link("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing"),
            "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn"
        );
        assert_eq!(
            resolve_share_link("https://drive.google.com/open?id=1AbCdEfGhIjKlMn"),
            "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMn"
        );
        assert_eq!(
            resolve_share_link("https://www.dropbox.com/s/abc/map.png?dl=0"),
            "https://www.dropbox.com/s/abc/map.png?dl=1"
        );
        assert_eq!(resolve_share_link(" https://example.com/a.png "), "https://example.com/a.png");
    }

    #[test]
    fn a_pages_main_picture() {
        let b = |s: &str| Url::parse(s).unwrap();
        let p = |html: &str, base: &str| picture_in_page(html, &b(base)).map(|u| u.to_string());
        assert_eq!(
            p(
                r#"<meta property="og:image" content="/big.jpg"><img src="small.png">"#,
                "https://x.test/p/"
            )
            .as_deref(),
            Some("https://x.test/big.jpg")
        );
        assert_eq!(
            p(
                r#"<meta content="https://cdn.test/a.webp" name="twitter:image">"#,
                "https://x.test/"
            )
            .as_deref(),
            Some("https://cdn.test/a.webp")
        );
        assert_eq!(
            p(r#"<link rel="image_src" href="a.png">"#, "https://x.test/d/").as_deref(),
            Some("https://x.test/d/a.png")
        );
        assert_eq!(
            p(r#"<p>hi</p><img alt="" src="maps/m.jpg?a=1&amp;b=2">"#, "https://x.test/").as_deref(),
            Some("https://x.test/maps/m.jpg?a=1&b=2")
        );
        assert_eq!(p("<p>nothing</p>", "https://x.test/"), None);
        let drive = r#"<form id="download-form" action="https://drive.usercontent.google.com/download" method="get"><input type="hidden" name="id" value="1Ab"><input type="hidden" name="confirm" value="t"></form>"#;
        assert_eq!(
            p(drive, "https://drive.google.com/").as_deref(),
            Some("https://drive.usercontent.google.com/download?id=1Ab&confirm=t")
        );
    }

    #[test]
    fn clean_names() {
        assert_eq!(clean_stem("Tower map.dd2vtt"), "Tower map");
        assert_eq!(clean_stem("a/b:c.png"), "a b c");
        assert_eq!(clean_stem(""), "map");
        assert_eq!(clean_stem(".png"), "map");
    }
}
