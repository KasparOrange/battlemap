import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../game_state.dart';

/// Draws the battlemap grid lines.
class GridComponent extends PositionComponent {
  bool _hasBackground = false;

  GridComponent()
      : super(
          size: Vector2(
            GameState.gridColumns * GameState.cellSize,
            GameState.gridRows * GameState.cellSize,
          ),
          priority: 1,
        );

  void syncFromState(GameState gs) {
    _hasBackground = gs.backgroundImage != null;
  }

  @override
  void render(Canvas canvas) {
    final paint = Paint()
      ..color = _hasBackground
          ? const Color(0x44FFFFFF)
          : const Color(0xFF2A2A4A)
      ..strokeWidth = _hasBackground ? 0.5 : 1.0;

    final cols = GameState.gridColumns;
    final rows = GameState.gridRows;
    final cell = GameState.cellSize;

    for (int i = 0; i <= cols; i++) {
      canvas.drawLine(
        Offset(i * cell, 0),
        Offset(i * cell, rows * cell),
        paint,
      );
    }

    for (int j = 0; j <= rows; j++) {
      canvas.drawLine(
        Offset(0, j * cell),
        Offset(cols * cell, j * cell),
        paint,
      );
    }
  }
}
