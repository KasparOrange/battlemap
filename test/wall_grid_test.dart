import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

import 'package:battlemap/game/wall_grid.dart';
import 'package:battlemap/model/uvtt_map.dart';

/// Helper to build a minimal [UvttMap] with the given walls, portals, and grid.
UvttMap _makeMap({
  required int gridCols,
  required int gridRows,
  List<List<UvttPoint>> lineOfSight = const [],
  List<List<UvttPoint>> objectsLineOfSight = const [],
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
    objectsLineOfSight: objectsLineOfSight,
    portals: portals,
    lights: [],
    environment: UvttEnvironment(
      bakedLighting: false,
      ambientLight: const Color(0xFFFFFFFF),
    ),
    imageBytes: Uint8List(0),
  );
}

/// Helper to make a portal with bounds at the given coordinates.
UvttPortal _makePortal(double x0, double y0, double x1, double y1,
    {bool closed = true}) {
  return UvttPortal(
    position: UvttPoint((x0 + x1) / 2, (y0 + y1) / 2),
    bounds: [UvttPoint(x0, y0), UvttPoint(x1, y1)],
    rotation: 0,
    closed: closed,
    freestanding: false,
  );
}

void main() {
  group('WallGrid', () {
    test('empty grid (no walls) — flood fill returns all cells', () {
      final map = _makeMap(gridCols: 4, gridRows: 3);
      final grid = WallGrid.fromMap(map, {});

      // Start from cell (0,0) — should reach all 12 cells
      final result = grid.floodFill(0);
      expect(result.length, 12);
      for (int i = 0; i < 12; i++) {
        expect(result.contains(i), isTrue, reason: 'cell $i should be reachable');
      }
    });

    test('simple box room — flood fill returns interior cells only', () {
      // 5x5 grid with walls forming a box around cells (1,1), (2,1), (1,2), (2,2)
      // Box walls: top from (1,1) to (3,1), bottom from (1,3) to (3,3),
      //            left from (1,1) to (1,3), right from (3,1) to (3,3)
      final map = _makeMap(
        gridCols: 5,
        gridRows: 5,
        lineOfSight: [
          // Top wall: horizontal line at y=1, from x=1 to x=3
          [UvttPoint(1, 1), UvttPoint(3, 1)],
          // Bottom wall: horizontal line at y=3, from x=1 to x=3
          [UvttPoint(1, 3), UvttPoint(3, 3)],
          // Left wall: vertical line at x=1, from y=1 to y=3
          [UvttPoint(1, 1), UvttPoint(1, 3)],
          // Right wall: vertical line at x=3, from y=1 to y=3
          [UvttPoint(3, 1), UvttPoint(3, 3)],
        ],
      );
      final grid = WallGrid.fromMap(map, {});

      // Flood fill from cell (1,1) should give the 4 interior cells
      final roomIdx = grid.cellIndex(1, 1);
      final result = grid.floodFill(roomIdx);
      expect(result, containsAll([
        grid.cellIndex(1, 1),
        grid.cellIndex(2, 1),
        grid.cellIndex(1, 2),
        grid.cellIndex(2, 2),
      ]));
      // Should NOT contain cells outside the box
      expect(result.contains(grid.cellIndex(0, 0)), isFalse);
      expect(result.contains(grid.cellIndex(3, 1)), isFalse);
      expect(result.contains(grid.cellIndex(1, 0)), isFalse);
      expect(result.contains(grid.cellIndex(1, 3)), isFalse);
    });

    test('two rooms with closed door — flood fill stops at door', () {
      // Two 2x1 rooms side by side:
      //   Room A: cells (0,0) and (1,0)
      //   Room B: cells (2,0) and (3,0)
      // Walls: top at y=0 from x=0 to x=4, bottom at y=1 from x=0 to x=4,
      //         left at x=0 from y=0 to y=1, right at x=4 from y=0 to y=1,
      //         divider at x=2 from y=0 to y=1
      // Door at x=2 (the divider), closed
      final map = _makeMap(
        gridCols: 4,
        gridRows: 1,
        lineOfSight: [
          // Top wall
          [UvttPoint(0, 0), UvttPoint(4, 0)],
          // Bottom wall
          [UvttPoint(0, 1), UvttPoint(4, 1)],
          // Left wall
          [UvttPoint(0, 0), UvttPoint(0, 1)],
          // Right wall
          [UvttPoint(4, 0), UvttPoint(4, 1)],
          // Divider wall (will be overridden by portal if open)
          [UvttPoint(2, 0), UvttPoint(2, 1)],
        ],
        portals: [
          _makePortal(2, 0, 2, 1, closed: true),
        ],
      );
      final grid = WallGrid.fromMap(map, {}); // No open portals

      // From Room A, should only reach cells 0 and 1
      final resultA = grid.floodFill(grid.cellIndex(0, 0));
      expect(resultA, containsAll([grid.cellIndex(0, 0), grid.cellIndex(1, 0)]));
      expect(resultA.contains(grid.cellIndex(2, 0)), isFalse);
      expect(resultA.contains(grid.cellIndex(3, 0)), isFalse);

      // From Room B, should only reach cells 2 and 3
      final resultB = grid.floodFill(grid.cellIndex(2, 0));
      expect(resultB, containsAll([grid.cellIndex(2, 0), grid.cellIndex(3, 0)]));
      expect(resultB.contains(grid.cellIndex(0, 0)), isFalse);
    });

    test('two rooms connected by open door — flood fill crosses door', () {
      // Same layout as above but door is open
      final map = _makeMap(
        gridCols: 4,
        gridRows: 1,
        lineOfSight: [
          [UvttPoint(0, 0), UvttPoint(4, 0)],
          [UvttPoint(0, 1), UvttPoint(4, 1)],
          [UvttPoint(0, 0), UvttPoint(0, 1)],
          [UvttPoint(4, 0), UvttPoint(4, 1)],
          [UvttPoint(2, 0), UvttPoint(2, 1)],
        ],
        portals: [
          _makePortal(2, 0, 2, 1, closed: true),
        ],
      );
      final grid = WallGrid.fromMap(map, {0}); // Portal 0 is open

      // From Room A, should reach all 4 cells
      final result = grid.floodFill(grid.cellIndex(0, 0));
      expect(result.length, 4);
      expect(result, containsAll([
        grid.cellIndex(0, 0),
        grid.cellIndex(1, 0),
        grid.cellIndex(2, 0),
        grid.cellIndex(3, 0),
      ]));
    });

    test('diagonal wall — correct edge blocking', () {
      // 3x3 grid with a diagonal wall from (0,0) to (3,3)
      // This crosses vertical grid lines at x=1,2 and horizontal at y=1,2
      final map = _makeMap(
        gridCols: 3,
        gridRows: 3,
        lineOfSight: [
          [UvttPoint(0, 0), UvttPoint(3, 3)],
        ],
      );
      final grid = WallGrid.fromMap(map, {});

      // The diagonal from (0,0) to (3,3) crosses:
      //   x=1 at y=1.0, x=2 at y=2.0
      //   y=1 at x=1.0, y=2 at x=2.0
      // But at y=1, x=1 (and at y=2, x=2) the line passes through grid corners.
      // Integer crossings: the line goes from (0,0) to (3,3).
      // At x=1: y = 1.0 -> floor(y) = 1 but y is exactly 1, so this is a corner
      //   The vertical crossing at x=1 gives cell row = floor(1.0) = 1
      //   But since the crossing is at an exact integer y, we might hit epsilon checks.
      //
      // The wall should create some blocked edges. Let's just verify that
      // the flood fill from (0,0) doesn't reach all cells.
      final fromCorner = grid.floodFill(grid.cellIndex(0, 0));
      final fromOpposite = grid.floodFill(grid.cellIndex(2, 2));

      // The diagonal should block passage across it in at least some places.
      // Due to the wall discretization at grid crossings, cells on one side
      // shouldn't all be reachable from the other side.
      // At minimum, the two corners should have different reachable sets.
      expect(fromCorner.length < 9 || fromOpposite.length < 9, isTrue,
          reason: 'diagonal wall should block at least some cells');
    });

    test('boundary cells — flood fill stays within grid', () {
      final map = _makeMap(gridCols: 3, gridRows: 3);
      final grid = WallGrid.fromMap(map, {});

      // Corner cell — should still flood fill correctly without going out of bounds
      final result = grid.floodFill(grid.cellIndex(0, 0));
      expect(result.length, 9); // All cells reachable (no walls)

      // All indices should be valid
      for (final idx in result) {
        expect(idx >= 0 && idx < 9, isTrue, reason: 'cell $idx out of bounds');
      }
    });

    test('out of bounds startCell returns empty set', () {
      final map = _makeMap(gridCols: 3, gridRows: 3);
      final grid = WallGrid.fromMap(map, {});

      expect(grid.floodFill(-1), isEmpty);
      expect(grid.floodFill(9), isEmpty);
      expect(grid.floodFill(100), isEmpty);
    });

    test('single cell grid works correctly', () {
      final map = _makeMap(gridCols: 1, gridRows: 1);
      final grid = WallGrid.fromMap(map, {});

      final result = grid.floodFill(0);
      expect(result, {0});
    });

    test('horizontal wall blocks north-south passage', () {
      // 3x3 grid with a horizontal wall at y=1 spanning the full width
      final map = _makeMap(
        gridCols: 3,
        gridRows: 3,
        lineOfSight: [
          [UvttPoint(0, 1), UvttPoint(3, 1)],
        ],
      );
      final grid = WallGrid.fromMap(map, {});

      // From row 0, should not reach row 1 or 2
      final topResult = grid.floodFill(grid.cellIndex(0, 0));
      expect(topResult, containsAll([
        grid.cellIndex(0, 0),
        grid.cellIndex(1, 0),
        grid.cellIndex(2, 0),
      ]));
      expect(topResult.length, 3, reason: 'should only reach top row');

      // From row 1, should reach rows 1 and 2 but not row 0
      final bottomResult = grid.floodFill(grid.cellIndex(0, 1));
      expect(bottomResult.contains(grid.cellIndex(0, 0)), isFalse);
      expect(bottomResult, containsAll([
        grid.cellIndex(0, 1),
        grid.cellIndex(1, 1),
        grid.cellIndex(2, 1),
        grid.cellIndex(0, 2),
        grid.cellIndex(1, 2),
        grid.cellIndex(2, 2),
      ]));
    });

    test('vertical wall blocks east-west passage', () {
      // 3x3 grid with a vertical wall at x=1 spanning the full height
      final map = _makeMap(
        gridCols: 3,
        gridRows: 3,
        lineOfSight: [
          [UvttPoint(1, 0), UvttPoint(1, 3)],
        ],
      );
      final grid = WallGrid.fromMap(map, {});

      // From col 0, should not reach cols 1 or 2
      final leftResult = grid.floodFill(grid.cellIndex(0, 0));
      expect(leftResult, containsAll([
        grid.cellIndex(0, 0),
        grid.cellIndex(0, 1),
        grid.cellIndex(0, 2),
      ]));
      expect(leftResult.length, 3, reason: 'should only reach left column');
    });

    test('cellIndex computes correct values', () {
      final map = _makeMap(gridCols: 5, gridRows: 3);
      final grid = WallGrid.fromMap(map, {});

      expect(grid.cellIndex(0, 0), 0);
      expect(grid.cellIndex(4, 0), 4);
      expect(grid.cellIndex(0, 1), 5);
      expect(grid.cellIndex(2, 2), 12);
    });

    test('closed portal blocks flood fill (explicit test)', () {
      // 3x1 grid with a portal between cell 0 and cell 1
      // Portal is CLOSED -> flood fill from cell 0 should NOT reach cell 1
      final map = _makeMap(
        gridCols: 3,
        gridRows: 1,
        lineOfSight: [
          // Top wall
          [UvttPoint(0, 0), UvttPoint(3, 0)],
          // Bottom wall
          [UvttPoint(0, 1), UvttPoint(3, 1)],
          // Left wall
          [UvttPoint(0, 0), UvttPoint(0, 1)],
          // Right wall
          [UvttPoint(3, 0), UvttPoint(3, 1)],
        ],
        portals: [
          _makePortal(1, 0, 1, 1, closed: true),
        ],
      );
      final grid = WallGrid.fromMap(map, {}); // empty openPortals => closed

      final result = grid.floodFill(grid.cellIndex(0, 0));
      expect(result, contains(grid.cellIndex(0, 0)));
      expect(result.contains(grid.cellIndex(1, 0)), isFalse,
          reason: 'closed portal should block passage');
      expect(result.contains(grid.cellIndex(2, 0)), isFalse);
    });

    test('open portal allows flood fill (explicit test)', () {
      // 3x1 grid with a portal between cell 0 and cell 1
      // Portal is OPEN -> flood fill from cell 0 should reach all cells
      final map = _makeMap(
        gridCols: 3,
        gridRows: 1,
        lineOfSight: [
          [UvttPoint(0, 0), UvttPoint(3, 0)],
          [UvttPoint(0, 1), UvttPoint(3, 1)],
          [UvttPoint(0, 0), UvttPoint(0, 1)],
          [UvttPoint(3, 0), UvttPoint(3, 1)],
          // Divider wall at x=1 (portal overlays this)
          [UvttPoint(1, 0), UvttPoint(1, 1)],
        ],
        portals: [
          _makePortal(1, 0, 1, 1, closed: true),
        ],
      );
      final grid = WallGrid.fromMap(map, {0}); // portal 0 is open

      final result = grid.floodFill(grid.cellIndex(0, 0));
      expect(result.length, 3);
      expect(result, containsAll([
        grid.cellIndex(0, 0),
        grid.cellIndex(1, 0),
        grid.cellIndex(2, 0),
      ]));
    });

    test('multiple rooms connected by multiple doors', () {
      // 6x1 grid: Room A (0,1), Room B (2,3), Room C (4,5)
      // Doors at x=2 (between A and B) and x=4 (between B and C)
      // Both doors OPEN -> all 6 cells reachable from cell 0
      final map = _makeMap(
        gridCols: 6,
        gridRows: 1,
        lineOfSight: [
          [UvttPoint(0, 0), UvttPoint(6, 0)],
          [UvttPoint(0, 1), UvttPoint(6, 1)],
          [UvttPoint(0, 0), UvttPoint(0, 1)],
          [UvttPoint(6, 0), UvttPoint(6, 1)],
          [UvttPoint(2, 0), UvttPoint(2, 1)],
          [UvttPoint(4, 0), UvttPoint(4, 1)],
        ],
        portals: [
          _makePortal(2, 0, 2, 1, closed: true), // door between A and B
          _makePortal(4, 0, 4, 1, closed: true), // door between B and C
        ],
      );

      // Both doors open
      final gridBothOpen = WallGrid.fromMap(map, {0, 1});
      final resultBoth = gridBothOpen.floodFill(gridBothOpen.cellIndex(0, 0));
      expect(resultBoth.length, 6,
          reason: 'all rooms reachable when both doors open');

      // Only first door open -> rooms A and B reachable from A
      final gridFirstOpen = WallGrid.fromMap(map, {0});
      final resultFirst = gridFirstOpen.floodFill(gridFirstOpen.cellIndex(0, 0));
      expect(resultFirst.length, 4,
          reason: 'rooms A and B reachable, C blocked');
      expect(resultFirst.contains(gridFirstOpen.cellIndex(4, 0)), isFalse);
      expect(resultFirst.contains(gridFirstOpen.cellIndex(5, 0)), isFalse);

      // Only second door open -> room C reachable from B but not A
      final gridSecondOpen = WallGrid.fromMap(map, {1});
      final resultFromA = gridSecondOpen.floodFill(gridSecondOpen.cellIndex(0, 0));
      expect(resultFromA.length, 2,
          reason: 'only room A reachable from cell 0');
      final resultFromB = gridSecondOpen.floodFill(gridSecondOpen.cellIndex(2, 0));
      expect(resultFromB.length, 4,
          reason: 'rooms B and C reachable from cell 2');

      // Both doors closed
      final gridBothClosed = WallGrid.fromMap(map, {});
      final resultClosed = gridBothClosed.floodFill(gridBothClosed.cellIndex(0, 0));
      expect(resultClosed.length, 2,
          reason: 'only room A reachable from cell 0');
    });

    test('L-shaped room (walls with corners)', () {
      // 4x3 grid with an L-shaped room:
      // Room occupies (0,0), (1,0), (0,1), (0,2)
      // Walls form an L around these cells
      final map = _makeMap(
        gridCols: 4,
        gridRows: 3,
        lineOfSight: [
          // Top wall of horizontal part: y=0, x=0 to x=2
          [UvttPoint(0, 0), UvttPoint(2, 0)],
          // Right wall of horizontal part: x=2, y=0 to y=1
          [UvttPoint(2, 0), UvttPoint(2, 1)],
          // Step wall: y=1, x=1 to x=2 (inner corner)
          [UvttPoint(1, 1), UvttPoint(2, 1)],
          // Right wall of vertical part: x=1, y=1 to y=3
          [UvttPoint(1, 1), UvttPoint(1, 3)],
          // Bottom wall: y=3, x=0 to x=1
          [UvttPoint(0, 3), UvttPoint(1, 3)],
          // Left wall: x=0, y=0 to y=3
          [UvttPoint(0, 0), UvttPoint(0, 3)],
        ],
      );
      final grid = WallGrid.fromMap(map, {});

      // From cell (0,0), should reach the L-shaped room cells
      final result = grid.floodFill(grid.cellIndex(0, 0));

      // L-room: (0,0), (1,0), (0,1), (0,2) = 4 cells
      expect(result, containsAll([
        grid.cellIndex(0, 0),
        grid.cellIndex(1, 0),
        grid.cellIndex(0, 1),
        grid.cellIndex(0, 2),
      ]));

      // Should NOT contain cells outside the L
      expect(result.contains(grid.cellIndex(2, 0)), isFalse,
          reason: 'cell (2,0) is outside the L');
      expect(result.contains(grid.cellIndex(1, 1)), isFalse,
          reason: 'cell (1,1) is outside the L');
      expect(result.contains(grid.cellIndex(1, 2)), isFalse,
          reason: 'cell (1,2) is outside the L');
    });
  });
}
