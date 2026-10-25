//! What a file is, from its first bytes — never from its name or the sender's word.

/// What the server recognises. `Uvtt` is a `.dd2vtt` / `.uvtt` map (JSON with a picture).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sniffed {
    /// A PNG picture.
    Png,
    /// A JPEG picture.
    Jpg,
    /// A WebP picture.
    Webp,
    /// A PDF.
    Pdf,
    /// A Universal VTT map (`.dd2vtt`, `.uvtt`).
    Uvtt,
    /// Other JSON.
    Json,
    /// A web page.
    Html,
}

impl Sniffed {
    /// Whether it is one of the pictures stored as they are (PNG, JPEG, WebP).
    pub fn is_plain_picture(self) -> bool {
        matches!(self, Self::Png | Self::Jpg | Self::Webp)
    }

    /// The name the refusals use ("PDF", ".dd2vtt map", …).
    pub fn label(self) -> &'static str {
        match self {
            Self::Png => "PNG",
            Self::Jpg => "JPG",
            Self::Webp => "WEBP",
            Self::Pdf => "PDF",
            Self::Uvtt => ".dd2vtt map",
            Self::Json => "JSON",
            Self::Html => "HTML",
        }
    }
}

/// How many first bytes [`sniff`] looks at.
pub const HEAD_BYTES: usize = 4096;

/// Looks at a file's first bytes (at most [`HEAD_BYTES`] are read).
///
/// Returns its kind, or `None` for anything else (other picture formats are found by the
/// picture decoder).
pub fn sniff(data: &[u8]) -> Option<Sniffed> {
    let b = data;
    if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some(Sniffed::Png);
    }
    if b.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(Sniffed::Jpg);
    }
    if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        return Some(Sniffed::Webp);
    }
    if b.starts_with(b"%PDF") {
        return Some(Sniffed::Pdf);
    }
    let text = String::from_utf8_lossy(&b[..b.len().min(HEAD_BYTES)]);
    let head = text.strip_prefix('\u{feff}').unwrap_or(&text).trim_start();
    if head.starts_with('{') {
        if head.contains("\"resolution\"") || (head.contains("\"image\"") && head.contains("\"format\"")) {
            return Some(Sniffed::Uvtt);
        }
        return Some(Sniffed::Json);
    }
    if head.starts_with('[') {
        return Some(Sniffed::Json);
    }
    let lower: String = head.chars().take(512).collect::<String>().to_lowercase();
    if lower.starts_with("<!doctype html") || lower.starts_with("<html") || lower.contains("<head") || lower.contains("<body") {
        return Some(Sniffed::Html);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn goes_by_the_bytes() {
        assert_eq!(sniff(b"\x89PNG\r\n"), Some(Sniffed::Png));
        assert_eq!(sniff(b"\xff\xd8\xff\xe0"), Some(Sniffed::Jpg));
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 "), Some(Sniffed::Webp));
        assert_eq!(sniff(b"%PDF-1.7"), Some(Sniffed::Pdf));
        assert_eq!(sniff(br#"{"format":0.3,"resolution":{"map_origin":{}}}"#), Some(Sniffed::Uvtt));
        assert_eq!(sniff("\u{feff}  {\"walls\":[]}".as_bytes()), Some(Sniffed::Json));
        assert_eq!(sniff(b"[1]"), Some(Sniffed::Json));
        assert_eq!(sniff(b"<!DOCTYPE html><html>"), Some(Sniffed::Html));
        assert_eq!(sniff(b"<meta x><body>"), Some(Sniffed::Html));
        assert_eq!(sniff(b"GIF89a"), None);
        assert_eq!(sniff(b""), None);
    }
}
