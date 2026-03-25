import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../model/draw_stroke.dart';
import '../model/map_token.dart';
import '../model/uvtt_map.dart';
import '../model/uvtt_parser.dart';

/// Interaction mode for the VTT -- determines what tap/drag does on the map.
///
/// The DM switches between modes using the control panel. Each mode changes
/// the behavior of single-finger gestures in [VttGame]:
///
/// * [fogReveal] -- tap to toggle a cell, drag to paint fog reveal/hide.
/// * [draw] -- drag to draw freehand strokes on the map.
/// * [token] -- tap to place a token, drag to move an existing token.
///
/// Two-finger gestures always control the camera regardless of mode.
enum InteractionMode {
  /// Fog of war mode: tap toggles a single cell, drag paints with the brush.
  fogReveal,

  /// Drawing mode: drag to create freehand strokes on the map.
  draw,

  /// Token mode: tap an empty cell to place a token, drag to reposition.
  token,
}

/// DM-controlled runtime state for the VTT table display.
///
/// This is the central state object shared between the Flame game engine
/// ([VttGame]), the UI panels ([DmControlPanel], [VttCompanionScreen]),
/// and the network layer ([VttRelayClient]). It extends [ChangeNotifier]
/// so that listeners (Flame components, Flutter widgets) are notified
/// whenever the state changes.
///
/// State is organized into several groups:
/// - **Map data** -- the loaded [UvttMap] and its raw bytes.
/// - **Fog of war** -- which cells are revealed, brush settings, reveal mode.
/// - **Portals** -- which doors/gates are currently open.
/// - **Display toggles** -- grid visibility, fog on/off, wall debug view.
/// - **Calibration** -- physical TV size mapping for accurate grid scale.
/// - **Tokens** -- placed creatures/objects on the grid.
/// - **Drawings** -- freehand strokes and the in-progress live stroke.
/// - **Interaction mode** -- which tool is active (fog, draw, token).
/// - **Relay callbacks** -- hooks for forwarding local changes to the network.
///
/// The full state (excluding raw map bytes and live stroke) can be serialized
/// with [toJson] and restored with [applyRemoteState] for WebSocket sync.
///
/// See also:
/// * [VttGame], the Flame engine that renders based on this state.
/// * [Session], which persists a snapshot of this state to disk.
/// * [VttRelayClient], which syncs state between TV and companion phone.
class VttState extends ChangeNotifier {
  /// The currently loaded UVTT map, or `null` if no map is loaded.
  UvttMap? map;

  /// Raw bytes of the loaded `.dd2vtt` file.
  ///
  /// Retained in memory so the TV can send the full file to newly
  /// connected companion phones without re-reading from disk.
  Uint8List? rawMapBytes;

  /// Whether the grid overlay is visible on the map.
  bool showGrid = true;

  /// Whether fog of war rendering is enabled.
  ///
  /// When `false`, the entire map is visible (fog layer hidden).
  bool fogEnabled = true;

  /// Whether wall debug outlines are displayed.
  ///
  /// Walls are normally invisible (used only for line-of-sight). This
  /// toggle renders them as colored lines for debugging map geometry.
  bool showWalls = false;

  /// Whether this instance accepts touch/gesture input.
  ///
  /// Set to `false` on the TV in networked mode, since the TV has no
  /// touch screen -- all interaction comes from the companion phone.
  bool isInteractive = true;

  /// Set of revealed fog cell indices.
  ///
  /// Each index encodes a grid cell as `row * gridCols + col`. Cells
  /// in this set have their fog removed (map is visible underneath).
  Set<int> revealedCells = {};

  /// Set of portal indices that are currently open.
  ///
  /// Indices correspond to positions in [UvttMap.portals]. Portals
  /// not in this set are rendered as closed (shut doors).
  Set<int> openPortals = {};

  // --- Calibration ---

