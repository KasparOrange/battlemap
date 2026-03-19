import 'dart:ui';

import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flutter/material.dart' show Colors;

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
    final cellX = (worldPos.x / pixelsPerGrid).floor();
    final cellY = (worldPos.y / pixelsPerGrid).floor();
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
