import 'dart:math';

import 'package:flame/components.dart';
import 'package:flutter/material.dart';

import '../../model/template_disc.dart';
import '../../state/vtt_state.dart';

/// Draws the area-of-effect template disc ([VttState.templateDisc]) — the
/// acrylic disc with radius rings, cubes and cones, as configured.
///
/// Order, bottom first: tint and edge, radius rings, cubes, cones, compass
/// marks, the middle's circle, labels, and (tablet only, [showHandles]) the
/// gold turning knob on the edge. Outlines, marks and labels are built once
/// per look ([TemplateDisc.shapeKey]) in the disc's frame and drawn
/// translated and turned, so a drag costs no rebuild.
///
/// Labels turn with the disc like printed ones, but flip when they would
/// read upside down on this device's screen ([viewAngle]).
///
/// Priority 22: above the measure line (20), below the ruler (25).
///
/// See also:
/// - [TemplateDisc], the geometry.
/// - [VttGame], which hit-tests the middle, edge and knob for dragging.
class TemplateDiscComponent extends PositionComponent {
  /// The state whose [VttState.templateDisc] is drawn.
  final VttState state;

  /// World pixels per grid square.
  final double pixelsPerGrid;

  /// Whether to draw the turning knob (the DM's tablet, not the TV).
  final bool showHandles;

  /// The camera's rotation in radians, read every frame so labels never
  /// read upside down. `null` = unrotated.
  final double Function()? viewAngle;

  String? _builtKey;
  final List<_Outline> _outlines = [];
  final List<_Label> _labels = [];
  Path? _markers;
  Path? _centerMark;
  TextPainter? _knobIcon;

  /// Creates the component covering [mapSize] world pixels.
  TemplateDiscComponent({
    required this.state,
    required this.pixelsPerGrid,
    required Vector2 mapSize,
    this.showHandles = false,
    this.viewAngle,
  }) : super(size: mapSize, priority: 22);

  @override
  void render(Canvas canvas) {
    final disc = state.templateDisc;
    if (!disc.visible) return;
    if (_builtKey != disc.shapeKey) _build(disc);
    final s = pixelsPerGrid;
    final turn = disc.rotation * pi / 180;

    canvas.save();
    canvas.translate(disc.x * s, disc.y * s);
    canvas.rotate(turn);

    final rim = disc.rimRadius * s;
    if (disc.tint > 0) {
      canvas.drawCircle(Offset.zero, rim,
          Paint()..color = Colors.white.withValues(alpha: disc.tint));
    }
    if (disc.rim) {
      canvas.drawCircle(
          Offset.zero,
          rim,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = disc.lineWidth * 0.5 * s
            ..color = const Color(0xB3E8EEF2));
    }
    for (final o in _outlines) {
      canvas.drawPath(o.path, o.paint);
    }
    if (_markers != null) {
      canvas.drawPath(_markers!, Paint()..color = const Color(0xFF141414));
    }
    if (_centerMark != null) {
      canvas.drawPath(
          _centerMark!,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = disc.lineWidth * 0.8 * s
            ..color = const Color(0xFF141414));
    }

    // Labels: flipped when they would read upside down on this screen
    final camera = viewAngle?.call() ?? 0;
    for (final l in _labels) {
      final onScreen = turn + l.angle - camera;
      final flip = cos(onScreen) < 0;
      canvas.save();
      canvas.translate(l.center.dx, l.center.dy);
      canvas.rotate(l.angle + (flip ? pi : 0));
      canvas.drawRRect(l.pill, l.fill);
      canvas.drawRRect(l.pill, l.border);
      l.text.paint(canvas, Offset(-l.text.width / 2, -l.text.height / 2));
      canvas.restore();
    }

    if (showHandles) {
      final k = disc.knobLocal * s;
      final r = knobRadius * s;
      canvas.drawCircle(k, r, Paint()..color = const Color(0xFFD4A76A));
      canvas.drawCircle(
          k,
          r,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 0.04 * s
            ..color = const Color(0xFF3A2410));
      final icon = _knobIcon;
      if (icon != null) {
        canvas.save();
        canvas.translate(k.dx, k.dy);
        canvas.rotate(camera - turn); // upright on this screen
        icon.paint(canvas, Offset(-icon.width / 2, -icon.height / 2));
        canvas.restore();
      }
    }
    canvas.restore();
  }

  /// Radius of the turning knob in squares.
  static const double knobRadius = 0.32;

