import 'dart:typed_data';
import 'dart:ui';

/// Parsed Universal VTT map (`.dd2vtt` / `.uvtt` format).
///
/// Contains everything needed to render a battlemap: the embedded image,
/// grid resolution, wall geometry (line of sight), interactive portals
/// (doors/gates), light sources, and environment settings.
///
/// Instances are created by [UvttParser.parse] from raw JSON file bytes.
///
/// See also:
/// * [UvttParser], which decodes `.dd2vtt` files into [UvttMap] instances.
/// * [VttState.loadMap], which stores the parsed map and initializes game state.
/// * [VttGame], the Flame engine game that renders the map.
class UvttMap {
  /// UVTT format version number (e.g. `0.3`).
  final double format;

  /// Grid resolution metadata: origin offset, grid dimensions, and pixels per grid square.
  final UvttResolution resolution;

  /// Wall polylines for line-of-sight calculations.
  ///
  /// Each inner list is a connected polyline of [UvttPoint]s in grid-square
  /// coordinates. These represent immovable walls baked into the map.
  final List<List<UvttPoint>> lineOfSight;

  /// Object wall polylines (e.g. furniture, pillars).
  ///
  /// Same format as [lineOfSight] but for movable or secondary obstacles.
  final List<List<UvttPoint>> objectsLineOfSight;

  /// Interactive portals (doors, gates, windows).
  ///
  /// Each [UvttPortal] has a position, bounding segment, rotation, and
  /// open/closed state. The DM can toggle portals during gameplay.
  final List<UvttPortal> portals;

  /// Light sources placed on the map.
  final List<UvttLight> lights;

  /// Global environment settings (ambient light, baked lighting flag).
  final UvttEnvironment environment;

  /// Raw PNG/JPEG bytes of the map background image.
  ///
  /// Decoded from the base64 `"image"` field in the `.dd2vtt` file.
  final Uint8List imageBytes;

  /// Creates a [UvttMap] with all parsed components.
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

  /// Total map width in pixels.
  ///
  /// Computed as `resolution.mapSize.dx * resolution.pixelsPerGrid`.
  double get pixelWidth => resolution.mapSize.dx * resolution.pixelsPerGrid;

  /// Total map height in pixels.
  ///
  /// Computed as `resolution.mapSize.dy * resolution.pixelsPerGrid`.
  double get pixelHeight => resolution.mapSize.dy * resolution.pixelsPerGrid;
}

/// Grid resolution metadata for a [UvttMap].
///
/// Defines the coordinate system: where the grid origin sits, how many
/// grid squares the map spans, and how many image pixels each grid square
/// occupies.
class UvttResolution {
  /// Origin offset of the grid in grid-square coordinates.
  ///
  /// Usually `(0, 0)` but some maps have non-zero origins.
  final Offset mapOrigin;

  /// Map dimensions in grid squares (columns as `dx`, rows as `dy`).
  final Offset mapSize;

  /// Number of image pixels per grid square.
  ///
  /// Used to convert between grid coordinates and pixel coordinates.
  final int pixelsPerGrid;

  /// Creates a [UvttResolution] with the given grid parameters.
  UvttResolution({
    required this.mapOrigin,
    required this.mapSize,
    required this.pixelsPerGrid,
  });

  /// Deserializes from the `"resolution"` JSON object in a `.dd2vtt` file.
  ///
  /// Expects keys `map_origin` (with `x`/`y`), `map_size` (with `x`/`y`),
  /// and `pixels_per_grid`.
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
///
/// Used throughout the UVTT data model for wall vertices, portal bounds,
/// and light positions. Grid coordinates are floating-point to allow
/// sub-cell precision (e.g. a wall that starts at the midpoint of a cell).
///
/// Use [toPixelOffset] to convert to pixel coordinates for rendering.
class UvttPoint {
  /// Horizontal position in grid squares.
  final double x;

  /// Vertical position in grid squares.
  final double y;

  /// Creates a [UvttPoint] at the given grid coordinates.
  UvttPoint(this.x, this.y);

  /// Deserializes from a JSON object with `x` and `y` keys.
  factory UvttPoint.fromJson(Map<String, dynamic> json) => UvttPoint(
        (json['x'] as num).toDouble(),
        (json['y'] as num).toDouble(),
      );

