import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../model/table_fit.dart';

/// The TV's screen-space frame for the table view: masks the leftover
/// around the window of whole one-inch squares and draws the calibration
/// pattern.
///
/// Lives in the camera's viewport (screen pixels, not map pixels), TV only.
///
/// - **Mask** ([masked] true, i.e. [TvCameraMode.table] with a map): the
///   strips outside [TableGrid.window] are painted in the background colour,
///   so the players see exactly 34 × 19 whole squares, centred, with the
///   gap split evenly — never a cut square at the screen's edge.
/// - **Calibration pattern** ([calibrating] true, `vtt.showCalibration`):
///   every one-inch square of the window, the window's outline, and a
///   10-inch measuring bar with inch ticks in the middle. The DM measures
///   the bar with a ruler and types the length into the tablet, which
///   corrects [VttState.tvWidthInches].
///
/// See also:
/// - [TableGrid], the arithmetic behind the window.
/// - [VttGame], which adds this to the TV's viewport.
class TableFrameComponent extends Component {
  /// The table for the current screen, or `null` before the first layout.
  final TableGrid? Function() grid;

  /// Whether the leftover around the window is masked.
  final bool Function() masked;

  /// Whether the calibration pattern is shown.
  final bool Function() calibrating;

  /// Colour of the mask (the game's background).
  final Color background;

  /// Creates the frame. See the fields.
  TableFrameComponent({
    required this.grid,
    required this.masked,
    required this.calibrating,
    this.background = const Color(0xFF111111),
  }) : super(priority: 100);

  @override
  void render(Canvas canvas) {
    final g = grid();
    if (g == null) return;
    final cal = calibrating();
    if (!cal && !masked()) return;
    final screen = Offset.zero & g.screen;
    final window = g.window;

    // Leftover strips (the window stays clear)
    final strips = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(screen)
      ..addRect(window);
    canvas.drawPath(strips, Paint()..color = background);

    if (cal) _renderCalibration(canvas, g, window);
  }

  void _renderCalibration(Canvas canvas, TableGrid g, Rect window) {
    final ppi = g.pxPerInch;
    // Dim the map so the pattern reads on any picture
    canvas.drawRect(window, Paint()..color = const Color(0xB3000000));

    final thin = Paint()
      ..color = const Color(0x59FFFFFF)
      ..strokeWidth = 1;
    final strong = Paint()
      ..color = const Color(0xA6FFFFFF)
      ..strokeWidth = 1.5;
    for (int c = 0; c <= g.cols; c++) {
      final x = window.left + c * ppi;
      canvas.drawLine(Offset(x, window.top), Offset(x, window.bottom),
          c % 5 == 0 ? strong : thin);
    }
    for (int r = 0; r <= g.rows; r++) {
      final y = window.top + r * ppi;
      canvas.drawLine(Offset(window.left, y), Offset(window.right, y),
          r % 5 == 0 ? strong : thin);
    }
    canvas.drawRect(
        window,
        Paint()
          ..color = const Color(0xFFD4A76A)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3);

    // Measuring bar on square boundaries, centred
    final bar = min(TableGrid.measuringBarInches, g.cols);
    final startCol = ((g.cols - bar) / 2).floor();
    final midRow = (g.rows / 2).floor();
    final x0 = window.left + startCol * ppi;
    final x1 = x0 + bar * ppi;
    final y = window.top + midRow * ppi;
    final barPaint = Paint()..color = const Color(0xFFFFFFFF);
    canvas.drawRect(Rect.fromLTRB(x0, y - 4, x1, y + 4), barPaint);
    for (int i = 0; i <= bar; i++) {
      final x = x0 + i * ppi;
      final h = i == 0 || i == bar ? 0.9 * ppi : (i % 5 == 0 ? 0.6 * ppi : 0.35 * ppi);
      canvas.drawRect(Rect.fromLTWH(x - 1.5, y - h, 3, h), barPaint);
      if (i % 5 == 0) {
        _text(canvas, '$i', Offset(x, y + 10), 0.32 * ppi, center: true);
      }
    }
    _text(
      canvas,
      'Measure this bar: it should be exactly $bar in '
      '(${(bar * 2.54).toStringAsFixed(1)} cm). Type what you measure into the tablet.',
      Offset(window.center.dx, y + 0.7 * ppi + 0.32 * ppi + 14),
      0.36 * ppi,
      center: true,
      maxWidth: window.width - ppi,
    );
    _text(
      canvas,
      '${g.cols} × ${g.rows} squares of 1 inch · picture '
      '${g.screenWidthInches.toStringAsFixed(2)} × ${g.screenHeightInches.toStringAsFixed(2)} in',
      Offset(window.center.dx, window.top + 0.6 * ppi),
      0.4 * ppi,
      center: true,
      maxWidth: window.width - ppi,
    );
  }

  static void _text(Canvas canvas, String s, Offset at, double size,
      {bool center = false, double maxWidth = 2000}) {
    final tp = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(
          color: Colors.white,
          fontSize: max(10, size),
          fontWeight: FontWeight.w600,
          shadows: const [Shadow(color: Colors.black, blurRadius: 4)],
        ),
      ),
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: maxWidth);
    final topLeft = center ? at - Offset(tp.width / 2, 0) : at;
    // A dark plate so the caption never sits on a bright grid line
    final pad = tp.height * 0.25;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(topLeft.dx - pad, topLeft.dy - pad / 2,
            tp.width + 2 * pad, tp.height + pad),
        Radius.circular(pad),
      ),
      Paint()..color = const Color(0xCC000000),
    );
    tp.paint(canvas, topLeft);
  }
}
