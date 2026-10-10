import 'dart:convert';

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

  /// Legacy switch for digital token placement. Tokens are always on now
  /// (they remember where miniatures and monsters stand, also at the
  /// tabletop): the companion's Tokens tab no longer reads this and the
  /// settings dialog no longer shows it. Kept for the presets and old
  /// session files.
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
/// A session plays one map at a time — [mapId] (a [MapLibraryEntry.id]) —
/// and can hold several ([mapIds]; the others wait in [parkedMaps] with
/// their own fog, tokens and drawings, see [switchTo]). Multiple sessions
/// can reference the same map (e.g. different encounters on the same
/// dungeon level).
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

  // --- Table view ---

  /// How the TV framed the map ([TvCameraMode] name): `table` (one inch
  /// per square, the default — also for sessions saved before 1.1.9),
  /// `fit` or `free`.
  String tvCameraMode;

  /// First map column of the TV's table window, or `null` = centred.
  int? tableCol;

  /// First map row of the TV's table window, or `null` = centred.
  int? tableRow;

  /// How this game's map goes on the table: its scale, the TV calibration
  /// it was computed for, and whether battlemap draws its own grid
  /// ([MapFit.toJson]). Written by the TV on every save; informational —
  /// the TV recomputes the scale on load. `null` in sessions saved before
  /// 1.1.9.
  Map<String, dynamic>? mapFit;

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

  /// The AoE template disc of this map ([TemplateDisc.toJson]: shown or
  /// not, place, turn and look), or `null` (never used: hidden, classic).
  Map<String, dynamic>? templateDisc;

  /// DM-only picture layers (list of [DmOverlay.toJson] maps, bottom layer
  /// first). The TV keeps them for the companion and never renders them.
  List<Map<String, dynamic>> dmOverlayData;

  // --- More than one map per game ---

  /// Every map of this game ([MapLibraryEntry.id]s) in the order they were
  /// added — always contains [mapId], the one on the table right now.
  ///
  /// A game holds several maps (the tower's floors, the town and the
  /// dungeon below it); the DM switches between them in the companion's
  /// Settings tab ([switchTo]). Sessions saved before 2026-10-10 have one.
  List<String> mapIds;

  /// The saved state of every map of this game except the active one, by
  /// map id: the [perMapKeys] of [toJson] (fog, doors, tokens, drawings,
  /// layers, ruler, table window, camera) as they were when the DM switched
  /// away. The fields of the session itself hold the active map's state.
  Map<String, Map<String, dynamic>> parkedMaps;

  /// The [toJson] keys that belong to one map rather than to the game —
  /// what [switchTo] parks and restores. Everything else (name, settings,
  /// brush, draw colour, interaction mode) is the game's and carries over.
  static const List<String> perMapKeys = [
    'revealedCells', 'openPortals', 'showGrid', 'fogEnabled', 'showWalls',
    'tvCameraMode', 'tableCol', 'tableRow', 'mapFit',
    'tokenData', 'strokeData', 'isPdfSession', 'isImageSession',
    'rulerVisible', 'rulerX', 'rulerY', 'rulerRotation', 'templateDisc',
    'dmOverlayData',
    'cameraX', 'cameraY', 'cameraZoom', 'cameraAngle',
  ];

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
    this.tvCameraMode = 'table',
    this.tableCol,
    this.tableRow,
    this.mapFit,
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
    this.templateDisc,
    this.dmOverlayData = const [],
    List<String>? mapIds,
    Map<String, Map<String, dynamic>>? parkedMaps,
    SessionSettings? settings,
    this.cameraX = 0,
    this.cameraY = 0,
    this.cameraZoom = 1,
    this.cameraAngle = 0,
  })  : settings = settings ?? SessionSettings.penAndPaper(),
        mapIds = mapIds == null || mapIds.isEmpty
            ? [mapId]
            : [...mapIds, if (!mapIds.contains(mapId)) mapId],
        parkedMaps = parkedMaps ?? {};

  /// This game with [targetMapId] on the table: the active map's state is
  /// parked in [parkedMaps] and the target's parked state comes back, or —
  /// for a map new to this game — a fresh start (all fogged, no tokens,
  /// 1-inch table centred) with battlemap's grid per [showGrid] (the map's
  /// [MapLibraryEntry.drawGrid]) and the map kind per [isPdf] / [isImage].
  /// The target joins [mapIds] at the end. Returns this session unchanged
  /// (a copy) when [targetMapId] is already active.
  ///
  /// Pure: the caller saves the result and loads it like a resumed session
  /// (`TvShell._switchMap`).
  Session switchTo(String targetMapId,
      {bool showGrid = true, bool isPdf = false, bool isImage = false}) {
    final json = _jsonCopy();
    if (targetMapId == mapId) return Session.fromJson(json);
    final parked = Map<String, dynamic>.from(json['parkedMaps'] as Map);
    parked[mapId] = {for (final k in perMapKeys) k: json[k]};
    final fresh = Session(
      id: id,
      mapId: targetMapId,
      name: name,
      createdAt: createdAt,
      lastModifiedAt: lastModifiedAt,
      showGrid: showGrid,
      isPdfSession: isPdf,
      isImageSession: isImage,
    ).toJson();
    final target = parked.remove(targetMapId) ??
        {for (final k in perMapKeys) k: fresh[k]};
    json
      ..addAll(target)
      ..['mapId'] = targetMapId
      ..['mapIds'] = [...mapIds, if (!mapIds.contains(targetMapId)) targetMapId]
      ..['parkedMaps'] = parked;
    return Session.fromJson(json);
  }

  /// This game without map [removedMapId] (the map was deleted from the
  /// library), or `null` when it was the game's only map. Removing the
  /// active map puts the first remaining one on the table.
  Session? withoutMap(String removedMapId) {
    if (!mapIds.contains(removedMapId)) return Session.fromJson(_jsonCopy());
    final rest = mapIds.where((m) => m != removedMapId).toList();
    if (rest.isEmpty) return null;
    final base = removedMapId == mapId ? switchTo(rest.first) : this;
    final json = base._jsonCopy();
    (json['parkedMaps'] as Map).remove(removedMapId);
    json['mapIds'] = rest;
    return Session.fromJson(json);
  }

  /// A deep copy of [toJson] — nothing shared with this session's lists.
  Map<String, dynamic> _jsonCopy() =>
      jsonDecode(jsonEncode(toJson())) as Map<String, dynamic>;

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
        'tvCameraMode': tvCameraMode,
        'tableCol': tableCol,
        'tableRow': tableRow,
        'mapFit': mapFit,
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
        if (templateDisc != null) 'templateDisc': templateDisc,
        'dmOverlayData': dmOverlayData,
        'mapIds': mapIds,
        'parkedMaps': parkedMaps,
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
  /// [interactionMode], [isPdfSession], [dmOverlayData], the table view
  /// fields) fall back to defaults if absent,
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
        tvCameraMode: json['tvCameraMode'] as String? ?? 'table',
        tableCol: (json['tableCol'] as num?)?.toInt(),
        tableRow: (json['tableRow'] as num?)?.toInt(),
        mapFit: json['mapFit'] != null
            ? Map<String, dynamic>.from(json['mapFit'] as Map)
            : null,
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
        templateDisc: json['templateDisc'] is Map
            ? Map<String, dynamic>.from(json['templateDisc'] as Map)
            : null,
        dmOverlayData: (json['dmOverlayData'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            const [],
        mapIds: (json['mapIds'] as List?)?.map((e) => e as String).toList(),
        parkedMaps: (json['parkedMaps'] as Map?)?.map((k, v) =>
            MapEntry(k as String, Map<String, dynamic>.from(v as Map))),
        settings: json['settings'] != null
            ? SessionSettings.fromJson(json['settings'] as Map<String, dynamic>)
            : null,
        cameraX: (json['cameraX'] as num).toDouble(),
        cameraY: (json['cameraY'] as num).toDouble(),
        cameraZoom: (json['cameraZoom'] as num).toDouble(),
        cameraAngle: (json['cameraAngle'] as num).toDouble(),
      );
}
