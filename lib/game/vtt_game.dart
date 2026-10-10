import 'dart:math';
import 'dart:ui' as ui;

import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/foundation.dart' show setEquals;
import 'package:flutter/material.dart';

import '../model/aoe_template.dart';
import '../model/draw_stroke.dart';
import '../model/table_fit.dart';
import '../model/uvtt_map.dart';
import '../state/vtt_state.dart';
import 'components/aoe_template_component.dart';
import 'components/dm_overlay_component.dart';
import 'components/fog_of_war_component.dart';
import 'components/global_effects_component.dart';
import 'components/grid_overlay_component.dart';
import 'components/live_stroke_component.dart';
import 'components/map_image_component.dart';
import 'components/portal_component.dart';
import 'components/strokes_component.dart';
import 'components/table_frame_component.dart';
import 'components/measure_component.dart';
import 'components/ruler_component.dart';
import 'components/token_layer.dart';
import 'components/torch_glow_component.dart';
import 'components/tv_viewport_component.dart';
import 'components/wall_component.dart';
import 'dm_overlay_images.dart';
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
/// **Table view** ([tableDisplay], the TV): the camera follows
/// [VttState.tvCameraMode]. In [TvCameraMode.table] one map square is one
/// physical inch and the screen shows a centred window of whole squares
/// ([TableGrid], [TableLayout]; leftover masked by [TableFrameComponent]);
/// [TvCameraMode.fit] shows the whole map; [TvCameraMode.free] leaves the
/// camera alone. The phone ([isDisplay] = `false`) draws the TV's window as
/// a frame with a drag grip ([TvViewportComponent], [tvTableLayout],
/// [onTvWindowDrag]). The minimum zoom is half the fit-to-screen zoom
/// everywhere, so the whole map can always be seen ([minZoom]).
///
/// See also:
/// - [VttState], the shared state this game renders.
/// - [TvViewportComponent], the phone-side outline of the TV's view.
class VttGame extends FlameGame with ScaleDetector, ScrollDetector {
  /// The shared state rendered by this game.
  final VttState state;

  /// Whether this instance is a display (the TV, or the companion's local
  /// mode) rather than the networked phone preview (free camera, TV viewport
  /// overlay).
  final bool isDisplay;

  /// Whether this game is the TV at the table: it lays out the camera from
  /// [VttState.tvCameraMode] (one inch per square in [TvCameraMode.table])
  /// and masks the leftover around the window of whole squares. `false` on
  /// the phone and in the companion's local mode, whose screen is no table.
  final bool tableDisplay;

  /// Picture cache for the DM-only layers ([VttState.dmOverlays]).
  ///
  /// Only the companion passes one; without it (the TV) no
  /// [DmOverlayComponent] exists, so the TV cannot show DM layers no matter
  /// what the state says.
  final DmOverlayImages? dmOverlayImages;

  VttMapImageComponent? _mapImage;

  /// The [UvttMap] whose components are (being) built — compared by identity
  /// so a newly loaded map replaces the old one, not just the first map.
  UvttMap? _loadedMap;

  /// The view to restore after the same picture was re-gridded (centre as
  /// a fraction of the map, zoom × map width), or `null`.
  ({double fx, double fy, double zw})? _regridView;

  /// Bumped per [_loadMap]; a decode that finishes after a newer load started
  /// discards itself instead of adding stale components.
  int _loadGeneration = 0;
  VttGridOverlayComponent? _gridOverlay;
  WallComponent? _wallComponent;
  final List<PortalComponent> _portalComponents = [];
  FogOfWarComponent? _fogOfWar;
  DmOverlayComponent? _dmOverlays;
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

  /// The TV's table frame (mask + calibration pattern), [tableDisplay] only.
  TableFrameComponent? _tableFrame;

  /// Whether a map picture is being decoded ([_loadMap] in flight).
  bool _mapLoading = false;

  /// Camera from [syncCamera] that arrived while a map was decoding; applied
  /// when the load finishes instead of the default fit (session resume).
  ({double x, double y, double zoom, double angle})? _pendingSync;

  /// Map square the phone's drag of the TV frame grip started on, and the
  /// window centre (squares) at that moment; `null` when not dragging.
  Offset? _tvDragStartSquares;
  Offset? _tvDragStartCenter;

