import 'dart:math';
import 'dart:ui' as ui;

import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/foundation.dart' show setEquals;
import 'package:flutter/material.dart';

import '../model/aoe_template.dart';
import '../model/draw_stroke.dart';
import '../model/uvtt_map.dart';
import '../state/vtt_state.dart';
import 'components/aoe_template_component.dart';
import 'components/fog_of_war_component.dart';
import 'components/global_effects_component.dart';
import 'components/grid_overlay_component.dart';
import 'components/live_stroke_component.dart';
import 'components/map_image_component.dart';
import 'components/portal_component.dart';
import 'components/strokes_component.dart';
import 'components/measure_component.dart';
import 'components/ruler_component.dart';
import 'components/token_layer.dart';
import 'components/torch_glow_component.dart';
import 'components/tv_viewport_component.dart';
import 'components/wall_component.dart';
import 'wall_grid.dart';

export 'components/tv_viewport_component.dart' show CameraSnapshot;

/// Flame game for the VTT map — runs on the TV (display) and on the phone
/// (editor preview).
///
/// Renders the map image with grid overlay and all tool layers, and owns
/// the camera. Input routing:
/// - **Two fingers** (any pointer count > 1) → camera pinch-zoom + pan,
///   detected via [ScaleUpdateInfo.pointerCount] so a two-finger pan without
///   pinching never reaches a tool.
/// - **One finger drag** → the active tool ([VttState.interactionMode]); the
///   tool starts on the first real move, not on touch-down, so a second
///   finger arriving late cannot leave a brush stroke behind.
/// - **Tap** (no movement) → the tool's tap action.
/// - **Scroll wheel** → zoom (desktop testing).
///
/// The TV ([isDisplay] = `true`) enforces the calibrated minimum zoom; the
/// phone does not, its minimum zoom is half the fit-to-screen zoom so the
/// whole map can always be seen ([minZoom]).
///
/// See also:
/// - [VttState], the shared state this game renders.
/// - [TvViewportComponent], the phone-side outline of the TV's view.
class VttGame extends FlameGame with ScaleDetector, ScrollDetector {
  /// The shared state rendered by this game.
  final VttState state;

  /// Whether this instance is the TV display (enforces calibration) rather
  /// than the phone preview (free camera, TV viewport overlay).
  final bool isDisplay;

  VttMapImageComponent? _mapImage;
  VttGridOverlayComponent? _gridOverlay;
  WallComponent? _wallComponent;
  final List<PortalComponent> _portalComponents = [];
  FogOfWarComponent? _fogOfWar;
  StrokesComponent? _strokes;
  LiveStrokeComponent? _liveStroke;
  TokenLayer? _tokenLayer;
  MeasureComponent? _measure;
  AoeTemplateComponent? _aoeComponent;
  RulerComponent? _ruler;
  TorchGlowComponent? _torchGlow;
  GlobalEffectsComponent? _globalEffects;
  TvViewportComponent? _tvViewport;

  /// Discretized wall grid for flood-fill room reveal.
  WallGrid? _wallGrid;

  /// Tracks previous open portals to detect changes and recompute wall grid.
  Set<int>? _lastOpenPortals;

  double? _lastCalibratedZoom;

  /// Upper zoom bound (screen pixels per world pixel).
  static const double maxZoom = 10.0;

  // Camera gesture state
  double _initialZoom = 1.0;
  bool _isMultiTouch = false;
  bool _toolActive = false;
  Vector2? _scaleStartPos;

  // Drawing state for live stroke
  List<Offset> _currentStrokePoints = [];

  // Token drag state
  String? _draggingTokenId;

  // Fog brush: last painted cell, to skip duplicate frames
  int? _lastBrushCell;

  // Ruler drag state (grid-space offset from the corner to the grab point)
  bool _draggingRuler = false;
  Offset _rulerGrabOffset = Offset.zero;

  // Camera change reporting
  CameraSnapshot? _lastReportedCamera;

  /// Latest TV camera snapshot (phone side), drawn by [TvViewportComponent].
  CameraSnapshot? _tvCamera;

