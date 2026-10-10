import 'dart:math';
import 'dart:ui';

/// How a family of [TemplateDisc] outlines is stroked.
enum DiscLineStyle {
  /// A continuous line (the disc's red radius rings).
  solid,

  /// Square dots (the disc's black cubes and blue cones).
  dotted,
}

/// Where the cones of a [TemplateDisc] start.
enum DiscConeAnchor {
  /// All cones share one base line and the longest is centred on the disc —
  /// the acrylic disc: the 30 ft cone's tip sits 15 ft east of the middle,
  /// the 15 ft cone's tip on the middle, both open west to the same base.
  sharedBase,

  /// Every cone's tip sits on the disc's middle (the caster's square).
  center,
}

/// What the disc's middle snaps to while it is dragged.
enum DiscSnap {
  /// Free placement.
  none,

  /// The middle of a square (a medium creature's base).
  squareCenters,

  /// A grid intersection (5e's point of origin for spheres and cubes).
  squareCorners,
}

/// One family of outlines on a [TemplateDisc]: the radius rings, the cubes
/// or the cones — their sizes, colour, line and labels.
///
/// Immutable; change it with [copyWith].
class DiscShapeSet {
  /// Whether this family is drawn at all.
  final bool visible;

  /// Sizes in feet, ascending (ring radius, cube side, cone length).
  final List<double> sizes;

  /// Outline and label colour (ARGB).
  final int color;

  /// Solid or dotted outline.
  final DiscLineStyle line;

  /// Whether each outline carries its label pill ("20' RADIUS").
  final bool labels;

  /// Creates a family; [sizes] are sorted ascending and deduplicated.
  DiscShapeSet({
    this.visible = true,
    required List<double> sizes,
    required this.color,
    this.line = DiscLineStyle.solid,
    this.labels = true,
  }) : sizes = List.unmodifiable(
            (sizes.where((s) => s > 0).toSet().toList()..sort()));

  /// The largest size in feet, or 0 when there are none.
  double get largest => sizes.isEmpty ? 0 : sizes.last;

  /// Whether anything of this family is drawn.
  bool get shows => visible && sizes.isNotEmpty;

  /// A copy with the given fields replaced.
  DiscShapeSet copyWith({
    bool? visible,
    List<double>? sizes,
    int? color,
    DiscLineStyle? line,
    bool? labels,
  }) =>
      DiscShapeSet(
        visible: visible ?? this.visible,
        sizes: sizes ?? this.sizes,
        color: color ?? this.color,
        line: line ?? this.line,
        labels: labels ?? this.labels,
      );

  /// JSON form; see [DiscShapeSet.fromJson].
  Map<String, dynamic> toJson() => {
        'visible': visible,
        'sizes': sizes,
        'color': color,
        'line': line.name,
        'labels': labels,
      };

  /// Reads [toJson]; missing fields fall back to [fallback]'s.
  factory DiscShapeSet.fromJson(Object? json, DiscShapeSet fallback) {
    if (json is! Map) return fallback;
    return DiscShapeSet(
      visible: json['visible'] as bool? ?? fallback.visible,
      sizes: (json['sizes'] as List?)
              ?.map((s) => (s as num).toDouble())
              .toList() ??
          fallback.sizes,
      color: (json['color'] as num?)?.toInt() ?? fallback.color,
      line: DiscLineStyle.values.firstWhere((l) => l.name == json['line'],
          orElse: () => fallback.line),
      labels: json['labels'] as bool? ?? fallback.labels,
    );
  }
}

