import 'package:flame/components.dart';
import 'package:flame/extensions.dart';
import 'package:flutter/material.dart';

/// Renders grid lines aligned to the UVTT map's pixels_per_grid spacing.
class VttGridOverlayComponent extends PositionComponent with HasVisibility {
  final int pixelsPerGrid;
  final int gridCols;
  final int gridRows;

  VttGridOverlayComponent({
    required Vector2 mapSize,
    required this.pixelsPerGrid,
    required this.gridCols,
    required this.gridRows,
  }) : super(size: mapSize, priority: 1);

  @override
  void render(Canvas canvas) {
    final paint = Paint()
      ..color = const Color(0x44FFFFFF)
      ..strokeWidth = 0.5;

    final ppg = pixelsPerGrid.toDouble();

    // Vertical lines
    for (int i = 0; i <= gridCols; i++) {
      canvas.drawLine(
        Offset(i * ppg, 0),
        Offset(i * ppg, size.y),
        paint,
      );
    }

    // Horizontal lines
    for (int j = 0; j <= gridRows; j++) {
      canvas.drawLine(
        Offset(0, j * ppg),
        Offset(size.x, j * ppg),
        paint,
      );
    }
  }
}