  /// Physical width of the TV screen in inches.
  ///
  /// Set during calibration to compute [calibratedBaseZoom]. `null` if
  /// calibration has not been performed.
  double? tvWidthInches;

  /// Computed base zoom level that maps one grid square to one physical inch.
  ///
  /// Calculated as `(screenWidthPx / tvWidthInches) / pixelsPerGrid`.
  /// When set, the camera zoom is clamped to never go below this value,
  /// ensuring grid squares are always at least 1 inch on the physical TV.
  /// `null` if calibration has not been performed.
  double? calibratedBaseZoom;

  // --- Brush reveal ---

  /// Fog brush radius in grid cells.
  ///
  /// Defines the area affected when painting fog reveal/hide:
  /// * `0` -- single cell
  /// * `1` -- 3x3 area (radius 1)
  /// * `2` -- 5x5 area (radius 2)
  ///
  /// The brush uses a circular shape (cells beyond `r^2 + r` distance
  /// are excluded).
  int brushRadius = 1;

  /// Whether the brush reveals or hides fog.
  ///
  /// * `true` -- painting adds cells to [revealedCells] (clears fog).
  /// * `false` -- painting removes cells from [revealedCells] (restores fog).
  bool revealMode = true;

  // --- Interaction mode ---

  /// The currently active interaction tool.
  ///
  /// Determines what single-finger tap and drag gestures do in [VttGame].
  ///
  /// See also:
  /// * [InteractionMode] for the available modes.
  /// * [setInteractionMode] to change the active mode.
  InteractionMode interactionMode = InteractionMode.fogReveal;

  // --- Tokens ---

  /// All tokens currently placed on the map.
  ///
  /// Tokens are ordered by creation time. Each has a unique [MapToken.id].
  List<MapToken> tokens = [];

  /// Internal counter for cycling through [MapToken.tokenColors].
  int _nextColorIndex = 0;

  // --- Drawings ---

  /// Completed freehand strokes drawn on the map.
  List<DrawStroke> strokes = [];

  /// The in-progress stroke being drawn right now, or `null` if idle.
  ///
  /// Rendered by [LiveStrokeComponent] as a preview. Finalized into
  /// [strokes] when the drag gesture ends.
  DrawStroke? liveStroke;

  /// Current drawing color for new strokes.
  Color drawColor = const Color(0xFFE53935);

  /// Current line width for new strokes, in world pixels.
  double drawWidth = 3.0;

  // --- Relay forwarding callbacks ---

  /// Called when the fog brush paints cells, so the relay can forward
  /// the indices to the peer.
  ///
  /// Set by [FogOfWarComponent] or the relay client.
  void Function(List<int> indices)? onBrushPaint;

  /// Called when a portal is tapped (toggled), so the relay can forward
  /// the portal index to the peer.
  ///
  /// Set by [FogOfWarComponent] or the relay client.
  void Function(int index)? onPortalTap;

  /// Called when a new token is added locally, for relay forwarding.
  void Function(MapToken token)? onTokenAdded;

  /// Called when a token is removed locally, for relay forwarding.
  ///
  /// The [String] parameter is the [MapToken.id] of the removed token.
  void Function(String id)? onTokenRemoved;

  /// Called when a token is moved locally, for relay forwarding.
  ///
  /// Parameters are the [MapToken.id] and the new grid coordinates.
  void Function(String id, int x, int y)? onTokenMoved;

  /// Called when a completed stroke is added, for relay forwarding.
  void Function(DrawStroke stroke)? onStrokeAdded;

  /// Called when all drawings are cleared, for relay forwarding.
  void Function()? onDrawingsCleared;

  /// Called when the live stroke preview changes, for relay forwarding.
  ///
  /// `null` means the live stroke has ended (finger lifted).
  void Function(DrawStroke? stroke)? onLiveStrokeChanged;

  // ===== Map loading =====

