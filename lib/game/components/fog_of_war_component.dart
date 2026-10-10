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
/// [SessionSettings.fogEdgeInset] pulls the rim of every revealed area in
/// by a part of a square (see [fogRevealRects]); the atmospheric mode
/// ignores it.
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

  /// Whether this fog is drawn on the TV the players look at.
  ///
  /// The TV fog is fully opaque — players must not see the map through it.
  /// The DM's phone draws it at 70 % so the DM can still read the layout
  /// under the fog while planning reveals. (Both were 90 % before 2026-10-10,
  /// which let players see the whole dungeon dimly.)
  final bool forPlayers;

  /// Whether the staged "Preview first" squares are tinted (blue = will be
  /// revealed, red = will be hidden). `false` on the TV: the preview is the
  /// DM's alone — before 2026-10-10 the TV showed the blue too, so players
  /// saw which room was about to open.
  final bool showPreview;

  // Cached paints -- not recreated per frame
  late final Paint _fogPaint = Paint()
    ..color = forPlayers ? const Color(0xFF000000) : const Color(0xB3000000);
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
  /// [mapSize] sets the component bounds. [forPlayers] picks the opaque TV
  /// fog over the DM's see-through phone fog. [showPreview] tints the staged
  /// preview squares (off on the TV).
  FogOfWarComponent({
    required this.state,
    required this.pixelsPerGrid,
    required this.gridCols,
    required this.gridRows,
    required Vector2 mapSize,
    this.forPlayers = false,
    this.showPreview = true,
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

  /// The edge trim in map pixels: [SessionSettings.fogEdgeInset] percent
  /// of a square.
  double get _inset =>
      state.sessionSettings.fogEdgeInset.clamp(0, 45) / 100 * pixelsPerGrid;

  /// One path of all revealed squares, their rim pulled in by [_inset].
  ///
  /// A single path (instead of one blurred rectangle per square) leaves no
  /// faint seams between neighbouring squares.
  Path _revealPath() {
    final path = Path();
    for (final r in fogRevealRects(state.revealedCells, gridCols, gridRows,
        pixelsPerGrid.toDouble(), _inset)) {
      path.addRect(r);
    }
    return path;
  }

  /// Standard fog mode: sharp-edged cells with a 4px blur.
  ///
  /// Uses saveLayer + dstOut to cut revealed cells from the fog overlay.
  void _renderStandard(Canvas canvas) {
    final bounds = Rect.fromLTWH(0, 0, size.x, size.y);

    // Draw fog + cut revealed cells
    canvas.saveLayer(bounds, _layerPaint);
    canvas.drawRect(bounds, _fogPaint);
    canvas.drawPath(_revealPath(), _erasePaint);
    canvas.restore();

    _renderAnimatingCells(canvas);
    _renderShadowCells(canvas);
  }

  /// Soft fog mode: same as standard but with a 16px blur for much softer edges.
  void _renderSoft(Canvas canvas) {
    final bounds = Rect.fromLTWH(0, 0, size.x, size.y);

    canvas.saveLayer(bounds, _layerPaint);
    canvas.drawRect(bounds, _fogPaint);
    canvas.drawPath(_revealPath(), _softErasePaint);
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
    final path = _revealPath();
    final ppg = pixelsPerGrid.toDouble();
    final d = _inset;

    // Add cloud bumps on boundary edges (moved in with the edge trim)
    for (final index in state.revealedCells) {
      final cellX = index % gridCols;
      final cellY = index ~/ gridCols;
      final x = cellX * ppg;
      final y = cellY * ppg;

      // North: if cell above is NOT revealed, add cloud bumps along top edge
      if (cellY == 0 ||
          !state.revealedCells.contains((cellY - 1) * gridCols + cellX)) {
        _addCloudBumps(
            path, Offset(x, y + d), Offset(x + ppg, y + d), ppg, index * 7 + 0);
      }
      // South
      if (cellY == gridRows - 1 ||
          !state.revealedCells.contains((cellY + 1) * gridCols + cellX)) {
        _addCloudBumps(path, Offset(x, y + ppg - d),
            Offset(x + ppg, y + ppg - d), ppg, index * 7 + 1);
      }
      // West
      if (cellX == 0 ||
          !state.revealedCells.contains(cellY * gridCols + cellX - 1)) {
        _addCloudBumps(
            path, Offset(x + d, y), Offset(x + d, y + ppg), ppg, index * 7 + 2);
      }
      // East
      if (cellX == gridCols - 1 ||
          !state.revealedCells.contains(cellY * gridCols + cellX + 1)) {
        _addCloudBumps(path, Offset(x + ppg - d, y),
            Offset(x + ppg - d, y + ppg), ppg, index * 7 + 3);
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
          _ => forPlayers ? 1.0 : 0.90, // deep fog: opaque on the TV
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
  /// Skipped on the TV ([showPreview] `false`).
  void _renderShadowCells(Canvas canvas) {
    if (!showPreview) return;
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

/// The rectangles that make up the revealed area of a fog grid, its rim
/// pulled in by [inset] map pixels — the shape [FogOfWarComponent] cuts out
/// of the fog.
///
/// [cells] are the revealed cell indices of a [cols] × [rows] grid with
/// squares [ppg] pixels wide. A square's side is moved in by [inset] where
/// the neighbour across it is fogged; where both neighbours of a corner are
/// revealed but the diagonal one is not (the inner corner of an L-shaped
/// area), an [inset] × [inset] notch is left out, so the whole area shrinks
/// evenly like an erosion. Outside the grid counts as revealed: the map's
/// own border is never trimmed. [inset] is clamped to 0–45 % of [ppg];
/// 0 gives one rectangle per square.
///
/// The rectangles touch or overlap; draw them as one path (nonzero fill)
/// to get their union.
///
/// See also:
/// - [SessionSettings.fogEdgeInset], the setting behind [inset].
List<Rect> fogRevealRects(
    Set<int> cells, int cols, int rows, double ppg, double inset) {
  final d = inset.clamp(0.0, ppg * 0.45);
  final rects = <Rect>[];
  bool open(int x, int y) =>
      x < 0 || y < 0 || x >= cols || y >= rows || cells.contains(y * cols + x);
  for (final index in cells) {
    final cx = index % cols;
    final cy = index ~/ cols;
    final x = cx * ppg;
    final y = cy * ppg;
    if (d == 0) {
      rects.add(Rect.fromLTWH(x, y, ppg, ppg));
      continue;
    }
    final n = open(cx, cy - 1), s = open(cx, cy + 1);
    final w = open(cx - 1, cy), e = open(cx + 1, cy);
    final l = w ? x : x + d, r = e ? x + ppg : x + ppg - d;
    final t = n ? y : y + d, b = s ? y + ppg : y + ppg - d;
    // Inner corners: both sides open, the diagonal fogged.
    final nw = n && w && !open(cx - 1, cy - 1) ? d : 0.0;
    final ne = n && e && !open(cx + 1, cy - 1) ? d : 0.0;
    final sw = s && w && !open(cx - 1, cy + 1) ? d : 0.0;
    final se = s && e && !open(cx + 1, cy + 1) ? d : 0.0;
    final topCut = nw > 0 || ne > 0, bottomCut = sw > 0 || se > 0;
    if (topCut) rects.add(Rect.fromLTRB(l + nw, t, r - ne, t + d));
    rects.add(Rect.fromLTRB(l, topCut ? t + d : t, r, bottomCut ? b - d : b));
    if (bottomCut) rects.add(Rect.fromLTRB(l + sw, b - d, r - se, b));
  }
  return rects;
}
