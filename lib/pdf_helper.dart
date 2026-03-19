import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:pdfrx/pdfrx.dart';

import 'game_state.dart';

/// Handles PDF loading and rendering, isolated from GameState
/// so that pdfrx import failures (e.g. on web) don't crash the app.
class PdfHelper {
  PdfDocument? _document;
  Uint8List? _bytes;

  Future<void> loadPdf(Uint8List bytes, GameState gameState) async {
    try {
      _document?.dispose();
      _bytes = bytes;
      _document = await PdfDocument.openData(bytes);
      await _renderPage(0, gameState);
    } catch (e) {
      debugPrint('PDF load error: $e');
    }
  }

  Future<void> setPage(int index, GameState gameState) async {
    if (_document == null) return;
    if (index < 0 || index >= _document!.pages.length) return;
    await _renderPage(index, gameState);
  }

  void clear(GameState gameState) {
    _document?.dispose();
    _document = null;
    _bytes = null;
    gameState.clearPdf();
  }

  Future<void> _renderPage(int index, GameState gameState) async {
    if (_document == null || _bytes == null) return;
    final page = _document!.pages[index];

    // Max 2048px on longest side — keeps GPU memory safe on 2GB device
    const maxDim = 2048.0;
    final scale = maxDim / (page.width > page.height ? page.width : page.height);
    final renderWidth = (page.width * scale).toInt();
    final renderHeight = (page.height * scale).toInt();

    final rendered = await page.render(
      fullWidth: renderWidth.toDouble(),
      fullHeight: renderHeight.toDouble(),
    );
    if (rendered == null) return;

    final ui.Image image = await rendered.createImage();

    gameState.setPdfState(
      bytes: _bytes!,
      pageCount: _document!.pages.length,
      pageIndex: index,
      image: image,
    );
  }

  void dispose() {
    _document?.dispose();
  }
}
