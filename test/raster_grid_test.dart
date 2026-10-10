import 'dart:typed_data';
import 'dart:ui';

import 'package:battlemap/model/grid_detect.dart';
import 'package:battlemap/model/map_library_entry.dart';
import 'package:battlemap/model/raster_grid.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:flutter_test/flutter_test.dart';

const pic = Size(1000, 800);

RasterGrid grid60({double x = 23, double y = 23, double w = 60, double h = 60}) =>
    RasterGrid.fromLines(lineX: x, lineY: y, cellW: w, cellH: h, picture: pic);

void main() {
  group('RasterGrid', () {
    test('whole stretches the counts over the picture', () {
      final g = RasterGrid.whole(40, 30, const Size(1280, 960));
      expect(g.cellW, 32);
      expect(g.cellH, 32);
      expect(g.isWhole, isTrue);
      expect(g.hasPartialEdges, isFalse);
      expect(g.rect, const Rect.fromLTWH(0, 0, 1280, 960));
    });

    test('fromLines: whole squares only leave the slivers off', () {
      final g = grid60();
      expect(g.x, closeTo(23, 1e-9));
      expect(g.cols, 16); // (1000 − 23) / 60 = 16.3
      expect(g.rows, 13); // (800 − 23) / 60 = 12.95 → within 15 %
      expect(g.isWhole, isFalse);
    });

    test('fromLines: partial edges cover the whole picture', () {
      final g = RasterGrid.fromLines(
          lineX: 23, lineY: 23, cellW: 60, cellH: 60, picture: pic, partialEdges: true);
      expect(g.x, closeTo(-37, 1e-9));
      expect(g.rect.left, lessThanOrEqualTo(0));
      expect(g.rect.right, greaterThanOrEqualTo(1000 - 0.15 * 60));
      // 17 squares end at 983: the last 17 px (0.28 square) get an 18th.
      expect(g.cols, 18);
      expect(g.hasPartialEdges, isTrue);
    });

    test('a line a hair inside the edge counts as the edge', () {
      final g = RasterGrid.fromLines(
          lineX: 2, lineY: 59, cellW: 60, cellH: 60, picture: const Size(1200, 600));
      expect(g.x, 2);
      expect(g.y, closeTo(-1, 1e-9));
      expect((g.cols, g.rows), (20, 10));
    });

    test('any line of the grid gives the same grid', () {
      final a = grid60(x: 23);
      final b = grid60(x: 23 + 7 * 60);
      expect(a.closeTo(b, eps: 1e-6), isTrue);
    });

    test('forPicture scales to another rendering of the same page', () {
      final g = grid60().forPicture(const Size(2000, 1600));
      expect(g.x, closeTo(46, 1e-9));
      expect(g.cellW, closeTo(120, 1e-9));
      expect(g.cols, 16);
      final same = grid60();
      expect(identical(same.forPicture(pic), same), isTrue);
    });

    test('withCell keeps the top-left corner', () {
      final g = grid60().withCell(61.5, 59);
      expect(g.x, closeTo(23, 1e-9));
      expect(g.cellW, 61.5);
      expect(g.cellH, 59);
      expect(grid60().withCell(1, 1).cellW, RasterGrid.minCell);
    });

    test('stretched: the line under the finger follows it, the corner stays', () {
      final g = grid60(x: 0, y: 0);
      // Line 10 (x = 600) dragged to x = 610 → squares of 61 px.
      final s = g.stretched(const Offset(600, 300), const Offset(610, 300), square: true);
      expect(s.cellW, closeTo(61, 1e-9));
      expect(s.cellH, closeTo(61, 1e-9));
      expect(s.x, 0);
      final free = g.stretched(const Offset(600, 300), const Offset(610, 295), square: false);
      expect(free.cellW, closeTo(61, 1e-9));
      expect(free.cellH, closeTo(59, 1e-9));
    });

    test('stretched ignores an axis too close to the corner', () {
      final g = grid60(x: 0, y: 0);
      final s = g.stretched(const Offset(600, 30), const Offset(610, 40), square: false);
      expect(s.cellW, closeTo(61, 1e-9));
      expect(s.cellH, 60); // 0.5 squares down: no leverage
      expect(g.stretched(const Offset(30, 30), const Offset(90, 90), square: true)
          .closeTo(g), isTrue);
    });

    test('fromCorners: two marks and the count set the squares exactly', () {
      final g = RasterGrid.fromCorners(
        a: const Offset(23.4, 23.4),
        b: const Offset(23.4 + 15 * 60.2, 23.4 + 12 * 60.2),
        nx: 15,
        ny: 12,
        square: true,
        fallback: grid60(),
      )!;
      expect(g.cellW, closeTo(60.2, 1e-9));
      expect(g.cellH, closeTo(60.2, 1e-9));
      expect(g.x, closeTo(23.4, 1e-9));
    });

    test('fromCorners: free squares per axis, zero count keeps the fallback', () {
      final g = RasterGrid.fromCorners(
        a: const Offset(0, 0),
        b: const Offset(600, 0),
        nx: 10,
        ny: 0,
        square: false,
        fallback: grid60(w: 55, h: 52),
      )!;
      expect(g.cellW, 60);
      expect(g.cellH, 52);
      expect(RasterGrid.fromCorners(
              a: Offset.zero, b: const Offset(5, 5), nx: 0, ny: 0,
              square: true, fallback: grid60()),
          isNull);
    });

    test('fromCorners: marks right-to-left work the same', () {
      final g = RasterGrid.fromCorners(
          a: const Offset(623, 623), b: const Offset(23, 23), nx: -10, ny: -10,
          square: true, fallback: grid60(w: 50, h: 50))!;
      expect(g.cellW, closeTo(60, 1e-9));
      expect(g.x, closeTo(23, 1e-9));
    });

    test('cornerCounts picks counts both directions agree on', () {
      // Vampire lair: 72 px squares, current guess 75 px → 17 × 12, not 16 × 12.
      final g = grid60(w: 75, h: 75);
      expect(g.cornerCounts(const Offset(10, 10), const Offset(10 + 17 * 72, 10 + 12 * 72),
          square: true), (17, 12));
      // Right to left, bottom to top: negative counts.
      expect(g.cornerCounts(const Offset(10 + 17 * 72, 10 + 12 * 72), const Offset(10, 10),
          square: true), (-17, -12));
      // A mark on the same row: only the across axis counts.
      expect(g.cornerCounts(const Offset(0, 0), const Offset(10 * 72, 5), square: true).$2, 0);
      // Free squares round each axis on its own.
      expect(grid60().cornerCounts(Offset.zero, const Offset(605, 290), square: false), (10, 5));
    });

    test('followingCount and cornersAgree', () {
      expect(RasterGrid.followingCount(1400, 14, 1600), 16);
      expect(RasterGrid.followingCount(1400, 14, -1600), -16);
      expect(RasterGrid.followingCount(1400, 0, 1600), 0);
      final ok = RasterGrid.cornersAgree(Offset.zero, const Offset(1400, 1600), 14, 16);
      expect(ok.across, 100);
      expect(ok.agree, isTrue);
      final bad = RasterGrid.cornersAgree(Offset.zero, const Offset(1224, 864), 16, 12);
      expect(bad.across, closeTo(76.5, 1e-9));
      expect(bad.down, 72);
      expect(bad.agree, isFalse);
    });

    test('a line a hair outside the edge is not a partial edge', () {
      final g = RasterGrid.fromLines(
          lineX: 0, lineY: 71.51, cellW: 72, cellH: 72, picture: const Size(1368, 1008));
      expect(g.y, lessThan(0));
      expect(g.hasPartialEdges, isFalse);
    });

    test('acrossWidth fills the width from the left edge', () {
      final g = grid60().acrossWidth(25, square: true);
      expect(g.cellW, 40);
      expect(g.x, 0);
      expect(g.cols, 25);
      expect(g.rows, 20);
    });

    test('JSON round trip and malformed input', () {
      final g = grid60(w: 60.25, h: 59.75);
      final back = RasterGrid.fromJson(g.toJson())!;
      expect(back.closeTo(g, eps: 1e-12), isTrue);
      expect(back.pictureW, 1000);
      expect(RasterGrid.fromJson(null), isNull);
      expect(RasterGrid.fromJson({'x': 1}), isNull);
      expect(RasterGrid.fromJson({...g.toJson(), 'w': 0}), isNull);
    });

    test('a detection becomes a picture grid', () {
      const d = GridDetection(
          cellPx: 32, offsetX: 0.1, offsetY: 0, strength: 0.96, cols: 40, rows: 30,
          pictureSize: Size(1280, 960));
      final g = d.toRasterGrid();
      expect((g.cols, g.rows), (40, 30));
      expect(g.cellW, 32);
    });
  });

  group('MapLibraryEntry.rasterGrid', () {
    test('survives JSON and withGrid', () {
      final e = MapLibraryEntry(
        id: 'm', displayName: 'Cave', fileSizeBytes: 1, gridCols: 16, gridRows: 13,
        portalCount: 0, addedAt: DateTime(2026, 10, 10), isImage: true,
        pdfGridCols: 16, pdfGridRows: 13, rasterGrid: grid60(),
      );
      final back = MapLibraryEntry.fromJson(e.toJson());
      expect(back.rasterGrid!.closeTo(grid60()), isTrue);
      final re = back.withGrid(20, 10);
      expect(re.rasterGrid, isNull);
      expect(re.pdfGridCols, 20);
      final old = Map<String, dynamic>.of(e.toJson())..remove('rasterGrid');
      expect(MapLibraryEntry.fromJson(old).rasterGrid, isNull);
    });
  });

  group('VttState picture grid', () {
    VttState loaded({RasterGrid? grid}) => VttState()
      ..loadPdfAsMap(Uint8List(0),
          gridCols: 20, gridRows: 15, imageWidth: 1000, imageHeight: 800, grid: grid);

    test('without a grid the counts stretch over the picture', () {
      final s = loaded();
      expect(s.rasterGrid!.isWhole, isTrue);
      expect(s.map!.resolution.mapSize, const Offset(20, 15));
    });

    test('a grid sets the counts and the map square size', () {
      final s = loaded(grid: grid60());
      expect(s.map!.resolution.mapSize, const Offset(16, 13));
      expect(s.map!.resolution.pixelsPerGrid, 60);
      expect(s.toJson()['rasterGrid'], isNotNull);
      expect(s.toJson()['gridCols'], 16);
    });

    test('a fine adjustment keeps the fog and the table window', () {
      final s = loaded(grid: grid60());
      s.revealedCells = {1, 2, 3};
      s.tableCol = 2;
      expect(s.regridRaster(16, 13, grid: grid60(x: 23.5, w: 60.1)), isTrue);
      expect(s.revealedCells, {1, 2, 3});
      expect(s.tableCol, 2);
      expect(s.rasterGrid!.cellW, closeTo(60.1, 1e-9));
    });

    test('new counts clear the fog', () {
      final s = loaded(grid: grid60());
      s.revealedCells = {1, 2, 3};
      expect(s.regridRaster(25, 20, grid: grid60().acrossWidth(25, square: true)), isTrue);
      expect(s.revealedCells, isEmpty);
      expect(s.map!.resolution.mapSize, const Offset(25, 20));
    });

    test('the same grid changes nothing', () {
      final s = loaded(grid: grid60());
      expect(s.regridRaster(16, 13, grid: grid60()), isFalse);
    });

    test('the companion follows the TV\'s grid from vtt.fullState', () {
      final tv = loaded(grid: grid60(x: 10));
      final phone = loaded();
      expect(phone.applyRemoteGrid(tv.toJson()), isTrue);
      expect(phone.rasterGrid!.closeTo(tv.rasterGrid!), isTrue);
      expect(phone.applyRemoteGrid(tv.toJson()), isFalse);
      // An old TV without rasterGrid: counts over the whole picture.
      final legacy = Map<String, dynamic>.of(tv.toJson())..remove('rasterGrid');
      expect(phone.applyRemoteGrid(legacy), isTrue);
      expect(phone.rasterGrid!.isWhole, isTrue);
    });
  });

  group('fromLength', () {
    test('a known length sets square squares, lines through its start', () {
      // A 30 ft hall (6 squares) measured over 300 px, starting at (105, 47).
      final g = RasterGrid.fromLength(
          a: const Offset(105, 47), b: const Offset(405, 47), squares: 6,
          picture: const Size(1000, 700))!;
      expect((g.cellW, g.cellH), (50, 50));
      expect(g.x % 50, closeTo(5, 1e-9));
      expect(g.y % 50, closeTo(47, 1e-9));
      expect((g.cols, g.rows), (20, 14));
    });

    test('a diagonal line counts its length', () {
      final g = RasterGrid.fromLength(
          a: Offset.zero, b: const Offset(300, 400), squares: 10,
          picture: const Size(1000, 1000))!;
      expect(g.cellW, closeTo(50, 1e-9));
    });

    test('no squares or too small squares give null', () {
      const pic = Size(1000, 700);
      expect(RasterGrid.fromLength(a: Offset.zero, b: const Offset(100, 0), squares: 0, picture: pic),
          isNull);
      expect(RasterGrid.fromLength(a: Offset.zero, b: const Offset(10, 0), squares: 5, picture: pic),
          isNull);
    });
  });
}
