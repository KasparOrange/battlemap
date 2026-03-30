import 'dart:ui';

import 'package:flame/components.dart';

import '../../state/vtt_state.dart';

/// Renders fog of war as a dark overlay with cutouts for revealed cells.
///
/// Uses saveLayer + BlendMode.dstOut for efficient GPU compositing.
/// This is a pure visual component — all input handling is in VttGame.
class FogOfWarComponent extends PositionComponent with HasVisibility {
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

  /// Slate-blue tint drawn over fog cells staged for reveal in shadow mode.
  final Paint _shadowRevealPaint = Paint()
    ..color = const Color(0x4D7B68EE); // slate blue 30%

  /// Red tint drawn over revealed cells staged for hiding in shadow mode.
  final Paint _shadowHidePaint = Paint()
    ..color = const Color(0x33E53935); // red 20%

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

    // Draw fog + cut revealed cells
    canvas.saveLayer(bounds, _layerPaint);
    canvas.drawRect(bounds, _fogPaint);

    for (final index in state.revealedCells) {
      canvas.drawRect(_cellRect(index), _erasePaint);
    }

    canvas.restore();

    // Draw shadow reveal cells (purple tint over fog)
    for (final index in state.shadowRevealCells) {
      if (!state.revealedCells.contains(index)) {
        canvas.drawRect(_cellRect(index), _shadowRevealPaint);
      }
    }

    // Draw shadow hide cells (red tint over revealed areas)
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

  Rect _cellRect(int index) {
    final cellX = index % gridCols;
    final cellY = index ~/ gridCols;
    final ppg = pixelsPerGrid.toDouble();
    return Rect.fromLTWH(cellX * ppg, cellY * ppg, ppg, ppg);
  }
}
