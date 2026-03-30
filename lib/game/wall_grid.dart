import 'dart:collection';
import 'dart:math';

import '../model/uvtt_map.dart';

/// Cardinal direction for a cell edge.
///
/// Used by [WallGrid] to track which edges of a grid cell are blocked
/// by walls or closed portals. Each direction corresponds to one side
/// of a rectangular grid cell:
///
/// * [north] -- top edge (shared with the cell above)
/// * [south] -- bottom edge (shared with the cell below)
/// * [east] -- right edge (shared with the cell to the right)
/// * [west] -- left edge (shared with the cell to the left)
enum Direction { north, south, east, west }

/// Discretized wall grid for flood-fill room detection.
///
/// Converts continuous wall polylines from a [UvttMap] into blocked
/// cell edges on the integer grid. This allows fast BFS flood fill
/// to find all cells reachable from a starting cell without crossing
/// any wall.
///
/// Portal (door) segments are handled specially: if a portal's index
/// is in the [openPortals] set passed to [WallGrid.fromMap], its
/// wall segments are removed (the passage is open). Closed portals
/// block edges just like normal walls.
///
/// See also:
/// * [VttGame], which uses the wall grid for room-reveal fog interaction.
/// * [FogOfWarComponent], which renders the fog cells.
class WallGrid {
  /// Number of grid columns.
  final int gridCols;

  /// Number of grid rows.
  final int gridRows;

  /// For each cell index, the set of directions where edges are blocked.
  ///
  /// Cell index is computed as `row * gridCols + col`. A missing entry
  /// means the cell has no blocked edges (all four neighbors are reachable).
  final Map<int, Set<Direction>> blockedEdges;

  WallGrid._({
    required this.gridCols,
    required this.gridRows,
    required this.blockedEdges,
  });

