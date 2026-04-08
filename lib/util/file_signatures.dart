import 'dart:typed_data';

/// Lightweight magic-byte sniffers for the file types the battlemap app
/// reads from disk.
///
/// These are used as defensive fallbacks when a [MapLibraryEntry] flag is
/// untrustworthy. For example, a session resumed from disk may claim
/// `isPdf: true` but actually hold raster image bytes (a bug pre-1.1.2),
/// in which case sniffing the magic header is the cheapest way to recover.
///
/// All checks are constant-time byte comparisons; safe to call on every
/// resume without measurable cost.
class FileSignatures {
  // No instances; this class is a namespace for static helpers.
  FileSignatures._();

  /// Returns `true` when [bytes] start with the PDF header `%PDF-`.
  ///
  /// PDF files always begin with the literal ASCII string `%PDF-` followed
  /// by a version number (e.g. `%PDF-1.7`). The check needs five bytes; if
  /// [bytes] is shorter it returns `false`.
  static bool looksLikePdf(Uint8List bytes) {
    if (bytes.length < 5) return false;
    // ASCII for "%PDF-"
    return bytes[0] == 0x25 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x44 &&
        bytes[3] == 0x46 &&
        bytes[4] == 0x2D;
  }

  /// Returns `true` when [bytes] start with the PNG signature.
  ///
  /// PNG files begin with the 8-byte sequence
  /// `\x89PNG\r\n\x1a\n`. We only check the first four bytes — that's
  /// already enough to distinguish PNG from any other format the app
  /// touches.
  static bool looksLikePng(Uint8List bytes) {
    if (bytes.length < 4) return false;
    return bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4E &&
        bytes[3] == 0x47;
  }

  /// Returns `true` when [bytes] start with the JPEG SOI marker `FF D8`.
  ///
  /// All JPEG files (JFIF, EXIF, etc.) begin with the two-byte
  /// Start-Of-Image marker `0xFF 0xD8`.
  static bool looksLikeJpeg(Uint8List bytes) {
    if (bytes.length < 2) return false;
    return bytes[0] == 0xFF && bytes[1] == 0xD8;
  }
}
