import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../game_state.dart';

/// Draws all completed drawing strokes.
class StrokesComponent extends PositionComponent {
  List<DrawStroke> _strokes = [];

  StrokesComponent()
      : super(
          size: Vector2(
            GameState.gridColumns * GameState.cellSize,
            GameState.gridRows * GameState.cellSize,
          ),
          priority: 2,
        );

  void syncFromState(GameState gs) {
    _strokes = gs.strokes;
  }

  @override
  void render(Canvas canvas) {
    for (final stroke in _strokes) {
      if (stroke.points.length < 2) continue;
      final paint = Paint()
        ..color = stroke.color
        ..strokeWidth = stroke.width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;

      final path = Path()..moveTo(stroke.points[0].dx, stroke.points[0].dy);
      for (int i = 1; i < stroke.points.length; i++) {
        path.lineTo(stroke.points[i].dx, stroke.points[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }
}
