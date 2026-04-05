import 'dart:collection';
import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';

import '../../state/vtt_state.dart';

/// Renders fog of war as a dark overlay with cutouts for revealed cells.
///
/// Supports four rendering modes controlled by [SessionSettings.fogMode]:
/// - `'standard'` -- sharp-edged cells with a 4px blur (original behavior).
/// - `'soft'` -- same as standard but with a 16px blur for much softer edges.
/// - `'cloud'` -- organic cloud-shaped edges with animated bumps on boundaries.
/// - `'atmospheric'` -- gradient opacity based on distance to revealed cells.
///
/// When [SessionSettings.fogAnimation] is enabled, newly revealed cells
/// animate with a 0.5-second fade-out instead of disappearing instantly.
///
/// Uses saveLayer + BlendMode.dstOut for efficient GPU compositing.
/// This is a pure visual component -- all input handling is in VttGame.
///
/// See also:
/// - [VttState.revealedCells], the set of revealed fog cell indices.
/// - [VttState.shadowRevealCells] / [VttState.shadowHideCells], staged fog changes.
class FogOfWarComponent extends PositionComponent with HasVisibility {
  /// The shared VTT game state.
  final VttState state;

  /// Number of image pixels per grid square.
  final int pixelsPerGrid;

  /// Number of grid columns on the map.
  final int gridCols;

  /// Number of grid rows on the map.
  final int gridRows;

