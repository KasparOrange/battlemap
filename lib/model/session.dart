/// Feature toggles controlling which tools and visual layers are enabled
/// during a game session.
///
/// A [SessionSettings] instance lives inside each [Session] and determines
/// what the DM sees in the control panel and what renders on the TV.
/// Templates ([penAndPaper], [digital]) provide convenient presets.
///
/// Toggle categories:
/// - **Map** -- Fog of War, Shadow Mode, Drawing Tools, Door Toggles
/// - **Tools** -- Tokens, Measure, Ruler
/// - **Combat** -- HP Bars, Conditions, AoE Templates, Initiative Tracker
/// - **Atmosphere** -- Ambient Sound, Weather Effects, Light Animations
///
/// See also:
/// * [Session], which owns a [Session.settings] field.
/// * `DmControlPanel`, which reads these flags to show/hide tabs.
class SessionSettings {
  // ── Pen & Paper features (map visuals + DM tools) ───────────────

  /// Whether fog of war is available for this session.
  bool fogOfWar;

  /// Whether shadow (preview) painting mode is available.
  bool shadowMode;

  /// Whether freehand drawing tools are available.
  bool drawingTools;

  /// Whether digital token placement is enabled.
  ///
  /// Typically `false` in pen-and-paper mode (physical miniatures are used).
  bool tokens;

  /// Whether the distance measurement tool is available.
  bool measureTool;

  /// Whether the L-shaped ruler overlay is available.
  bool ruler;

  /// Whether door/portal toggles are shown in the DM panel.
  bool doorToggles;

  // ── Digital features (game mechanics) ───────────────────────────

  /// Whether HP bars are rendered on tokens.
  bool hpBars;

  /// Whether condition indicators (colored dots) are rendered on tokens.
  bool conditions;

  /// Whether area-of-effect template tools are available.
  bool aoeTemplates;

  /// Whether the initiative tracker is available (future feature).
  bool initiativeTracker;

  // ── Atmosphere ────────────────────────────────────────────────────

  /// Whether ambient sound effects are enabled (future feature).
  bool ambientSound;

  /// Whether weather overlay effects are enabled (future feature).
  bool weatherEffects;

  /// Whether animated lighting effects are enabled (future feature).
  bool lightAnimations;

  /// Fog rendering mode: `'standard'`, `'soft'`, `'cloud'`, or `'atmospheric'`.
  ///
  /// Controls how the fog-of-war layer is drawn on the map:
  /// - `standard` -- sharp-edged cells with slight blur (default).
  /// - `soft` -- same as standard but with a much wider blur radius.
  /// - `cloud` -- organic cloud-shaped edges with animated bumps.
  /// - `atmospheric` -- gradient opacity based on distance from revealed cells.
  String fogMode;

  /// Whether fog retraction is animated (cells fade out when revealed).
  bool fogAnimation;

  /// Whether global visual effects (flash, shake, fade, etc.) are enabled.
  bool globalEffects;

  /// Creates a [SessionSettings] with the given toggles.
  ///
  /// All parameters default to the Pen & Paper preset values.
  SessionSettings({
    this.fogOfWar = true,
    this.shadowMode = false,
    this.drawingTools = true,
    this.tokens = false,
    this.measureTool = true,
    this.ruler = false,
    this.doorToggles = true,
    this.hpBars = false,
    this.conditions = false,
    this.aoeTemplates = false,
    this.initiativeTracker = false,
    this.ambientSound = false,
    this.weatherEffects = false,
    this.lightAnimations = false,
    this.fogMode = 'standard',
    this.fogAnimation = true,
    this.globalEffects = true,
  });

  /// Creates the "Pen & Paper" preset.
  ///
  /// Designed for physical miniatures on a TV table: fog, drawing,
  /// measurement, and doors are on; tokens and digital combat features
  /// are off.
  factory SessionSettings.penAndPaper() => SessionSettings(
        fogOfWar: true,
        shadowMode: false,
        drawingTools: true,
        tokens: false,
        measureTool: true,
        ruler: false,
        doorToggles: true,
        hpBars: false,
        conditions: false,
        aoeTemplates: false,
        initiativeTracker: false,
        ambientSound: false,
        weatherEffects: false,
        lightAnimations: false,
        fogMode: 'standard',
        fogAnimation: true,
        globalEffects: true,
      );

