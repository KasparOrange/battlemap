import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../state/vtt_state.dart';

/// Renders a physical L-shaped ruler overlay on the battlemap.
///
/// The ruler has two perpendicular arms (horizontal and vertical) that meet
/// at a right-angle corner. Each arm is [armLengthSquares] grid squares long
/// and [armWidthSquares] wide, with tick marks at every square, half-ticks
/// at half squares, and numbered labels. All sizes are fractions of
/// [pixelsPerGrid], so the ruler keeps its proportions on any map and,
/// on a calibrated TV, measures real inches.
///
/// Controlled by:
/// - [VttState.rulerVisible] -- whether to draw.
/// - [VttState.rulerX], [VttState.rulerY] -- corner position in grid coords.
/// - [VttState.rulerRotation] -- orientation (0, 90, 180, 270 degrees).
///
/// The ruler can be dragged on the phone in any interaction mode while it
/// is visible ([VttGame] hit-tests the arms, then calls
/// [VttState.setRulerPosition]).
///
/// Priority 25 ensures the ruler renders above everything else including
/// the measure tool (priority 20) and fog of war (priority 10).
///
/// See also:
/// - [VttGame], which creates this component during map load.
/// - [DmControlPanel], which provides the toggle and rotation controls.
class RulerComponent extends PositionComponent {
  /// Length of each arm in grid squares.
  static const double armLengthSquares = 10;

  /// Width of each arm in grid squares (thick enough to grab and read).
  static const double armWidthSquares = 0.6;

  /// The shared VTT state that controls ruler visibility and position.
  final VttState state;

  /// World pixels per grid square, used for spacing tick marks.
  final double pixelsPerGrid;

  /// Fill paint for the wooden ruler body (85% opacity warm brown).
  static final _woodFill = Paint()..color = const Color(0xD95C3A1E);

  /// Border paint for the ruler outline.
  final Paint _woodBorder = Paint()
    ..color = const Color(0xFF3A2410)
    ..style = PaintingStyle.stroke;

  /// Paint for full tick marks at each grid square.
  final Paint _tickPaint = Paint()..color = const Color(0xFF1A0E05);

  /// Paint for half tick marks at each half grid square.
  final Paint _halfTickPaint = Paint()..color = const Color(0xFF3A2410);

  /// Paint for the right-angle indicator square in the corner.
  final Paint _cornerPaint = Paint()
    ..color = const Color(0xFF3A2410)
    ..style = PaintingStyle.stroke;

  /// Cached text painters for number labels 1..[armLengthSquares].
  final List<TextPainter> _numberPainters = [];

  /// Creates a [RulerComponent] for the given map.
  ///
  /// [pixelsPerGrid] sets the spacing between tick marks and every other
  /// dimension. [mapSize] sets the component's bounding box so it renders
  /// regardless of camera position.
  RulerComponent({
    required this.state,
    required this.pixelsPerGrid,
    required Vector2 mapSize,
  }) : super(
          size: mapSize,
          priority: 25,
        ) {
    _woodBorder.strokeWidth = 0.025 * pixelsPerGrid;
    _tickPaint.strokeWidth = 0.02 * pixelsPerGrid;
    _halfTickPaint.strokeWidth = 0.012 * pixelsPerGrid;
    _cornerPaint.strokeWidth = 0.02 * pixelsPerGrid;
  }

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    // Pre-cache number painters, sized to the arm width
    for (int i = 1; i <= armLengthSquares.toInt(); i++) {
      final painter = TextPainter(
        text: TextSpan(
          text: '$i',
          style: TextStyle(
            color: const Color(0xFF1A0E05),
            fontSize: 0.3 * pixelsPerGrid,
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
    final armLength = armLengthSquares * pixelsPerGrid;
    final armWidth = armWidthSquares * pixelsPerGrid;
    final tickLength = 0.22 * pixelsPerGrid;
    final halfTickLength = 0.12 * pixelsPerGrid;
    final cornerSize = 0.2 * pixelsPerGrid;
    final n = armLengthSquares.toInt();

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

    // --- Tick marks on horizontal arm (ticks on the outer edge, y = -armWidth) ---
    for (int i = 0; i <= n; i++) {
      final x = i * pixelsPerGrid;
      canvas.drawLine(
        Offset(x, -armWidth),
        Offset(x, -armWidth + tickLength),
        _tickPaint,
      );
      if (i < n) {
        final halfX = (i + 0.5) * pixelsPerGrid;
        canvas.drawLine(
          Offset(halfX, -armWidth),
          Offset(halfX, -armWidth + halfTickLength),
          _halfTickPaint,
        );
      }
      if (i > 0 && i - 1 < _numberPainters.length) {
        final painter = _numberPainters[i - 1];
        painter.paint(
          canvas,
          Offset(x - painter.width / 2, -armWidth + tickLength + 0.02 * pixelsPerGrid),
        );
      }
    }

    // --- Tick marks on vertical arm (ticks on the outer edge, x = -armWidth) ---
    for (int i = 0; i <= n; i++) {
      final y = -i * pixelsPerGrid;
      canvas.drawLine(
        Offset(-armWidth, y),
        Offset(-armWidth + tickLength, y),
        _tickPaint,
      );
      if (i < n) {
        final halfY = -(i + 0.5) * pixelsPerGrid;
        canvas.drawLine(
          Offset(-armWidth, halfY),
          Offset(-armWidth + halfTickLength, halfY),
          _halfTickPaint,
        );
      }
      if (i > 0 && i - 1 < _numberPainters.length) {
        final painter = _numberPainters[i - 1];
        painter.paint(
          canvas,
          Offset(-armWidth + tickLength + 0.02 * pixelsPerGrid, y - painter.height / 2),
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