  // Cached paints -- not recreated per frame
  final Paint _fogPaint = Paint()..color = const Color(0xE5000000);
  final Paint _erasePaint = Paint()
    ..color = const Color(0xFFFFFFFF)
    ..blendMode = BlendMode.dstOut
    ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4.0);
  final Paint _softErasePaint = Paint()
    ..color = const Color(0xFFFFFFFF)
    ..blendMode = BlendMode.dstOut
    ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16.0);
  final Paint _layerPaint = Paint();

  /// Slate-blue tint drawn over fog cells staged for reveal in shadow mode.
  final Paint _shadowRevealPaint = Paint()
    ..color = const Color(0x4D7B68EE); // slate blue 30%

  /// Red tint drawn over revealed cells staged for hiding in shadow mode.
  final Paint _shadowHidePaint = Paint()
    ..color = const Color(0x33E53935); // red 20%

  /// Elapsed time for cloud animation.
  double _time = 0;

  /// Previous frame's revealed cells for detecting changes.
  Set<int> _previousRevealedCells = {};

  /// Map of cell index to animation progress (0.0 to 1.0) for fade transitions.
  final Map<int, double> _animatingCells = {};

  /// Creates a [FogOfWarComponent] for the given map grid.
  ///
  /// [state] provides access to revealed cells and session settings.
  /// [pixelsPerGrid] converts cell indices to pixel coordinates.
  /// [gridCols] and [gridRows] define the grid dimensions.
  /// [mapSize] sets the component bounds.
  FogOfWarComponent({
    required this.state,
    required this.pixelsPerGrid,
    required this.gridCols,
    required this.gridRows,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 10);

  @override
  void update(double dt) {
    _time += dt;

    if (!state.sessionSettings.fogAnimation) {
      _animatingCells.clear();
      _previousRevealedCells = Set.from(state.revealedCells);
      return;
    }

    // Detect newly revealed cells for animation
    final current = state.revealedCells;
    final newlyRevealed = current.difference(_previousRevealedCells);

    for (final cell in newlyRevealed) {
      _animatingCells[cell] = 0.0; // start animation
    }

    _previousRevealedCells = Set.from(current);

    // Advance animations
    final done = <int>[];
    for (final entry in _animatingCells.entries) {
      _animatingCells[entry.key] = entry.value + dt * 2.0; // 0.5s duration
      if (_animatingCells[entry.key]! >= 1.0) done.add(entry.key);
    }
    for (final cell in done) {
      _animatingCells.remove(cell);
    }
  }

  @override
  void render(Canvas canvas) {
    final mode = state.sessionSettings.fogMode;
    switch (mode) {
      case 'standard':
        _renderStandard(canvas);
      case 'soft':
        _renderSoft(canvas);
      case 'cloud':
        _renderCloud(canvas);
      case 'atmospheric':
        _renderAtmospheric(canvas);
      default:
        _renderStandard(canvas);
    }
  }

  /// Standard fog mode: sharp-edged cells with a 4px blur.
  ///
  /// Uses saveLayer + dstOut to cut revealed cells from the fog overlay.
  void _renderStandard(Canvas canvas) {
    final bounds = Rect.fromLTWH(0, 0, size.x, size.y);

    // Draw fog + cut revealed cells
    canvas.saveLayer(bounds, _layerPaint);
    canvas.drawRect(bounds, _fogPaint);

    for (final index in state.revealedCells) {
      canvas.drawRect(_cellRect(index), _erasePaint);
    }

    canvas.restore();

    _renderAnimatingCells(canvas);
    _renderShadowCells(canvas);
  }

  /// Soft fog mode: same as standard but with a 16px blur for much softer edges.
  void _renderSoft(Canvas canvas) {
    final bounds = Rect.fromLTWH(0, 0, size.x, size.y);

    canvas.saveLayer(bounds, _layerPaint);
    canvas.drawRect(bounds, _fogPaint);

    for (final index in state.revealedCells) {
      canvas.drawRect(_cellRect(index), _softErasePaint);
    }

    canvas.restore();

    _renderAnimatingCells(canvas);
    _renderShadowCells(canvas);
  }

  /// Cloud fog mode: organic cloud-shaped edges with animated bumps.
  ///
  /// Revealed cells are erased with their rectangular shapes, plus
  /// semi-circular cloud bumps are added along boundary edges (edges
  /// adjacent to unrevealed cells) to create an organic fog border.
  void _renderCloud(Canvas canvas) {
    final bounds = Rect.fromLTWH(0, 0, size.x, size.y);
    canvas.saveLayer(bounds, _layerPaint);
    canvas.drawRect(bounds, _fogPaint);

    // Build a combined path of all revealed cells with cloud edges
    final path = Path();
    final ppg = pixelsPerGrid.toDouble();

    for (final index in state.revealedCells) {
      path.addRect(_cellRect(index));
    }

    // Add cloud bumps on boundary edges
    for (final index in state.revealedCells) {
      final cellX = index % gridCols;
      final cellY = index ~/ gridCols;
      final x = cellX * ppg;
      final y = cellY * ppg;

      // North: if cell above is NOT revealed, add cloud bumps along top edge
      if (cellY == 0 ||
          !state.revealedCells.contains((cellY - 1) * gridCols + cellX)) {
        _addCloudBumps(
            path, Offset(x, y), Offset(x + ppg, y), ppg, index * 7 + 0);
      }
      // South
      if (cellY == gridRows - 1 ||
          !state.revealedCells.contains((cellY + 1) * gridCols + cellX)) {
        _addCloudBumps(path, Offset(x, y + ppg), Offset(x + ppg, y + ppg),
            ppg, index * 7 + 1);
      }
      // West
      if (cellX == 0 ||
          !state.revealedCells.contains(cellY * gridCols + cellX - 1)) {
        _addCloudBumps(
            path, Offset(x, y), Offset(x, y + ppg), ppg, index * 7 + 2);
      }
      // East
      if (cellX == gridCols - 1 ||
          !state.revealedCells.contains(cellY * gridCols + cellX + 1)) {
        _addCloudBumps(path, Offset(x + ppg, y), Offset(x + ppg, y + ppg),
            ppg, index * 7 + 3);
      }
    }

    // Use the cloud path as the erase mask
    final cloudErase = Paint()
      ..color = const Color(0xFFFFFFFF)
      ..blendMode = BlendMode.dstOut;
    canvas.drawPath(path, cloudErase);

    canvas.restore();

    _renderAnimatingCells(canvas);
    _renderShadowCells(canvas);
  }

  /// Adds semi-circular cloud bumps along a boundary edge.
  ///
  /// [start] and [end] define the edge segment. [cellSize] controls bump
  /// radius. [seed] provides a deterministic offset per edge so bumps
  /// differ between edges while remaining stable across frames.
  void _addCloudBumps(
      Path path, Offset start, Offset end, double cellSize, int seed) {
    final dir = end - start;
    final length = dir.distance;
    if (length < 1) return;
    final normal = Offset(-dir.dy, dir.dx) / length; // perpendicular
    const bumpCount = 3;
    final bumpRadius = cellSize * 0.3;

    for (int i = 0; i < bumpCount; i++) {
      final t = (i + 0.5) / bumpCount;
      // Slight animation: offset by sin(time)
      final animOffset = sin(_time * 0.5 + seed + i) * cellSize * 0.03;
      final center = start + dir * t + normal * (bumpRadius * 0.5 + animOffset);
      path.addOval(Rect.fromCircle(center: center, radius: bumpRadius));
    }
  }

  /// Atmospheric fog mode: gradient opacity based on distance to revealed cells.
  ///
  /// Uses BFS from all revealed cells to compute how far each unrevealed cell
  /// is from the nearest revealed cell. Closer cells get lighter fog (more
  /// translucent), creating a gradual falloff effect.
  void _renderAtmospheric(Canvas canvas) {
    final ppg = pixelsPerGrid.toDouble();

    // Compute distance from each unrevealed cell to nearest revealed cell
    final distances = _computeDistances();

    // Draw fog with varying opacity based on distance
    for (int y = 0; y < gridRows; y++) {
      for (int x = 0; x < gridCols; x++) {
        final idx = y * gridCols + x;
        if (state.revealedCells.contains(idx)) continue;
        if (_animatingCells.containsKey(idx)) continue;

        final dist = distances[idx] ?? 99;
        final opacity = switch (dist) {
          0 => 0.35, // adjacent to revealed
          1 => 0.55,
          2 => 0.75,
          _ => 0.90, // deep fog
        };

        final paint = Paint()..color = Color.fromRGBO(0, 0, 0, opacity);
        canvas.drawRect(
            Rect.fromLTWH(x * ppg, y * ppg, ppg, ppg), paint);
      }
    }

    _renderAnimatingCells(canvas);
    _renderShadowCells(canvas);
  }

  /// Computes BFS distance from each unrevealed cell to the nearest revealed cell.
  ///
  /// Returns a map of cell index to distance (0 = immediately adjacent,
  /// 1 = one cell away, etc.). Only computes up to distance 3 for performance.
  Map<int, int> _computeDistances() {
    final distances = <int, int>{};
    final queue = Queue<int>();

    // Start BFS from all revealed cells -- add their unrevealed neighbors
    for (final cell in state.revealedCells) {
      final x = cell % gridCols;
      final y = cell ~/ gridCols;
      for (final (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)]) {
        final nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= gridCols || ny < 0 || ny >= gridRows) continue;
        final nIdx = ny * gridCols + nx;
        if (!state.revealedCells.contains(nIdx) &&
            !distances.containsKey(nIdx)) {
          distances[nIdx] = 0;
          queue.add(nIdx);
        }
      }
    }

    while (queue.isNotEmpty) {
      final cell = queue.removeFirst();
      final dist = distances[cell]!;
      if (dist >= 3) continue; // don't need more precision
      final x = cell % gridCols;
      final y = cell ~/ gridCols;
      for (final (dx, dy) in [(0, -1), (0, 1), (-1, 0), (1, 0)]) {
        final nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= gridCols || ny < 0 || ny >= gridRows) continue;
        final nIdx = ny * gridCols + nx;
        if (!state.revealedCells.contains(nIdx) &&
            !distances.containsKey(nIdx)) {
          distances[nIdx] = dist + 1;
          queue.add(nIdx);
        }
      }
    }

    return distances;
  }

  /// Renders cells that are currently animating (fading fog out).
  ///
  /// Each animating cell is drawn as a semi-transparent black rectangle
  /// whose opacity decreases from 90% to 0% over the animation duration.
  void _renderAnimatingCells(Canvas canvas) {
    final ppg = pixelsPerGrid.toDouble();
    for (final entry in _animatingCells.entries) {
      final progress = entry.value.clamp(0.0, 1.0);
      final opacity = 0.9 * (1.0 - progress); // fade from 90% to 0
      final cellX = entry.key % gridCols;
      final cellY = entry.key ~/ gridCols;
      canvas.drawRect(
        Rect.fromLTWH(cellX * ppg, cellY * ppg, ppg, ppg),
        Paint()..color = Color.fromRGBO(0, 0, 0, opacity),
      );
    }
  }

  /// Renders shadow mode previews (purple for staged reveal, red for staged hide).
  void _renderShadowCells(Canvas canvas) {
    for (final index in state.shadowRevealCells) {
      if (!state.revealedCells.contains(index)) {
        canvas.drawRect(_cellRect(index), _shadowRevealPaint);
      }
    }
    for (final index in state.shadowHideCells) {
      if (state.revealedCells.contains(index)) {
        canvas.drawRect(_cellRect(index), _shadowHidePaint);
      }
    }
  }

  @override
  bool containsLocalPoint(Vector2 point) {
    return size.toRect().contains(point.toOffset());
  }

  /// Computes the pixel rectangle for the cell at flat [index].
  Rect _cellRect(int index) {
    final cellX = index % gridCols;
    final cellY = index ~/ gridCols;
    final ppg = pixelsPerGrid.toDouble();
    return Rect.fromLTWH(cellX * ppg, cellY * ppg, ppg, ppg);
  }
}
