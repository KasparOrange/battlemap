import 'dart:ui';

import 'package:flame/components.dart';

import '../../model/uvtt_map.dart';

/// Renders wall outlines from line_of_sight data. DM debug view only.
class WallComponent extends PositionComponent with HasVisibility {
  final List<List<UvttPoint>> walls;
  final int pixelsPerGrid;

  // Cached paint
  final Paint _wallPaint = Paint()
    ..color = const Color(0x88FF0000)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.0
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;

  WallComponent({
    required this.walls,
    required this.pixelsPerGrid,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 2);

  @override
  void render(Canvas canvas) {
    final ppg = pixelsPerGrid.toDouble();

    for (final polyline in walls) {
      if (polyline.length < 2) continue;
      final path = Path();
      path.moveTo(polyline[0].x * ppg, polyline[0].y * ppg);
      for (int i = 1; i < polyline.length; i++) {
        path.lineTo(polyline[i].x * ppg, polyline[i].y * ppg);
      }
      canvas.drawPath(path, _wallPaint);
    }
  }
}