  /// Creates the "Digital" preset.
  ///
  /// All interactive tools are on including tokens, HP bars, conditions,
  /// and AoE templates -- intended for fully digital play.
  factory SessionSettings.digital() => SessionSettings(
        fogOfWar: true,
        shadowMode: false,
        drawingTools: true,
        tokens: true,
        measureTool: true,
        ruler: false,
        doorToggles: true,
        hpBars: true,
        conditions: true,
        aoeTemplates: true,
        initiativeTracker: false,
        ambientSound: false,
        weatherEffects: false,
        lightAnimations: false,
        fogMode: 'standard',
        fogAnimation: true,
        globalEffects: true,
      );

  /// Serializes these settings to a JSON-compatible map.
  Map<String, dynamic> toJson() => {
        'fogOfWar': fogOfWar,
        'shadowMode': shadowMode,
        'drawingTools': drawingTools,
        'tokens': tokens,
        'measureTool': measureTool,
        'ruler': ruler,
        'doorToggles': doorToggles,
        'hpBars': hpBars,
        'conditions': conditions,
        'aoeTemplates': aoeTemplates,
        'initiativeTracker': initiativeTracker,
        'ambientSound': ambientSound,
        'weatherEffects': weatherEffects,
        'lightAnimations': lightAnimations,
        'fogMode': fogMode,
        'fogAnimation': fogAnimation,
        'globalEffects': globalEffects,
      };

  /// Deserializes a [SessionSettings] from a JSON map.
  ///
  /// All fields fall back to their Pen & Paper defaults if absent,
  /// for backwards compatibility with sessions saved before settings
  /// were introduced.
  factory SessionSettings.fromJson(Map<String, dynamic> json) =>
      SessionSettings(
        fogOfWar: json['fogOfWar'] as bool? ?? true,
        shadowMode: json['shadowMode'] as bool? ?? false,
        drawingTools: json['drawingTools'] as bool? ?? true,
        tokens: json['tokens'] as bool? ?? false,
        measureTool: json['measureTool'] as bool? ?? true,
        ruler: json['ruler'] as bool? ?? false,
        doorToggles: json['doorToggles'] as bool? ?? true,
        hpBars: json['hpBars'] as bool? ?? false,
        conditions: json['conditions'] as bool? ?? false,
        aoeTemplates: json['aoeTemplates'] as bool? ?? false,
        initiativeTracker: json['initiativeTracker'] as bool? ?? false,
        ambientSound: json['ambientSound'] as bool? ?? false,
        weatherEffects: json['weatherEffects'] as bool? ?? false,
        lightAnimations: json['lightAnimations'] as bool? ?? false,
        fogMode: json['fogMode'] as String? ?? 'standard',
        fogAnimation: json['fogAnimation'] as bool? ?? true,
        globalEffects: json['globalEffects'] as bool? ?? true,
      );

