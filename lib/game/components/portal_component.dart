import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';
import 'package:flame/events.dart';

import '../../model/uvtt_map.dart';
import '../../state/vtt_state.dart';

/// Renders a door/portal indicator and handles tap-to-toggle.
class PortalComponent extends PositionComponent with TapCallbacks {
  final int portalIndex;
  final UvttPortal portal;
  final VttState state;
  final int pixelsPerGrid;

  static const double _padding = 8.0;

  // Cached paints
  final Paint _closedPaint = Paint()..color = const Color(0xFFAA4400);
  final Paint _openPaint = Paint()..color = const Color(0xFF00AA00);
  final Paint _borderPaint = Paint()
    ..color = const Color(0x88FFFFFF)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.0;

  PortalComponent({
    required this.portalIndex,
    required this.portal,
    required this.state,
    required this.pixelsPerGrid,
  }) : super(priority: 3) {
    // Compute position and size from portal bounds
    final ppg = pixelsPerGrid.toDouble();
    final p0x = portal.bounds[0].x * ppg;
    final p0y = portal.bounds[0].y * ppg;
    final p1x = portal.bounds[1].x * ppg;
    final p1y = portal.bounds[1].y * ppg;

    final minX = min(p0x, p1x) - _padding;
    final minY = min(p0y, p1y) - _padding;
    final maxX = max(p0x, p1x) + _padding;
    final maxY = max(p0y, p1y) + _padding;

    // Ensure minimum size for thin doors (e.g. vertical line = 0 width)
    final w = max(maxX - minX, _padding * 4);
    final h = max(maxY - minY, _padding * 4);

    position = Vector2(minX, minY);
    size = Vector2(w, h);
  }

  bool get isOpen => state.openPortals.contains(portalIndex);

  @override
  void render(Canvas canvas) {
    final rect = size.toRect();
    canvas.drawRect(rect, isOpen ? _openPaint : _closedPaint);
    canvas.drawRect(rect, _borderPaint);
  }

  @override
  void onTapDown(TapDownEvent event) {
    state.togglePortal(portalIndex);
  }

  @override
  bool containsLocalPoint(Vector2 point) {
    return size.toRect().contains(point.toOffset());
  }
}
