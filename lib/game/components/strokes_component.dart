import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../state/vtt_state.dart';

/// Draws all completed drawing strokes.
/// Reads strokes from VttState and re-renders on state change.
class StrokesComponent extends PositionComponent {
  final VttState state;

  StrokesComponent({
    required this.state,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 2);

  @override
  void render(Canvas canvas) {
    for (final stroke in state.strokes) {
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
