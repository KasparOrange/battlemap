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

/// Flame game for VTT table display.
/// Renders the map image with grid overlay, handles camera pan/zoom.
class VttGame extends FlameGame with ScaleDetector, PanDetector {
  final VttState state;

  VttMapImageComponent? _mapImage;
  VttGridOverlayComponent? _gridOverlay;
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
    _fogOfWar?.isVisible = state.fogEnabled;
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

    // Fog of war
    final gridCols = map.resolution.mapSize.dx.toInt();
    final gridRows = map.resolution.mapSize.dy.toInt();
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
    _fogOfWar?.removeFromParent();
    _fogOfWar = null;
  }

  // --- Camera gestures ---

  double _initialZoom = 1.0;

  @override
  void onScaleStart(ScaleStartInfo info) {
    _initialZoom = camera.viewfinder.zoom;
  }

  @override
  void onScaleUpdate(ScaleUpdateInfo info) {
    final newZoom = _initialZoom * info.scale.global.x;
    camera.viewfinder.zoom = newZoom.clamp(0.1, 10.0);
  }

  @override
  void onPanUpdate(DragUpdateInfo info) {
    camera.viewfinder.position -= info.delta.global / camera.viewfinder.zoom;
  }
}