/// A clear area-of-effect template disc laid on the map — the acrylic disc
/// with 5/10/15/20 ft radius rings, 10/20/30 ft cubes and 15/30 ft cones,
/// rebuilt and made configurable ([TemplateDisc.classic]).
///
/// Lives in the Measure tab. The DM shows it, drags it by its middle or its
/// edge and turns it by its knob; the TV draws it for the players
/// ([TemplateDiscComponent]). One map square is [feetPerSquare] feet, so on
/// the calibrated table the 20 ft ring is exactly four inches across its
/// radius — the same size as the physical disc.
///
/// Geometry is in the disc's own frame, in squares: origin on the middle,
/// x east, y south (screen axes), before [rotation]. Unrotated it looks
/// like the photo: ring labels on top, cube labels at the bottom, cones
/// opening west.
///
/// Immutable; change it with [copyWith]. Game state: saved with the
/// session (`Session.templateDisc`), synced with `vtt.setTemplateDisc`.
///
/// See also:
/// - [DiscShapeSet], one family of outlines.
/// - [TemplateDiscComponent], which draws it.
/// - [VttState.setTemplateDisc], which holds the current one.
class TemplateDisc {
  /// Feet per map square (D&D 5e).
  static const double feetPerSquare = 5;

  /// Opening angle of a 5e cone in degrees: its width at any distance from
  /// the tip equals that distance, `2 · atan(½)`.
  static const double dndConeDegrees = 53.13010235415598;

  /// Gap between the farthest outline and the disc's edge, in squares.
  static const double rimMargin = 0.06;

  /// Whether the disc is on the map.
  final bool visible;

  /// The middle's position in grid squares.
  final double x;

  /// The middle's position in grid squares.
  final double y;

  /// Turn in degrees, clockwise on screen, 0 ≤ rotation < 360.
  final double rotation;

  /// Radius rings (sizes = radius in feet).
  final DiscShapeSet rings;

  /// Cubes centred on the middle (sizes = side in feet).
  final DiscShapeSet cubes;

  /// Cones (sizes = length in feet), see [coneAnchor] and [coneDegrees].
  final DiscShapeSet cones;

  /// Where the cones' tips sit.
  final DiscConeAnchor coneAnchor;

  /// Opening angle of the cones in degrees (5e: [dndConeDegrees]).
  final double coneDegrees;

  /// Whether a one-square circle with a cross marks the middle (where the
  /// caster's miniature stands).
  final bool centerMark;

  /// Number of compass marks around the disc between its two largest rings
  /// (the disc has 12; one under the ring labels is left out).
  final int markers;

  /// Whether the disc's clear edge is drawn.
  final bool rim;

  /// White tint of the disc's face: its opacity, 0 (clear) to 0.8.
  final double tint;

  /// Outline width in squares.
  final double lineWidth;

  /// Label text height in squares.
  final double labelSize;

  /// What the middle snaps to while dragged.
  final DiscSnap snap;

  /// Creates a disc; see the fields. Prefer [TemplateDisc.classic].
  TemplateDisc({
    this.visible = false,
    this.x = 0,
    this.y = 0,
    double rotation = 0,
    required this.rings,
    required this.cubes,
    required this.cones,
    this.coneAnchor = DiscConeAnchor.sharedBase,
    this.coneDegrees = dndConeDegrees,
    this.centerMark = true,
    this.markers = 12,
    this.rim = true,
    this.tint = 0,
    this.lineWidth = 0.05,
    this.labelSize = 0.2,
    this.snap = DiscSnap.none,
  }) : rotation = ((rotation % 360) + 360) % 360;

  /// The acrylic disc from the photo: red 5/10/15/20 ft radius rings, black
  /// dotted 10/20/30 ft cubes, blue dotted 15/30 ft cones on a shared base,
  /// 12 compass marks, a clear edge. Hidden, at the map's corner.
  factory TemplateDisc.classic() => TemplateDisc(
        rings: DiscShapeSet(
            sizes: const [5, 10, 15, 20], color: 0xFFE0402C),
        cubes: DiscShapeSet(
            sizes: const [10, 20, 30],
            color: 0xFF141414,
            line: DiscLineStyle.dotted),
        cones: DiscShapeSet(
            sizes: const [15, 30],
            color: 0xFF1F4FB8,
            line: DiscLineStyle.dotted),
      );

  /// Colours offered for a family (the disc's red, black, blue, then
  /// colours that read on dark maps).
  static const List<int> palette = [
    0xFFE0402C, 0xFF141414, 0xFF1F4FB8, 0xFFFFFFFF,
    0xFFF2C14E, 0xFF3DBB6B, 0xFF9B59D0, 0xFF29B6F6,
  ];

