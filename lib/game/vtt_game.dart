import 'dart:async';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import '../model/draw_stroke.dart';
import '../model/uvtt_map.dart';
import '../state/vtt_state.dart';
import 'components/fog_of_war_component.dart';
import 'components/grid_overlay_component.dart';
import 'components/live_stroke_component.dart';
import 'components/map_image_component.dart';
import 'components/portal_component.dart';
import 'components/strokes_component.dart';
import 'components/token_layer.dart';
import 'components/wall_component.dart';

/// Flame game for VTT table display.
/// Renders the map image with grid overlay, handles camera pan/zoom.
/// Routes single-finger input to the active tool (fog/draw/token).
/// Two-finger gestures control the camera (pinch zoom + drag pan).
class VttGame extends FlameGame with ScaleDetector {
  final VttState state;

  VttMapImageComponent? _mapImage;
  VttGridOverlayComponent? _gridOverlay;
  WallComponent? _wallComponent;
  final List<PortalComponent> _portalComponents = [];
  FogOfWarComponent? _fogOfWar;
  StrokesComponent? _strokes;
  LiveStrokeComponent? _liveStroke;
  TokenLayer? _tokenLayer;

  double? _lastCalibratedZoom;

  // Camera gesture state
  double _initialZoom = 1.0;
  bool _isMultiTouch = false;

  // Drawing state for live stroke
  List<Offset> _currentStrokePoints = [];

  // Token drag state
  String? _draggingTokenId;

  // Tap detection (short gesture with minimal movement)
  Vector2? _scaleStartPos;
  bool _hasDragged = false;

  VttGame({required this.state});

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

    // Enforce calibrated zoom
    if (state.calibratedBaseZoom != null) {
      if (state.calibratedBaseZoom != _lastCalibratedZoom) {
        camera.viewfinder.zoom = state.calibratedBaseZoom!;
        _lastCalibratedZoom = state.calibratedBaseZoom;
      } else if (camera.viewfinder.zoom < state.calibratedBaseZoom!) {
        camera.viewfinder.zoom = state.calibratedBaseZoom!;
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

    // Sync tokens from state
    _tokenLayer!.sync();

    // Center camera on map
    camera.viewfinder.position = Vector2(mapPixelW / 2, mapPixelH / 2);

    // Zoom to fit the map in the viewport
    _zoomToFit(mapPixelW, mapPixelH);
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
  }

  // --- Public camera controls (called from DM panel) ---

  void zoomIn() {
    final minZoom = state.calibratedBaseZoom ?? 0.1;
    camera.viewfinder.zoom = (camera.viewfinder.zoom * 1.3).clamp(minZoom, 10.0);
  }

  void zoomOut() {
    final minZoom = state.calibratedBaseZoom ?? 0.1;
    camera.viewfinder.zoom = (camera.viewfinder.zoom / 1.3).clamp(minZoom, 10.0);
  }

  void zoomToFit() {
    if (state.map == null) return;
    _zoomToFit(state.map!.pixelWidth, state.map!.pixelHeight);
    camera.viewfinder.position = Vector2(
      state.map!.pixelWidth / 2,
      state.map!.pixelHeight / 2,
    );
  }

  void rotateCW() {
    camera.viewfinder.angle += 1.5707963; // pi/2
  }

  void rotateCCW() {
    camera.viewfinder.angle -= 1.5707963; // pi/2
  }

  void resetRotation() {
    camera.viewfinder.angle = 0;
  }

  double get currentZoom => camera.viewfinder.zoom;
  double get currentAngleDegrees =>
      (camera.viewfinder.angle * 180 / 3.14159265).roundToDouble();

  /// Set camera to match TV state (called on phone after receiving vtt.fullState).
  void syncCamera(double x, double y, double zoom, double angle) {
    camera.viewfinder.position = Vector2(x, y);
    camera.viewfinder.zoom = zoom;
    camera.viewfinder.angle = angle;
  }

  /// Get current camera state for broadcasting.
  Map<String, double> getCameraState() => {
        'x': camera.viewfinder.position.x,
        'y': camera.viewfinder.position.y,
        'zoom': camera.viewfinder.zoom,
        'angle': camera.viewfinder.angle,
      };

  // ===== Gesture handling =====
  // Two-finger (scale) = camera zoom + pan
  // Single-finger drag = active tool (fog/draw/token)
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

  // --- Scale gestures (pinch zoom + camera pan, or single-finger tool drag) ---

  @override
  void onScaleStart(ScaleStartInfo info) {
    _isMultiTouch = false;
    _hasDragged = false;
    _initialZoom = camera.viewfinder.zoom;
    _scaleStartPos = info.eventPosition.global.clone();

    if (!state.isInteractive) return;

    // Start tool gesture (will be cancelled if multi-touch detected)
    final worldPos = _screenToWorld(info.eventPosition.global);
    _toolDragStart(worldPos);
  }

  @override
  void onScaleUpdate(ScaleUpdateInfo info) {
    // Detect multi-touch by checking if scale deviates from 1.0
    if ((info.scale.global.x - 1.0).abs() > 0.05) {
      _isMultiTouch = true;
    }

    if (_isMultiTouch) {
      // Camera zoom
      final minZoom = state.calibratedBaseZoom ?? 0.1;
      final newZoom = _initialZoom * info.scale.global.x;
      camera.viewfinder.zoom = newZoom.clamp(minZoom, 10.0);
      // Camera pan
      camera.viewfinder.position -= info.delta.global / camera.viewfinder.zoom;
    } else if (state.isInteractive) {
      // Single-finger tool drag — mark as dragged if moved enough
      if (_scaleStartPos != null &&
          (info.eventPosition.global - _scaleStartPos!).length > 5) {
        _hasDragged = true;
      }
      final worldPos = _screenToWorld(info.eventPosition.global);
      _toolDragUpdate(worldPos);
    }
  }

  @override
  void onScaleEnd(ScaleEndInfo info) {
    if (!_isMultiTouch && state.isInteractive) {
      // If barely moved, treat as a tap
      if (!_hasDragged && _scaleStartPos != null) {
        final worldPos = _screenToWorld(_scaleStartPos!);
        _handleTap(worldPos);
      }
      _toolDragEnd();
    }
    _isMultiTouch = false;
    _draggingTokenId = null;
    _scaleStartPos = null;
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
    }
  }

  // --- Tool drag dispatch ---

  void _toolDragStart(Vector2 worldPos) {
    switch (state.interactionMode) {
      case InteractionMode.fogReveal:
        _fogBrushAt(worldPos);
        break;
      case InteractionMode.draw:
        _drawStart(worldPos);
        break;
      case InteractionMode.token:
        _tokenDragStart(worldPos);
        break;
    }
  }

  void _toolDragUpdate(Vector2 worldPos) {
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
    }
  }

  void _toolDragEnd() {
    switch (state.interactionMode) {
      case InteractionMode.fogReveal:
        // No finalization needed for fog
        break;
      case InteractionMode.draw:
        _drawEnd();
        break;
      case InteractionMode.token:
        _draggingTokenId = null;
        break;
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

  void _fogBrushAt(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    final centerX = (worldPos.x / ppg).floor();
    final centerY = (worldPos.y / ppg).floor();
    final r = state.brushRadius;
    final gridCols = _getGridCols();
    final gridRows = _getGridRows();
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

  bool _tryTogglePortal(Vector2 worldPos) {
    final portals = state.map?.portals ?? [];
    final ppg = _getPixelsPerGrid();
    const pad = 8.0;
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
}
