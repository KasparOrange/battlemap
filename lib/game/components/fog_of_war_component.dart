import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';
import 'package:flame/events.dart';

import '../../model/uvtt_map.dart';
import '../../state/vtt_state.dart';

/// Renders fog of war as a dark overlay with cutouts for revealed cells.
///
/// Uses saveLayer + BlendMode.dstOut for efficient GPU compositing.
/// The DM taps cells to reveal/hide them.
class FogOfWarComponent extends PositionComponent with TapCallbacks, HasVisibility {
  final VttState state;
  final int pixelsPerGrid;
  final int gridCols;
  final int gridRows;

  // Cached paints — not recreated per frame
  final Paint _fogPaint = Paint()..color = const Color(0xE5000000);
  final Paint _erasePaint = Paint()
    ..color = const Color(0xFFFFFFFF)
    ..blendMode = BlendMode.dstOut;
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

    // Isolate fog in its own compositing layer
    canvas.saveLayer(bounds, _layerPaint);

    // Fill entire map with fog
    canvas.drawRect(bounds, _fogPaint);

    // Erase revealed cells (punch holes in the fog)
    for (final index in state.revealedCells) {
      canvas.drawRect(_cellRect(index), _erasePaint);
    }

    canvas.restore();
  }

  @override
  void onTapDown(TapDownEvent event) {
    final worldPos = event.localPosition;

    // Check if tap hits a portal — route to portal toggle instead of fog reveal
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
        return;
      }
    }

    // Normal fog reveal
    final cellX = (worldPos.x / ppg).floor();
    final cellY = (worldPos.y / ppg).floor();
    if (cellX < 0 || cellX >= gridCols || cellY < 0 || cellY >= gridRows) return;
    final index = cellY * gridCols + cellX;
    state.toggleReveal(index);
  }

  @override
  bool containsLocalPoint(Vector2 point) {
    // Accept taps anywhere within the map bounds
    return size.toRect().contains(point.toOffset());
  }

  Rect _cellRect(int index) {
    final cellX = index % gridCols;
    final cellY = index ~/ gridCols;
    final ppg = pixelsPerGrid.toDouble();
    return Rect.fromLTWH(cellX * ppg, cellY * ppg, ppg, ppg);
  }
}