  /// Called (at most once per frame) when this game's camera changed.
  ///
  /// The phone uses it to forward its camera to the TV while "link TV to
  /// phone" is on. `null` disables the check entirely.
  void Function(CameraSnapshot camera)? onCameraChanged;

  /// Creates the game for [state]. [isDisplay] is `true` on the TV and in
  /// the companion's local mode, `false` for the networked phone preview.
  VttGame({required this.state, this.isDisplay = true});

  @override
  Color backgroundColor() => const Color(0xFF111111);

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    state.addListener(_onStateChanged);
    if (state.map != null) _loadMap(state.map!);
  }

  @override
  void onRemove() {
    state.removeListener(_onStateChanged);
    super.onRemove();
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (onCameraChanged != null) {
      final snap = cameraSnapshot;
      if (snap.differsFrom(_lastReportedCamera)) {
        _lastReportedCamera = snap;
        onCameraChanged!(snap);
      }
    }
  }

  void _onStateChanged() {
    if (state.map != null && _mapImage == null) {
      _loadMap(state.map!);
    } else if (state.map == null && _mapImage != null) {
      _clearMap();
    }
    // Sync visibility
    _gridOverlay?.isVisible = state.showGrid;
    _wallComponent?.isVisible = state.showWalls;
    _fogOfWar?.isVisible = state.fogEnabled;

    // Sync tokens
    _tokenLayer?.sync();

    // Recompute wall grid when portals change (open/close affects flood fill)
    if (state.map != null && !setEquals(state.openPortals, _lastOpenPortals)) {
      _lastOpenPortals = Set.from(state.openPortals);
      _wallGrid = WallGrid.fromMap(state.map!, state.openPortals);
    }

    // Enforce calibrated zoom on the display only (with scale slider factor)
    if (isDisplay && state.calibratedBaseZoom != null) {
      final effectiveZoom = state.calibratedBaseZoom! * state.scaleSliderFactor;
      if (state.calibratedBaseZoom != _lastCalibratedZoom ||
          camera.viewfinder.zoom < effectiveZoom) {
        camera.viewfinder.zoom = effectiveZoom;
        _lastCalibratedZoom = state.calibratedBaseZoom;
      }
    } else {
      _lastCalibratedZoom = null;
    }
  }

  Future<void> _loadMap(UvttMap map) async {
    _clearMap();

    // Decode image
    final codec = await ui.instantiateImageCodec(map.imageBytes);
    final frame = await codec.getNextFrame();
    final image = frame.image;

    final mapPixelW = map.pixelWidth;
    final mapPixelH = map.pixelHeight;
    final mapSizeVec = Vector2(mapPixelW, mapPixelH);

    final gridCols = map.resolution.mapSize.dx.toInt();
    final gridRows = map.resolution.mapSize.dy.toInt();

    // Map image (priority 0)
    _mapImage = VttMapImageComponent(
      image: image,
      mapSize: mapSizeVec,
    );
    world.add(_mapImage!);

    // Grid overlay (priority 1)
    _gridOverlay = VttGridOverlayComponent(
      mapSize: mapSizeVec,
      pixelsPerGrid: map.resolution.pixelsPerGrid,
      gridCols: gridCols,
      gridRows: gridRows,
    );
    _gridOverlay!.isVisible = state.showGrid;
    world.add(_gridOverlay!);

    // Drawing strokes (priority 2)
    _strokes = StrokesComponent(
      state: state,
      mapSize: mapSizeVec,
    );
    world.add(_strokes!);

    // Live stroke preview (priority 3)
    _liveStroke = LiveStrokeComponent(
      state: state,
      mapSize: mapSizeVec,
    );
    world.add(_liveStroke!);

    // Tokens (priority 4)
    _tokenLayer = TokenLayer(
      state: state,
      cellSize: map.resolution.pixelsPerGrid.toDouble(),
    );
    world.add(_tokenLayer!);

    // Walls (priority 5)
    final allWalls = [...map.lineOfSight, ...map.objectsLineOfSight];
    _wallComponent = WallComponent(
      walls: allWalls,
      pixelsPerGrid: map.resolution.pixelsPerGrid,
      mapSize: mapSizeVec,
    );
    _wallComponent!.isVisible = state.showWalls;
    world.add(_wallComponent!);

    // Portals (priority 6)
    for (int i = 0; i < map.portals.length; i++) {
      final portal = PortalComponent(
        portalIndex: i,
        portal: map.portals[i],
        state: state,
        pixelsPerGrid: map.resolution.pixelsPerGrid,
      );
      _portalComponents.add(portal);
      world.add(portal);
    }

    // Torch glow (priority 8 — above portals, below fog)
    _torchGlow = TorchGlowComponent(
      state: state,
      pixelsPerGrid: map.resolution.pixelsPerGrid.toDouble(),
      mapSize: mapSizeVec,
    );
    world.add(_torchGlow!);

    // Fog of war (priority 10)
    _fogOfWar = FogOfWarComponent(
      state: state,
      pixelsPerGrid: map.resolution.pixelsPerGrid,
      gridCols: gridCols,
      gridRows: gridRows,
      mapSize: mapSizeVec,
    );
    _fogOfWar!.isVisible = state.fogEnabled;
    world.add(_fogOfWar!);

    // AoE template overlay (priority 15)
    _aoeComponent = AoeTemplateComponent(
      state: state,
      pixelsPerGrid: map.resolution.pixelsPerGrid,
      mapSize: mapSizeVec,
    );
    world.add(_aoeComponent!);

    // Measure tool overlay (priority 20 — always on top)
    _measure = MeasureComponent(
      state: state,
      pixelsPerGrid: map.resolution.pixelsPerGrid.toDouble(),
      mapSize: mapSizeVec,
    );
    world.add(_measure!);

    // Ruler overlay (priority 25 — above everything)
    _ruler = RulerComponent(
      state: state,
      pixelsPerGrid: map.resolution.pixelsPerGrid.toDouble(),
      mapSize: mapSizeVec,
    );
    world.add(_ruler!);

    // TV viewport outline (priority 28, phone only)
    if (!isDisplay) {
      _tvViewport = TvViewportComponent(
        snapshot: () => _tvCamera,
        screenZoom: () => camera.viewfinder.zoom,
        mapSize: mapSizeVec,
      );
      world.add(_tvViewport!);
    }

    // Global effects overlay (priority 30 — above everything)
    _globalEffects = GlobalEffectsComponent(
      state: state,
      game: this,
      mapSize: mapSizeVec,
    );
    world.add(_globalEffects!);

    // Build wall grid for room-reveal flood fill
    _wallGrid = WallGrid.fromMap(map, state.openPortals);
    _lastOpenPortals = Set.from(state.openPortals);

    // Sync tokens from state
    _tokenLayer!.sync();

    // Center camera on map
    camera.viewfinder.position = Vector2(mapPixelW / 2, mapPixelH / 2);

    // Zoom to fit the map in the viewport
    _zoomToFit(mapPixelW, mapPixelH);
  }

  /// Zoom at which the whole map fits the viewport (0.1 if unknown).
  double get fitZoom {
    final map = state.map;
    if (map == null || !isMounted) return 0.1;
    final viewSize = camera.viewport.size;
    if (viewSize.x == 0 || viewSize.y == 0) return 0.1;
    return min(viewSize.x / map.pixelWidth, viewSize.y / map.pixelHeight);
  }

  /// Lower zoom bound.
  ///
  /// On the display with calibration: the calibrated base zoom times the
  /// scale slider factor (grid squares never smaller than 1 inch).
  /// Otherwise half of [fitZoom], so pinching out can always show the whole
  /// map with a margin (a fixed 0.1 could not reach fit for large maps).
  double get minZoom {
    if (isDisplay && state.calibratedBaseZoom != null) {
      return state.calibratedBaseZoom! * state.scaleSliderFactor;
    }
    return fitZoom * 0.5;
  }

  void _zoomToFit(double mapW, double mapH) {
    if (!isMounted) return;
    final viewSize = camera.viewport.size;
    if (viewSize.x == 0 || viewSize.y == 0) return;
    final zoomX = viewSize.x / mapW;
    final zoomY = viewSize.y / mapH;
    camera.viewfinder.zoom = (zoomX < zoomY ? zoomX : zoomY);
  }

  void _clearMap() {
    _mapImage?.removeFromParent();
    _mapImage = null;
    _gridOverlay?.removeFromParent();
    _gridOverlay = null;
    _strokes?.removeFromParent();
    _strokes = null;
    _liveStroke?.removeFromParent();
    _liveStroke = null;
    _tokenLayer?.removeFromParent();
    _tokenLayer = null;
    _wallComponent?.removeFromParent();
    _wallComponent = null;
    for (final p in _portalComponents) {
      p.removeFromParent();
    }
    _portalComponents.clear();
    _fogOfWar?.removeFromParent();
    _fogOfWar = null;
    _aoeComponent?.removeFromParent();
    _aoeComponent = null;
    _measure?.removeFromParent();
    _measure = null;
    _ruler?.removeFromParent();
    _ruler = null;
    _tvViewport?.removeFromParent();
    _tvViewport = null;
    _torchGlow?.removeFromParent();
    _torchGlow = null;
    _globalEffects?.removeFromParent();
    _globalEffects = null;
    _wallGrid = null;
    _lastOpenPortals = null;
  }

  // --- Public camera controls (called from DM panel / relay dispatch) ---

  /// Zooms in one step (×1.3), clamped to [minZoom]..[maxZoom].
  void zoomIn() {
    camera.viewfinder.zoom = (camera.viewfinder.zoom * 1.3).clamp(minZoom, maxZoom);
  }

  /// Zooms out one step (÷1.3), clamped to [minZoom]..[maxZoom].
  void zoomOut() {
    camera.viewfinder.zoom = (camera.viewfinder.zoom / 1.3).clamp(minZoom, maxZoom);
  }

  /// Fits the whole map into the viewport and centers it.
  void zoomToFit() {
    if (state.map == null) return;
    _zoomToFit(state.map!.pixelWidth, state.map!.pixelHeight);
    camera.viewfinder.position = Vector2(
      state.map!.pixelWidth / 2,
      state.map!.pixelHeight / 2,
    );
  }

  /// Rotates the camera 90° clockwise.
  void rotateCW() {
    camera.viewfinder.angle += 1.5707963; // pi/2
  }

  /// Rotates the camera 90° counter-clockwise.
  void rotateCCW() {
    camera.viewfinder.angle -= 1.5707963; // pi/2
  }

  /// Resets the camera rotation to 0.
  void resetRotation() {
    camera.viewfinder.angle = 0;
  }

  /// Current camera zoom.
  double get currentZoom => camera.viewfinder.zoom;

  /// Current camera rotation in whole degrees.
  double get currentAngleDegrees =>
      (camera.viewfinder.angle * 180 / 3.14159265).roundToDouble();

  /// Sets the camera transform verbatim (session resume on the TV).
  void syncCamera(double x, double y, double zoom, double angle) {
    camera.viewfinder.position = Vector2(x, y);
    camera.viewfinder.zoom = zoom;
    camera.viewfinder.angle = angle;
  }

  /// Sets the camera transform with [zoom] clamped to [minZoom]..[maxZoom].
  ///
  /// Used for `vtt.setCamera` on the TV and "match TV" on the phone.
  void applyCamera(double x, double y, double zoom, double angle) {
    syncCamera(x, y, zoom.clamp(minZoom, maxZoom), angle);
  }

  /// Stores the TV's camera (phone side) for the viewport outline and
  /// "match TV". No-op on the display.
  void setTvViewport(CameraSnapshot snapshot) {
    _tvCamera = snapshot;
  }

  /// The last TV camera received via [setTvViewport], or `null`.
  CameraSnapshot? get tvCamera => _tvCamera;

  /// Moves this camera to the TV's last known transform (phone side).
  ///
  /// Does nothing when no TV camera has been received yet.
  void matchTvCamera() {
    final cam = _tvCamera;
    if (cam == null) return;
    applyCamera(cam.x, cam.y, cam.zoom, cam.angle);
  }

  /// Triggers a global visual effect on the game canvas.
  ///
  /// Delegates to [GlobalEffectsComponent.triggerEffect]. Does nothing
  /// if the global effects component has not been initialized.
  ///
  /// Supported effects: `'flash'`, `'shake'`, `'fade'`, `'pulse'`, `'danger'`.
  void triggerEffect(String effect) =>
      _globalEffects?.triggerEffect(effect);

  /// Current camera transform plus viewport size.
  CameraSnapshot get cameraSnapshot => CameraSnapshot(
        x: camera.viewfinder.position.x,
        y: camera.viewfinder.position.y,
        zoom: camera.viewfinder.zoom,
        angle: camera.viewfinder.angle,
        vw: isMounted ? camera.viewport.size.x : 0,
        vh: isMounted ? camera.viewport.size.y : 0,
      );

  /// Current camera state for broadcasting (`x`, `y`, `zoom`, `angle`,
  /// `vw`, `vh`), see [CameraSnapshot.toJson].
  Map<String, double> getCameraState() => cameraSnapshot.toJson();

  // ===== Gesture handling =====
  // Two-finger (pointerCount > 1) = camera zoom + pan
  // Single-finger drag = active tool (fog/draw/token/…)
  // Tap = active tool action

  double _getPixelsPerGrid() {
    return state.map?.resolution.pixelsPerGrid.toDouble() ?? 140.0;
  }

  int _getGridCols() {
    return state.map?.resolution.mapSize.dx.toInt() ?? 0;
  }

  int _getGridRows() {
    return state.map?.resolution.mapSize.dy.toInt() ?? 0;
  }

  /// Convert screen position to world position.
  Vector2 _screenToWorld(Vector2 screenPos) {
    return camera.globalToLocal(screenPos);
  }

  /// Minimum finger travel (screen px) before a drag starts the tool.
  static const double _dragThreshold = 4.0;

  @override
  void onScaleStart(ScaleStartInfo info) {
    _isMultiTouch = info.pointerCount > 1;
    _toolActive = false;
    _initialZoom = camera.viewfinder.zoom;
    _scaleStartPos = info.eventPosition.global.clone();
  }

  @override
  void onScaleUpdate(ScaleUpdateInfo info) {
    if (info.pointerCount > 1 && !_isMultiTouch) {
      // Second finger arrived after a single-finger start: hand the gesture
      // to the camera and drop whatever the tool had begun.
      _isMultiTouch = true;
      if (_toolActive) {
        _toolCancel();
        _toolActive = false;
      }
      _initialZoom = camera.viewfinder.zoom;
    }

    if (_isMultiTouch) {
      final newZoom = _initialZoom * info.scale.global.x;
      camera.viewfinder.zoom = newZoom.clamp(minZoom, maxZoom);
      camera.viewfinder.position -= info.delta.global / camera.viewfinder.zoom;
      return;
    }

    if (!state.isInteractive || _scaleStartPos == null) return;
    final pos = info.eventPosition.global;
    if (!_toolActive) {
      if ((pos - _scaleStartPos!).length < _dragThreshold) return;
      _toolActive = true;
      _toolDragStart(_screenToWorld(_scaleStartPos!));
    }
    _toolDragUpdate(_screenToWorld(pos));
  }

  @override
  void onScaleEnd(ScaleEndInfo info) {
    if (!_isMultiTouch && state.isInteractive) {
      if (_toolActive) {
        _toolDragEnd();
      } else if (_scaleStartPos != null) {
        _handleTap(_screenToWorld(_scaleStartPos!));
      }
    }
    _isMultiTouch = false;
    _toolActive = false;
    _draggingTokenId = null;
    _draggingRuler = false;
    _lastBrushCell = null;
    _scaleStartPos = null;
  }

  @override
  void onScroll(PointerScrollInfo info) {
    final dy = info.scrollDelta.global.y;
    if (dy == 0) return;
    final factor = dy > 0 ? 1 / 1.15 : 1.15;
    camera.viewfinder.zoom =
        (camera.viewfinder.zoom * factor).clamp(minZoom, maxZoom);
  }

  void _handleTap(Vector2 worldPos) {
    switch (state.interactionMode) {
      case InteractionMode.fogReveal:
        if (_tryTogglePortal(worldPos)) return;
        _fogToggleCell(worldPos);
      case InteractionMode.draw:
        break; // No-op
      case InteractionMode.token:
        _tokenTapAt(worldPos);
      case InteractionMode.measure:
        // Tap clears the previous measurement
        state.clearMeasure();
      case InteractionMode.roomReveal:
        if (_tryTogglePortal(worldPos)) return;
        if (_wallGrid != null) {
          final ppg = _getPixelsPerGrid();
          final cellX = (worldPos.x / ppg).floor();
          final cellY = (worldPos.y / ppg).floor();
          if (cellX >= 0 && cellX < _getGridCols() && cellY >= 0 && cellY < _getGridRows()) {
            final startIdx = cellY * _getGridCols() + cellX;
            final roomCells = _wallGrid!.floodFill(startIdx);
            state.revealRoom(roomCells);
          }
        }
      case InteractionMode.aoe:
        // AoE: tap places the active template's shape/size at this origin
        _aoeStart(worldPos);
    }
  }

  // --- Tool drag dispatch ---

  void _toolDragStart(Vector2 worldPos) {
    // The ruler is draggable in every mode while visible
    if (state.rulerVisible && _rulerHitTest(worldPos)) {
      _draggingRuler = true;
      final ppg = _getPixelsPerGrid();
      _rulerGrabOffset = Offset(
        worldPos.x / ppg - state.rulerX,
        worldPos.y / ppg - state.rulerY,
      );
      return;
    }
    switch (state.interactionMode) {
      case InteractionMode.fogReveal:
        _lastBrushCell = null;
        _fogBrushAt(worldPos);
        break;
      case InteractionMode.draw:
        _drawStart(worldPos);
        break;
      case InteractionMode.token:
        _tokenDragStart(worldPos);
        break;
      case InteractionMode.measure:
        _measureStart(worldPos);
        break;
      case InteractionMode.roomReveal:
        break; // Room reveal is tap-only
      case InteractionMode.aoe:
        _aoeStart(worldPos);
        break;
    }
  }

  void _toolDragUpdate(Vector2 worldPos) {
    if (_draggingRuler) {
      final ppg = _getPixelsPerGrid();
      state.setRulerPosition(
        worldPos.x / ppg - _rulerGrabOffset.dx,
        worldPos.y / ppg - _rulerGrabOffset.dy,
      );
      return;
    }
    switch (state.interactionMode) {
      case InteractionMode.fogReveal:
        _fogBrushAt(worldPos);
        break;
      case InteractionMode.draw:
        _drawUpdate(worldPos);
        break;
      case InteractionMode.token:
        _tokenDragUpdate(worldPos);
        break;
      case InteractionMode.measure:
        _measureUpdate(worldPos);
        break;
      case InteractionMode.roomReveal:
        break;
      case InteractionMode.aoe:
        _aoeUpdate(worldPos);
        break;
    }
  }

  void _toolDragEnd() {
    if (_draggingRuler) {
      _draggingRuler = false;
      return;
    }
    switch (state.interactionMode) {
      case InteractionMode.fogReveal:
        _lastBrushCell = null;
        break;
      case InteractionMode.draw:
        _drawEnd();
        break;
      case InteractionMode.token:
        _draggingTokenId = null;
        break;
      case InteractionMode.measure:
        // Keep measurement visible until next interaction
        break;
      case InteractionMode.roomReveal:
        break;
      case InteractionMode.aoe:
        break; // Keep template visible
    }
  }

  /// Aborts an in-progress tool gesture because a second finger arrived.
  ///
  /// Discards the live stroke and any drag handles; fog cells already
  /// painted stay (they are undoable).
  void _toolCancel() {
    _draggingRuler = false;
    _draggingTokenId = null;
    _lastBrushCell = null;
    if (_currentStrokePoints.isNotEmpty) {
      _currentStrokePoints.clear();
      state.setLiveStroke(null);
    }
  }

  // ===== AoE tool =====

  Vector2? _aoeOrigin;

  /// Places the active template ([VttState.aoeShape] / [VttState.aoeRadius])
  /// with its origin at [worldPos]; the angle of an existing template of
  /// the same shape is kept.
  void _aoeStart(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    _aoeOrigin = worldPos;
    final current = state.activeAoe;
    state.setAoe(AoeTemplate(
      shape: state.aoeShape,
      originX: worldPos.x / ppg,
      originY: worldPos.y / ppg,
      radius: state.aoeRadius,
      angle: current != null && current.shape == state.aoeShape ? current.angle : 0,
    ));
  }

  /// Drag: cone/line aim from the origin towards the finger; circle/square
  /// move with the finger. Shape and radius are never changed by dragging.
  void _aoeUpdate(Vector2 worldPos) {
    if (_aoeOrigin == null) return;
    final ppg = _getPixelsPerGrid();
    final current = state.activeAoe;
    final shape = current?.shape ?? state.aoeShape;
    final radius = current?.radius ?? state.aoeRadius;
    switch (shape) {
      case AoeShape.cone:
      case AoeShape.line:
        final dx = worldPos.x - _aoeOrigin!.x;
        final dy = worldPos.y - _aoeOrigin!.y;
        if (dx.abs() < 1 && dy.abs() < 1) return;
        state.setAoe(AoeTemplate(
          shape: shape,
          originX: _aoeOrigin!.x / ppg,
          originY: _aoeOrigin!.y / ppg,
          radius: radius,
          angle: atan2(dy, dx),
        ));
      case AoeShape.circle:
      case AoeShape.square:
        state.setAoe(AoeTemplate(
          shape: shape,
          originX: worldPos.x / ppg,
          originY: worldPos.y / ppg,
          radius: radius,
          angle: current?.angle ?? 0,
        ));
    }
  }

  // ===== Fog reveal tool =====

  void _fogToggleCell(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    final cellX = (worldPos.x / ppg).floor();
    final cellY = (worldPos.y / ppg).floor();
    final gridCols = _getGridCols();
    final gridRows = _getGridRows();
    if (cellX < 0 || cellX >= gridCols || cellY < 0 || cellY >= gridRows) {
      return;
    }
    final index = cellY * gridCols + cellX;
    state.toggleReveal(index);
  }

  /// Paints the brush around [worldPos]; skipped while the finger stays in
  /// the same cell so a drag sends one `vtt.brushReveal` per cell, not per
  /// frame.
  void _fogBrushAt(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    final centerX = (worldPos.x / ppg).floor();
    final centerY = (worldPos.y / ppg).floor();
    final r = state.brushRadius;
    final gridCols = _getGridCols();
    final gridRows = _getGridRows();
    final centerIndex = centerY * gridCols + centerX;
    if (_lastBrushCell == centerIndex) return;
    _lastBrushCell = centerIndex;
    final indices = <int>[];

    for (int dy = -r; dy <= r; dy++) {
      for (int dx = -r; dx <= r; dx++) {
        // Circular brush
        if (dx * dx + dy * dy > r * r + r) continue;
        final cx = centerX + dx;
        final cy = centerY + dy;
        if (cx < 0 || cx >= gridCols || cy < 0 || cy >= gridRows) continue;
        indices.add(cy * gridCols + cx);
      }
    }

    if (indices.isNotEmpty) {
      // applyBrushReveal handles reveal/hide logic and notifies listeners
      state.applyBrushReveal(indices);
      state.onBrushPaint?.call(indices);
    }
  }

  /// Toggles the portal under [worldPos], with a quarter-square hit pad on
  /// each side. Returns `true` if a portal was hit.
  bool _tryTogglePortal(Vector2 worldPos) {
    final portals = state.map?.portals ?? [];
    final ppg = _getPixelsPerGrid();
    final pad = 0.25 * ppg;
    for (int i = 0; i < portals.length; i++) {
      final p = portals[i];
      final p0x = p.bounds[0].x * ppg;
      final p0y = p.bounds[0].y * ppg;
      final p1x = p.bounds[1].x * ppg;
      final p1y = p.bounds[1].y * ppg;
      final rect = Rect.fromLTRB(
        min(p0x, p1x) - pad,
        min(p0y, p1y) - pad,
        max(p0x, p1x) + pad,
        max(p0y, p1y) + pad,
      );
      if (rect.contains(worldPos.toOffset())) {
        state.togglePortal(i);
        state.onPortalTap?.call(i);
        return true;
      }
    }
    return false;
  }

  // ===== Draw tool =====

  void _drawStart(Vector2 worldPos) {
    _currentStrokePoints = [worldPos.toOffset()];
  }

  void _drawUpdate(Vector2 worldPos) {
    _currentStrokePoints.add(worldPos.toOffset());
    state.setLiveStroke(DrawStroke(
      points: List.from(_currentStrokePoints),
      color: state.drawColor,
      width: state.drawWidth,
    ));
  }

  void _drawEnd() {
    if (_currentStrokePoints.length >= 2) {
      final stroke = DrawStroke(
        points: List.from(_currentStrokePoints),
        color: state.drawColor,
        width: state.drawWidth,
      );
      state.addStroke(stroke);
    }
    state.setLiveStroke(null);
    _currentStrokePoints.clear();
  }

  // ===== Token tool =====

  void _tokenTapAt(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    final gridX = (worldPos.x / ppg).floor();
    final gridY = (worldPos.y / ppg).floor();

    // Check if token already exists at this position
    final existing =
        state.tokens.where((t) => t.gridX == gridX && t.gridY == gridY);
    if (existing.isEmpty) {
      state.addToken(gridX, gridY);
    } else {
      // Long-press to remove is not available via tap; tapping an occupied cell
      // does nothing for now (could cycle selection in the future).
    }
  }

  void _tokenDragStart(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    final gridX = (worldPos.x / ppg).floor();
    final gridY = (worldPos.y / ppg).floor();

    // Find token at this grid position
    for (final token in state.tokens) {
      if (token.gridX == gridX && token.gridY == gridY) {
        _draggingTokenId = token.id;
        return;
      }
    }
    _draggingTokenId = null;
  }

  void _tokenDragUpdate(Vector2 worldPos) {
    if (_draggingTokenId == null) return;
    final ppg = _getPixelsPerGrid();
    final newGridX = (worldPos.x / ppg).floor();
    final newGridY = (worldPos.y / ppg).floor();

    // Only move if position changed
    final token = state.tokens.where((t) => t.id == _draggingTokenId);
    if (token.isEmpty) return;
    final t = token.first;
    if (t.gridX != newGridX || t.gridY != newGridY) {
      state.moveToken(_draggingTokenId!, newGridX, newGridY);
    }
  }

  // ===== Measure tool =====

  /// Begins a new measurement at the given world position (start = end).
  void _measureStart(Vector2 worldPos) {
    final p = worldPos.toOffset();
    state.setMeasure(p, p);
  }

  /// Updates the endpoint of the current measurement as the user drags.
  void _measureUpdate(Vector2 worldPos) {
    state.setMeasure(state.measureStart ?? worldPos.toOffset(), worldPos.toOffset());
  }

  // ===== Ruler =====

  /// Whether [worldPos] lies on one of the ruler's arms (plus a small pad).
  ///
  /// Transforms the point into the ruler's local frame (corner at the
  /// origin, arms along +x and −y, see [RulerComponent]) and tests the two
  /// arm rectangles.
  bool _rulerHitTest(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    final dx = worldPos.x - state.rulerX * ppg;
    final dy = worldPos.y - state.rulerY * ppg;
    final a = -state.rulerRotation * pi / 180;
    final lx = dx * cos(a) - dy * sin(a);
    final ly = dx * sin(a) + dy * cos(a);
    final len = RulerComponent.armLengthSquares * ppg;
    final w = RulerComponent.armWidthSquares * ppg;
    final pad = 0.15 * ppg;
    final onHorizontal = lx >= -pad && lx <= len + pad && ly >= -w - pad && ly <= pad;
    final onVertical = lx >= -w - pad && lx <= pad && ly >= -len - pad && ly <= pad;
    return onHorizontal || onVertical;
  }
}