  /// Feet → squares.
  static double squares(double feet) => feet / feetPerSquare;

  /// Distance in squares from the middle to the cone tip of a cone
  /// [lengthFeet] long, along x (negative = west). Cones open toward −x.
  double coneTipX(double lengthFeet) => switch (coneAnchor) {
        DiscConeAnchor.center => 0,
        DiscConeAnchor.sharedBase =>
          squares(cones.largest / 2 - cones.largest + lengthFeet),
      };

  /// The cone [lengthFeet] long as a triangle in the disc frame (squares):
  /// tip, base end north, base end south. Opens toward −x.
  List<Offset> coneTriangle(double lengthFeet) {
    final tip = coneTipX(lengthFeet);
    final len = squares(lengthFeet);
    final half = len * tan(coneDegrees * pi / 360);
    final baseX = tip - len;
    return [Offset(tip, 0), Offset(baseX, -half), Offset(baseX, half)];
  }

  /// Radius in squares of the farthest point any drawn outline reaches.
  double get reach {
    var r = 0.0;
    if (rings.shows) r = max(r, squares(rings.largest));
    if (cubes.shows) r = max(r, squares(cubes.largest) / 2 * sqrt2);
    if (cones.shows) {
      for (final size in cones.sizes) {
        for (final p in coneTriangle(size)) {
          r = max(r, p.distance);
        }
      }
    }
    if (centerMark) r = max(r, 0.5);
    return r;
  }

  /// Radius in squares of the disc's edge: [reach] plus [rimMargin], at
  /// least one square.
  double get rimRadius => max(1.0, reach + rimMargin);

  /// Radius in squares the compass marks sit on: midway between the two
  /// largest rings (the disc), else just inside the edge.
  double get markerRadius {
    final s = rings.shows ? rings.sizes : const <double>[];
    if (s.length >= 2) return squares((s[s.length - 1] + s[s.length - 2]) / 2);
    return rimRadius * 0.88;
  }

  /// Angles (radians, 0 = east, clockwise on screen) of the compass marks:
  /// [markers] evenly spaced from east, leaving out any under the ring
  /// labels at the top.
  List<double> get markerAngles {
    if (markers <= 0) return const [];
    final labelsOnTop = rings.shows && rings.labels;
    final out = <double>[];
    for (var i = 0; i < markers; i++) {
      final a = 2 * pi * i / markers;
      // The top is -π/2 (screen y down); skip marks within 14° of it
      final fromTop = ((a + pi / 2) % (2 * pi) + 2 * pi) % (2 * pi);
      if (labelsOnTop && min(fromTop, 2 * pi - fromTop) < 14 * pi / 180) {
        continue;
      }
      out.add(a);
    }
    return out;
  }

  /// [p] (grid squares) moved to what [snap] asks for.
  Offset snapped(Offset p) => switch (snap) {
        DiscSnap.none => p,
        DiscSnap.squareCenters =>
          Offset(p.dx.floorToDouble() + 0.5, p.dy.floorToDouble() + 0.5),
        DiscSnap.squareCorners =>
          Offset(p.dx.roundToDouble(), p.dy.roundToDouble()),
      };

  /// Turns a point of the disc frame (squares) into grid squares on the map.
  Offset toMap(Offset local) {
    final a = rotation * pi / 180;
    return Offset(x + local.dx * cos(a) - local.dy * sin(a),
        y + local.dx * sin(a) + local.dy * cos(a));
  }

  /// Where the turning knob sits, in the disc frame: on the edge, on the
  /// side the cones open to (west) — dragging it aims the cones.
  Offset get knobLocal => Offset(-rimRadius, 0);

