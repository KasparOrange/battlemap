import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../game_state.dart';

/// Draws the real-time stroke preview (from companion drawing or network).
class LiveStrokeComponent extends PositionComponent {
  // Remote live stroke (from GameState, received via network)
  DrawStroke? _remoteStroke;

  // Local live stroke (companion's own in-progress drawing, not yet in GameState)
  List<Offset>? _localPoints;
  Color _localColor = Colors.red;
  double _localWidth = 3.0;

  LiveStrokeComponent()
      : super(
          size: Vector2(
            GameState.gridColumns * GameState.cellSize,
            GameState.gridRows * GameState.cellSize,
          ),
          priority: 3,
        );

  void syncFromState(GameState gs) {
    _remoteStroke = gs.liveStroke;
  }

  void setLocalStroke(List<Offset>? points, Color color, double width) {
    _localPoints = points;
    _localColor = color;
    _localWidth = width;
  }

  @override
  void render(Canvas canvas) {
    // Draw remote live stroke (from network, on TV)
    _drawStroke(canvas, _remoteStroke?.points, _remoteStroke?.color, _remoteStroke?.width);

    // Draw local live stroke (companion's own drawing in progress)
    _drawStroke(canvas, _localPoints, _localColor, _localWidth);
  }

  void _drawStroke(Canvas canvas, List<Offset>? points, Color? color, double? width) {
    if (points == null || points.length < 2 || color == null || width == null) return;
    final paint = Paint()
      ..color = color.withValues(alpha: 0.7)
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final path = Path()..moveTo(points[0].dx, points[0].dy);
    for (int i = 1; i < points.length; i++) {
      path.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, paint);
  }
}