  /// Builds a [WallGrid] from a [UvttMap]'s wall geometry.
  ///
  /// Combines [UvttMap.lineOfSight] and [UvttMap.objectsLineOfSight] walls,
  /// discretizes each wall segment into blocked cell edges, then processes
  /// portals: closed portals block edges, open portals (indices in
  /// [openPortals]) have their edges removed to allow passage.
  ///
  /// The [map] provides wall polylines, portal geometry, and grid dimensions.
  /// [openPortals] contains the indices of portals that are currently open.
  factory WallGrid.fromMap(UvttMap map, Set<int> openPortals) {
    final gridCols = map.resolution.mapSize.dx.toInt();
    final gridRows = map.resolution.mapSize.dy.toInt();
    final blocked = <int, Set<Direction>>{};

    void addBlock(int col, int row, Direction dir) {
      if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return;
      final idx = row * gridCols + col;
      (blocked[idx] ??= {}).add(dir);
    }

    void processSegment(double x0, double y0, double x1, double y1) {
      const eps = 1e-6;
      final dx = x1 - x0;
      final dy = y1 - y0;
      final length = sqrt(dx * dx + dy * dy);
      if (length < eps) return;

      // Special case: wall runs along a horizontal grid line (y is integer)
      // This blocks the north/south edge for all cells it spans.
      if (dy.abs() < eps) {
        final iy = y0.round();
        if ((y0 - iy).abs() < eps) {
          final xMin = min(x0, x1);
          final xMax = max(x0, x1);
          // Block edges for each cell column this segment spans
          final colStart = xMin.ceil();
          final colEnd = (xMax - eps).floor();
          for (int col = colStart; col <= colEnd; col++) {
            if (col < 0 || col >= gridCols) continue;
            // Cell above the line: (col, iy-1), south edge blocked
            addBlock(col, iy - 1, Direction.south);
            // Cell below the line: (col, iy), north edge blocked
            addBlock(col, iy, Direction.north);
          }
          return;
        }
      }

      // Special case: wall runs along a vertical grid line (x is integer)
      // This blocks the east/west edge for all cells it spans.
      if (dx.abs() < eps) {
        final ix = x0.round();
        if ((x0 - ix).abs() < eps) {
          final yMin = min(y0, y1);
          final yMax = max(y0, y1);
          final rowStart = yMin.ceil();
          final rowEnd = (yMax - eps).floor();
          for (int row = rowStart; row <= rowEnd; row++) {
            if (row < 0 || row >= gridRows) continue;
            // Cell to the left: (ix-1, row), east edge blocked
            addBlock(ix - 1, row, Direction.east);
            // Cell to the right: (ix, row), west edge blocked
            addBlock(ix, row, Direction.west);
          }
          return;
        }
      }

      // General case: wall crosses grid lines at non-trivial angles
      // Vertical grid lines (integer x values)
      {
        final xMin = min(x0, x1);
        final xMax = max(x0, x1);
        final xStart = xMin.ceil();
        final xEnd = xMax.floor();
        for (int ix = xStart; ix <= xEnd; ix++) {
          // Skip segment endpoints (within epsilon of segment start/end x)
          if ((ix - xMin).abs() < eps || (ix - xMax).abs() < eps) continue;
          final y = y0 + (ix - x0) * dy / dx;
          final cellRow = y.floor();
          if (cellRow < 0 || cellRow >= gridRows) continue;
          // Cell to the left: (ix-1, cellRow), east edge blocked
          addBlock(ix - 1, cellRow, Direction.east);
          // Cell to the right: (ix, cellRow), west edge blocked
          addBlock(ix, cellRow, Direction.west);
        }
      }

      // Horizontal grid lines (integer y values)
      {
        final yMin = min(y0, y1);
        final yMax = max(y0, y1);
        final yStart = yMin.ceil();
        final yEnd = yMax.floor();
        for (int iy = yStart; iy <= yEnd; iy++) {
          // Skip segment endpoints (within epsilon of segment start/end y)
          if ((iy - yMin).abs() < eps || (iy - yMax).abs() < eps) continue;
          final x = x0 + (iy - y0) * dx / dy;
          final cellCol = x.floor();
          if (cellCol < 0 || cellCol >= gridCols) continue;
          // Cell above: (cellCol, iy-1), south edge blocked
          addBlock(cellCol, iy - 1, Direction.south);
          // Cell below: (cellCol, iy), north edge blocked
          addBlock(cellCol, iy, Direction.north);
        }
      }
    }

    void processPolylines(List<List<UvttPoint>> polylines) {
      for (final polyline in polylines) {
        for (int i = 0; i < polyline.length - 1; i++) {
          processSegment(
            polyline[i].x,
            polyline[i].y,
            polyline[i + 1].x,
            polyline[i + 1].y,
          );
        }
      }
    }

    // Process all walls
    processPolylines(map.lineOfSight);
    processPolylines(map.objectsLineOfSight);

    // Computes blocked edges for a single segment into a target map.
    Map<int, Set<Direction>> segmentEdges(
        double x0, double y0, double x1, double y1) {
      final edges = <int, Set<Direction>>{};
      const eps = 1e-6;
      final sdx = x1 - x0;
      final sdy = y1 - y0;
      final slen = sqrt(sdx * sdx + sdy * sdy);
      if (slen < eps) return edges;

      void addEdge(int col, int row, Direction dir) {
        if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return;
        final idx = row * gridCols + col;
        (edges[idx] ??= {}).add(dir);
      }

      // Horizontal segment along a grid line
      if (sdy.abs() < eps) {
        final iy = y0.round();
        if ((y0 - iy).abs() < eps) {
          final xMin = min(x0, x1);
          final xMax = max(x0, x1);
          final colStart = xMin.ceil();
          final colEnd = (xMax - eps).floor();
          for (int col = colStart; col <= colEnd; col++) {
            addEdge(col, iy - 1, Direction.south);
            addEdge(col, iy, Direction.north);
          }
          return edges;
        }
      }

      // Vertical segment along a grid line
      if (sdx.abs() < eps) {
        final ix = x0.round();
        if ((x0 - ix).abs() < eps) {
          final yMin = min(y0, y1);
          final yMax = max(y0, y1);
          final rowStart = yMin.ceil();
          final rowEnd = (yMax - eps).floor();
          for (int row = rowStart; row <= rowEnd; row++) {
            addEdge(ix - 1, row, Direction.east);
            addEdge(ix, row, Direction.west);
          }
          return edges;
        }
      }

      // General diagonal case
      {
        final xMin = min(x0, x1);
        final xMax = max(x0, x1);
        final xStart = xMin.ceil();
        final xEnd = xMax.floor();
        for (int ix = xStart; ix <= xEnd; ix++) {
          if ((ix - xMin).abs() < eps || (ix - xMax).abs() < eps) continue;
          final y = y0 + (ix - x0) * sdy / sdx;
          final cellRow = y.floor();
          if (cellRow < 0 || cellRow >= gridRows) continue;
          addEdge(ix - 1, cellRow, Direction.east);
          addEdge(ix, cellRow, Direction.west);
        }
      }
      {
        final yMin = min(y0, y1);
        final yMax = max(y0, y1);
        final yStart = yMin.ceil();
        final yEnd = yMax.floor();
        for (int iy = yStart; iy <= yEnd; iy++) {
          if ((iy - yMin).abs() < eps || (iy - yMax).abs() < eps) continue;
          final x = x0 + (iy - y0) * sdx / sdy;
          final cellCol = x.floor();
          if (cellCol < 0 || cellCol >= gridCols) continue;
          addEdge(cellCol, iy - 1, Direction.south);
          addEdge(cellCol, iy, Direction.north);
        }
      }

      return edges;
    }

    // Process portals
    for (int i = 0; i < map.portals.length; i++) {
      final portal = map.portals[i];
      if (portal.bounds.length < 2) continue;

      final p0 = portal.bounds[0];
      final p1 = portal.bounds[1];
      final portalEdges = segmentEdges(p0.x, p0.y, p1.x, p1.y);

      if (openPortals.contains(i)) {
        // Door is open — remove these edges from blockedEdges
        for (final entry in portalEdges.entries) {
          final existing = blocked[entry.key];
          if (existing != null) {
            existing.removeAll(entry.value);
            if (existing.isEmpty) blocked.remove(entry.key);
          }
        }
      } else {
        // Door is closed — add these edges to blockedEdges
        for (final entry in portalEdges.entries) {
          (blocked[entry.key] ??= {}).addAll(entry.value);
        }
      }
    }

    return WallGrid._(
      gridCols: gridCols,
      gridRows: gridRows,
      blockedEdges: blocked,
    );
  }