  /// Window start the phone shows while the DM moves the TV frame (grip or
  /// overview map) until the TV confirms it, or `null`.
  ({int col, int row})? _tvDragPreview;

  /// When [_tvDragPreview] was last set.
  DateTime? _tvDragPreviewAt;

  /// Whether a move of the TV frame is in progress (finger still down).
  bool _tvWindowDragging = false;

  /// Bumped when the TV camera snapshot or the map picture changes — the
  /// companion's overview map listens to repaint.
  final ValueNotifier<int> viewRevision = ValueNotifier(0);

  /// Upper zoom bound (screen pixels per world pixel).
  static const double maxZoom = 10.0;

  /// Longest side, in pixels, a map picture is decoded to.
  ///
  /// Bigger Dungeondraft exports (a 114×64-square castle at 150 px/square is
  /// 17100×9600) exceed GPU texture limits and would need ~650 MB decoded —
  /// the TV then showed an empty screen. Larger pictures are decoded straight
  /// to this size (no full-size intermediate); the map keeps its grid
  /// coordinates because the picture is always drawn stretched to
  /// [UvttMap.pixelWidth] × [UvttMap.pixelHeight]. 4096² RGBA ≈ 64 MB.
  static const int maxMapTextureSide = 4096;

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

  /// Called on the phone while the DM drags the TV frame's grip or the
  /// overview map's window: the window start the TV should show
  /// ([TableLayout.col]/[TableLayout.row], clamped), with [done] `true` on
  /// release. The companion forwards it as `vtt.setTableWindow`.
  void Function(int col, int row, {required bool done})? onTvWindowDrag;

  /// Creates the game for [state]. [isDisplay] is `true` on the TV and in
  /// the companion's local mode, `false` for the networked phone preview;
  /// [tableDisplay] is `true` on the TV only. Pass [dmOverlayImages] on the
  /// DM's device only (see the field).
  VttGame({
    required this.state,
    this.isDisplay = true,
    this.tableDisplay = false,
    this.dmOverlayImages,
  });

