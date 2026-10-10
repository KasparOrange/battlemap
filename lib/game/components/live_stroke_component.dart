import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../state/vtt_state.dart';

/// Draws the real-time stroke preview (in-progress drawing).
/// Reads liveStroke from VttState and re-renders on state change.
class LiveStrokeComponent extends PositionComponent {
  final VttState state;

  LiveStrokeComponent({
    required this.state,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 3);

  @override
  void render(Canvas canvas) {
    final stroke = state.liveStroke;
    if (stroke == null || stroke.points.length < 2) return;

    final paint = Paint()
      ..color = stroke.color.withValues(alpha: 0.7)
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
