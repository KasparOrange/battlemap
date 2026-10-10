import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

import 'package:battlemap/game/wall_grid.dart';
import 'package:battlemap/model/uvtt_map.dart';

/// Edge-case tests for [WallGrid] that complement the main scenarios
/// in `wall_grid_test.dart`.
///
/// These cover situations that are easy to get wrong but rare on real maps:
/// isolated single cells, walls flush against the map edge, malformed
/// portals, very large open rooms, and reachability symmetry.
UvttMap _makeMap({
  required int gridCols,
  required int gridRows,
  List<List<UvttPoint>> lineOfSight = const [],
  List<UvttPortal> portals = const [],
}) {
  return UvttMap(
    format: 0,
    resolution: UvttResolution(
      mapOrigin: const Offset(0, 0),
      mapSize: Offset(gridCols.toDouble(), gridRows.toDouble()),
      pixelsPerGrid: 140,
    ),
    lineOfSight: lineOfSight,
    objectsLineOfSight: const [],
    portals: portals,
    lights: const [],
    environment: UvttEnvironment(
      bakedLighting: false,
      ambientLight: const Color(0xFFFFFFFF),
    ),
    imageBytes: Uint8List(0),
  );
}

UvttPortal _portal(double x0, double y0, double x1, double y1) => UvttPortal(
      position: UvttPoint((x0 + x1) / 2, (y0 + y1) / 2),
      bounds: [UvttPoint(x0, y0), UvttPoint(x1, y1)],
      rotation: 0,
      closed: true,
      freestanding: false,
    );

