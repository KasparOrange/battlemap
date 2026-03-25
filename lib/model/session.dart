/// A saved gameplay session that references a map and stores all DM state.
///
/// A session captures a complete snapshot of the game at a point in time:
/// which fog cells are revealed, which portals are open, where tokens are
/// placed, what has been drawn, and where the camera is positioned. This
/// allows the DM to save mid-game, close the app, and resume later with
/// everything restored.
///
/// Each session is tied to a specific map via [mapId] (a [MapLibraryEntry.id]).
/// Multiple sessions can reference the same map (e.g. different encounters
/// on the same dungeon level).
///
/// Sessions are JSON-serializable for persistence to disk via [MapLibrary].
///
/// See also:
/// * [VttState], the runtime state object that sessions serialize from / restore to.
/// * [MapLibraryEntry], the map metadata referenced by [mapId].
class Session {
  /// UUID identifying this session.
  final String id;

  /// The [MapLibraryEntry.id] of the map this session is played on.
  final String mapId;

  /// Human-readable session name (e.g. "Goblin Ambush - Round 3").
  String name;

  /// Timestamp when this session was first created.
  final DateTime createdAt;

  /// Timestamp of the most recent save / modification.
  DateTime lastModifiedAt;

  /// Absolute path to a thumbnail screenshot, or `null` if not yet captured.
  String? thumbnailPath;

  // --- VttState snapshot ---

  /// Flat list of revealed fog cell indices.
  ///
  /// Each index encodes a cell as `row * gridCols + col`.
  List<int> revealedCells;

  /// Indices of portals that are currently open (unlocked / ajar).
  List<int> openPortals;

  /// Whether the grid overlay is visible.
  bool showGrid;

  /// Whether fog of war is enabled.
  bool fogEnabled;

  /// Whether wall debug outlines are displayed.
  bool showWalls;

  /// Fog brush radius: 0 = single cell, 1 = 3x3, 2 = 5x5, etc.
  int brushRadius;

  /// `true` to reveal fog on paint, `false` to hide.
  bool revealMode;

  /// Physical TV screen width in inches, used for calibration.
  ///
  /// `null` if calibration has not been performed.
  double? tvWidthInches;

  /// Computed base zoom level that maps one grid square to one physical inch.
  ///
  /// `null` if calibration has not been performed.
  double? calibratedBaseZoom;

  // --- Token / drawing / interaction state ---

  /// Serialized token data (list of [MapToken.toJson] maps).
  List<Map<String, dynamic>> tokenData;

  /// Serialized stroke data (list of [DrawStroke.toJson] maps).
  List<Map<String, dynamic>> strokeData;

  /// ARGB color value for the drawing tool.
  int drawColorValue;

  /// Stroke width for the drawing tool, in world pixels.
  double drawWidth;

  /// Name of the active [InteractionMode] (`'fogReveal'`, `'draw'`, or `'token'`).
  String interactionMode;

  // --- Camera snapshot ---

  /// Camera X position (world coordinates).
  double cameraX;

  /// Camera Y position (world coordinates).
  double cameraY;

  /// Camera zoom level.
  double cameraZoom;

  /// Camera rotation angle in radians.
  double cameraAngle;

  /// Creates a [Session] with the given parameters.
  ///
  /// Most fields have sensible defaults matching a fresh game start:
  /// fog enabled, grid visible, no revealed cells, no tokens, camera at origin.
  Session({
    required this.id,
    required this.mapId,
    required this.name,
    required this.createdAt,
    required this.lastModifiedAt,
    this.thumbnailPath,
    this.revealedCells = const [],
    this.openPortals = const [],
    this.showGrid = true,
    this.fogEnabled = true,
    this.showWalls = false,
    this.brushRadius = 1,
    this.revealMode = true,
    this.tvWidthInches,
    this.calibratedBaseZoom,
    this.tokenData = const [],
    this.strokeData = const [],
    this.drawColorValue = 0xFFE53935,
    this.drawWidth = 3.0,
    this.interactionMode = 'fogReveal',
    this.cameraX = 0,
    this.cameraY = 0,
    this.cameraZoom = 1,
    this.cameraAngle = 0,
  });

  /// Serializes this session to a JSON-compatible map.
  ///
  /// Timestamps are encoded as ISO 8601 strings. Token and stroke data
  /// are stored as raw JSON maps (already serialized by their respective
  /// `toJson` methods).
  Map<String, dynamic> toJson() => {
        'id': id,
        'mapId': mapId,
        'name': name,
        'createdAt': createdAt.toIso8601String(),
        'lastModifiedAt': lastModifiedAt.toIso8601String(),
        'thumbnailPath': thumbnailPath,
        'revealedCells': revealedCells,
        'openPortals': openPortals,
        'showGrid': showGrid,
        'fogEnabled': fogEnabled,
        'showWalls': showWalls,
        'brushRadius': brushRadius,
        'revealMode': revealMode,
        'tvWidthInches': tvWidthInches,
        'calibratedBaseZoom': calibratedBaseZoom,
        'tokenData': tokenData,
        'strokeData': strokeData,
        'drawColorValue': drawColorValue,
        'drawWidth': drawWidth,
        'interactionMode': interactionMode,
        'cameraX': cameraX,
        'cameraY': cameraY,
        'cameraZoom': cameraZoom,
        'cameraAngle': cameraAngle,
      };

  /// Deserializes a [Session] from a JSON map.
  ///
  /// Expects keys matching [toJson] output. Fields added after the initial
  /// schema ([tokenData], [strokeData], [drawColorValue], [drawWidth],
  /// [interactionMode]) fall back to defaults if absent, for backwards
  /// compatibility with older saved sessions.
  factory Session.fromJson(Map<String, dynamic> json) => Session(
        id: json['id'] as String,
        mapId: json['mapId'] as String,
        name: json['name'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        lastModifiedAt: DateTime.parse(json['lastModifiedAt'] as String),
        thumbnailPath: json['thumbnailPath'] as String?,
        revealedCells:
            (json['revealedCells'] as List).map((e) => e as int).toList(),
        openPortals:
            (json['openPortals'] as List).map((e) => e as int).toList(),
        showGrid: json['showGrid'] as bool,
        fogEnabled: json['fogEnabled'] as bool,
        showWalls: json['showWalls'] as bool,
        brushRadius: json['brushRadius'] as int,
        revealMode: json['revealMode'] as bool,
        tvWidthInches: (json['tvWidthInches'] as num?)?.toDouble(),
        calibratedBaseZoom: (json['calibratedBaseZoom'] as num?)?.toDouble(),
        tokenData: (json['tokenData'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            const [],
        strokeData: (json['strokeData'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            const [],
        drawColorValue: json['drawColorValue'] as int? ?? 0xFFE53935,
        drawWidth: (json['drawWidth'] as num?)?.toDouble() ?? 3.0,
        interactionMode: json['interactionMode'] as String? ?? 'fogReveal',
        cameraX: (json['cameraX'] as num).toDouble(),
        cameraY: (json['cameraY'] as num).toDouble(),
        cameraZoom: (json['cameraZoom'] as num).toDouble(),
        cameraAngle: (json['cameraAngle'] as num).toDouble(),
      );
}
