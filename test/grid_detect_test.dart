import 'dart:math';
import 'dart:typed_data';
import 'dart:ui';

import 'package:battlemap/model/grid_detect.dart';
import 'package:flutter_test/flutter_test.dart';

/// A [w] × [h] RGBA picture: grey noise (a stone floor), optional grid
/// lines every [cell] px starting at [offset], optional extra [paint].
Uint8List picture(
  int w,
  int h, {
  double? cell,
  double offset = 0,
  int lineWidth = 2,
  int lineDelta = -40,
  int noise = 40,
  int seed = 1,
  void Function(Uint8List px, int w, int h)? paint,
}) {
  final rnd = Random(seed);
  final px = Uint8List(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    final v = 120 + rnd.nextInt(noise + 1) - noise ~/ 2;
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  if (cell != null) {
    bool onLine(int i) {
      // Line centred on the edge offset + k·cell, covering lineWidth px.
      final r = ((i + 0.5 - offset) % cell + cell) % cell;
      return r < lineWidth / 2 || r >= cell - lineWidth / 2;
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (onLine(x) || onLine(y)) {
          final p = (y * w + x) * 4;
          for (var c = 0; c < 3; c++) {
            px[p + c] = (px[p + c] + lineDelta).clamp(0, 255);
          }
        }
      }
    }
  }
  paint?.call(px, w, h);
  return px;
}

void main() {
  group('detectEmbeddedGrid', () {
    test('finds a 32 px grid that meets the edges (Juri\'s cave map)', () {
      final g = detectEmbeddedGrid(picture(1280, 960, cell: 32), 1280, 960)!;
      expect(g.cellPx, closeTo(32, 0.05));
      expect(g.cols, 40);
      expect(g.rows, 30);
      expect(g.aligned, isTrue);
      expect(g.crop.left, 0);
      expect(g.crop.top, 0);
      expect(g.crop.width, closeTo(1280, 2));
      expect(g.crop.height, closeTo(960, 2));
    });

    test('finds a faint grid (lines only 12 levels darker)', () {
      final g = detectEmbeddedGrid(
          picture(900, 700, cell: 50, lineDelta: -12, lineWidth: 1), 900, 700)!;
      expect(g.cellPx, closeTo(50, 0.1));
      expect((g.cols, g.rows), (18, 14));
    });

    test('a grid that starts inside the picture is cropped to whole squares',
        () {
      // Lines at 23, 83, 143, … : a 23 px sliver on the left and top.
      final g = detectEmbeddedGrid(
          picture(1000, 800, cell: 60, offset: 23), 1000, 800)!;
      expect(g.cellPx, closeTo(60, 0.1));
      expect(g.offsetX, closeTo(23, 1));
      expect(g.offsetY, closeTo(23, 1));
      expect(g.aligned, isFalse);
      // (1000 − 23) / 60 = 16.3 → 16 squares, (800 − 23) / 60 = 12.95 → 12
      // (short by 5 % of a square, inside the tolerance → 13).
      expect(g.cols, 16);
      expect(g.rows, 13);
      expect(g.crop.left, closeTo(23, 1));
      expect(g.crop.width, closeTo(960, 2));
    });

    test('no grid in plain noise', () {
      expect(detectEmbeddedGrid(picture(800, 600), 800, 600), isNull);
    });

    test('fine texture (12 px bricks) is not a grid', () {
      final g = detectEmbeddedGrid(picture(1024, 768, cell: 12), 1024, 768);
      expect(g, isNull);
    });

    test('heavier lines every fifth square do not multiply the cell', () {
      // A faint 40 px grid plus a dark 4 px line every 200 px (a 5-square
      // major grid, like 25 ft markers). Noise ±10: with ±20 per pixel the
      // faint lines drown and the major grid wins, which is fair.
      final px = picture(1200, 880, cell: 40, lineDelta: -18, noise: 20,
          paint: (px, w, h) {
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            final dx = (x + 0.5) % 200, dy = (y + 0.5) % 200;
            if (min(dx, 200 - dx) < 2 || min(dy, 200 - dy) < 2) {
              final p = (y * w + x) * 4;
              px[p] = px[p + 1] = px[p + 2] = 20;
            }
          }
        }
      });
      final g = detectEmbeddedGrid(px, 1200, 880)!;
      expect(g.cellPx, closeTo(40, 0.2));
      expect(g.cols, 30);
      expect(g.rows, 22);
    });

    test('a big picture is averaged down and reported in its own pixels',
        () {
      // 2560 × 1920 with 64 px squares, detected at half size.
      final g = detectEmbeddedGrid(picture(2560, 1920, cell: 64), 2560, 1920,
          maxSide: 1280)!;
      expect(g.cellPx, closeTo(64, 0.2));
      expect(g.pictureSize, const Size(2560, 1920));
      expect((g.cols, g.rows), (40, 30));
      expect(g.aligned, isTrue);
    });

    test('transparent background counts as white paper', () {
      final px = picture(800, 800, cell: 80, lineDelta: -60, paint: (px, w, h) {
        for (var i = 0; i < w * h; i++) {
          final x = i % w;
          if (x > 400) px[i * 4 + 3] = 0; // right half transparent black
          if (x > 400) px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 0;
        }
      });
      final g = detectEmbeddedGrid(px, 800, 800)!;
      expect(g.cellPx, closeTo(80, 0.2));
    });

    test('too small or truncated input gives null', () {
      expect(detectEmbeddedGrid(Uint8List(10), 100, 100), isNull);
      expect(detectEmbeddedGrid(Uint8List(8 * 8 * 4), 8, 8), isNull);
    });
  });
}