void main() {
  group('WallGrid edge cases', () {
    test('isolated single cell — walls on all four sides reach only itself', () {
      // 3x3 grid with cell (1,1) sealed off completely.
      final map = _makeMap(
        gridCols: 3,
        gridRows: 3,
        lineOfSight: [
          [UvttPoint(1, 1), UvttPoint(2, 1)], // top
          [UvttPoint(1, 2), UvttPoint(2, 2)], // bottom
          [UvttPoint(1, 1), UvttPoint(1, 2)], // left
          [UvttPoint(2, 1), UvttPoint(2, 2)], // right
        ],
      );
      final grid = WallGrid.fromMap(map, {});
      final inside = grid.floodFill(grid.cellIndex(1, 1));
      expect(inside, {grid.cellIndex(1, 1)},
          reason: 'sealed cell should reach only itself');

      // Outside should reach the other 8 cells (everything but the sealed one).
      final outside = grid.floodFill(grid.cellIndex(0, 0));
      expect(outside.length, 8);
      expect(outside.contains(grid.cellIndex(1, 1)), isFalse);
    });

    test('reachability is symmetric — if A reaches B, B reaches A', () {
      // A non-trivial layout: two rooms joined by a corridor.
      final map = _makeMap(
        gridCols: 5,
        gridRows: 3,
        lineOfSight: [
          // Outer perimeter
          [UvttPoint(0, 0), UvttPoint(5, 0)],
          [UvttPoint(0, 3), UvttPoint(5, 3)],
          [UvttPoint(0, 0), UvttPoint(0, 3)],
          [UvttPoint(5, 0), UvttPoint(5, 3)],
          // Vertical wall splitting top-right corner
          [UvttPoint(3, 0), UvttPoint(3, 1)],
          // Horizontal wall splitting middle row from right side
          [UvttPoint(3, 1), UvttPoint(5, 1)],
        ],
      );
      final grid = WallGrid.fromMap(map, {});
      // For every reachable pair, flooding from either end should give the
      // same connected component.
      for (int row = 0; row < 3; row++) {
        for (int col = 0; col < 5; col++) {
          final start = grid.cellIndex(col, row);
          final reach = grid.floodFill(start);
          for (final other in reach) {
            final back = grid.floodFill(other);
            expect(back, equals(reach),
                reason:
                    'flood($start)=${reach.length} but flood($other)=${back.length}');
          }
        }
      }
    });

    test('wall flush against the map edge does not block extra cells', () {
      // 3x3 grid with a wall along the very top edge (y=0). The top edge
      // of row 0 has no neighbor above anyway, so blocking it should have
      // zero effect on connectivity.
      final map = _makeMap(
        gridCols: 3,
        gridRows: 3,
        lineOfSight: [
          [UvttPoint(0, 0), UvttPoint(3, 0)],
        ],
      );
      final grid = WallGrid.fromMap(map, {});
      final reach = grid.floodFill(grid.cellIndex(0, 0));
      expect(reach.length, 9, reason: 'edge-flush wall must not block anything');
    });

    test('portal with fewer than 2 bounds is silently skipped', () {
      // 3x1 with a divider wall and a malformed portal (only 1 bound).
      // The portal should be ignored, leaving the divider in force.
      final map = _makeMap(
        gridCols: 3,
        gridRows: 1,
        lineOfSight: [
          [UvttPoint(0, 0), UvttPoint(3, 0)],
          [UvttPoint(0, 1), UvttPoint(3, 1)],
          [UvttPoint(0, 0), UvttPoint(0, 1)],
          [UvttPoint(3, 0), UvttPoint(3, 1)],
          [UvttPoint(1, 0), UvttPoint(1, 1)], // divider
        ],
        portals: [
          UvttPortal(
            position: UvttPoint(1, 0.5),
            bounds: [UvttPoint(1, 0)], // only one point — malformed
            rotation: 0,
            closed: false, // even open, since it's malformed it should be ignored
            freestanding: false,
          ),
        ],
      );
      final grid = WallGrid.fromMap(map, {0});
      final reach = grid.floodFill(grid.cellIndex(0, 0));
      expect(reach.contains(grid.cellIndex(1, 0)), isFalse,
          reason: 'malformed portal should not unblock the divider');
    });

    test('open portal at a non-existent index leaves walls intact', () {
      // The DM marks portal index 7 as open but only portal 0 exists.
      // Portal 0 stays closed; nothing should crash.
      final map = _makeMap(
        gridCols: 3,
        gridRows: 1,
        lineOfSight: [
          [UvttPoint(0, 0), UvttPoint(3, 0)],
          [UvttPoint(0, 1), UvttPoint(3, 1)],
          [UvttPoint(0, 0), UvttPoint(0, 1)],
          [UvttPoint(3, 0), UvttPoint(3, 1)],
          [UvttPoint(1, 0), UvttPoint(1, 1)],
        ],
        portals: [_portal(1, 0, 1, 1)],
      );
      final grid = WallGrid.fromMap(map, {7}); // 7 doesn't exist
      final reach = grid.floodFill(grid.cellIndex(0, 0));
      expect(reach.contains(grid.cellIndex(1, 0)), isFalse,
          reason: 'portal 0 is still closed; index 7 is irrelevant');
    });

    test('large open room (40x40) — flood fill reaches all cells', () {
      // Sanity check: BFS scales to a real-size room without slowdown
      // and without missing any cells.
      const cols = 40;
      const rows = 40;
      final map = _makeMap(gridCols: cols, gridRows: rows);
      final grid = WallGrid.fromMap(map, {});
      final reach = grid.floodFill(grid.cellIndex(0, 0));
      expect(reach.length, cols * rows);
    });

    test('two diagonally adjacent cells — diagonal is NOT a flood-fill neighbor', () {
      // 3x3 with a wall pattern that leaves (0,0) and (1,1) only diagonally
      // adjacent (no shared edge). Flood fill is 4-connected, so they
      // must end up in different components.
      final map = _makeMap(
        gridCols: 3,
        gridRows: 3,
        lineOfSight: [
          // Seal off (0,0) entirely except its east edge into (1,0):
          // walls south and east of (0,0) block (0,1) and (1,0).
          [UvttPoint(0, 1), UvttPoint(1, 1)], // south of (0,0)
          [UvttPoint(1, 0), UvttPoint(1, 1)], // east of (0,0)
        ],
      );
      final grid = WallGrid.fromMap(map, {});
      final fromZero = grid.floodFill(grid.cellIndex(0, 0));
      // (0,0) should NOT reach (1,1) — diagonal is not a flood-fill neighbor.
      expect(fromZero.contains(grid.cellIndex(1, 1)), isFalse);
      expect(fromZero, {grid.cellIndex(0, 0)},
          reason: '(0,0) is sealed, so only itself');
    });

    test('toggling a single portal changes only the affected component', () {
      // 5x1 with two doors. Open the middle one only — verify both new
      // grids reflect the toggle correctly.
      List<List<UvttPoint>> walls() => [
            [UvttPoint(0, 0), UvttPoint(5, 0)],
            [UvttPoint(0, 1), UvttPoint(5, 1)],
            [UvttPoint(0, 0), UvttPoint(0, 1)],
            [UvttPoint(5, 0), UvttPoint(5, 1)],
            [UvttPoint(2, 0), UvttPoint(2, 1)],
            [UvttPoint(4, 0), UvttPoint(4, 1)],
          ];
      final map = _makeMap(
        gridCols: 5,
        gridRows: 1,
        lineOfSight: walls(),
        portals: [
          _portal(2, 0, 2, 1),
          _portal(4, 0, 4, 1),
        ],
      );
      // Both closed: from cell 0 you only reach 0,1.
      final closed = WallGrid.fromMap(map, {});
      expect(closed.floodFill(closed.cellIndex(0, 0)).length, 2);
      // First door open: cells 0..3 reachable.
      final firstOpen = WallGrid.fromMap(map, {0});
      expect(firstOpen.floodFill(firstOpen.cellIndex(0, 0)).length, 4);
      // Second door open: still only 0,1 from cell 0.
      final secondOnly = WallGrid.fromMap(map, {1});
      expect(secondOnly.floodFill(secondOnly.cellIndex(0, 0)).length, 2);
    });
  });
}