  /// Loads a `.dd2vtt` map file from raw bytes.
  ///
  /// Parses the JSON, extracts the map image, initializes portal states
  /// from the file defaults, and clears any previously revealed fog cells.
  /// Retains [rawMapBytes] for sending to newly connected companions.
  ///
  /// Notifies all listeners after loading.
  void loadMap(Uint8List fileBytes) {
    rawMapBytes = fileBytes;
    final jsonString = utf8.decode(fileBytes);
    map = UvttParser.parse(jsonString);
    // Initialize portal states from file defaults
    openPortals.clear();
    for (int i = 0; i < map!.portals.length; i++) {
      if (!map!.portals[i].closed) openPortals.add(i);
    }
    revealedCells.clear();
    debugPrint('Loaded UVTT map: ${map!.resolution.mapSize.dx.toInt()}x'
        '${map!.resolution.mapSize.dy.toInt()} grid, '
        '${map!.resolution.pixelsPerGrid}ppg, '
        '${map!.portals.length} portals');
    notifyListeners();
  }

  // ===== Display toggles =====

  /// Toggles grid overlay visibility on/off.
  void toggleGrid() {
    showGrid = !showGrid;
    notifyListeners();
  }

  // ===== Fog of war =====

  /// Toggles a single fog cell between revealed and hidden.
  ///
  /// The [index] is computed as `row * gridCols + col`.
  void toggleReveal(int index) {
    if (revealedCells.contains(index)) {
      revealedCells.remove(index);
    } else {
      revealedCells.add(index);
    }
    notifyListeners();
  }

