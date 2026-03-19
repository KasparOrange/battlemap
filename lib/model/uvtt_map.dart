import 'dart:typed_data';
import 'dart:ui';

/// Parsed Universal VTT map (.dd2vtt / .uvtt).
class UvttMap {
  final double format;
  final UvttResolution resolution;
  final List<List<UvttPoint>> lineOfSight;
  final List<List<UvttPoint>> objectsLineOfSight;
  final List<UvttPortal> portals;
  final List<UvttLight> lights;
  final UvttEnvironment environment;
  final Uint8List imageBytes;

  UvttMap({
    required this.format,
    required this.resolution,
    required this.lineOfSight,
    required this.objectsLineOfSight,
    required this.portals,
    required this.lights,
    required this.environment,
    required this.imageBytes,
  });

  /// Map width in pixels.
  double get pixelWidth => resolution.mapSize.dx * resolution.pixelsPerGrid;

  /// Map height in pixels.
  double get pixelHeight => resolution.mapSize.dy * resolution.pixelsPerGrid;
}

class UvttResolution {
  final Offset mapOrigin;
  final Offset mapSize; // in grid squares
  final int pixelsPerGrid;

  UvttResolution({
    required this.mapOrigin,
    required this.mapSize,
    required this.pixelsPerGrid,
  });

  factory UvttResolution.fromJson(Map<String, dynamic> json) {
    final origin = json['map_origin'] as Map<String, dynamic>;
    final size = json['map_size'] as Map<String, dynamic>;
    return UvttResolution(
      mapOrigin: Offset(
        (origin['x'] as num).toDouble(),
        (origin['y'] as num).toDouble(),
      ),
      mapSize: Offset(
        (size['x'] as num).toDouble(),
        (size['y'] as num).toDouble(),
      ),
      pixelsPerGrid: (json['pixels_per_grid'] as num).toInt(),
    );
  }
}

/// A 2D point in grid-square coordinates.
class UvttPoint {
  final double x;
  final double y;

  UvttPoint(this.x, this.y);

  factory UvttPoint.fromJson(Map<String, dynamic> json) => UvttPoint(
        (json['x'] as num).toDouble(),
        (json['y'] as num).toDouble(),
      );

  Offset toPixelOffset(int pixelsPerGrid) =>
      Offset(x * pixelsPerGrid, y * pixelsPerGrid);
}

class UvttPortal {
  final UvttPoint position;
  final List<UvttPoint> bounds;
  final double rotation; // radians
  final bool closed;
  final bool freestanding;

  UvttPortal({
    required this.position,
    required this.bounds,
    required this.rotation,
    required this.closed,
    required this.freestanding,
  });

  factory UvttPortal.fromJson(Map<String, dynamic> json) => UvttPortal(
        position: UvttPoint.fromJson(json['position'] as Map<String, dynamic>),
        bounds: (json['bounds'] as List)
            .map((p) => UvttPoint.fromJson(p as Map<String, dynamic>))
            .toList(),
        rotation: (json['rotation'] as num).toDouble(),
        closed: json['closed'] as bool,
        freestanding: json['freestanding'] as bool,
      );
}

class UvttLight {
  final UvttPoint position;
  final double range;
  final double intensity;
  final Color color;
  final bool shadows;

  UvttLight({
    required this.position,
    required this.range,
    required this.intensity,
    required this.color,
    required this.shadows,
  });

  factory UvttLight.fromJson(Map<String, dynamic> json) => UvttLight(
        position: UvttPoint.fromJson(json['position'] as Map<String, dynamic>),
        range: (json['range'] as num).toDouble(),
        intensity: (json['intensity'] as num).toDouble(),
        color: _parseColor(json['color'] as String),
        shadows: json['shadows'] as bool? ?? false,
      );

  static Color _parseColor(String hex) {
    // UVTT uses ARGB hex strings like "ffffffff"
    final value = int.tryParse(hex, radix: 16) ?? 0xFFFFFFFF;
    return Color(value);
  }
}

class UvttEnvironment {
  final bool bakedLighting;
  final Color ambientLight;

  UvttEnvironment({
    required this.bakedLighting,
    required this.ambientLight,
  });

  factory UvttEnvironment.fromJson(Map<String, dynamic> json) =>
      UvttEnvironment(
        bakedLighting: json['baked_lighting'] as bool? ?? false,
        ambientLight: _parseColor(json['ambient_light'] as String? ?? 'ffffffff'),
      );

  static Color _parseColor(String hex) {
    final value = int.tryParse(hex, radix: 16) ?? 0xFFFFFFFF;
    return Color(value);
  }
}
