import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:battlemap/util/file_signatures.dart';

/// Tests for [FileSignatures] — the magic-byte sniffers used as a
/// defensive fallback when a [MapLibraryEntry] flag claims one file type
/// but the bytes on disk say another.
///
/// The bug that motivated this helper:
/// `_downloadAndLoadImage` saved PNG/JPG images with `isPdf: true` as a
/// hack so they could share the PDF code path. On session resume the TV
/// then tried to render the image as a PDF and crashed. The
/// [FileSignatures.looksLikePdf] check now catches that case.
void main() {
  group('FileSignatures.looksLikePdf', () {
    test('detects standard "%PDF-1.4" header', () {
      final bytes = Uint8List.fromList('%PDF-1.4\n...rest of file...'.codeUnits);
      expect(FileSignatures.looksLikePdf(bytes), isTrue);
    });

    test('detects "%PDF-1.7"', () {
      final bytes = Uint8List.fromList('%PDF-1.7'.codeUnits);
      expect(FileSignatures.looksLikePdf(bytes), isTrue);
    });

    test('detects "%PDF-2.0"', () {
      final bytes = Uint8List.fromList('%PDF-2.0\n%binary'.codeUnits);
      expect(FileSignatures.looksLikePdf(bytes), isTrue);
    });

    test('exactly 5 bytes "%PDF-" is enough', () {
      final bytes = Uint8List.fromList([0x25, 0x50, 0x44, 0x46, 0x2D]);
      expect(FileSignatures.looksLikePdf(bytes), isTrue);
    });

    test('rejects PNG header', () {
      // Standard PNG signature: 89 50 4E 47 0D 0A 1A 0A
      final bytes = Uint8List.fromList([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D,
      ]);
      expect(FileSignatures.looksLikePdf(bytes), isFalse);
    });

    test('rejects JPEG SOI marker', () {
      // JFIF: FF D8 FF E0
      final bytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(FileSignatures.looksLikePdf(bytes), isFalse);
    });

    test('rejects WEBP RIFF header', () {
      final bytes = Uint8List.fromList('RIFF\x00\x00\x00\x00WEBP'.codeUnits);
      expect(FileSignatures.looksLikePdf(bytes), isFalse);
    });

    test('rejects UVTT JSON', () {
      // .dd2vtt files are JSON starting with "{"
      final bytes = Uint8List.fromList('{"format": 0.3, ...'.codeUnits);
      expect(FileSignatures.looksLikePdf(bytes), isFalse);
    });

    test('rejects empty bytes', () {
      expect(FileSignatures.looksLikePdf(Uint8List(0)), isFalse);
    });

    test('rejects too-short bytes', () {
      expect(FileSignatures.looksLikePdf(Uint8List.fromList([0x25, 0x50])),
          isFalse);
      expect(
          FileSignatures.looksLikePdf(
              Uint8List.fromList([0x25, 0x50, 0x44, 0x46])),
          isFalse,
          reason: '4 bytes is one short of the full %PDF- header');
    });

    test('rejects PDF prefix that is not at offset 0', () {
      // %PDF- in the middle of a file is not a valid PDF.
      final bytes = Uint8List.fromList(
          'XXX%PDF-1.7 garbage in the wrong place'.codeUnits);
      expect(FileSignatures.looksLikePdf(bytes), isFalse);
    });
  });

  group('FileSignatures.looksLikePng', () {
    test('detects standard PNG signature', () {
      final bytes =
          Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(FileSignatures.looksLikePng(bytes), isTrue);
    });

    test('rejects PDF header', () {
      final bytes = Uint8List.fromList('%PDF-1.7'.codeUnits);
      expect(FileSignatures.looksLikePng(bytes), isFalse);
    });

    test('rejects JPEG header', () {
      final bytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0]);
      expect(FileSignatures.looksLikePng(bytes), isFalse);
    });

    test('rejects too-short bytes', () {
      expect(FileSignatures.looksLikePng(Uint8List(0)), isFalse);
      expect(FileSignatures.looksLikePng(Uint8List.fromList([0x89, 0x50, 0x4E])),
          isFalse);
    });
  });

  group('FileSignatures.looksLikeJpeg', () {
    test('detects JFIF (FF D8 FF E0)', () {
      final bytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(FileSignatures.looksLikeJpeg(bytes), isTrue);
    });

    test('detects EXIF (FF D8 FF E1)', () {
      final bytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x16]);
      expect(FileSignatures.looksLikeJpeg(bytes), isTrue);
    });

    test('rejects PNG header', () {
      final bytes = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47]);
      expect(FileSignatures.looksLikeJpeg(bytes), isFalse);
    });

    test('rejects PDF header', () {
      final bytes = Uint8List.fromList('%PDF-1.7'.codeUnits);
      expect(FileSignatures.looksLikeJpeg(bytes), isFalse);
    });

    test('rejects too-short bytes', () {
      expect(FileSignatures.looksLikeJpeg(Uint8List(0)), isFalse);
      expect(FileSignatures.looksLikeJpeg(Uint8List.fromList([0xFF])), isFalse);
    });
  });
}