  /// Builds outlines, marks and labels for [disc]'s look, in world pixels
  /// around the disc's middle.
  void _build(TemplateDisc disc) {
    _builtKey = disc.shapeKey;
    _outlines.clear();
    _labels.clear();
    final s = pixelsPerGrid;
    final lw = disc.lineWidth * s;

    Paint stroke(DiscShapeSet set) => Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = lw
      ..strokeCap = StrokeCap.butt
      ..strokeJoin = StrokeJoin.miter
      ..color = Color(set.color);
    Path styled(Path p, DiscShapeSet set) =>
        set.line == DiscLineStyle.dotted ? dotted(p, lw) : p;

    // Radius rings, labels on top
    final rings = disc.rings;
    if (rings.shows) {
      for (final ft in rings.sizes) {
        final r = TemplateDisc.squares(ft) * s;
        _outlines.add(_Outline(
            styled(Path()..addOval(Rect.fromCircle(center: Offset.zero, radius: r)),
                rings),
            stroke(rings)));
        if (rings.labels) {
          _labels.add(_label(disc, rings, "${_ft(ft)}' RADIUS", Offset(0, -r), 0));
        }
      }
    }

    // Cubes centred on the middle, labels on the bottom edge
    final cubes = disc.cubes;
    if (cubes.shows) {
      for (final ft in cubes.sizes) {
        final h = TemplateDisc.squares(ft) / 2 * s;
        _outlines.add(_Outline(
            styled(Path()..addRect(Rect.fromLTRB(-h, -h, h, h)), cubes),
            stroke(cubes)));
        if (cubes.labels) {
          _labels.add(_label(disc, cubes, "${_ft(ft)}' CUBE", Offset(0, h), 0));
        }
      }
    }

    // Cones, labels along the south edge a third of the way from the base
    final cones = disc.cones;
    if (cones.shows) {
      for (final ft in cones.sizes) {
        final t = disc.coneTriangle(ft).map((p) => p * s).toList();
        _outlines.add(_Outline(
            styled(
                Path()
                  ..moveTo(t[0].dx, t[0].dy)
                  ..lineTo(t[1].dx, t[1].dy)
                  ..lineTo(t[2].dx, t[2].dy)
                  ..close(),
                cones),
            stroke(cones)));
        if (cones.labels) {
          final edge = t[0] - t[2]; // base south → tip
          final at = t[2] + edge * 0.3;
          _labels.add(_label(
              disc, cones, "${_ft(ft)}' CONE", at, atan2(edge.dy, edge.dx)));
        }
      }
    }

    // Compass marks: a slim four-point star, long arm pointing outward
    final angles = disc.markerAngles;
    if (angles.isNotEmpty) {
      final p = Path();
      final r = disc.markerRadius * s;
      final len = 0.22 * s, side = 0.09 * s, back = 0.12 * s;
      for (final a in angles) {
        final c = Offset(cos(a) * r, sin(a) * r);
        final out = Offset(cos(a), sin(a));
        final across = Offset(-out.dy, out.dx);
        Offset at(double o, double x) => c + out * o + across * x;
        p
          ..moveTo(at(len, 0).dx, at(len, 0).dy)
          ..lineTo(at(0.03 * s, side * 0.35).dx, at(0.03 * s, side * 0.35).dy)
          ..lineTo(at(0, side).dx, at(0, side).dy)
          ..lineTo(at(-0.03 * s, side * 0.35).dx, at(-0.03 * s, side * 0.35).dy)
          ..lineTo(at(-back, 0).dx, at(-back, 0).dy)
          ..lineTo(at(-0.03 * s, -side * 0.35).dx, at(-0.03 * s, -side * 0.35).dy)
          ..lineTo(at(0, -side).dx, at(0, -side).dy)
          ..lineTo(at(0.03 * s, -side * 0.35).dx, at(0.03 * s, -side * 0.35).dy)
          ..close();
      }
      _markers = p;
    } else {
      _markers = null;
    }

    // The middle: a one-square circle (a medium creature's base) + a cross
    if (disc.centerMark) {
      final r = 0.5 * s, c = 0.12 * s;
      _centerMark = Path()
        ..addOval(Rect.fromCircle(center: Offset.zero, radius: r))
        ..moveTo(-c, 0)
        ..lineTo(c, 0)
        ..moveTo(0, -c)
        ..lineTo(0, c);
    } else {
      _centerMark = null;
    }

    _knobIcon = showHandles
        ? (TextPainter(
            text: TextSpan(
              text: String.fromCharCode(Icons.rotate_right.codePoint),
              style: TextStyle(
                fontFamily: Icons.rotate_right.fontFamily,
                package: Icons.rotate_right.fontPackage,
                fontSize: knobRadius * 1.5 * s,
                color: const Color(0xFF3A2410),
              ),
            ),
            textDirection: TextDirection.ltr,
          )..layout())
        : null;
  }

  /// A label pill for [set] centred on [center], turned by [angle].
  _Label _label(TemplateDisc disc, DiscShapeSet set, String text,
      Offset center, double angle) {
    final s = pixelsPerGrid;
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: Color(set.color),
          fontSize: disc.labelSize * s,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.02 * s,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final padX = disc.labelSize * 0.45 * s, padY = disc.labelSize * 0.18 * s;
    final rect = Rect.fromCenter(
        center: Offset.zero,
        width: painter.width + padX * 2,
        height: painter.height + padY * 2);
    return _Label(
      center: center,
      angle: angle,
      text: painter,
      pill: RRect.fromRectAndRadius(rect, Radius.circular(rect.height * 0.3)),
      fill: Paint()..color = const Color(0xF2FFFFFF),
      border: Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = disc.lineWidth * 0.6 * s
        ..color = Color(set.color),
    );
  }

  /// Feet without a trailing ".0" (5, 7.5).
  static String _ft(double ft) =>
      ft == ft.roundToDouble() ? ft.toInt().toString() : ft.toString();

  /// [source] cut into square dots [width] long with equal gaps, spread
  /// evenly so each closed outline ends on a whole dot.
  static Path dotted(Path source, double width) {
    final out = Path();
    for (final metric in source.computeMetrics()) {
      final n = max(1, (metric.length / (width * 2)).floor());
      final step = metric.length / n;
      for (var i = 0; i < n; i++) {
        final start = i * step;
        out.addPath(metric.extractPath(start, start + step / 2), Offset.zero);
      }
    }
    return out;
  }
}

/// One cached outline: its path and stroke.
class _Outline {
  final Path path;
  final Paint paint;
  _Outline(this.path, this.paint);
}

/// One cached label pill.
class _Label {
  final Offset center;
  final double angle;
  final TextPainter text;
  final RRect pill;
  final Paint fill;
  final Paint border;
  _Label({
    required this.center,
    required this.angle,
    required this.text,
    required this.pill,
    required this.fill,
    required this.border,
  });
}