  /// Computes a cell index from column and row.
  ///
  /// Returns `row * gridCols + col`. No bounds checking is performed.
  int cellIndex(int col, int row) => row * gridCols + col;

  /// Performs BFS flood fill from [startCell], returning all reachable cells.
  ///
  /// Starting from [startCell], expands to all four cardinal neighbors
  /// where the shared edge is not blocked. Returns the set of all cell
  /// indices reachable without crossing any wall.
  ///
  /// Returns an empty set if [startCell] is out of bounds.
  ///
  /// See also:
  /// * [blockedEdges], which defines which edges are impassable.
  /// * [VttState.revealRoom], which uses the result to reveal fog cells.
  Set<int> floodFill(int startCell) {
    if (startCell < 0 || startCell >= gridCols * gridRows) return {};

    final visited = <int>{startCell};
    final queue = Queue<int>();
    queue.add(startCell);

    // (dc, dr, direction from current cell, opposite direction on neighbor)
    const neighbors = [
      (-1, 0, Direction.west, Direction.east),
      (1, 0, Direction.east, Direction.west),
      (0, -1, Direction.north, Direction.south),
      (0, 1, Direction.south, Direction.north),
    ];

    while (queue.isNotEmpty) {
      final cell = queue.removeFirst();
      final col = cell % gridCols;
      final row = cell ~/ gridCols;
      final cellBlocked = blockedEdges[cell] ?? const {};

      for (final (dc, dr, dir, _) in neighbors) {
        final nc = col + dc;
        final nr = row + dr;
        if (nc < 0 || nc >= gridCols || nr < 0 || nr >= gridRows) continue;
        final neighborIdx = nr * gridCols + nc;
        if (visited.contains(neighborIdx)) continue;

        // Check if edge is blocked from current cell's side
        if (cellBlocked.contains(dir)) continue;

        visited.add(neighborIdx);
        queue.add(neighborIdx);
      }
    }

    return visited;
  }
}