  /// Creates a deep copy of these settings.
  SessionSettings copy() => SessionSettings(
        fogOfWar: fogOfWar,
        shadowMode: shadowMode,
        drawingTools: drawingTools,
        tokens: tokens,
        measureTool: measureTool,
        ruler: ruler,
        doorToggles: doorToggles,
        hpBars: hpBars,
        conditions: conditions,
        aoeTemplates: aoeTemplates,
        initiativeTracker: initiativeTracker,
        ambientSound: ambientSound,
        weatherEffects: weatherEffects,
        lightAnimations: lightAnimations,
        fogMode: fogMode,
        fogAnimation: fogAnimation,
        globalEffects: globalEffects,
      );
}

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

  /// Whether this session is for a PDF map rather than a `.dd2vtt` map.
  ///
  /// When `true`, session resume must render the PDF bytes to a PNG via
  /// `PdfHelper.renderPdfPage` before calling [VttState.loadPdfAsMap].
  ///
  /// Mutually exclusive with [isImageSession]: a session is either a PDF,
  /// an image, or a UVTT map.
  ///
  /// See also:
  /// * [MapLibraryEntry.isPdf], the corresponding flag on the map entry.
  bool isPdfSession;

  /// Whether this session is for a raster image map (PNG/JPG/WEBP).
  ///
  /// When `true`, session resume can pass the bytes straight to
  /// [VttState.loadPdfAsMap] without going through PDF rendering.
  /// Distinguishing this from [isPdfSession] is critical: rendering an
  /// image as if it were a PDF fails and breaks resume.
  ///
  /// See also:
  /// * [MapLibraryEntry.isImage], the corresponding flag on the map entry.
  bool isImageSession;

  /// Whether the L-shaped ruler overlay is visible.
  bool rulerVisible;

  /// Ruler corner X position in grid coordinates.
  double rulerX;

  /// Ruler corner Y position in grid coordinates.
  double rulerY;

  /// Ruler rotation in degrees (0, 90, 180, or 270).
  int rulerRotation;

  /// Scale slider factor for fine-tune zoom adjustment (0.5 to 2.0).
  double scaleSliderFactor;

  /// Feature toggles controlling which tools and visual layers are enabled.
  ///
  /// Defaults to [SessionSettings.penAndPaper] if not provided.
  ///
  /// See also:
  /// * [SessionSettings], the model class with all toggle fields.
  SessionSettings settings;

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
  /// Set [isPdfSession] to `true` for sessions created from PDF maps.
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
    this.isPdfSession = false,
    this.isImageSession = false,
    this.rulerVisible = false,
    this.rulerX = 0,
    this.rulerY = 0,
    this.rulerRotation = 0,
    this.scaleSliderFactor = 1.0,
    SessionSettings? settings,
    this.cameraX = 0,
    this.cameraY = 0,
    this.cameraZoom = 1,
    this.cameraAngle = 0,
  }) : settings = settings ?? SessionSettings.penAndPaper();

  /// Serializes this session to a JSON-compatible map.
  ///
  /// Timestamps are encoded as ISO 8601 strings. Token and stroke data
  /// are stored as raw JSON maps (already serialized by their respective
  /// `toJson` methods). The [isPdfSession] flag is always included for
  /// forward compatibility.
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
        'isPdfSession': isPdfSession,
        'isImageSession': isImageSession,
        'rulerVisible': rulerVisible,
        'rulerX': rulerX,
        'rulerY': rulerY,
        'rulerRotation': rulerRotation,
        'scaleSliderFactor': scaleSliderFactor,
        'settings': settings.toJson(),
        'cameraX': cameraX,
        'cameraY': cameraY,
        'cameraZoom': cameraZoom,
        'cameraAngle': cameraAngle,
      };

  /// Deserializes a [Session] from a JSON map.
  ///
  /// Expects keys matching [toJson] output. Fields added after the initial
  /// schema ([tokenData], [strokeData], [drawColorValue], [drawWidth],
  /// [interactionMode], [isPdfSession]) fall back to defaults if absent,
  /// for backwards compatibility with older saved sessions.
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
        isPdfSession: json['isPdfSession'] as bool? ?? false,
        isImageSession: json['isImageSession'] as bool? ?? false,
        rulerVisible: json['rulerVisible'] as bool? ?? false,
        rulerX: (json['rulerX'] as num?)?.toDouble() ?? 0,
        rulerY: (json['rulerY'] as num?)?.toDouble() ?? 0,
        rulerRotation: json['rulerRotation'] as int? ?? 0,
        scaleSliderFactor: (json['scaleSliderFactor'] as num?)?.toDouble() ?? 1.0,
        settings: json['settings'] != null
            ? SessionSettings.fromJson(json['settings'] as Map<String, dynamic>)
            : null,
        cameraX: (json['cameraX'] as num).toDouble(),
        cameraY: (json['cameraY'] as num).toDouble(),
        cameraZoom: (json['cameraZoom'] as num).toDouble(),
        cameraAngle: (json['cameraAngle'] as num).toDouble(),
      );
}