  @override
  Color backgroundColor() => const Color(0xFF111111);

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    if (tableDisplay) {
      _tableFrame = TableFrameComponent(
        grid: () => tableGrid,
        masked: () =>
            state.map != null && state.tvCameraMode == TvCameraMode.table,
        calibrating: () => state.showCalibration,
        background: backgroundColor(),
      );
      camera.viewport.add(_tableFrame!);
    }
    if (state.map != null) {
      _loadedMap = state.map;
      _loadMap(state.map!);
    }
  }

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    // The TV's screen size decides the table's whole squares.
    if (tableDisplay && isMounted) _applyTvView();
  }

  /// Subscribes to [state] each time the game is attached to a GameWidget.
  ///
  /// The TV drops its GameWidget whenever it leaves the game view (back to the
  /// library) and builds a new one for the next game; Flame then calls
  /// [onRemove] and later [onMount] again, but never [onLoad] a second time.
  /// The listener used to be added in [onLoad] only, so after the first trip
  /// to the library the TV stopped following state — a new map, tokens and
  /// doors stayed stale (found 2026-10-10). Catches up on attach.
  @override
  void onMount() {
    super.onMount();
    state.addListener(_onStateChanged);
    state.onRevealRadiusChanged = _resizeLiveCircle;
    _onStateChanged();
  }

  @override
  void onRemove() {
    state.removeListener(_onStateChanged);
    if (state.onRevealRadiusChanged == _resizeLiveCircle) {
      state.onRevealRadiusChanged = null;
    }
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
    // Rebuild whenever the map object changes. Before 2026-10-10 this checked
    // `_mapImage == null`, so the first map's picture stayed for the whole app
    // run while fog, doors and grid already belonged to the next map.
    if (state.map != null && !identical(state.map, _loadedMap)) {
      final prev = _loadedMap;
      // The same picture re-gridded (grid editor): keep the view where it
      // was instead of jumping back to the whole map.
      _regridView = prev != null &&
              identical(prev.imageBytes, state.map!.imageBytes) &&
              _mapImage != null
          ? (
              fx: camera.viewfinder.position.x / prev.pixelWidth,
              fy: camera.viewfinder.position.y / prev.pixelHeight,
              zw: camera.viewfinder.zoom * prev.pixelWidth,
            )
          : null;
      _loadedMap = state.map;
      _loadMap(state.map!);
    } else if (state.map == null && _loadedMap != null) {
      _loadedMap = null;
      _loadGeneration++;
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

    // The TV frames the map as its camera mode says (table / whole map)
    if (tableDisplay) _applyTvView();
  }

  Future<void> _loadMap(UvttMap map) async {
    final generation = ++_loadGeneration;
    _clearMap();
    _mapLoading = true;

    // Decode image, shrunk to maxMapTextureSide if it is bigger. A raster
    // map keeps its picture's proportions (its grid rectangle is mapped
    // onto the squares at draw time); a .dd2vtt picture is the map's size.
    final grid = state.rasterGrid;
    final pictureW = grid?.pictureW ?? map.pixelWidth;
    final pictureH = grid?.pictureH ?? map.pixelHeight;
    final longest = max(pictureW, pictureH);
    final shrink = longest > maxMapTextureSide ? maxMapTextureSide / longest : 1.0;
    final codec = await ui.instantiateImageCodec(
      map.imageBytes,
      targetWidth: shrink < 1 ? (pictureW * shrink).round() : null,
      targetHeight: shrink < 1 ? (pictureH * shrink).round() : null,
    );
    final frame = await codec.getNextFrame();
    final image = frame.image;
    if (generation != _loadGeneration) {
      // Another map was loaded while this one decoded — drop this one.
      image.dispose();
      return;
    }
    _mapLoading = false;

    final mapPixelW = map.pixelWidth;
    final mapPixelH = map.pixelHeight;
    final mapSizeVec = Vector2(mapPixelW, mapPixelH);

    final gridCols = map.resolution.mapSize.dx.toInt();
    final gridRows = map.resolution.mapSize.dy.toInt();

    // Map image (priority 0)
    _mapImage = VttMapImageComponent(
      image: image,
      mapSize: mapSizeVec,
      source: grid?.rect,
      pictureSize: grid == null ? null : Size(grid.pictureW, grid.pictureH),
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
      isDisplay: isDisplay,
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

    // Portals (priority 6; a drawn door on the TV 11 — above the fog)
    for (int i = 0; i < map.portals.length; i++) {
      final portal = PortalComponent(
        portalIndex: i,
        portal: map.portals[i],
        state: state,
        pixelsPerGrid: map.resolution.pixelsPerGrid,
        // Door markers are for the DM; the TV shows the map's own doors.
        showMarker: !isDisplay,
        forPlayers: isDisplay,
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
      forPlayers: isDisplay,
    );
    _fogOfWar!.isVisible = state.fogEnabled;
    world.add(_fogOfWar!);

    // DM-only picture layers (priority 12 — above the fog, companion only)
    if (dmOverlayImages != null) {
      _dmOverlays = DmOverlayComponent(
        state: state,
        images: dmOverlayImages!,
        mapSize: mapSizeVec,
      );
      world.add(_dmOverlays!);
    }

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
      viewAngle: () => camera.viewfinder.angle,
    );
    world.add(_ruler!);

    // TV viewport outline (priority 28, phone only)
    if (!isDisplay) {
      _tvViewport = TvViewportComponent(
        snapshot: () => _tvCamera,
        screenZoom: () => camera.viewfinder.zoom,
        mapSize: mapSizeVec,
        tableWindow: () => _tvFrameRect(),
        showHandle: () => tvTableLayout()?.pans ?? false,
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

    final pending = _pendingSync;
    _pendingSync = null;
    if (pending != null) {
      // A resumed session's camera arrived while the picture decoded
      syncCamera(pending.x, pending.y, pending.zoom, pending.angle);
    } else if (_regridView case final v?) {
      // Same picture, new grid: same spot, same on-screen size.
      camera.viewfinder.position = Vector2(v.fx * mapPixelW, v.fy * mapPixelH);
      camera.viewfinder.zoom = v.zw / mapPixelW;
    } else {
      // Center camera on map and zoom to fit it in the viewport
      camera.viewfinder.position = Vector2(mapPixelW / 2, mapPixelH / 2);
      _zoomToFit(mapPixelW, mapPixelH);
    }
    _regridView = null;
    if (tableDisplay) _applyTvView();
    viewRevision.value++;
  }

  // ===== Table view (TV) =====

  /// The TV's table for its current screen and calibration, or `null`
  /// before the viewport has a size. Meaningful on the TV ([tableDisplay]).
  TableGrid? get tableGrid {
    if (!isMounted) return null;
    final v = camera.viewport.size;
    return state.tableGridFor(Size(v.x, v.y));
  }

  /// The table layout for the loaded map on this screen at the current
  /// rotation. The window starts at [col]/[row]; with [useState] a `null`
  /// falls back to the state's window ([VttState.tableCol]/[tableRow]),
  /// without it `null` means centred. `null` without a map or screen size.
  /// TV side.
  TableLayout? _tableLayout({int? col, int? row, bool useState = true}) {
    final map = state.map;
    final grid = tableGrid;
    if (map == null || grid == null) return null;
    return TableLayout.compute(
      grid: grid,
      mapCols: map.resolution.mapSize.dx.toInt(),
      mapRows: map.resolution.mapSize.dy.toInt(),
      cellPx: map.resolution.pixelsPerGrid.toDouble(),
      quarterTurns: quarterTurnsOf(camera.viewfinder.angle),
      col: useState ? (col ?? state.tableCol) : col,
      row: useState ? (row ?? state.tableRow) : row,
    );
  }

  /// Frames the map as [VttState.tvCameraMode] says. TV only, no-op while
  /// the picture decodes (the load calls it when done).
  void _applyTvView() {
    if (!tableDisplay || state.map == null || _mapLoading || _mapImage == null) {
      return;
    }
    switch (state.tvCameraMode) {
      case TvCameraMode.table:
        _layoutTable();
      case TvCameraMode.fit:
        _fitWholeMap();
      case TvCameraMode.free:
        break;
    }
  }

  /// Puts the camera on the table layout: one square = one inch, the
  /// window's edges on square boundaries, the angle snapped to 90°. Stores
  /// the clamped window start (`null` on an axis that does not pan) and the
  /// screen's whole squares in the state.
  void _layoutTable() {
    final layout = _tableLayout();
    final grid = tableGrid;
    if (layout == null || grid == null) return;
    camera.viewfinder.angle = quarterTurnsOf(camera.viewfinder.angle) * pi / 2;
    camera.viewfinder.zoom = layout.zoom;
    camera.viewfinder.position = Vector2(layout.center.dx, layout.center.dy);
    state.updateTableWindow(
      col: layout.pansX ? layout.col : null,
      row: layout.pansY ? layout.row : null,
      cols: grid.cols,
      rows: grid.rows,
    );
  }

  /// Whole map on the screen, rotation-aware, centred.
  void _fitWholeMap() {
    final map = state.map;
    if (map == null || !isMounted) return;
    final v = camera.viewport.size;
    if (v.x == 0 || v.y == 0) return;
    final sideways = quarterTurnsOf(camera.viewfinder.angle).isOdd;
    final w = sideways ? map.pixelHeight : map.pixelWidth;
    final h = sideways ? map.pixelWidth : map.pixelHeight;
    camera.viewfinder.zoom = min(v.x / w, v.y / h);
    camera.viewfinder.position = Vector2(map.pixelWidth / 2, map.pixelHeight / 2);
  }

  /// TV: shows the table view (one inch per square), keeping the window
  /// where it was.
  void showTable() => state.setTvCameraMode(TvCameraMode.table);

  /// TV: shows the whole map (squares are not one inch then).
  void showWholeMap() {
    state.setTvCameraMode(TvCameraMode.fit);
    _applyTvView();
  }

  /// TV: moves the table window by [dCols] × [dRows] squares (map axes),
  /// clamped to the map; switches to the table view first if needed.
  void panTable(int dCols, int dRows) {
    final layout = _tableLayout();
    if (layout == null) return;
    setTableWindow(
      layout.pansX ? layout.col + dCols : null,
      layout.pansY ? layout.row + dRows : null,
    );
  }

  /// TV: puts the table window's first square at [col]/[row] (clamped; a
  /// `null` or an axis that does not pan stays centred) and switches to the
  /// table view.
  void setTableWindow(int? col, int? row) {
    final layout = _tableLayout(col: col, row: row, useState: false);
    if (layout == null) return;
    state.setTvCameraMode(TvCameraMode.table);
    state.updateTableWindow(
      col: layout.pansX ? layout.col : null,
      row: layout.pansY ? layout.row : null,
    );
    _applyTvView();
  }

  /// TV: centres the table window on [squares] (map squares), snapped to
  /// whole squares — used for a view sent from the tablet in table view.
  void centerTableOn(Offset squares) {
    final layout = _tableLayout();
    if (layout == null) return;
    final start = layout.startFor(squares);
    setTableWindow(start.col, start.row);
  }

  /// Turns the camera by [quarters] × 90°. In the table view the window
  /// keeps its centre (its width and height swap at 90°/270°).
  void _rotateBy(int quarters) {
    final before = tableDisplay && state.tvCameraMode == TvCameraMode.table
        ? _tableLayout()
        : null;
    final q = quarterTurnsOf(camera.viewfinder.angle) + quarters;
    camera.viewfinder.angle = ((q % 4) + 4) % 4 * pi / 2;
    if (before != null) {
      centerTableOn(before.center / before.cellPx);
    } else if (tableDisplay) {
      _applyTvView();
    }
  }

  // ===== TV frame on the phone =====

  /// The TV's table layout as the phone reconstructs it from the TV's last
  /// camera snapshot (screen size, angle) and the synced state (calibration,
  /// window start) — the same numbers the TV used. `null` when the TV is not
  /// in table view, no snapshot arrived, or no map is loaded. Pass
  /// [col]/[row] to ask where a different window start would land.
  TableLayout? tvTableLayout({int? col, int? row, bool withPreview = true}) {
    final cam = _tvCamera;
    final map = state.map;
    if (cam == null || map == null || cam.vw <= 0 || cam.vh <= 0) return null;
    if (state.tvCameraMode != TvCameraMode.table) return null;
    final grid = TableGrid.of(Size(cam.vw, cam.vh), state.tvWidthInches);
    if (grid == null) return null;
    final preview = withPreview ? _tvDragPreview : null;
    return TableLayout.compute(
      grid: grid,
      mapCols: map.resolution.mapSize.dx.toInt(),
      mapRows: map.resolution.mapSize.dy.toInt(),
      cellPx: map.resolution.pixelsPerGrid.toDouble(),
      quarterTurns: quarterTurnsOf(cam.angle),
      col: col ?? preview?.col ?? state.tableCol,
      row: row ?? preview?.row ?? state.tableRow,
    );
  }

  /// The TV's table window in map pixels (phone side), or `null`.
  Rect? _tvFrameRect() {
    final layout = tvTableLayout();
    if (layout == null) return null;
    final sq = layout.windowSquares;
    final c = layout.cellPx;
    return Rect.fromLTRB(sq.left * c, sq.top * c, sq.right * c, sq.bottom * c);
  }

  /// Phone: moves the TV window so it is centred on [centerSquares]
  /// (snapped and clamped) — shown at once as a preview and reported via
  /// [onTvWindowDrag]. [done] `false` while the finger is still down (end
  /// such a drag with [endTvWindowDrag]). Used by the frame's grip and the
  /// overview map.
  void previewTvWindow(Offset centerSquares, {required bool done}) {
    final layout = tvTableLayout();
    if (layout == null) return;
    final start = layout.startFor(centerSquares);
    final moved = tvTableLayout(col: start.col, row: start.row);
    if (moved == null) return;
    _tvDragPreview = (col: moved.col, row: moved.row);
    _tvDragPreviewAt = DateTime.now();
    _tvWindowDragging = !done;
    viewRevision.value++;
    onTvWindowDrag?.call(moved.col, moved.row, done: done);
  }

  /// Phone: the finger left the TV frame — reports the last previewed
  /// window as final ([onTvWindowDrag] with `done: true`).
  void endTvWindowDrag() {
    final p = _tvDragPreview;
    _tvWindowDragging = false;
    if (p != null) onTvWindowDrag?.call(p.col, p.row, done: true);
  }

  /// Drops the move preview once the TV shows that window (or after 1.5 s,
  /// if a command got lost), so the frame never jumps back mid-move.
  void _settleTvPreview() {
    final p = _tvDragPreview;
    if (p == null || _tvWindowDragging) return;
    final tv = tvTableLayout(withPreview: false);
    final at = _tvDragPreviewAt;
    final stale = at == null ||
        DateTime.now().difference(at) > const Duration(milliseconds: 1500);
    if (stale || tv == null || (tv.col == p.col && tv.row == p.row)) {
      _tvDragPreview = null;
    }
  }

  /// Zoom at which the whole map fits the viewport (0.1 if unknown).
  double get fitZoom {
    final map = state.map;
    if (map == null || !isMounted) return 0.1;
    final viewSize = camera.viewport.size;
    if (viewSize.x == 0 || viewSize.y == 0) return 0.1;
    return min(viewSize.x / map.pixelWidth, viewSize.y / map.pixelHeight);
  }

  /// Lower zoom bound: half of [fitZoom], so pinching out can always show
  /// the whole map with a margin (a fixed 0.1 could not reach fit for large
  /// maps). The TV's one-inch scale is its table view, not a zoom clamp.
  double get minZoom => fitZoom * 0.5;

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
    _dmOverlays?.removeFromParent();
    _dmOverlays = null;
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

  /// Zooms in one step (×1.3), clamped to [minZoom]..[maxZoom]. On the TV
  /// this leaves the table view ([TvCameraMode.free]).
  void zoomIn() {
    if (tableDisplay) state.setTvCameraMode(TvCameraMode.free);
    camera.viewfinder.zoom = (camera.viewfinder.zoom * 1.3).clamp(minZoom, maxZoom);
  }

  /// Zooms out one step (÷1.3), clamped to [minZoom]..[maxZoom]. On the TV
  /// this leaves the table view ([TvCameraMode.free]).
  void zoomOut() {
    if (tableDisplay) state.setTvCameraMode(TvCameraMode.free);
    camera.viewfinder.zoom = (camera.viewfinder.zoom / 1.3).clamp(minZoom, maxZoom);
  }

  /// Fits the whole map into the viewport and centers it. On the TV this is
  /// the whole-map view ([showWholeMap]).
  void zoomToFit() {
    if (state.map == null) return;
    if (tableDisplay) {
      showWholeMap();
      return;
    }
    _zoomToFit(state.map!.pixelWidth, state.map!.pixelHeight);
    camera.viewfinder.position = Vector2(
      state.map!.pixelWidth / 2,
      state.map!.pixelHeight / 2,
    );
  }

  /// Rotates the camera 90° clockwise (snapped to whole quarter turns).
  void rotateCW() => _rotateBy(1);

  /// Rotates the camera 90° counter-clockwise (snapped to whole quarter
  /// turns).
  void rotateCCW() => _rotateBy(-1);

  /// Resets the camera rotation to 0.
  void resetRotation() => _rotateBy(-quarterTurnsOf(camera.viewfinder.angle));

  /// Current camera zoom.
  double get currentZoom => camera.viewfinder.zoom;

  /// Current camera rotation in whole degrees.
  double get currentAngleDegrees =>
      (camera.viewfinder.angle * 180 / 3.14159265).roundToDouble();

  /// Sets the camera transform verbatim (session resume on the TV).
  ///
  /// While a map picture is still decoding (or not yet picked up by a
  /// detached game) the transform is kept and applied when the load
  /// finishes — it would otherwise be replaced by the load's fit-to-screen,
  /// which made resumed sessions forget a free camera. In the TV's table view the angle is what counts — the
  /// layout then sets position and zoom.
  void syncCamera(double x, double y, double zoom, double angle) {
    camera.viewfinder.angle = angle;
    // Still decoding, or the game has not started on the state's map yet
    // (detached in the library, or not loaded) — the load would refit.
    if (_mapLoading || (state.map != null && !identical(state.map, _loadedMap))) {
      _pendingSync = (x: x, y: y, zoom: zoom, angle: angle);
      return;
    }
    camera.viewfinder.position = Vector2(x, y);
    camera.viewfinder.zoom = zoom;
    if (tableDisplay) _applyTvView();
  }

  /// Sets the camera transform with [zoom] clamped to [minZoom]..[maxZoom].
  ///
  /// Used for `vtt.setCamera` on the TV and "Jump to TV" on the phone. On
  /// the TV in table view only the centre counts: the window moves there
  /// (whole squares, one inch each) and the angle is kept; otherwise the TV
  /// takes the transform as a free camera.
  void applyCamera(double x, double y, double zoom, double angle) {
    final map = state.map;
    if (tableDisplay && state.tvCameraMode == TvCameraMode.table && map != null) {
      final ppg = map.resolution.pixelsPerGrid.toDouble();
      centerTableOn(Offset(x / ppg, y / ppg));
      return;
    }
    if (tableDisplay) state.setTvCameraMode(TvCameraMode.free);
    syncCamera(x, y, zoom.clamp(minZoom, maxZoom), angle);
  }

  /// Puts the ruler in the middle of this game's view, its L square to the
  /// screen (rotation = the camera's, snapped to 90°).
  ///
  /// Called when the ruler is shown — on the TV for `vtt.toggleRuler`, so it
  /// appears where the players look instead of at the map's corner.
  /// No-op without a map.
  void centerRulerInView() {
    final map = state.map;
    if (map == null) return;
    final ppg = map.resolution.pixelsPerGrid.toDouble();
    final c = camera.viewfinder.position;
    final quarterTurns = (camera.viewfinder.angle / (pi / 2)).round();
    state.placeRuler(c.x / ppg, c.y / ppg, quarterTurns * 90);
  }

  /// Stores the TV's camera (phone side) for the viewport outline and
  /// "Jump to TV". No-op on the display.
  ///
  /// Ends a finished frame move's preview once the TV shows that window
  /// ([_settleTvPreview]).
  void setTvViewport(CameraSnapshot snapshot) {
    _tvCamera = snapshot;
    _settleTvPreview();
    viewRevision.value++;
  }

  /// The loaded map picture (decoded, at most [maxMapTextureSide] on the
  /// long side), or `null` while none is shown. Read it per paint and do
  /// not keep it: it is disposed when the map changes. Used by the
  /// companion's overview map.
  ui.Image? get mapImage => _mapImage?.image;

  /// Where [mapImage] lies on the map, in map-sized units of a [Size]
  /// `mapSize`: the whole map for a `.dd2vtt` picture, the picture under
  /// its grid for a raster map ([VttMapImageComponent.pictureRectOnMap]).
  Rect mapImageRectOn(Size mapSize) {
    final c = _mapImage;
    final src = c?.source;
    if (c == null || src == null) return Offset.zero & mapSize;
    return VttMapImageComponent.pictureRectOnMap(
        src, c.pictureSize ?? Size(c.image.width.toDouble(), c.image.height.toDouble()), mapSize);
  }

  /// The last TV camera received via [setTvViewport], or `null`.
  CameraSnapshot? get tvCamera => _tvCamera;

  /// Centres this camera on the square ([col], [row]) — the Tokens tab's
  /// "jump to the token" on the DM's tablet; zoom and angle stay. No-op on
  /// the display or without a map.
  void centerOnSquare(int col, int row) {
    final map = state.map;
    if (isDisplay || map == null) return;
    final ppg = map.resolution.pixelsPerGrid.toDouble();
    camera.viewfinder.position = Vector2((col + 0.5) * ppg, (row + 0.5) * ppg);
    viewRevision.value++;
  }

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
        // The normal mode: doors open and close here too
        if (_tryTogglePortal(worldPos)) return;
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
            _revealCells(_wallGrid!.floodFill(startIdx));
          }
        }
      case InteractionMode.circleReveal:
        if (_tryTogglePortal(worldPos)) return;
        _circleRevealAt(worldPos);
      case InteractionMode.aoe:
        // AoE: tap places the active template's shape/size at this origin
        _aoeStart(worldPos);
    }
  }

  // --- Tool drag dispatch ---

  void _toolDragStart(Vector2 worldPos) {
    // The TV frame's grip (phone): drag moves what the players see
    if (!isDisplay && _tvHandleHit(worldPos)) {
      final layout = tvTableLayout()!;
      final ppg = _getPixelsPerGrid();
      _tvDragStartSquares = Offset(worldPos.x / ppg, worldPos.y / ppg);
      _tvDragStartCenter = layout.center / layout.cellPx;
      return;
    }
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
      case InteractionMode.circleReveal:
        break; // Room and circle reveal are tap-only
      case InteractionMode.aoe:
        _aoeStart(worldPos);
        break;
    }
  }

  void _toolDragUpdate(Vector2 worldPos) {
    if (_tvDragStartSquares != null) {
      final ppg = _getPixelsPerGrid();
      final now = Offset(worldPos.x / ppg, worldPos.y / ppg);
      previewTvWindow(_tvDragStartCenter! + (now - _tvDragStartSquares!),
          done: false);
      return;
    }
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
      case InteractionMode.circleReveal:
        break;
      case InteractionMode.aoe:
        _aoeUpdate(worldPos);
        break;
    }
  }

  void _toolDragEnd() {
    if (_tvDragStartSquares != null) {
      _tvDragStartSquares = null;
      _tvDragStartCenter = null;
      endTvWindowDrag();
      return;
    }
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
      case InteractionMode.circleReveal:
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
    _tvDragStartSquares = null;
    _tvDragStartCenter = null;
    _tvDragPreview = null;
    _tvWindowDragging = false;
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

  /// Reveals or hides [cells] (by [VttState.revealMode], staged in shadow
  /// mode) and forwards them to the TV through [VttState.onRoomReveal].
  void _revealCells(Set<int> cells) {
    if (cells.isEmpty) return;
    state.revealRoom(cells);
    state.onRoomReveal?.call(cells.toList());
  }

  /// The circle reveal: the squares within [VttState.revealRadius] of the
  /// tapped square that are reachable from it without crossing a wall or a
  /// closed door ([WallGrid.floodFillWithin]); a plain circle on a map
  /// without walls.
  void _circleRevealAt(Vector2 worldPos) {
    final ppg = _getPixelsPerGrid();
    final col = (worldPos.x / ppg).floor();
    final row = (worldPos.y / ppg).floor();
    final cols = _getGridCols();
    final rows = _getGridRows();
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    final center = row * cols + col;
    final cells = _circleCells(center);
    if (!state.shadowMode) {
      _revealCells(cells);
      return;
    }
    // In the preview the circle stays live: − / + redraws it
    state.previewCircle(cells, center: center);
    state.onCirclePreview?.call(cells.toList(), false);
  }

  /// The circle reveal's squares around [center] at [VttState.revealRadius]:
  /// stopped by walls and closed doors, a plain circle without walls.
  Set<int> _circleCells(int center) {
    final cols = _getGridCols();
    final r = state.revealRadius;
    return _wallGrid?.floodFillWithin(center, r) ??
        WallGrid.circleCells(center % cols, center ~/ cols, r, cols, _getGridRows());
  }

  /// Redraws the circle still waiting in the preview at the new radius —
  /// [VttState.onRevealRadiusChanged], so the radius − / + acts on it live.
  void _resizeLiveCircle() {
    final center = state.liveCircleCell;
    if (center == null || !state.shadowMode || state.map == null) return;
    final cells = _circleCells(center);
    state.previewCircle(cells, replaceLast: true);
    state.onCirclePreview?.call(cells.toList(), true);
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
    final existing = state.tokens
        .where((t) => t.placed && t.gridX == gridX && t.gridY == gridY);
    if (existing.isEmpty) {
      // A token picked in the Tokens tab's list goes here; else a new one
      final placing = state.placingTokenId;
      if (placing != null && state.tokens.any((t) => t.id == placing)) {
        state.moveToken(placing, gridX, gridY);
      } else {
        state.addToken(gridX, gridY);
      }
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
      if (token.placed && token.gridX == gridX && token.gridY == gridY) {
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

  /// Whether [worldPos] is on the TV frame's drag grip (phone, table view,
  /// map bigger than the window). The hit area is wider than the drawn grip.
  bool _tvHandleHit(Vector2 worldPos) {
    final layout = tvTableLayout();
    final rect = _tvFrameRect();
    if (layout == null || rect == null || !layout.pans) return false;
    final zoom = max(camera.viewfinder.zoom, 1e-4);
    final h = TvViewportComponent.handleCenter(rect, zoom);
    return (worldPos.toOffset() - h).distance <=
        TvViewportComponent.handleRadius * 1.8 / zoom;
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
