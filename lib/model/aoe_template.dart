/// Geometric shapes available for area-of-effect templates.
///
/// Each shape determines how the template is rendered and how its
/// [AoeTemplate.radius] and [AoeTemplate.angle] are interpreted:
///
/// * [circle] -- filled circle centered on origin, radius in grid squares.
/// * [cone] -- 90-degree arc from origin in the [AoeTemplate.angle] direction.
/// * [line] -- 5ft-wide (1 grid square) rectangle from origin in the
///   [AoeTemplate.angle] direction, length = radius.
/// * [square] -- axis-aligned square centered on origin, side = 2 * radius.
enum AoeShape {
  /// Filled circle centered on origin.
  circle,

  /// 90-degree cone from origin in the given angle direction.
  cone,

  /// 5ft-wide line (1 grid square) from origin in the given angle direction.
  line,

  /// Axis-aligned square centered on origin.
  square,
}

/// An area-of-effect template placed on the map for spell/ability targeting.
///
/// Templates are positioned in grid coordinates and rendered as a
/// semi-transparent overlay by [AoeTemplateComponent]. The DM places
/// them via the companion phone's AoE controls.
///
/// See also:
/// - [AoeShape], the available geometric shapes.
/// - [AoeTemplateComponent], which renders the template on the Flame canvas.
/// - [VttState.activeAoe], which holds the currently active template.
class AoeTemplate {
  /// The geometric shape of this template.
  final AoeShape shape;

  /// X-coordinate of the template origin in grid squares.
  final double originX;

  /// Y-coordinate of the template origin in grid squares.
  final double originY;

  /// Radius (or length) of the template in grid squares.
  ///
  /// Interpretation depends on [shape]:
  /// * [AoeShape.circle] -- circle radius in grid squares.
  /// * [AoeShape.cone] -- cone reach in grid squares.
  /// * [AoeShape.line] -- line length in grid squares.
  /// * [AoeShape.square] -- half the side length (side = 2 * radius).
  final double radius;

  /// Direction angle in radians for directional shapes.
  ///
  /// Used by [AoeShape.cone] and [AoeShape.line] to orient the template.
  /// Ignored for [AoeShape.circle] and [AoeShape.square].
  final double angle;

  /// Creates an [AoeTemplate] with the given [shape], position, and dimensions.
  ///
  /// The [originX] and [originY] are in grid coordinates. The [radius] is
  /// in grid squares. The [angle] defaults to 0 and is only meaningful for
  /// cone and line shapes.
  AoeTemplate({
    required this.shape,
    required this.originX,
    required this.originY,
    required this.radius,
    this.angle = 0,
  });

  /// Serializes this template to a JSON-compatible map.
  ///
  /// The [shape] is stored as its enum name string. All numeric fields are
  /// stored as doubles.
  ///
  /// See also:
  /// - [AoeTemplate.fromJson], the inverse operation.
  Map<String, dynamic> toJson() => {
        'shape': shape.name,
        'originX': originX,
        'originY': originY,
        'radius': radius,
        'angle': angle,
      };

  /// Deserializes an [AoeTemplate] from a JSON map.
  ///
  /// Falls back to [AoeShape.circle] if the shape name is unrecognized,
  /// and to angle `0` if the angle field is missing.
  ///
  /// See also:
  /// - [AoeTemplate.toJson], the inverse operation.
  factory AoeTemplate.fromJson(Map<String, dynamic> json) => AoeTemplate(
        shape: AoeShape.values.firstWhere(
          (s) => s.name == json['shape'],
          orElse: () => AoeShape.circle,
        ),
        originX: (json['originX'] as num).toDouble(),
        originY: (json['originY'] as num).toDouble(),
        radius: (json['radius'] as num).toDouble(),
        angle: (json['angle'] as num?)?.toDouble() ?? 0,
      );
}
