import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';

import '../../model/aoe_template.dart';
import '../../state/vtt_state.dart';

/// Renders the active area-of-effect template overlay on the map.
///
/// Reads [VttState.activeAoe] every frame. When non-null, draws the
/// appropriate shape (circle, cone, line, or square) as a semi-transparent
/// red fill with a white stroke outline.
///
/// Priority 15 places this above the fog layer (10) but below the
/// measurement overlay (20).
///
/// See also:
/// - [AoeTemplate], the data model for the template.
/// - [AoeShape], the available geometric shapes.
/// - [VttState.setAoe] and [VttState.clearAoe], which control the state.
class AoeTemplateComponent extends PositionComponent {
  /// The shared VTT state, read each frame for [VttState.activeAoe].
  final VttState state;

  /// Pixels per grid square, used to convert grid coordinates to pixels.
  final int pixelsPerGrid;

  // ── Cached paints ─────────────────────────────────────────────────

  /// Semi-transparent red fill for the AoE area.
  final Paint _fillPaint = Paint()..color = const Color(0x33FF4444);

  /// White stroke outline for the AoE boundary.
  final Paint _strokePaint = Paint()
    ..color = const Color(0xFFFFFFFF)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.0;

  /// Creates an [AoeTemplateComponent] bound to [state].
  ///
  /// The [pixelsPerGrid] scales grid-coordinate positions to pixel
  /// positions. The [mapSize] sets the component bounds.
  AoeTemplateComponent({
    required this.state,
    required this.pixelsPerGrid,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 15);

  @override
  void render(Canvas canvas) {
    final aoe = state.activeAoe;
    if (aoe == null) return;

    final ppg = pixelsPerGrid.toDouble();
    final cx = aoe.originX * ppg;
    final cy = aoe.originY * ppg;
    final r = aoe.radius * ppg;

    switch (aoe.shape) {
      case AoeShape.circle:
        _renderCircle(canvas, cx, cy, r);
      case AoeShape.cone:
        _renderCone(canvas, cx, cy, r, aoe.angle);
      case AoeShape.line:
        _renderLine(canvas, cx, cy, r, ppg, aoe.angle);
      case AoeShape.square:
        _renderSquare(canvas, cx, cy, r);
    }
  }

  /// Draws a filled + outlined circle centered at ([cx], [cy]) with radius [r].
  void _renderCircle(Canvas canvas, double cx, double cy, double r) {
    canvas.drawCircle(Offset(cx, cy), r, _fillPaint);
    canvas.drawCircle(Offset(cx, cy), r, _strokePaint);
  }

  /// Draws a 90-degree cone from ([cx], [cy]) in the [angle] direction.
  ///
  /// The cone spans 45 degrees to each side of [angle], with reach [r].
  void _renderCone(
      Canvas canvas, double cx, double cy, double r, double angle) {
    final halfArc = pi / 4; // 45 degrees = half of 90-degree cone
    final startAngle = angle - halfArc;
    const sweepAngle = pi / 2; // 90-degree arc

    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);

    // Build path: origin -> arc -> origin
    final path = Path()
      ..moveTo(cx, cy)
      ..arcTo(rect, startAngle, sweepAngle, false)
      ..close();

    canvas.drawPath(path, _fillPaint);
    canvas.drawPath(path, _strokePaint);
  }

  /// Draws a 1-grid-square-wide line from ([cx], [cy]) in the [angle] direction.
  ///
  /// The line extends [r] pixels (= radius * ppg) in the given direction,
  /// with a width of [ppg] (5ft = 1 grid square).
  void _renderLine(
      Canvas canvas, double cx, double cy, double r, double ppg, double angle) {
    final halfWidth = ppg / 2;

    // Direction vector
    final dx = cos(angle);
    final dy = sin(angle);

    // Perpendicular vector
    final px = -dy * halfWidth;
    final py = dx * halfWidth;

    // Four corners of the rectangle
    final path = Path()
      ..moveTo(cx + px, cy + py)
      ..lineTo(cx + dx * r + px, cy + dy * r + py)
      ..lineTo(cx + dx * r - px, cy + dy * r - py)
      ..lineTo(cx - px, cy - py)
      ..close();

    canvas.drawPath(path, _fillPaint);
    canvas.drawPath(path, _strokePaint);
  }

  /// Draws an axis-aligned square centered at ([cx], [cy]) with side = 2 * [r].
  void _renderSquare(Canvas canvas, double cx, double cy, double r) {
    final rect = Rect.fromCenter(
      center: Offset(cx, cy),
      width: r * 2,
      height: r * 2,
    );
    canvas.drawRect(rect, _fillPaint);
    canvas.drawRect(rect, _strokePaint);
  }
}