  /// Converts this grid-coordinate point to a pixel-coordinate [Offset].
  ///
  /// Multiplies both [x] and [y] by [pixelsPerGrid].
  Offset toPixelOffset(int pixelsPerGrid) =>
      Offset(x * pixelsPerGrid, y * pixelsPerGrid);
}

/// An interactive portal (door, gate, or window) on the map.
///
/// Portals are line segments that can be toggled open or closed by the DM
/// during gameplay. Their visual state is tracked in [VttState.openPortals].
///
/// The portal's clickable/tappable area is defined by [bounds] (two
/// endpoints of the door segment). The [position] is the center point
/// and [rotation] is the door's angle in radians.
///
/// See also:
/// * [PortalComponent], which renders the portal on the Flame canvas.
/// * [VttState.togglePortal], which opens or closes a portal by index.
class UvttPortal {
  /// Center position of the portal in grid coordinates.
  final UvttPoint position;

  /// Two endpoints defining the door segment, in grid coordinates.
  final List<UvttPoint> bounds;

  /// Rotation angle of the portal in radians.
  final double rotation;

  /// Whether the portal is closed (locked/shut) in the source file.
  ///
  /// This is the default state from the `.dd2vtt` file. Runtime state
  /// is tracked separately in [VttState.openPortals].
  final bool closed;

  /// Whether this portal is freestanding (not attached to a wall).
  final bool freestanding;

  /// Creates a [UvttPortal] with the given geometry and state.
  UvttPortal({
    required this.position,
    required this.bounds,
    required this.rotation,
    required this.closed,
    required this.freestanding,
  });

  /// Deserializes from a JSON object in the `"portals"` array.
  ///
  /// Expects keys `position`, `bounds` (array of point objects),
  /// `rotation`, `closed`, and `freestanding`.
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

/// A light source placed on the map.
///
/// Lights define position, range, intensity, color, and whether they
/// cast shadows. Currently used for metadata; dynamic lighting rendering
/// is planned for a future release.
class UvttLight {
  /// Position of the light source in grid coordinates.
  final UvttPoint position;

  /// Light range in grid squares.
  final double range;

  /// Light intensity (0.0 = off, 1.0 = full brightness).
  final double intensity;

  /// Light color.
  final Color color;

  /// Whether this light casts shadows against walls.
  final bool shadows;

  /// Creates a [UvttLight] with the given properties.
  UvttLight({
    required this.position,
    required this.range,
    required this.intensity,
    required this.color,
    required this.shadows,
  });

  /// Deserializes from a JSON object in the `"lights"` array.
  ///
  /// Expects keys `position`, `range`, `intensity`, `color` (ARGB hex
  /// string like `"ffffffff"`), and optionally `shadows` (defaults to `false`).
  factory UvttLight.fromJson(Map<String, dynamic> json) => UvttLight(
        position: UvttPoint.fromJson(json['position'] as Map<String, dynamic>),
        range: (json['range'] as num).toDouble(),
        intensity: (json['intensity'] as num).toDouble(),
        color: _parseColor(json['color'] as String),
        shadows: json['shadows'] as bool? ?? false,
      );

  /// Parses an ARGB hex color string (e.g. `"ffffffff"`) into a [Color].
  static Color _parseColor(String hex) {
    // UVTT uses ARGB hex strings like "ffffffff"
    final value = int.tryParse(hex, radix: 16) ?? 0xFFFFFFFF;
    return Color(value);
  }
}

/// Global environment settings for a [UvttMap].
///
/// Controls whether the map image has pre-baked lighting and what the
/// ambient light color/level is.
class UvttEnvironment {
  /// Whether the map image already includes baked lighting.
  ///
  /// When `true`, dynamic lighting should avoid double-brightening
  /// already-lit areas.
  final bool bakedLighting;

  /// Ambient light color applied to the entire map.
  ///
  /// Typically white (`0xFFFFFFFF`) for fully lit maps or a tinted color
  /// for mood lighting.
  final Color ambientLight;

  /// Creates a [UvttEnvironment] with the given settings.
  UvttEnvironment({
    required this.bakedLighting,
    required this.ambientLight,
  });

  /// Deserializes from the `"environment"` JSON object.
  ///
  /// Both fields are optional and fall back to safe defaults:
  /// [bakedLighting] defaults to `false`, [ambientLight] defaults to
  /// opaque white.
  factory UvttEnvironment.fromJson(Map<String, dynamic> json) =>
      UvttEnvironment(
        bakedLighting: json['baked_lighting'] as bool? ?? false,
        ambientLight: _parseColor(json['ambient_light'] as String? ?? 'ffffffff'),
      );

  /// Parses an ARGB hex color string (e.g. `"ffffffff"`) into a [Color].
  static Color _parseColor(String hex) {
    final value = int.tryParse(hex, radix: 16) ?? 0xFFFFFFFF;
    return Color(value);
  }
}
