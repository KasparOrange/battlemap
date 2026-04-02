import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../state/vtt_state.dart';

/// Renders a physical L-shaped ruler overlay on the battlemap.
///
/// The ruler has two perpendicular arms (horizontal and vertical) that meet
/// at a right-angle corner. Each arm displays tick marks at every grid square
/// interval, half-tick marks at half intervals, and numbered labels 1-5.
///
/// The ruler renders in world coordinates (using [pixelsPerGrid] spacing),
/// so the camera zoom makes it appear at the correct physical size on the TV.
///
/// Controlled by:
/// - [VttState.rulerVisible] -- whether to draw.
/// - [VttState.rulerX], [VttState.rulerY] -- corner position in grid coords.
/// - [VttState.rulerRotation] -- orientation (0, 90, 180, 270 degrees).
///
/// Priority 25 ensures the ruler renders above everything else including
/// the measure tool (priority 20) and fog of war (priority 10).
///
/// See also:
/// - [VttGame], which creates this component during map load.
/// - [DmControlPanel], which provides the toggle and rotation controls.
class RulerComponent extends PositionComponent {
  /// The shared VTT state that controls ruler visibility and position.
  final VttState state;

  /// World pixels per grid square, used for spacing tick marks.
  final double pixelsPerGrid;

  /// Fill paint for the wooden ruler body (85% opacity warm brown).
  static final _woodFill = Paint()..color = const Color(0xD95C3A1E);

  /// Border paint for the ruler outline.
  static final _woodBorder = Paint()
    ..color = const Color(0xFF3A2410)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.0;

  /// Paint for full tick marks at each grid square.
  static final _tickPaint = Paint()
    ..color = const Color(0xFF1A0E05)
    ..strokeWidth = 1.5;

  /// Paint for half tick marks at each half grid square.
  static final _halfTickPaint = Paint()
    ..color = const Color(0xFF3A2410)
    ..strokeWidth = 1.0;

  /// Paint for the right-angle indicator square in the corner.
  static final _cornerPaint = Paint()
    ..color = const Color(0xFF3A2410)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.5;

  /// Cached text painters for number labels 1-5.
  final List<TextPainter> _numberPainters = [];

  /// Creates a [RulerComponent] for the given map.
  ///
  /// [pixelsPerGrid] sets the spacing between tick marks.
  /// [mapSize] sets the component's bounding box so it renders regardless
  /// of camera position.
  RulerComponent({
    required this.state,
    required this.pixelsPerGrid,
    required Vector2 mapSize,
  }) : super(
          size: mapSize,
          priority: 25,
        );

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    // Pre-cache number painters for labels 1-5
    for (int i = 1; i <= 5; i++) {
      final painter = TextPainter(
        text: TextSpan(
          text: '$i',
          style: const TextStyle(
            color: Color(0xFF1A0E05),
            fontSize: 10,
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      _numberPainters.add(painter);
    }
  }

  @override
  void render(Canvas canvas) {
    if (!state.rulerVisible) return;

    final cornerX = state.rulerX * pixelsPerGrid;
    final cornerY = state.rulerY * pixelsPerGrid;
    final armLength = 5 * pixelsPerGrid;
    final armWidth = 0.15 * pixelsPerGrid;
    final tickLength = 0.08 * pixelsPerGrid;
    final halfTickLength = 0.05 * pixelsPerGrid;
    final cornerSize = 0.08 * pixelsPerGrid;

    canvas.save();
    canvas.translate(cornerX, cornerY);
    canvas.rotate(state.rulerRotation * pi / 180);

    // --- Horizontal arm: extends right from corner ---
    // Rect from (0, -armWidth) to (armLength, 0)
    final hRect = Rect.fromLTRB(0, -armWidth, armLength, 0);
    canvas.drawRect(hRect, _woodFill);
    canvas.drawRect(hRect, _woodBorder);

    // --- Vertical arm: extends upward from corner ---
    // Rect from (-armWidth, -armLength) to (0, 0)
    final vRect = Rect.fromLTRB(-armWidth, -armLength, 0, 0);
    canvas.drawRect(vRect, _woodFill);
    canvas.drawRect(vRect, _woodBorder);

    // --- Tick marks on horizontal arm ---
    for (int i = 0; i <= 5; i++) {
      final x = i * pixelsPerGrid;
      // Full tick
      canvas.drawLine(
        Offset(x, -armWidth),
        Offset(x, -armWidth + tickLength),
        _tickPaint,
      );
      // Half tick (except after last full tick)
      if (i < 5) {
        final halfX = (i + 0.5) * pixelsPerGrid;
        canvas.drawLine(
          Offset(halfX, -armWidth),
          Offset(halfX, -armWidth + halfTickLength),
          _halfTickPaint,
        );
      }
      // Number label
      if (i > 0 && i <= 5 && i - 1 < _numberPainters.length) {
        final painter = _numberPainters[i - 1];
        painter.paint(
          canvas,
          Offset(x - painter.width / 2, -armWidth / 2 - painter.height / 2),
        );
      }
    }

    // --- Tick marks on vertical arm ---
    for (int i = 0; i <= 5; i++) {
      final y = -i * pixelsPerGrid;
      // Full tick
      canvas.drawLine(
        Offset(-armWidth, y),
        Offset(-armWidth + tickLength, y),
        _tickPaint,
      );
      // Half tick (except after last full tick)
      if (i < 5) {
        final halfY = -(i + 0.5) * pixelsPerGrid;
        canvas.drawLine(
          Offset(-armWidth, halfY),
          Offset(-armWidth + halfTickLength, halfY),
          _halfTickPaint,
        );
      }
      // Number label
      if (i > 0 && i <= 5 && i - 1 < _numberPainters.length) {
        final painter = _numberPainters[i - 1];
        painter.paint(
          canvas,
          Offset(-armWidth / 2 - painter.width / 2, y - painter.height / 2),
        );
      }
    }

    // --- Right-angle indicator in the corner ---
    final indicatorPath = Path()
      ..moveTo(cornerSize, 0)
      ..lineTo(cornerSize, -cornerSize)
      ..lineTo(0, -cornerSize);
    canvas.drawPath(indicatorPath, _cornerPaint);

    canvas.restore();
  }
}
