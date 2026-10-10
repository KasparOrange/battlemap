import 'dart:math';
import 'dart:typed_data';
import 'dart:ui';

import 'package:battlemap/model/dm_overlay.dart';
import 'package:battlemap/model/draw_stroke.dart';
import 'package:battlemap/model/table_fit.dart';
import 'package:battlemap/state/vtt_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// The table view: one map square = one inch on the TV, a centred window of
/// whole squares (34 × 19 on Konrad's TV), panned in whole squares.
void main() {
  // The Xiaomi box's screen in logical pixels (1080p at density 1.0; the
  // arithmetic is the same at any density).
  const screen = Size(1920, 1080);

  group('TableGrid', () {
    test("Konrad's TV: 34 × 19 one-inch squares, a bit of gap both ways", () {
      final g = TableGrid.of(screen, TableGrid.defaultScreenWidthInches)!;
      expect(g.cols, 34);
      expect(g.rows, 19);
      expect(g.marginXInches, greaterThan(0));
      expect(g.marginXInches, lessThan(0.5));
      expect(g.marginYInches, greaterThan(0));
      expect(g.marginYInches, lessThan(0.5));
    });

    test('the window is centred: the leftover is split evenly', () {
      final g = TableGrid.of(screen, 34.5)!;
      final w = g.window;
      expect(w.width, closeTo(34 * g.pxPerInch, 1e-9));
      expect(w.height, closeTo(19 * g.pxPerInch, 1e-9));
      expect(w.left, closeTo(screen.width - w.right, 1e-9));
      expect(w.top, closeTo(screen.height - w.bottom, 1e-9));
    });

    test('an exact fit counts the last square', () {
      final g = TableGrid.of(const Size(1000, 500), 10)!;
      expect(g.cols, 10);
      expect(g.rows, 5);
      expect(g.window, const Rect.fromLTWH(0, 0, 1000, 500));
    });

    test('a bigger picture holds more squares', () {
      final g = TableGrid.of(screen, 47.6)!; // a 55" TV
      expect(g.cols, 47);
      expect(g.rows, 26);
    });

    test('no table for an empty screen or width', () {
      expect(TableGrid.of(Size.zero, 34.5), isNull);
      expect(TableGrid.of(screen, 0), isNull);
    });
  });

  group('TableLayout', () {
    final grid = TableGrid.of(screen, 34.5)!;

    test('a small map is centred at one inch per square', () {
      final l = TableLayout.compute(
          grid: grid, mapCols: 20, mapRows: 15, cellPx: 140);
      expect(l.zoom, closeTo(grid.pxPerInch / 140, 1e-12));
      expect(l.center, const Offset(10 * 140, 7.5 * 140));
      expect(l.pans, isFalse);
      // The window hangs over both ends evenly
      expect(l.windowSquares, const Rect.fromLTWH(-7, -2, 34, 19));
    });

    test('a map exactly the table size fills the window', () {
      final l = TableLayout.compute(
          grid: grid, mapCols: 34, mapRows: 19, cellPx: 100);
      expect(l.pans, isFalse);
      expect(l.windowSquares, const Rect.fromLTWH(0, 0, 34, 19));
    });

    test('a big map starts centred, the window on whole squares', () {
      final l = TableLayout.compute(
          grid: grid, mapCols: 60, mapRows: 40, cellPx: 100);
      expect(l.pansX, isTrue);
      expect(l.pansY, isTrue);
      expect(l.col, 13); // (60 − 34) / 2
      expect(l.row, 11); // (40 − 19) / 2 = 10.5, rounded
      expect(l.windowSquares, const Rect.fromLTWH(13, 11, 34, 19));
      expect(l.center, const Offset((13 + 17) * 100, (11 + 9.5) * 100));
    });

    test('the window is clamped to the map', () {
      final low = TableLayout.compute(
          grid: grid, mapCols: 60, mapRows: 40, cellPx: 100, col: -5, row: -1);
      expect((low.col, low.row), (0, 0));
      final high = TableLayout.compute(
          grid: grid, mapCols: 60, mapRows: 40, cellPx: 100, col: 99, row: 99);
      expect((high.col, high.row), (26, 21));
      expect(high.windowSquares.right, 60);
      expect(high.windowSquares.bottom, 40);
    });

    test('one axis pans, the other stays centred', () {
      final l = TableLayout.compute(
          grid: grid, mapCols: 50, mapRows: 12, cellPx: 70, col: 4, row: 3);
      expect(l.pansX, isTrue);
      expect(l.pansY, isFalse);
      expect(l.col, 4);
      expect(l.center.dy, 6 * 70); // map centre, row request ignored
    });

    test('turned 90°: the 34 screen columns run down the map', () {
      final l = TableLayout.compute(
          grid: grid, mapCols: 25, mapRows: 30, cellPx: 100, quarterTurns: 1);
      expect(l.winCols, 19);
      expect(l.winRows, 34);
      expect(l.pansX, isTrue); // 25 > 19
      expect(l.pansY, isFalse); // 30 ≤ 34
      final upright = TableLayout.compute(
          grid: grid, mapCols: 25, mapRows: 30, cellPx: 100, quarterTurns: 2);
      expect(upright.winCols, 34);
    });

    test('startFor centres the window on a square, rounded', () {
      final l = TableLayout.compute(
          grid: grid, mapCols: 60, mapRows: 40, cellPx: 100);
      final s = l.startFor(const Offset(30.4, 20.2));
      expect((s.col, s.row), (13, 11));
      final moved = TableLayout.compute(
          grid: grid, mapCols: 60, mapRows: 40, cellPx: 100,
          col: l.startFor(const Offset(50, 35)).col,
          row: l.startFor(const Offset(50, 35)).row);
      expect((moved.col, moved.row), (26, 21)); // clamped at the far corner
    });

    test('quarterTurnsOf rounds any angle to 0–3', () {
      expect(quarterTurnsOf(0), 0);
      expect(quarterTurnsOf(1.5707963), 1);
      expect(quarterTurnsOf(pi), 2);
      expect(quarterTurnsOf(-pi / 2), 3);
      expect(quarterTurnsOf(2 * pi), 0);
      expect(quarterTurnsOf(5 * pi / 2 + 0.1), 1);
    });
  });

  group('MapFit (the game file record)', () {
    test('records scale, calibration and grid; round-trips', () {
      final g = TableGrid.of(screen, 34.5)!;
      final fit = MapFit.of(g, cellPx: 140, cols: 25, rows: 24, drawGrid: false);
      expect(fit.tvZoom, closeTo(g.pxPerInch / 140, 1e-12));
      expect(fit.tableCols, 34);
      expect(fit.tableRows, 19);
      expect(fit.fitsTable, isFalse); // 24 rows > 19
      final json = fit.toJson();
      expect(json['fitsTable'], isFalse);
      expect(json['drawGrid'], isFalse);
      final back = MapFit.fromJson(json);
      expect(back.tvZoom, fit.tvZoom);
      expect(back.screenWidthInches, 34.5);
      expect(back.drawGrid, isFalse);
    });

    test('a map within 34 × 19 fits the table', () {
      final g = TableGrid.of(screen, 34.5)!;
      expect(MapFit.of(g, cellPx: 100, cols: 34, rows: 19, drawGrid: true).fitsTable, isTrue);
    });
  });

  group('TvCameraMode', () {
    test('unknown or missing names fall back to the table', () {
      expect(TvCameraMode.fromName('fit'), TvCameraMode.fit);
      expect(TvCameraMode.fromName(null), TvCameraMode.table);
      expect(TvCameraMode.fromName('zoomed'), TvCameraMode.table);
    });
  });

  group('VttState table view', () {
    test('updateTableWindow notifies only on a change', () {
      final state = VttState();
      var n = 0;
      state.addListener(() => n++);
      state.updateTableWindow(col: 3, row: null, cols: 34, rows: 19);
      expect(n, 1);
      state.updateTableWindow(col: 3, row: null, cols: 34, rows: 19);
      expect(n, 1, reason: 'a layout pass that changes nothing ends quietly');
      state.updateTableWindow(col: 4, row: null);
      expect(n, 2);
      expect(state.tableCols, 34);
    });

    test('a new map starts on the 1-inch table, window centred', () {
      final state = VttState()
        ..tvCameraMode = TvCameraMode.fit
        ..tableCol = 9
        ..tableRow = 2;
      state.loadPdfAsMap(Uint8List(0),
          gridCols: 20, gridRows: 10, imageWidth: 2000, imageHeight: 1000);
      expect(state.tvCameraMode, TvCameraMode.table);
      expect(state.tableCol, isNull);
      expect(state.tableRow, isNull);
    });

    test('the calibration survives a new map', () {
      final state = VttState()..setTvWidthInches(36);
      state.loadPdfAsMap(Uint8List(0),
          gridCols: 20, gridRows: 10, imageWidth: 2000, imageHeight: 1000);
      expect(state.tvWidthInches, 36);
    });
  });

  group('VttState.regridRaster (Map squares)', () {
    VttState pictureMap() => VttState()
      ..loadPdfAsMap(Uint8List(0),
          gridCols: 20, gridRows: 10, imageWidth: 2000, imageHeight: 1000);

    test('lays the new grid, clears fog, keeps drawings, layers and tokens', () {
      final state = pictureMap();
      state.revealedCells = {1, 2, 3};
      state.addStroke(DrawStroke(
          points: const [Offset(1, 1), Offset(5, 5)],
          color: const Color(0xFFFF0000),
          width: 3));
      state.addToken(2, 2);
      state.dmOverlays = [DmOverlay(id: 'a', name: 'notes.png', url: 'local:a')];
      state.tvCameraMode = TvCameraMode.fit;

      expect(state.regridRaster(25, 12), isTrue);
      final grid = state.map!.resolution.mapSize;
      expect((grid.dx, grid.dy), (25.0, 12.0));
      expect(state.map!.resolution.pixelsPerGrid, 80); // 2000 / 25
      expect(state.revealedCells, isEmpty);
      expect(state.strokes, hasLength(1));
      expect(state.tokens, hasLength(1));
      expect(state.dmOverlays.single.id, 'a');
      expect(state.tvCameraMode, TvCameraMode.fit);
      expect(state.canUndo, isFalse, reason: 'old fog undo steps mean other squares');
    });

    test('same grid, a .dd2vtt or no map: nothing happens', () {
      final state = pictureMap()..revealedCells = {4};
      expect(state.regridRaster(20, 10), isFalse);
      expect(state.revealedCells, {4});
      expect(VttState().regridRaster(10, 10), isFalse);
      expect(state.regridRaster(0, 10), isFalse);
    });
  });

  group('calibration pivot', () {
    // Konrad's TV: 960 × 540 logical px, 34.5 in wide.
    final g = TableGrid.of(const Size(960, 540), 34.5)!;

    test('corners sit inset from the screen edges, the centre in the middle', () {
      final i = g.pivotInset;
      expect(i, closeTo(43.2, 1e-9));
      expect(g.pivotPoint(CalibrationPivot.bottomLeft), Offset(i, 540 - i));
      expect(g.pivotPoint(CalibrationPivot.topRight), Offset(960 - i, i));
      expect(g.pivotPoint(CalibrationPivot.center), const Offset(480, 270));
    });

    test('the pivot does not move when the calibration changes', () {
      final wider = TableGrid.of(const Size(960, 540), 36)!;
      for (final p in CalibrationPivot.values) {
        expect(wider.pivotPoint(p), g.pivotPoint(p));
      }
    });

    test('the bar runs into the screen and is 10 in where there is room', () {
      expect(TableGrid.barRunsRight(CalibrationPivot.bottomLeft), isTrue);
      expect(TableGrid.barRunsRight(CalibrationPivot.topRight), isFalse);
      expect(TableGrid.barRunsRight(CalibrationPivot.center), isTrue);
      for (final p in CalibrationPivot.values) {
        expect(g.barInchesFrom(p), 10);
      }
      // A 15 in wide picture: 7 in from the centre, 10 from a corner.
      expect(TableGrid.barInches(15, 15 * 9 / 16, CalibrationPivot.center), 7);
      expect(TableGrid.barInches(15, 15 * 9 / 16, CalibrationPivot.bottomLeft), 10);
    });

    test('names parse, unknown ones give bottom left', () {
      expect(CalibrationPivot.fromName('topLeft'), CalibrationPivot.topLeft);
      expect(CalibrationPivot.fromName(null), CalibrationPivot.bottomLeft);
      expect(CalibrationPivot.fromName('x'), CalibrationPivot.bottomLeft);
    });
  });
}
