import 'dart:async';
import 'dart:ui' as ui;

import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

import '../model/uvtt_map.dart';
import '../state/vtt_state.dart';
import 'components/fog_of_war_component.dart';
import 'components/grid_overlay_component.dart';
import 'components/map_image_component.dart';
import 'components/portal_component.dart';
import 'components/wall_component.dart';

/// Flame game for VTT table display.
/// Renders the map image with grid overlay, handles camera pan/zoom.
class VttGame extends FlameGame with ScaleDetector, PanDetector {
  final VttState state;

  VttMapImageComponent? _mapImage;
  VttGridOverlayComponent? _gridOverlay;
  WallComponent? _wallComponent;
  final List<PortalComponent> _portalComponents = [];
  FogOfWarComponent? _fogOfWar;

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

    // Enforce calibrated zoom floor
    if (state.calibratedBaseZoom != null &&
        camera.viewfinder.zoom < state.calibratedBaseZoom!) {
      camera.viewfinder.zoom = state.calibratedBaseZoom!;
    }
  }

  Future<void> _loadMap(UvttMap map) async {
    // Clear previous
    _clearMap();

    // Decode image
    final codec = await ui.instantiateImageCodec(map.imageBytes);
    final frame = await codec.getNextFrame();
    final image = frame.image;

    final mapPixelW = map.pixelWidth;
    final mapPixelH = map.pixelHeight;

    // Map image
    _mapImage = VttMapImageComponent(
      image: image,
      mapSize: Vector2(mapPixelW, mapPixelH),
    );
    world.add(_mapImage!);

    // Grid overlay
    _gridOverlay = VttGridOverlayComponent(
      mapSize: Vector2(mapPixelW, mapPixelH),
      pixelsPerGrid: map.resolution.pixelsPerGrid,
      gridCols: map.resolution.mapSize.dx.toInt(),
      gridRows: map.resolution.mapSize.dy.toInt(),
    );
    _gridOverlay!.isVisible = state.showGrid;
    world.add(_gridOverlay!);

    final gridCols = map.resolution.mapSize.dx.toInt();
    final gridRows = map.resolution.mapSize.dy.toInt();
    final mapSizeVec = Vector2(mapPixelW, mapPixelH);

    // Walls (DM debug, hidden by default)
    final allWalls = [...map.lineOfSight, ...map.objectsLineOfSight];
    _wallComponent = WallComponent(
      walls: allWalls,
      pixelsPerGrid: map.resolution.pixelsPerGrid,
      mapSize: mapSizeVec,
    );
    _wallComponent!.isVisible = state.showWalls;
    world.add(_wallComponent!);

    // Portals (doors)
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

    // Fog of war
    _fogOfWar = FogOfWarComponent(
      state: state,
      pixelsPerGrid: map.resolution.pixelsPerGrid,
      gridCols: gridCols,
      gridRows: gridRows,
      mapSize: Vector2(mapPixelW, mapPixelH),
    );
    _fogOfWar!.isVisible = state.fogEnabled;
    world.add(_fogOfWar!);

    // Center camera on map
    camera.viewfinder.position = Vector2(mapPixelW / 2, mapPixelH / 2);

    // Zoom to fit the map in the viewport
    _zoomToFit(mapPixelW, mapPixelH);
  }

  void _zoomToFit(double mapW, double mapH) {
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
    camera.viewfinder.angle += 1.5707963; // π/2
  }

  void rotateCCW() {
    camera.viewfinder.angle -= 1.5707963; // π/2
  }

  void resetRotation() {
    camera.viewfinder.angle = 0;
  }

  double get currentZoom => camera.viewfinder.zoom;
  double get currentAngleDegrees => (camera.viewfinder.angle * 180 / 3.14159265).roundToDouble();

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

  // --- Camera gestures ---

  double _initialZoom = 1.0;

  @override
  void onScaleStart(ScaleStartInfo info) {
    _initialZoom = camera.viewfinder.zoom;
  }

  @override
  void onScaleUpdate(ScaleUpdateInfo info) {
    final newZoom = _initialZoom * info.scale.global.x;
    final minZoom = state.calibratedBaseZoom ?? 0.1;
    camera.viewfinder.zoom = newZoom.clamp(minZoom, 10.0);
  }

  @override
  void onPanUpdate(DragUpdateInfo info) {
    camera.viewfinder.position -= info.delta.global / camera.viewfinder.zoom;
  }
}
