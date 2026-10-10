import 'dart:ui';

/// A single freehand drawing stroke on the battlemap.
///
/// Each stroke is a polyline defined by a list of [points] in world
/// (pixel) coordinates, rendered with the given [color] and line [width].
/// Strokes are immutable once finalized and stored in [VttState.strokes].
///
/// During active drawing, a temporary live stroke is held in
/// [VttState.liveStroke] and rendered by [LiveStrokeComponent].
///
/// Strokes are JSON-serializable for WebSocket relay sync.
///
/// See also:
/// * [VttState.addStroke], which finalizes and stores a completed stroke.
/// * [VttState.liveStroke], the in-progress stroke preview.
class DrawStroke {
  /// Ordered list of points forming the polyline, in world pixel coordinates.
  final List<Offset> points;

  /// Color used to render this stroke.
  final Color color;

  /// Line width in world pixels.
  final double width;

  /// Creates a [DrawStroke] with the given [points], [color], and [width].
  DrawStroke({
    required this.points,
    required this.color,
    required this.width,
  });

  /// Serializes this stroke to a JSON-compatible map.
  ///
  /// Each point is encoded as a `[dx, dy]` array. The [color] is encoded
  /// as an 8-character ARGB hex string.
  Map<String, dynamic> toJson() => {
        'points': points.map((p) => [p.dx, p.dy]).toList(),
        'color': color.toARGB32().toRadixString(16).padLeft(8, '0'),
        'width': width,
      };

  /// Deserializes a [DrawStroke] from a JSON map.
  ///
  /// Expects keys `points` (list of `[x, y]` arrays), `color` (hex string),
  /// and `width` (number).
  factory DrawStroke.fromJson(Map<String, dynamic> json) => DrawStroke(
        points: (json['points'] as List)
            .map((p) =>
                Offset((p[0] as num).toDouble(), (p[1] as num).toDouble()))
            .toList(),
        color: Color(int.parse(json['color'] as String, radix: 16)),
        width: (json['width'] as num).toDouble(),
      );
}
