import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';
import 'package:flame/events.dart';

import '../../state/vtt_state.dart';

/// Renders fog of war as a dark overlay with cutouts for revealed cells.
///
/// Uses saveLayer + BlendMode.dstOut for efficient GPU compositing.
/// Supports tap-to-toggle and drag-to-paint brush reveal.
class FogOfWarComponent extends PositionComponent
    with TapCallbacks, DragCallbacks, HasVisibility {
  final VttState state;
  final int pixelsPerGrid;
  final int gridCols;
  final int gridRows;

  // Cached paints — not recreated per frame
  final Paint _fogPaint = Paint()..color = const Color(0xE5000000);
  final Paint _erasePaint = Paint()
    ..color = const Color(0xFFFFFFFF)
    ..blendMode = BlendMode.dstOut
    ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4.0);
  final Paint _layerPaint = Paint();

  FogOfWarComponent({
    required this.state,
    required this.pixelsPerGrid,
    required this.gridCols,
    required this.gridRows,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 10);

  @override
  void render(Canvas canvas) {
    final bounds = Rect.fromLTWH(0, 0, size.x, size.y);

    canvas.saveLayer(bounds, _layerPaint);
    canvas.drawRect(bounds, _fogPaint);

    for (final index in state.revealedCells) {
      canvas.drawRect(_cellRect(index), _erasePaint);
    }

    canvas.restore();
  }

  // --- Tap: toggle single cell or portal ---

  @override
  void onTapDown(TapDownEvent event) {
    if (!state.isInteractive) return;
    final worldPos = event.localPosition;

    // Check if tap hits a portal
    if (_tryTogglePortal(worldPos)) return;

    // Toggle single cell
    final ppg = pixelsPerGrid.toDouble();
    final cellX = (worldPos.x / ppg).floor();
    final cellY = (worldPos.y / ppg).floor();
    if (cellX < 0 || cellX >= gridCols || cellY < 0 || cellY >= gridRows) return;
    final index = cellY * gridCols + cellX;
    state.toggleReveal(index);
  }

  // --- Drag: brush reveal/hide ---

  @override
  void onDragStart(DragStartEvent event) {
    if (!state.isInteractive) return;
    _brushAt(event.localPosition);
  }

  @override
  void onDragUpdate(DragUpdateEvent event) {
    if (!state.isInteractive) return;
    _brushAt(event.localEndPosition);
  }

  void _brushAt(Vector2 worldPos) {
    final ppg = pixelsPerGrid.toDouble();
    final centerX = (worldPos.x / ppg).floor();
    final centerY = (worldPos.y / ppg).floor();
    final r = state.brushRadius;
    bool changed = false;

    for (int dy = -r; dy <= r; dy++) {
      for (int dx = -r; dx <= r; dx++) {
        // Circular brush
        if (dx * dx + dy * dy > r * r + r) continue;
        final cx = centerX + dx;
        final cy = centerY + dy;
        if (cx < 0 || cx >= gridCols || cy < 0 || cy >= gridRows) continue;
        final index = cy * gridCols + cx;
        if (state.revealMode) {
          if (state.revealedCells.add(index)) changed = true;
        } else {
          if (state.revealedCells.remove(index)) changed = true;
        }
      }
    }

    if (changed) state.notifyListeners();
  }

  // --- Portal hit test ---

  bool _tryTogglePortal(Vector2 worldPos) {
    final portals = state.map?.portals ?? [];
    final ppg = pixelsPerGrid.toDouble();
    const pad = 8.0;
    for (int i = 0; i < portals.length; i++) {
      final p = portals[i];
      final p0x = p.bounds[0].x * ppg;
      final p0y = p.bounds[0].y * ppg;
      final p1x = p.bounds[1].x * ppg;
      final p1y = p.bounds[1].y * ppg;
      final rect = Rect.fromLTRB(
        min(p0x, p1x) - pad,
        min(p0y, p1y) - pad,
        max(p0x, p1x) + pad,
        max(p0y, p1y) + pad,
      );
      if (rect.contains(worldPos.toOffset())) {
        state.togglePortal(i);
        return true;
      }
    }
    return false;
  }

  @override
  bool containsLocalPoint(Vector2 point) {
    return size.toRect().contains(point.toOffset());
  }

  Rect _cellRect(int index) {
    final cellX = index % gridCols;
    final cellY = index ~/ gridCols;
    final ppg = pixelsPerGrid.toDouble();
    return Rect.fromLTWH(cellX * ppg, cellY * ppg, ppg, ppg);
  }
}