  /// Batch reveal or hide fog cells (used by brush drag painting).
  ///
  /// If [revealMode] is `true`, the given [indices] are added to
  /// [revealedCells]. If `false`, they are removed. Only notifies
  /// listeners if at least one cell actually changed state.
  void applyBrushReveal(List<int> indices) {
    bool changed = false;
    for (final index in indices) {
      if (revealMode) {
        if (revealedCells.add(index)) changed = true;
      } else {
        if (revealedCells.remove(index)) changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  /// Reveals all fog cells on the map.
  ///
  /// [totalCells] should be `gridCols * gridRows`.
  void revealAll(int totalCells) {
    revealedCells = Set.from(List.generate(totalCells, (i) => i));
    notifyListeners();
  }

  /// Hides all fog cells (restores full fog coverage).
  void hideAll() {
    revealedCells.clear();
    notifyListeners();
  }

  // ===== Portals =====

  /// Toggles a portal (door/gate) between open and closed.
  ///
  /// The [index] corresponds to the portal's position in
  /// [UvttMap.portals].
  void togglePortal(int index) {
    if (openPortals.contains(index)) {
      openPortals.remove(index);
    } else {
      openPortals.add(index);
    }
    notifyListeners();
  }

  /// Toggles wall debug outline visibility on/off.
  void toggleWalls() {
    showWalls = !showWalls;
    notifyListeners();
  }

  // ===== Calibration =====

  /// Calibrates the zoom level so that grid squares match physical inches.
  ///
  /// Given the physical [tvWidth] in inches and the screen's pixel width
  /// [screenWidthPx], computes [calibratedBaseZoom] such that one grid
  /// square equals one inch on the TV surface.
  ///
  /// Does nothing if no map is loaded.
  void calibrate(double tvWidth, double screenWidthPx) {
    if (map == null) return;
    tvWidthInches = tvWidth;
    final pxPerInch = screenWidthPx / tvWidth;
    calibratedBaseZoom = pxPerInch / map!.resolution.pixelsPerGrid;
    notifyListeners();
  }

  /// Clears calibration data, returning to default zoom behavior.
  void resetCalibration() {
    tvWidthInches = null;
    calibratedBaseZoom = null;
    notifyListeners();
  }

  /// Sets the fog brush radius.
  ///
  /// [radius] of `0` means single cell, `1` means 3x3, `2` means 5x5, etc.
  void setBrushRadius(int radius) {
    brushRadius = radius;
    notifyListeners();
  }

  /// Toggles [revealMode] between reveal (`true`) and hide (`false`).
  void toggleRevealMode() {
    revealMode = !revealMode;
    notifyListeners();
  }

  /// Toggles fog of war on/off.
  ///
  /// When disabled, the entire map is visible regardless of [revealedCells].
  void toggleFog() {
    fogEnabled = !fogEnabled;
    notifyListeners();
  }

  // ===== Token operations =====

  /// Creates a new token at the given grid position and adds it to [tokens].
  ///
  /// The token is assigned the next color from [MapToken.tokenColors]
  /// (cycling) and a sequential numeric label. Fires [onTokenAdded] for
  /// relay forwarding.
  void addToken(int gridX, int gridY) {
    final color =
        MapToken.tokenColors[_nextColorIndex % MapToken.tokenColors.length];
    _nextColorIndex++;
    final token = MapToken(
      id: 'token_${DateTime.now().millisecondsSinceEpoch}',
      label: '${tokens.length + 1}',
      color: color,
      gridX: gridX,
      gridY: gridY,
    );
    tokens.add(token);
    notifyListeners();
    onTokenAdded?.call(token);
  }

  /// Moves an existing token to a new grid position.
  ///
  /// Finds the token by [id] and updates its [MapToken.gridX] and
  /// [MapToken.gridY]. Fires [onTokenMoved] for relay forwarding.
  ///
  /// Throws [StateError] if no token with the given [id] exists.
  void moveToken(String id, int newGridX, int newGridY) {
    final token = tokens.firstWhere((t) => t.id == id);
    token.gridX = newGridX;
    token.gridY = newGridY;
    notifyListeners();
    onTokenMoved?.call(id, newGridX, newGridY);
  }

  /// Removes a token by [id].
  ///
  /// Silently does nothing if no token with that [id] exists. Fires
  /// [onTokenRemoved] for relay forwarding.
  void removeToken(String id) {
    tokens.removeWhere((t) => t.id == id);
    notifyListeners();
    onTokenRemoved?.call(id);
  }

  /// Removes all tokens from the map.
  void clearTokens() {
    tokens.clear();
    notifyListeners();
  }

  // ===== Drawing operations =====

  /// Adds a completed [stroke] to the drawing layer.
  ///
  /// Fires [onStrokeAdded] for relay forwarding.
  void addStroke(DrawStroke stroke) {
    strokes.add(stroke);
    notifyListeners();
    onStrokeAdded?.call(stroke);
  }

  /// Removes the most recently added stroke (undo).
  ///
  /// Does nothing if there are no strokes.
  void undoStroke() {
    if (strokes.isNotEmpty) {
      strokes.removeLast();
      notifyListeners();
    }
  }

  /// Removes all drawing strokes from the map.
  ///
  /// Fires [onDrawingsCleared] for relay forwarding.
  void clearDrawings() {
    strokes.clear();
    notifyListeners();
    onDrawingsCleared?.call();
  }

  // ===== Interaction mode / draw settings =====

  /// Sets the active interaction mode (fog, draw, or token).
  ///
  /// See [InteractionMode] for available modes.
  void setInteractionMode(InteractionMode mode) {
    interactionMode = mode;
    notifyListeners();
  }

  /// Sets the drawing color for new strokes.
  void setDrawColor(Color c) {
    drawColor = c;
    notifyListeners();
  }

  /// Sets the drawing line width for new strokes.
  void setDrawWidth(double w) {
    drawWidth = w;
    notifyListeners();
  }

  /// Updates the live stroke preview, or clears it if [stroke] is `null`.
  ///
  /// The live stroke is rendered as a real-time preview while the user
  /// is actively drawing. Fires [onLiveStrokeChanged] for relay forwarding.
  void setLiveStroke(DrawStroke? stroke) {
    liveStroke = stroke;
    notifyListeners();
    onLiveStrokeChanged?.call(stroke);
  }

  /// Unloads the current map and resets all map-related state.
  ///
  /// Clears revealed cells, open portals, fog settings, calibration,
  /// and wall debug view. Does not clear tokens or drawings.
  void clearMap() {
    map = null;
    rawMapBytes = null;
    revealedCells.clear();
    openPortals.clear();
    fogEnabled = true;
    showWalls = false;
    calibratedBaseZoom = null;
    notifyListeners();
  }

  // ===== Serialization =====

  /// Serializes the full state to a JSON-compatible map for relay broadcast.
  ///
  /// Excludes [rawMapBytes] (sent separately as a chunked binary transfer)
  /// and [liveStroke] (sent via dedicated live-stroke messages). Includes
  /// all fog cells, portal states, display toggles, calibration, tokens,
  /// strokes, draw settings, and the active interaction mode.
  Map<String, dynamic> toJson() => {
        'hasMap': map != null,
        'gridCols': map?.resolution.mapSize.dx.toInt(),
        'gridRows': map?.resolution.mapSize.dy.toInt(),
        'portalCount': map?.portals.length ?? 0,
        'revealedCells': revealedCells.toList(),
        'openPortals': openPortals.toList(),
        'showGrid': showGrid,
        'fogEnabled': fogEnabled,
        'showWalls': showWalls,
        'brushRadius': brushRadius,
        'revealMode': revealMode,
        'tvWidthInches': tvWidthInches,
        'calibratedBaseZoom': calibratedBaseZoom,
        'interactionMode': interactionMode.name,
        'tokens': tokens.map((t) => t.toJson()).toList(),
        'strokes': strokes.map((s) => s.toJson()).toList(),
        'drawColor': drawColor.toARGB32(),
        'drawWidth': drawWidth,
      };

  /// Applies a full state snapshot received from the relay (TV to phone sync).
  ///
  /// Overwrites all local state fields with the values from [json] and
  /// fires a single [notifyListeners] call. Fields added in later versions
  /// ([interactionMode], [tokens], [strokes], [drawColor], [drawWidth])
  /// fall back to defaults if absent, for backwards compatibility.
  ///
  /// This is the inverse of [toJson] and is called on the companion phone
  /// when it receives a `vtt.fullState` message from the TV.
  void applyRemoteState(Map<String, dynamic> json) {
    revealedCells = Set<int>.from(
        (json['revealedCells'] as List).map((e) => e as int));
    openPortals = Set<int>.from(
        (json['openPortals'] as List).map((e) => e as int));
    showGrid = json['showGrid'] as bool;
    fogEnabled = json['fogEnabled'] as bool;
    showWalls = json['showWalls'] as bool;
    brushRadius = json['brushRadius'] as int;
    revealMode = json['revealMode'] as bool;
    tvWidthInches = (json['tvWidthInches'] as num?)?.toDouble();
    calibratedBaseZoom = (json['calibratedBaseZoom'] as num?)?.toDouble();

    // New fields — backwards compatible with old state messages
    final modeName = json['interactionMode'] as String? ?? 'fogReveal';
    interactionMode = InteractionMode.values.firstWhere(
      (m) => m.name == modeName,
      orElse: () => InteractionMode.fogReveal,
    );
    tokens = (json['tokens'] as List?)
            ?.map((t) => MapToken.fromJson(t as Map<String, dynamic>))
            .toList() ??
        [];
    strokes = (json['strokes'] as List?)
            ?.map((s) => DrawStroke.fromJson(s as Map<String, dynamic>))
            .toList() ??
        [];
    drawColor = Color(json['drawColor'] as int? ?? 0xFFE53935);
    drawWidth = (json['drawWidth'] as num?)?.toDouble() ?? 3.0;

    notifyListeners(); // single notification
  }
}
