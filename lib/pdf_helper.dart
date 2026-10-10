import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:pdfrx/pdfrx.dart';

/// Handles PDF rendering, isolated from the rest of the app so that pdfrx
/// import failures (e.g. on web) don't crash the app.
///
/// Provides the static [renderPdfPage] utility for the VTT PDF map flow,
/// which renders a PDF page to PNG bytes for use as a battlemap background
/// image.
///
/// Runs on every platform that has a PDFium build — Android, iOS, desktop,
/// and **web** (pdfrx ≥ 2 ships PDFium as WASM inside the web build's assets).
/// Not on tvOS (no binary): the companion phone rasterizes PDFs before upload
/// (`VttCompanionScreen._pickAndUploadMap`), so the TV only receives images.
///
/// See also:
/// - [VttState.loadPdfAsMap], which consumes the rendered PNG bytes.
/// - `TvShell._downloadAndLoadPdf` (in `lib/ui/tv_shell.dart`), the legacy
///   TV-side PDF path kept for older phone builds.
class PdfHelper {
  static bool _engineReady = false;

  /// Initialises the pdfrx engine once per process.
  ///
  /// pdfrx 2.x requires [pdfrxFlutterInitialize] before any direct
  /// [PdfDocument] call (we never build a pdfrx widget). Idempotent; a
  /// failure (e.g. no PDFium binary for this platform, such as tvOS) is
  /// surfaced by the subsequent `openData` call and handled there.
  static void _ensureEngine() {
    if (_engineReady) return;
    pdfrxFlutterInitialize();
    _engineReady = true;
  }

  /// Renders a single PDF page to PNG image bytes for use as a map background.
  ///
  /// Opens the PDF from [pdfBytes], renders the page at [pageIndex] at high
  /// resolution (up to 4096px on the longest side), and encodes the result
  /// as PNG bytes.
  ///
  /// Returns a map with:
  /// - `'imageBytes'` ([Uint8List]) — the PNG-encoded image data.
  /// - `'width'` ([int]) — rendered image width in pixels.
  /// - `'height'` ([int]) — rendered image height in pixels.
  /// - `'pageCount'` ([int]) — total number of pages in the PDF.
  ///
  /// Returns `null` if the PDF cannot be opened or the page fails to render.
  ///
  /// The caller is responsible for disposing the intermediate resources;
  /// this method opens and closes its own [PdfDocument].
  ///
  /// See also:
  /// - `TvShell._downloadAndLoadPdf` (in `lib/ui/tv_shell.dart`), which
  ///   calls this to process uploaded PDFs.
  /// - `TvShell._startNewSession` (same file), which calls this for PDF
  ///   map sessions.
  static Future<Map<String, dynamic>?> renderPdfPage(
    Uint8List pdfBytes, {
    int pageIndex = 0,
  }) async {
    PdfDocument? doc;
    try {
      _ensureEngine();
      doc = await PdfDocument.openData(pdfBytes);
      if (pageIndex < 0 || pageIndex >= doc.pages.length) {
        doc.dispose();
        return null;
      }
      final page = doc.pages[pageIndex];

      // Max 4096px on longest side for high-resolution map rendering.
      // This is larger than the legacy 2048 limit because VTT maps benefit
      // from higher detail when zoomed in.
      const maxDim = 4096.0;
      final scale =
          maxDim / (page.width > page.height ? page.width : page.height);
      final renderWidth = (page.width * scale).toInt();
      final renderHeight = (page.height * scale).toInt();

      final rendered = await page.render(
        fullWidth: renderWidth.toDouble(),
        fullHeight: renderHeight.toDouble(),
      );
      if (rendered == null) {
        doc.dispose();
        return null;
      }

      // Convert to ui.Image, then encode to PNG bytes
      final ui.Image image = await rendered.createImage();
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();

      if (byteData == null) {
        doc.dispose();
        return null;
      }

      final pageCount = doc.pages.length;
      doc.dispose();

      return {
        'imageBytes': byteData.buffer.asUint8List(),
        'width': renderWidth,
        'height': renderHeight,
        'pageCount': pageCount,
      };
    } catch (e) {
      debugPrint('PdfHelper.renderPdfPage error: $e');
      doc?.dispose();
      return null;
    }
  }
}
