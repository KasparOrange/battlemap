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
///   10-inch measuring bar with inch ticks starting at the [pivot] — a
///   screen corner or the centre, marked "0", that stays put while the
///   calibration changes, so the ruler can lie there and only the bar's far
///   end moves. The DM measures the bar and types the length into the
///   tablet, which corrects [VttState.tvWidthInches].
/// - **Edges** (also while calibrating): a blue line around what the TV is
///   believed to show ([TableGrid.visible]) and red stripes beyond it. The
///   DM raises "Edges the TV cuts off" ([VttState.tvOverscanPercent]) until
///   the blue line shows along all four edges of the glass.
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

  /// Where the measuring bar starts ([CalibrationPivot]).
  final CalibrationPivot Function() pivot;

  /// Colour of the mask (the game's background).
  final Color background;

  /// Creates the frame. See the fields.
  TableFrameComponent({
    required this.grid,
    required this.masked,
    required this.calibrating,
    this.pivot = _defaultPivot,
    this.background = const Color(0xFF111111),
  }) : super(priority: 100);

  static CalibrationPivot _defaultPivot() => CalibrationPivot.bottomLeft;

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

    // Edges: red beyond what the TV is believed to show, a blue line on its
    // border — the line must show on all four edges of the glass.
    final screen = Offset.zero & g.screen;
    final visible = g.visible;
    if (visible != screen) {
      canvas.drawPath(
          Path()
            ..fillType = PathFillType.evenOdd
            ..addRect(screen)
            ..addRect(visible),
          Paint()..color = const Color(0xFFB3261E));
    }
    canvas.drawRect(
        visible.deflate(2),
        Paint()
          ..color = const Color(0xFF4FC3F7)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4);

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

    // Measuring bar from the pivot: its zero is fixed on the screen, so a
    // ruler laid there stays right while the calibration changes.
    final pv = pivot();
    final origin = g.pivotPoint(pv);
    final bar = g.barInchesFrom(pv);
    final dir = TableGrid.barRunsRight(pv) ? 1.0 : -1.0;
    final up = pv.isTop ? -1.0 : 1.0; // ticks point away from the near edge
    final y = origin.dy;
    final x0 = origin.dx;
    final x1 = x0 + dir * bar * ppi;
    final barPaint = Paint()..color = const Color(0xFFFFFFFF);
    canvas.drawRect(Rect.fromLTRB(min(x0, x1), y - 4, max(x0, x1), y + 4), barPaint);
    for (int i = 0; i <= bar; i++) {
      final x = x0 + dir * i * ppi;
      final h = i == 0 || i == bar ? 0.9 * ppi : (i % 5 == 0 ? 0.6 * ppi : 0.35 * ppi);
      canvas.drawRect(Rect.fromLTRB(x - 1.5, y - up * h, x + 1.5, y), barPaint);
      if (i % 5 == 0) {
        // Numbers on the near-edge side of the bar, the ticks on the other.
        _text(canvas, '$i', Offset(x, up > 0 ? y + 10 : y - 10), 0.32 * ppi,
            center: true, above: up < 0);
      }
    }
    // The pivot: a gold ring + cross on the zero, "0" next to it.
    final gold = Paint()
      ..color = const Color(0xFFD4A76A)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    canvas.drawCircle(origin, 0.3 * ppi, gold);
    canvas.drawLine(origin - Offset(0, 0.5 * ppi), origin + Offset(0, 0.5 * ppi), gold);

    // Caption on the far side of the ticks (above a bottom pivot's bar).
    final captionY = up > 0 ? y - 0.9 * ppi - 14 : y + 0.9 * ppi + 14;
    _text(
      canvas,
      'Ruler\'s zero on the gold ring — it stays put. The bar should be exactly $bar in '
      '(${(bar * 2.54).toStringAsFixed(1)} cm). Type what you measure into the tablet.',
      Offset((x0 + x1) / 2, captionY),
      0.32 * ppi,
      center: true,
      maxWidth: max(bar * ppi, 6 * ppi),
      above: up > 0,
    );
    _text(
      canvas,
      '${g.cols} × ${g.rows} squares of 1 inch · picture '
      '${g.screenWidthInches.toStringAsFixed(2)} × ${g.screenHeightInches.toStringAsFixed(2)} in'
      '${g.overscanPercent > 0 ? ' · ${_pct(g.overscanPercent)} % cut off each edge' : ''}'
      ' · the blue line should show on all four edges',
      // At the top — or the bottom when the bar runs along the top.
      pv.isTop
          ? Offset(window.center.dx, window.bottom - 0.6 * ppi)
          : Offset(window.center.dx, window.top + 0.6 * ppi),
      0.4 * ppi,
      center: true,
      maxWidth: window.width - ppi,
      above: pv.isTop,
    );
  }

  /// A percentage without trailing zeros (`5`, `2.5`).
  static String _pct(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2).replaceFirst(RegExp(r'0$'), '');

  static void _text(Canvas canvas, String s, Offset at, double size,
      {bool center = false, double maxWidth = 2000, bool above = false}) {
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
    // [above]: [at] is the text's bottom edge instead of its top.
    final topLeft = (center ? at - Offset(tp.width / 2, 0) : at) -
        Offset(0, above ? tp.height : 0);
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
