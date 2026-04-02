import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../model/aoe_template.dart';
import '../model/draw_stroke.dart';
import '../model/map_token.dart';
import '../model/session.dart';
import '../model/undo_action.dart';
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

  /// Measure mode: drag to draw a distance measurement line between two points.
  measure,

  /// AoE template mode: tap to place origin, drag to set direction/size.
  aoe,

  /// Room reveal mode: tap a cell to flood-fill reveal all connected cells
  /// bounded by walls and closed portals.
  roomReveal,
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

  // --- Undo / Redo ---

  /// Stack of actions that can be undone, most recent last.
  ///
  /// Capped at [_maxUndoSize] entries. Cleared when the map is unloaded.
  final List<UndoAction> _undoStack = [];

  /// Stack of actions that were undone and can be redone.
  ///
  /// Cleared whenever a new action is pushed (any new mutation
  /// invalidates the redo history).
  final List<UndoAction> _redoStack = [];

  /// Maximum number of undo actions retained.
  static const int _maxUndoSize = 50;

  /// Whether there are actions that can be undone.
  bool get canUndo => _undoStack.isNotEmpty;

  /// Whether there are undone actions that can be redone.
  bool get canRedo => _redoStack.isNotEmpty;

  // --- Ruler overlay ---

  /// Whether the physical L-shaped ruler overlay is visible on the map.
  bool rulerVisible = false;

  /// Ruler corner X position in grid coordinates.
  double rulerX = 0;

  /// Ruler corner Y position in grid coordinates.
  double rulerY = 0;

  /// Ruler rotation in degrees (0, 90, 180, or 270).
  int rulerRotation = 0;

  /// Fine-tune zoom multiplier for scale calibration (0.5 to 2.0).
  ///
  /// Applied on top of [calibratedBaseZoom] to allow the DM to fine-tune
  /// the physical grid size without re-calibrating.
  double scaleSliderFactor = 1.0;

  // --- Session settings ---

  /// Feature toggles controlling which tools and visual layers are enabled.
  ///
  /// Set when a session is created or resumed. The DM panel reads these
  /// flags to show/hide tabs and controls. The TV reads them to decide
  /// which visual layers to render.
  ///
  /// Defaults to the Pen & Paper preset. Synced to the companion via
  /// [toJson] / [applyRemoteState].
  ///
  /// See also:
  /// * [SessionSettings], the model class with all toggle fields.
  /// * [Session.settings], where these are persisted.
  SessionSettings sessionSettings = SessionSettings.penAndPaper();

  // --- Shadow mode ---

  /// Whether shadow (preview) mode is active for fog painting.
  ///
  /// When `true`, brush strokes accumulate in [shadowRevealCells] and
  /// [shadowHideCells] instead of modifying [revealedCells] directly.
  /// The DM can preview the result before committing with [commitShadow].
  ///
  /// Defaults to `true` -- shadow mode is the safer default for fog work.
  bool shadowMode = false;

  /// Cells staged for reveal in shadow mode (not yet committed).
  ///
  /// These cells will be added to [revealedCells] when [commitShadow]
  /// is called. Rendered as a translucent preview by the fog component.
  Set<int> shadowRevealCells = {};

  /// Cells staged for hiding in shadow mode (not yet committed).
  ///
  /// These cells will be removed from [revealedCells] when [commitShadow]
  /// is called. Rendered as a translucent preview by the fog component.
  Set<int> shadowHideCells = {};

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

  /// Called when a token's combat metadata is edited locally, for relay forwarding.
  ///
  /// Parameters are the [MapToken.id], updated [name], [maxHp], [currentHp],
  /// and the list of active [conditions].
  void Function(String id, String name, int maxHp, int currentHp, List<String> conditions)? onTokenEdited;

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

  /// Loads a PDF page as a map with user-specified grid dimensions.
  ///
  /// Creates a synthetic [UvttMap] from a rendered PDF page image, with
  /// empty portals, walls, and line-of-sight data. This allows PDF maps
  /// to reuse the same rendering pipeline as `.dd2vtt` maps.
  ///
  /// The [imageBytes] are the PNG-encoded rendered page from pdfrx.
  /// [gridCols] and [gridRows] define the grid overlay dimensions.
  /// [imageWidth] and [imageHeight] are the pixel dimensions of the
  /// rendered page image.
  ///
  /// Sets [rawMapBytes] to `null` since PDF bytes are stored separately
  /// in the [MapLibrary].
  ///
  /// See also:
  /// * [loadMap], which loads a `.dd2vtt` map from raw file bytes.
  /// * [MapLibraryEntry.isPdf], which flags entries as PDF maps.
  void loadPdfAsMap(Uint8List imageBytes, {
    required int gridCols,
    required int gridRows,
    required double imageWidth,
    required double imageHeight,
  }) {
    final pixelsPerGrid = imageWidth / gridCols;

    map = UvttMap(
      format: 0,
      resolution: UvttResolution(
        mapOrigin: const Offset(0, 0),
        mapSize: Offset(gridCols.toDouble(), gridRows.toDouble()),
        pixelsPerGrid: pixelsPerGrid.round(),
      ),
      lineOfSight: [],
      objectsLineOfSight: [],
      portals: [],
      lights: [],
      environment: UvttEnvironment(
        bakedLighting: false,
        ambientLight: const Color(0xFF000000),
      ),
      imageBytes: imageBytes,
    );
    rawMapBytes = null; // PDF bytes stored separately in library
    openPortals.clear();
    revealedCells.clear();
    debugPrint('Loaded PDF as map: ${gridCols}x$gridRows grid, '
        '${pixelsPerGrid.round()}ppg');
    notifyListeners();
  }

  // ===== Undo / Redo =====

  /// Pushes an [action] onto the undo stack and clears the redo stack.
  ///
  /// If the undo stack exceeds [_maxUndoSize], the oldest entry is removed.
  void _pushUndo(UndoAction action) {
    _undoStack.add(action);
    _redoStack.clear();
    if (_undoStack.length > _maxUndoSize) _undoStack.removeAt(0);
  }

  /// Undoes the most recent action by popping it from the undo stack,
  /// reversing its effect, and pushing it onto the redo stack.
  ///
  /// Does nothing if the undo stack is empty.
  ///
  /// See also:
  /// * [redo], which re-applies the most recently undone action.
  /// * [UndoAction], for the set of reversible action types.
  void undo() {
    if (_undoStack.isEmpty) return;
    final action = _undoStack.removeLast();
    _reverseAction(action);
    _redoStack.add(action);
    notifyListeners();
  }

  /// Re-applies the most recently undone action by popping it from the
  /// redo stack, applying its effect, and pushing it onto the undo stack.
  ///
  /// Does nothing if the redo stack is empty.
  ///
  /// See also:
  /// * [undo], which reverses the most recent action.
  void redo() {
    if (_redoStack.isEmpty) return;
    final action = _redoStack.removeLast();
    _applyAction(action);
    _undoStack.add(action);
    notifyListeners();
  }

  /// Reverses a single [action] (used by [undo]).
  void _reverseAction(UndoAction action) {
    switch (action) {
      case FogAction():
        if (action.wasReveal) {
          revealedCells.removeAll(action.cellsChanged);
        } else {
          revealedCells.addAll(action.cellsChanged);
        }
      case PortalAction():
        if (action.wasOpen) {
          openPortals.add(action.index);
        } else {
          openPortals.remove(action.index);
        }
      case TokenAddAction():
        tokens.removeWhere((t) => t.id == action.token.id);
      case TokenRemoveAction():
        tokens.add(action.token);
      case TokenMoveAction():
        final token = tokens.firstWhere((t) => t.id == action.id);
        token.gridX = action.fromX;
        token.gridY = action.fromY;
      case StrokeAddAction():
        if (strokes.isNotEmpty && identical(strokes.last, action.stroke)) {
          strokes.removeLast();
        } else {
          strokes.remove(action.stroke);
        }
      case StrokeClearAction():
        strokes.addAll(action.strokes);
      case ShadowCommitAction():
        revealedCells.removeAll(action.revealed);
        revealedCells.addAll(action.hidden);
    }
  }

  /// Re-applies a single [action] (used by [redo]).
  void _applyAction(UndoAction action) {
    switch (action) {
      case FogAction():
        if (action.wasReveal) {
          revealedCells.addAll(action.cellsChanged);
        } else {
          revealedCells.removeAll(action.cellsChanged);
        }
      case PortalAction():
        if (action.wasOpen) {
          openPortals.remove(action.index);
        } else {
          openPortals.add(action.index);
        }
      case TokenAddAction():
        tokens.add(action.token);
      case TokenRemoveAction():
        tokens.removeWhere((t) => t.id == action.token.id);
      case TokenMoveAction():
        final token = tokens.firstWhere((t) => t.id == action.id);
        token.gridX = action.toX;
        token.gridY = action.toY;
      case StrokeAddAction():
        strokes.add(action.stroke);
      case StrokeClearAction():
        strokes.clear();
      case ShadowCommitAction():
        revealedCells.addAll(action.revealed);
        revealedCells.removeAll(action.hidden);
    }
  }

  // ===== Shadow mode =====

  /// Toggles [shadowMode] on or off and clears any pending shadow cells.
  ///
  /// See also:
  /// * [commitShadow], which merges shadow cells into [revealedCells].
  /// * [clearShadow], which discards pending shadow cells.
  void toggleShadowMode() {
    shadowMode = !shadowMode;
    clearShadow();
  }

  /// Discards all pending shadow reveal/hide cells without committing.
  void clearShadow() {
    shadowRevealCells.clear();
    shadowHideCells.clear();
    notifyListeners();
  }

  /// Commits pending shadow cells into [revealedCells].
  ///
  /// Cells in [shadowRevealCells] are added to [revealedCells], and cells
  /// in [shadowHideCells] are removed. A [ShadowCommitAction] is pushed
  /// onto the undo stack recording only the cells that actually changed.
  ///
  /// Both shadow sets are cleared after committing.
  ///
  /// See also:
  /// * [toggleShadowMode], which enables/disables shadow mode.
  /// * [clearShadow], which discards without committing.
  void commitShadow() {
    final revealed = <int>{};
    final hidden = <int>{};

    for (final cell in shadowRevealCells) {
      if (revealedCells.add(cell)) revealed.add(cell);
    }
    for (final cell in shadowHideCells) {
      if (revealedCells.remove(cell)) hidden.add(cell);
    }

    if (revealed.isNotEmpty || hidden.isNotEmpty) {
      _pushUndo(ShadowCommitAction(revealed, hidden));
    }

    shadowRevealCells.clear();
    shadowHideCells.clear();
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
  /// In [shadowMode], toggles the cell within the shadow sets instead
  /// of modifying [revealedCells] directly.
  ///
  /// The [index] is computed as `row * gridCols + col`.
  void toggleReveal(int index) {
    if (shadowMode) {
      // In shadow mode, toggle between shadow sets
      if (shadowRevealCells.contains(index)) {
        shadowRevealCells.remove(index);
      } else if (shadowHideCells.contains(index)) {
        shadowHideCells.remove(index);
      } else if (revealedCells.contains(index)) {
        shadowHideCells.add(index);
      } else {
        shadowRevealCells.add(index);
      }
      notifyListeners();
      return;
    }
    final wasRevealed = revealedCells.contains(index);
    if (wasRevealed) {
      revealedCells.remove(index);
    } else {
      revealedCells.add(index);
    }
    _pushUndo(FogAction({index}, !wasRevealed));
    notifyListeners();
  }

  /// Batch reveal or hide fog cells (used by brush drag painting).
  ///
  /// In [shadowMode], cells are routed to [shadowRevealCells] or
  /// [shadowHideCells] instead of modifying [revealedCells] directly.
  ///
  /// In live mode, if [revealMode] is `true`, the given [indices] are
  /// added to [revealedCells]. If `false`, they are removed. Only
  /// notifies listeners if at least one cell actually changed state.
  /// Pushes a [FogAction] for undo when cells change.
  void applyBrushReveal(List<int> indices) {
    if (shadowMode) {
      bool changed = false;
      for (final index in indices) {
        if (revealMode) {
          if (shadowRevealCells.add(index)) changed = true;
          shadowHideCells.remove(index);
        } else {
          if (shadowHideCells.add(index)) changed = true;
          shadowRevealCells.remove(index);
        }
      }
      if (changed) notifyListeners();
      return;
    }
    // Live mode: modify revealedCells directly and push undo
    final cellsChanged = <int>{};
    for (final index in indices) {
      if (revealMode) {
        if (revealedCells.add(index)) cellsChanged.add(index);
      } else {
        if (revealedCells.remove(index)) cellsChanged.add(index);
      }
    }
    if (cellsChanged.isNotEmpty) {
      _pushUndo(FogAction(cellsChanged, revealMode));
      notifyListeners();
    }
  }

  /// Reveals all fog cells on the map.
  ///
  /// In [shadowMode], fills [shadowRevealCells] with all cells and clears
  /// [shadowHideCells]. In live mode, computes the diff (cells not already
  /// revealed) and pushes a [FogAction] for undo.
  ///
  /// [totalCells] should be `gridCols * gridRows`.
  void revealAll(int totalCells) {
    if (shadowMode) {
      shadowRevealCells = Set.from(List.generate(totalCells, (i) => i));
      shadowHideCells.clear();
      notifyListeners();
      return;
    }
    final allCells = Set<int>.from(List.generate(totalCells, (i) => i));
    final newlyRevealed = allCells.difference(revealedCells);
    if (newlyRevealed.isNotEmpty) {
      _pushUndo(FogAction(newlyRevealed, true));
    }
    revealedCells = allCells;
    notifyListeners();
  }

  /// Hides all fog cells (restores full fog coverage).
  ///
  /// In [shadowMode], fills [shadowHideCells] with all currently revealed
  /// cells and clears [shadowRevealCells]. In live mode, saves the
  /// currently revealed cells and pushes a [FogAction] for undo.
  void hideAll() {
    if (shadowMode) {
      shadowHideCells = Set<int>.from(revealedCells);
      shadowRevealCells.clear();
      notifyListeners();
      return;
    }
    final previouslyRevealed = Set<int>.from(revealedCells);
    if (previouslyRevealed.isNotEmpty) {
      _pushUndo(FogAction(previouslyRevealed, false));
    }
    revealedCells.clear();
    notifyListeners();
  }

  /// Reveals or hides a set of cells (used by room-reveal flood fill).
  ///
  /// In [shadowMode], routes cells to [shadowRevealCells] or
  /// [shadowHideCells]. In live mode, modifies [revealedCells] directly
  /// and pushes a [FogAction] for undo.
  ///
  /// The behavior depends on [revealMode]:
  /// * `true` -- the [cells] are revealed (fog is cleared).
  /// * `false` -- the [cells] are hidden (fog is restored).
  ///
  /// See also:
  /// * [WallGrid.floodFill], which computes the cell set.
  /// * [InteractionMode.roomReveal], the mode that triggers this.
  void revealRoom(Set<int> cells) {
    if (shadowMode) {
      if (revealMode) {
        shadowRevealCells.addAll(cells);
        shadowHideCells.removeAll(cells);
      } else {
        shadowHideCells.addAll(cells);
        shadowRevealCells.removeAll(cells);
      }
      notifyListeners();
      return;
    }
    // Live mode
    final changed = <int>{};
    for (final cell in cells) {
      if (revealMode) {
        if (revealedCells.add(cell)) changed.add(cell);
      } else {
        if (revealedCells.remove(cell)) changed.add(cell);
      }
    }
    if (changed.isNotEmpty) {
      _pushUndo(FogAction(changed, revealMode));
      notifyListeners();
    }
  }

  // ===== Portals =====

  /// Toggles a portal (door/gate) between open and closed.
  ///
  /// Pushes a [PortalAction] onto the undo stack recording the portal's
  /// state before the toggle.
  ///
  /// The [index] corresponds to the portal's position in
  /// [UvttMap.portals].
  void togglePortal(int index) {
    final wasOpen = openPortals.contains(index);
    _pushUndo(PortalAction(index, wasOpen));
    if (wasOpen) {
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
  /// (cycling) and a sequential numeric label. Pushes a [TokenAddAction]
  /// onto the undo stack. Fires [onTokenAdded] for relay forwarding.
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
    _pushUndo(TokenAddAction(token));
    notifyListeners();
    onTokenAdded?.call(token);
  }

  /// Moves an existing token to a new grid position.
  ///
  /// Saves the old position and pushes a [TokenMoveAction] onto the undo
  /// stack. Finds the token by [id] and updates its [MapToken.gridX] and
  /// [MapToken.gridY]. Fires [onTokenMoved] for relay forwarding.
  ///
  /// Throws [StateError] if no token with the given [id] exists.
  void moveToken(String id, int newGridX, int newGridY) {
    final token = tokens.firstWhere((t) => t.id == id);
    final oldX = token.gridX;
    final oldY = token.gridY;
    _pushUndo(TokenMoveAction(id, oldX, oldY, newGridX, newGridY));
    token.gridX = newGridX;
    token.gridY = newGridY;
    notifyListeners();
    onTokenMoved?.call(id, newGridX, newGridY);
  }

  /// Removes a token by [id].
  ///
  /// Saves a reference to the token and pushes a [TokenRemoveAction]
  /// onto the undo stack before removing it. Silently does nothing if
  /// no token with that [id] exists. Fires [onTokenRemoved] for relay
  /// forwarding.
  void removeToken(String id) {
    final index = tokens.indexWhere((t) => t.id == id);
    if (index == -1) return;
    final token = tokens[index];
    _pushUndo(TokenRemoveAction(token));
    tokens.removeAt(index);
    notifyListeners();
    onTokenRemoved?.call(id);
  }

  /// Edits combat metadata on an existing token.
  ///
  /// Only the provided fields are updated; `null` parameters are left
  /// unchanged. Fires [onTokenEdited] for relay forwarding.
  ///
  /// Throws [StateError] if no token with the given [id] exists.
  ///
  /// See also:
  /// * [MapToken.name], [MapToken.maxHp], [MapToken.currentHp],
  ///   [MapToken.conditions] for the fields being edited.
  void editToken(String id, {String? name, int? maxHp, int? currentHp, Set<String>? conditions}) {
    final token = tokens.firstWhere((t) => t.id == id);
    if (name != null) token.name = name;
    if (maxHp != null) token.maxHp = maxHp;
    if (currentHp != null) token.currentHp = currentHp;
    if (conditions != null) token.conditions = conditions;
    notifyListeners();
    onTokenEdited?.call(id, token.name, token.maxHp, token.currentHp, token.conditions.toList());
  }

  /// Removes all tokens from the map.
  void clearTokens() {
    tokens.clear();
    notifyListeners();
  }

  // ===== Drawing operations =====

  /// Adds a completed [stroke] to the drawing layer.
  ///
  /// Pushes a [StrokeAddAction] onto the undo stack.
  /// Fires [onStrokeAdded] for relay forwarding.
  void addStroke(DrawStroke stroke) {
    strokes.add(stroke);
    _pushUndo(StrokeAddAction(stroke));
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
  /// Saves a snapshot of all current strokes and pushes a [StrokeClearAction]
  /// onto the undo stack before clearing. Fires [onDrawingsCleared] for
  /// relay forwarding.
  void clearDrawings() {
    if (strokes.isNotEmpty) {
      _pushUndo(StrokeClearAction(List.from(strokes)));
    }
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
  /// wall debug view, shadow cells, and the undo/redo stacks.
  /// Does not clear tokens or drawings.
  void clearMap() {
    map = null;
    rawMapBytes = null;
    revealedCells.clear();
    openPortals.clear();
    fogEnabled = true;
    showWalls = false;
    calibratedBaseZoom = null;
    shadowRevealCells.clear();
    shadowHideCells.clear();
    _undoStack.clear();
    _redoStack.clear();
    notifyListeners();
  }

  // ===== AoE Templates =====

  /// The currently active AoE template displayed on the map, or null.
  AoeTemplate? activeAoe;

  /// Sets the active AoE template and notifies listeners.
  void setAoe(AoeTemplate? template) {
    activeAoe = template;
    notifyListeners();
  }

  /// Clears the active AoE template.
  void clearAoe() {
    activeAoe = null;
    notifyListeners();
  }

  // ===== Ruler overlay =====

  /// Toggles the ruler overlay visibility.
  void toggleRuler() {
    rulerVisible = !rulerVisible;
    notifyListeners();
  }

  /// Sets the ruler corner position in grid coordinates.
  void setRulerPosition(double x, double y) {
    rulerX = x;
    rulerY = y;
    notifyListeners();
  }

  /// Rotates the ruler 90 degrees clockwise, cycling 0 -> 90 -> 180 -> 270 -> 0.
  void rotateRulerCW() {
    rulerRotation = (rulerRotation + 90) % 360;
    notifyListeners();
  }

  /// Sets the scale slider factor, clamped to [0.5, 2.0].
  ///
  /// This multiplier is applied on top of [calibratedBaseZoom] to allow
  /// the DM to fine-tune the physical grid size.
  void setScaleFactor(double factor) {
    scaleSliderFactor = factor.clamp(0.5, 2.0);
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
        'shadowMode': shadowMode,
        'shadowRevealCells': shadowRevealCells.toList(),
        'shadowHideCells': shadowHideCells.toList(),
        'rulerVisible': rulerVisible,
        'rulerX': rulerX,
        'rulerY': rulerY,
        'rulerRotation': rulerRotation,
        'scaleSliderFactor': scaleSliderFactor,
        'sessionSettings': sessionSettings.toJson(),
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

    // Shadow mode fields — backwards compatible
    shadowMode = json['shadowMode'] as bool? ?? true;
    shadowRevealCells = json['shadowRevealCells'] != null
        ? Set<int>.from(
            (json['shadowRevealCells'] as List).map((e) => e as int))
        : {};
    shadowHideCells = json['shadowHideCells'] != null
        ? Set<int>.from(
            (json['shadowHideCells'] as List).map((e) => e as int))
        : {};

    // Ruler overlay fields — backwards compatible
    rulerVisible = json['rulerVisible'] as bool? ?? false;
    rulerX = (json['rulerX'] as num?)?.toDouble() ?? 0;
    rulerY = (json['rulerY'] as num?)?.toDouble() ?? 0;
    rulerRotation = json['rulerRotation'] as int? ?? 0;
    scaleSliderFactor = (json['scaleSliderFactor'] as num?)?.toDouble() ?? 1.0;

    // Session settings — backwards compatible
    sessionSettings = json['sessionSettings'] != null
        ? SessionSettings.fromJson(json['sessionSettings'] as Map<String, dynamic>)
        : SessionSettings.penAndPaper();

    notifyListeners(); // single notification
  }
}