  /// A copy with the given fields replaced.
  TemplateDisc copyWith({
    bool? visible,
    double? x,
    double? y,
    double? rotation,
    DiscShapeSet? rings,
    DiscShapeSet? cubes,
    DiscShapeSet? cones,
    DiscConeAnchor? coneAnchor,
    double? coneDegrees,
    bool? centerMark,
    int? markers,
    bool? rim,
    double? tint,
    double? lineWidth,
    double? labelSize,
    DiscSnap? snap,
  }) =>
      TemplateDisc(
        visible: visible ?? this.visible,
        x: x ?? this.x,
        y: y ?? this.y,
        rotation: rotation ?? this.rotation,
        rings: rings ?? this.rings,
        cubes: cubes ?? this.cubes,
        cones: cones ?? this.cones,
        coneAnchor: coneAnchor ?? this.coneAnchor,
        coneDegrees: coneDegrees ?? this.coneDegrees,
        centerMark: centerMark ?? this.centerMark,
        markers: markers ?? this.markers,
        rim: rim ?? this.rim,
        tint: tint ?? this.tint,
        lineWidth: lineWidth ?? this.lineWidth,
        labelSize: labelSize ?? this.labelSize,
        snap: snap ?? this.snap,
      );

  /// This disc's place on the map ([visible], [x], [y], [rotation]) with
  /// [shape]'s look — how the tablet's remembered disc is laid on a game.
  TemplateDisc withShapeOf(TemplateDisc shape) =>
      TemplateDisc.fromJson({...shape.shapeJson(), ...placementJson()});

  /// The look only: everything but [visible], [x], [y], [rotation].
  Map<String, dynamic> shapeJson() => {
        'rings': rings.toJson(),
        'cubes': cubes.toJson(),
        'cones': cones.toJson(),
        'coneAnchor': coneAnchor.name,
        'coneDegrees': coneDegrees,
        'centerMark': centerMark,
        'markers': markers,
        'rim': rim,
        'tint': tint,
        'lineWidth': lineWidth,
        'labelSize': labelSize,
        'snap': snap.name,
      };

  /// The place only: [visible], [x], [y], [rotation].
  Map<String, dynamic> placementJson() =>
      {'visible': visible, 'x': x, 'y': y, 'rotation': rotation};

  /// Everything; see [TemplateDisc.fromJson].
  Map<String, dynamic> toJson() => {...placementJson(), ...shapeJson()};

  /// A key that changes whenever the look changes (not the place) — the
  /// renderer rebuilds its cached outlines and labels on a new key.
  late final String shapeKey = shapeJson().toString();

  /// Reads [toJson] (or [shapeJson]); anything missing or unreadable falls
  /// back to [TemplateDisc.classic], hidden at (0, 0).
  factory TemplateDisc.fromJson(Object? json) {
    final base = TemplateDisc.classic();
    if (json is! Map) return base;
    double dbl(String k, double fallback) =>
        (json[k] as num?)?.toDouble() ?? fallback;
    T byName<T extends Enum>(List<T> values, String k, T fallback) =>
        values.firstWhere((v) => v.name == json[k], orElse: () => fallback);
    return TemplateDisc(
      visible: json['visible'] as bool? ?? false,
      x: dbl('x', 0),
      y: dbl('y', 0),
      rotation: dbl('rotation', 0),
      rings: DiscShapeSet.fromJson(json['rings'], base.rings),
      cubes: DiscShapeSet.fromJson(json['cubes'], base.cubes),
      cones: DiscShapeSet.fromJson(json['cones'], base.cones),
      coneAnchor: byName(DiscConeAnchor.values, 'coneAnchor', base.coneAnchor),
      coneDegrees: dbl('coneDegrees', base.coneDegrees).clamp(10, 170),
      centerMark: json['centerMark'] as bool? ?? base.centerMark,
      markers: ((json['markers'] as num?)?.toInt() ?? base.markers).clamp(0, 36),
      rim: json['rim'] as bool? ?? base.rim,
      tint: dbl('tint', base.tint).clamp(0, 0.8),
      lineWidth: dbl('lineWidth', base.lineWidth).clamp(0.01, 0.3),
      labelSize: dbl('labelSize', base.labelSize).clamp(0.08, 0.8),
      snap: byName(DiscSnap.values, 'snap', base.snap),
    );
  }
}
