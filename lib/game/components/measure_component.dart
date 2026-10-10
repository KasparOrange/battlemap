import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../state/vtt_state.dart';

/// Renders the measurement line overlay on the battlemap.
///
/// Reads [VttState.measureStart] / [VttState.measureEnd] every frame and
/// draws a dashed line between them with circle markers at each endpoint
/// and a distance label at the midpoint. The distance uses D&D 5e rules
/// (5 ft per square, alternating 5/10 ft for diagonals).
///
/// Because the endpoints live in the shared state, a measurement dragged
/// on the phone is broadcast to the TV (`vtt.setMeasure`) and rendered
/// there by the same component. Marker size and label scale with
/// [pixelsPerGrid] so they stay readable on large maps.
///
/// Priority 20 ensures the measure line renders above all other map
/// content (fog, tokens, walls, etc.).
///
/// See also:
/// - [VttGame], which drives the state via drag gestures.
/// - [VttState.setMeasure], the state setter.
/// - [InteractionMode.measure], the interaction mode that activates measuring.
class MeasureComponent extends PositionComponent {
  /// The shared VTT state holding the measurement endpoints.
  final VttState state;

  /// World pixels per grid square, used for distance calculation and sizing.
  final double pixelsPerGrid;

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

  @override
  void render(Canvas canvas) {
    final start = state.measureStart;
    final end = state.measureEnd;
    if (start == null || end == null) return;

    // Don't render if start and end are the same point
    if ((end - start).distance < 1.0) return;

    const lineColor = Color(0xFFD4A76A); // gold/amber
    final linePaint = Paint()
      ..color = lineColor
      ..strokeWidth = 0.04 * pixelsPerGrid
      ..style = PaintingStyle.stroke;

    // Dashed line
    _drawDashedLine(canvas, start, end, linePaint);

    // Endpoint markers
    final markerPaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.fill;
    final markerR = 0.08 * pixelsPerGrid;
    canvas.drawCircle(start, markerR, markerPaint);
    canvas.drawCircle(end, markerR, markerPaint);

    // Distance label at midpoint
    _renderDistanceLabel(canvas, start, end);
  }

  /// Calculates the D&D 5e distance between [start] and [end].
  ///
  /// Uses grid-based measurement: each square is 5 ft. Diagonal squares
  /// alternate between 5 ft and 10 ft cost (the "simple" D&D 5e rule).
  ///
  /// Returns a human-readable string like "30 ft".
  String _calculateDistance(Offset start, Offset end) {
    final dx = ((end.dx - start.dx) / pixelsPerGrid).round().abs();
    final dy = ((end.dy - start.dy) / pixelsPerGrid).round().abs();
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
  /// sized relative to the grid so it is legible at map scale.
  void _renderDistanceLabel(Canvas canvas, Offset start, Offset end) {
    final distText = _calculateDistance(start, end);

    // Cache the TextPainter
    if (_distPainter == null || _cachedDistText != distText) {
      _cachedDistText = distText;
      _distPainter = TextPainter(
        text: TextSpan(
          text: distText,
          style: TextStyle(
            color: Colors.white,
            fontSize: 0.35 * pixelsPerGrid,
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

    final hPad = 0.15 * pixelsPerGrid;
    final vPad = 0.08 * pixelsPerGrid;
    final pillW = _distPainter!.width + hPad * 2;
    final pillH = _distPainter!.height + vPad * 2;
    final pillLeft = mid.dx - pillW / 2;
    final pillTop = mid.dy - pillH / 2;

    // Pill background
    final pillRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(pillLeft, pillTop, pillW, pillH),
      Radius.circular(pillH / 2),
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
  /// Dash and gap lengths are a fraction of a grid square. The final dash
  /// may be shorter if the remaining length is less than a full dash.
  void _drawDashedLine(Canvas canvas, Offset start, Offset end, Paint paint) {
    final dashLength = 0.2 * pixelsPerGrid;
    final gapLength = 0.1 * pixelsPerGrid;
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
