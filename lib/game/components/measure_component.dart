import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../state/vtt_state.dart';

/// Renders a measurement line overlay on the battlemap.
///
/// Displays a dashed line between two world-coordinate points, with small
/// circle markers at each endpoint and a distance label at the midpoint.
/// The distance is calculated using D&D 5e rules (5 ft per square, with
/// alternating 5/10 ft for diagonal movement).
///
/// The component stays visible after the drag ends until the next
/// interaction clears it or a new measurement begins.
///
/// Priority 20 ensures the measure line renders above all other map
/// content (fog, tokens, walls, etc.).
///
/// See also:
/// - [VttGame], which creates and drives this component via drag gestures.
/// - [InteractionMode.measure], the interaction mode that activates measuring.
class MeasureComponent extends PositionComponent {
  /// The shared VTT state (reserved for future use, e.g. snapping).
  final VttState state;

  /// World pixels per grid square, used for distance calculation.
  final double pixelsPerGrid;

  /// Start point of the measurement in world coordinates, or `null` if
  /// no measurement is active.
  Offset? startPoint;

  /// End point of the measurement in world coordinates, or `null` if
  /// the user hasn't dragged yet.
  Offset? endPoint;

  // Cached text painter for the distance label
  TextPainter? _distPainter;
  String? _cachedDistText;

  /// Creates a [MeasureComponent] for the given map.
  ///
  /// [pixelsPerGrid] is used to convert pixel distances to grid squares.
  /// [mapSize] sets the component's bounding box so it covers the full map.
  MeasureComponent({
    required this.state,
    required this.pixelsPerGrid,
    required Vector2 mapSize,
  }) : super(
          size: mapSize,
          priority: 20,
        );

  /// Begins a new measurement at [worldPos].
  ///
  /// Both start and end are set to the same point initially; call [setEnd]
  /// as the user drags to update the endpoint.
  void setStart(Offset worldPos) {
    startPoint = worldPos;
    endPoint = worldPos;
  }

  /// Updates the end point of the current measurement.
  void setEnd(Offset worldPos) {
    endPoint = worldPos;
  }

  /// Clears the measurement line (hides it).
  void clear() {
    startPoint = null;
    endPoint = null;
  }

  @override
  void render(Canvas canvas) {
    if (startPoint == null || endPoint == null) return;
    final start = startPoint!;
    final end = endPoint!;

    // Don't render if start and end are the same point
    if ((end - start).distance < 1.0) return;

    const lineColor = Color(0xFFD4A76A); // gold/amber
    final linePaint = Paint()
      ..color = lineColor
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke;

    // Dashed line
    _drawDashedLine(canvas, start, end, linePaint);

    // Start marker
    final markerPaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.fill;
    canvas.drawCircle(start, 4.0, markerPaint);

    // End marker
    canvas.drawCircle(end, 4.0, markerPaint);

    // Distance label at midpoint
    _renderDistanceLabel(canvas, start, end);
  }

  /// Calculates the D&D 5e distance between start and end points.
  ///
  /// Uses grid-based measurement: each square is 5 ft. Diagonal squares
  /// alternate between 5 ft and 10 ft cost (the "simple" D&D 5e rule).
  ///
  /// Returns a human-readable string like "30 ft".
  String _calculateDistance() {
    final dx =
        ((endPoint!.dx - startPoint!.dx) / pixelsPerGrid).round().abs();
    final dy =
        ((endPoint!.dy - startPoint!.dy) / pixelsPerGrid).round().abs();
    final straight = max(dx, dy);
    final diagonal = min(dx, dy);
    // D&D 5e rule: each square = 5ft, diagonal squares alternate 5/10
    final diagonalFt = (diagonal ~/ 2) * 15 + (diagonal % 2) * 5;
    final straightFt = (straight - diagonal) * 5;
    return '${diagonalFt + straightFt} ft';
  }

  /// Renders the distance text at the midpoint of the measurement line.
  ///
  /// Uses a semi-transparent black pill background with white text,
  /// matching the style of token name labels.
  void _renderDistanceLabel(Canvas canvas, Offset start, Offset end) {
    final distText = _calculateDistance();

    // Cache the TextPainter
    if (_distPainter == null || _cachedDistText != distText) {
      _cachedDistText = distText;
      _distPainter = TextPainter(
        text: TextSpan(
          text: distText,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
    }

    final mid = Offset(
      (start.dx + end.dx) / 2,
      (start.dy + end.dy) / 2,
    );

    const hPad = 6.0;
    const vPad = 3.0;
    final pillW = _distPainter!.width + hPad * 2;
    final pillH = _distPainter!.height + vPad * 2;
    final pillLeft = mid.dx - pillW / 2;
    final pillTop = mid.dy - pillH / 2;

    // Pill background
    final pillRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(pillLeft, pillTop, pillW, pillH),
      const Radius.circular(6),
    );
    canvas.drawRRect(
      pillRect,
      Paint()..color = const Color(0xCC000000),
    );

    // Text
    _distPainter!.paint(
      canvas,
      Offset(pillLeft + hPad, pillTop + vPad),
    );
  }

  /// Draws a dashed line from [start] to [end] using the given [paint].
  ///
  /// Dashes are 8px long with 4px gaps. The final dash may be shorter
  /// if the remaining length is less than a full dash.
  void _drawDashedLine(Canvas canvas, Offset start, Offset end, Paint paint) {
    const dashLength = 8.0;
    const gapLength = 4.0;
    final direction = end - start;
    final totalLength = direction.distance;
    if (totalLength == 0) return;
    final unitDir = direction / totalLength;
    var drawn = 0.0;
    while (drawn < totalLength) {
      final dashEnd = min(drawn + dashLength, totalLength);
      canvas.drawLine(
        start + unitDir * drawn,
        start + unitDir * dashEnd,
        paint,
      );
      drawn = dashEnd + gapLength;
    }
  }
}
