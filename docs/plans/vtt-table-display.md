# Flutter/Flame VTT — Physical Table Display

## Implementation Plan

> **Context:** A Flutter + Flame app displayed on a TV used as a physical game table
> with real miniatures on top. No digital tokens. The DM controls the app to reveal
> fog of war and open/close doors. Maps are loaded from the Universal VTT format
> (`.dd2vtt` / `.uvtt`).

-----

## Architecture Philosophy

Everything lives inside Flame's component tree from day one — even things that could be
done with plain Flutter widgets. This ensures a single rendering context, consistent
coordinate space, and a clean extension path for future features like animated effects,
tokens, lighting, or multiplayer overlays.

The world is composed of stacked `Component` layers rendered in priority order. State
is managed outside the game loop using a simple `VttState` notifier, keeping the Flame
layer purely presentational.

-----

## Package Dependencies

```yaml
dependencies:
  flame: ^1.x          # Core engine — camera, components, gestures
  provider: ^6.x       # State management outside the game loop
  file_picker: ^8.x    # Let the DM pick a .dd2vtt file
  path_provider: ^2.x  # Resolve file paths on the device
```

No additional rendering or polygon packages are needed. Dart's native `dart:ui`
`Canvas`, `Path`, and `BlendMode` cover everything required for fog of war and
wall rendering.

-----

## Data Model

### `UvttMap` — parsed from .dd2vtt JSON

```dart
class UvttMap {
  final double format;
  final UvttResolution resolution;
  final List<List<Vector2>> lineOfSight;   // wall polygons, coords in squares
  final List<UvttPortal> portals;          // doors/windows
  final List<UvttLight> lights;
  final UvttEnvironment environment;
  final Uint8List imageBytes;              // decoded from base64
}

class UvttResolution {
  final Vector2 mapOrigin;
  final Vector2 mapSize;       // in squares
  final int pixelsPerGrid;
}

class UvttPortal {
  final Vector2 position;
  final List<Vector2> bounds;
  final double rotation;
  bool closed;
  final bool freestanding;
}

class UvttLight {
  final Vector2 position;
  final double range;
  final double intensity;
  final Color color;
  final bool shadows;
}
```

### `VttState` — DM-controlled runtime state

```dart
class VttState extends ChangeNotifier {
  UvttMap? map;
  Set<int> revealedRegions = {};   // indices into a reveal grid
  Set<int> openPortals = {};       // indices into map.portals
  double gridScale = 1.0;          // pixels-per-physical-inch calibration

  void loadMap(UvttMap map) { ... }
  void togglePortal(int index) { ... }
  void revealRegion(int index) { ... }
  void revealAll() { ... }
  void hideAll() { ... }
}
```

-----

## Component Hierarchy

```
FlameGame (VttGame)
└── World
    └── MapRootComponent           # anchors everything, owns grid transform
        ├── MapImageComponent      # renders the base map image (priority 0)
        ├── GridOverlayComponent   # optional grid lines (priority 1)
        ├── WallComponent          # renders wall lines from line_of_sight (priority 2)
        ├── PortalComponent[]      # one per portal, tappable (priority 3)
        ├── LightComponent[]       # one per light source (priority 4)
        └── FogOfWarComponent      # full-screen dark overlay with cutouts (priority 10)

CameraComponent
└── Viewport (FixedAspectRatioViewport or MaxViewport)
    └── World (above)
```

The `CameraComponent` handles pan and zoom. All components live in `World` space so
camera transforms apply uniformly — tap positions, fog cutouts, and wall lines all
stay in sync automatically.

-----

## Phase 1 — Map Loading and Display

**Goal:** Load a `.dd2vtt` file and display the map image correctly scaled to fill
the screen.

### Steps

1. **Parse the file**

```dart
class UvttParser {
  static UvttMap parse(String jsonString) {
    final json = jsonDecode(jsonString) as Map<String, dynamic>;
    final imageBase64 = json['image'] as String;
    // strip data URI prefix if present
    final data = imageBase64.contains(',')
        ? imageBase64.split(',').last
        : imageBase64;
    final bytes = base64Decode(data);
    return UvttMap(
      format: (json['format'] as num).toDouble(),
      resolution: UvttResolution.fromJson(json['resolution']),
      lineOfSight: _parseWalls(json['line_of_sight']),
      portals: _parsePortals(json['portals']),
      lights: _parseLights(json['lights']),
      environment: UvttEnvironment.fromJson(json['environment']),
      imageBytes: bytes,
    );
  }
}
```

2. **`MapImageComponent`**

Loads the image bytes into a Flame `Sprite` and sizes itself to `resolution.mapSize * pixelsPerGrid`. The camera's `viewfinder.visibleGameSize` is then set to this size
so the map fills the screen on load.

```dart
class MapImageComponent extends SpriteComponent {
  @override
  Future<void> onLoad() async {
    final map = ...;
    final image = await Flame.images.fromBytes(map.imageBytes);
    sprite = Sprite(image);
    size = map.resolution.mapSize * map.resolution.pixelsPerGrid.toDouble();
    position = Vector2.zero();
  }
}
```

3. **Camera setup — pan and zoom**

```dart
class VttGame extends FlameGame with ScaleDetector, PanDetector {
  late final CameraComponent camera;

  @override
  Future<void> onLoad() async {
    camera = CameraComponent(world: world);
    camera.viewfinder.zoom = 1.0;
    add(camera);
  }

  @override
  void onScaleUpdate(ScaleUpdateInfo info) {
    camera.viewfinder.zoom *= info.scale.global.x;
    camera.viewfinder.zoom = camera.viewfinder.zoom.clamp(0.3, 5.0);
  }

  @override
  void onPanUpdate(DragUpdateInfo info) {
    camera.viewfinder.position -= info.delta.global / camera.viewfinder.zoom;
  }
}
```

**Deliverable:** App opens, DM picks a file, map fills the TV screen, pinch to zoom
and drag to pan work.

-----

## Phase 2 — Grid Overlay

**Goal:** Optionally render a grid aligned to the map's pixel-per-grid value.

`GridOverlayComponent` extends `Component` and overrides `render`. It draws horizontal
and vertical lines across `mapSize` using `canvas.drawLine` with a semi-transparent
paint. The line spacing is exactly `pixelsPerGrid` pixels.

The DM can toggle the grid from the UI. No state changes required in Flame — just
call `gridComponent.isVisible = !gridComponent.isVisible`.

-----

## Phase 3 — Walls

**Goal:** Render wall outlines from `line_of_sight` data (debug/DM view only, not
shown to players).

`WallComponent` overrides `render` and draws each wall polygon from
`map.lineOfSight`. Coordinates in the .dd2vtt file are in *squares*, so they must be
multiplied by `pixelsPerGrid` to convert to world-space pixels.

```dart
class WallComponent extends Component {
  @override
  void render(Canvas canvas) {
    final paint = Paint()
      ..color = const Color(0x88FF0000)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    for (final polygon in map.lineOfSight) {
      final path = Path();
      for (var i = 0; i < polygon.length; i++) {
        final p = polygon[i] * pixelsPerGrid;
        i == 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y);
      }
      path.close();
      canvas.drawPath(path, paint);
    }
  }
}
```

This is DM-only debug mode. In the player-facing view this component is hidden.

-----

## Phase 4 — Fog of War

**Goal:** Cover the entire map in darkness. The DM taps regions to reveal them.
Revealed regions persist until explicitly re-hidden.

### Reveal Grid

The map is divided into a reveal grid of N x M cells (default: same as the map's
square grid, so one cell = one 5ft square). Each cell has a revealed/hidden state
stored in `VttState.revealedRegions` as a flat index set.

### `FogOfWarComponent` rendering

This is the most important rendering technique in the whole app. The component:

1. Saves a layer with `canvas.saveLayer`
2. Fills the entire map bounds with the fog color (dark, semi-transparent)
3. Switches paint blend mode to `BlendMode.dstOut`
4. Draws filled rectangles for every revealed cell — this *erases* the fog in those
   cells, making them transparent
5. Restores the layer

```dart
class FogOfWarComponent extends Component {
  @override
  void render(Canvas canvas) {
    final fogPaint = Paint()..color = const Color(0xE5000000);
    final erasePaint = Paint()
      ..color = const Color(0xFFFFFFFF)
      ..blendMode = BlendMode.dstOut;

    canvas.saveLayer(mapBounds, Paint());
    canvas.drawRect(mapBounds, fogPaint);

    for (final index in state.revealedRegions) {
      final cell = _indexToRect(index);
      canvas.drawRect(cell, erasePaint);
    }

    canvas.restore();
  }
}
```

### DM reveal interaction

The DM taps the TV screen to reveal cells. `FogOfWarComponent` mixes in
`TapCallbacks`. On `onTapDown`, convert the event's world position to a grid cell
index and toggle it in `VttState`.

```dart
@override
void onTapDown(TapDownEvent event) {
  final worldPos = event.localPosition;
  final cellX = (worldPos.x / pixelsPerGrid).floor();
  final cellY = (worldPos.y / pixelsPerGrid).floor();
  final index = cellY * gridWidth + cellX;
  state.toggleReveal(index);
}
```

**Deliverable:** DM taps to reveal squares. Tap again to hide. "Reveal all" and
"Hide all" buttons in the DM overlay.

-----

## Phase 5 — Doors (Portals)

**Goal:** Tappable door components that open and close, with visual feedback.

Each portal from `map.portals` becomes a `PortalComponent` with `TapCallbacks`. The
component renders a small rectangle at the portal's position — colored differently
for open vs. closed state.

On tap, it calls `state.togglePortal(index)`. The component reads its open/closed
state from `VttState` each render frame.

```dart
class PortalComponent extends PositionComponent with TapCallbacks {
  final int portalIndex;
  final UvttPortal portal;

  @override
  void render(Canvas canvas) {
    final isOpen = state.openPortals.contains(portalIndex);
    final paint = Paint()
      ..color = isOpen ? const Color(0xFF00AA00) : const Color(0xFFAA4400);
    canvas.drawRect(size.toRect(), paint);
  }

  @override
  void onTapDown(TapDownEvent event) => state.togglePortal(portalIndex);
}
```

Portal positions are in squares — multiply by `pixelsPerGrid` for world space.
Portal bounds define the hit area.

**Deliverable:** DM taps a door indicator on the map to open/close it.
(Phase 7 will integrate this with line-of-sight.)

-----

## Phase 6 — DM Overlay UI

**Goal:** A floating Flutter widget overlay on top of the Flame `GameWidget` with DM
controls. This is plain Flutter, not Flame.

```dart
Stack(
  children: [
    GameWidget(game: vttGame),
    Positioned(
      bottom: 16, right: 16,
      child: DmControlPanel(state: vttState),
    ),
  ],
)
```

### `DmControlPanel` contains

- **Load Map** — triggers file picker, parses .dd2vtt, calls `state.loadMap()`
- **Reveal All** / **Hide All** — bulk fog toggle
- **Grid On/Off** — toggles `GridOverlayComponent.isVisible`
- **Walls On/Off** — toggles `WallComponent.isVisible` (DM debug mode)
- **Calibrate** — opens a dialog to set `gridScale` for physical inch alignment

The panel is semi-transparent and dismissible so it doesn't distract players.

-----

## Phase 7 — Physical Calibration

**Goal:** Match the digital grid to physical 1-inch miniature bases on the TV.

The DM enters the TV's physical screen width in inches (or measures it). The app
calculates the required zoom level so that `pixelsPerGrid` pixels on screen equals
exactly 1 physical inch. This is stored in `VttState.gridScale` and applied as the
camera's base zoom.

```dart
double calibratedZoom(double tvWidthInches, double screenWidthPx) {
  final pxPerInch = screenWidthPx / tvWidthInches;
  final pxPerGridAtZoom1 = map.resolution.pixelsPerGrid.toDouble();
  return pxPerInch / pxPerGridAtZoom1;
}
```

After calibration, the DM should not be able to zoom out past this base zoom, so
miniatures always land on correct squares.

-----

## Future Extension Points

The architecture intentionally leaves these hooks open:

| Feature | Extension point |
|---|---|
| **Animated effects** (fire, magic circles) | New `Component` subclass at priority 5, added dynamically |
| **Digital tokens** | `TokenComponent extends SpriteComponent with DragCallbacks` |
| **Light rendering** | `LightComponent` renders radial gradients; `FogOfWarComponent` uses light range instead of manual reveal |
| **Ray-cast line of sight** | Replace grid-cell reveal logic in `FogOfWarComponent` with a ray-cast pass using `line_of_sight` wall polygons |
| **Sound effects** | `FlameAudio` package, triggered from `VttState` listeners |
| **Multiplayer DM control** | Replace `VttState` with a `StreamController`-backed state synced via WebSocket or Firebase |
| **Multiple map layers** | Stack additional `MapImageComponent` instances (roof layer, canopy layer from the .dd2vtt layering pipeline) |

-----

## File Structure

```
lib/
├── main.dart
├── game/
│   ├── vtt_game.dart              # FlameGame subclass, camera, gestures
│   └── components/
│       ├── map_root_component.dart
│       ├── map_image_component.dart
│       ├── grid_overlay_component.dart
│       ├── wall_component.dart
│       ├── portal_component.dart
│       ├── light_component.dart
│       └── fog_of_war_component.dart
├── model/
│   ├── uvtt_map.dart              # Data classes
│   └── uvtt_parser.dart           # JSON parsing logic
├── state/
│   └── vtt_state.dart             # ChangeNotifier, DM-controlled state
└── ui/
    ├── vtt_screen.dart            # Stack: GameWidget + overlay
    └── dm_control_panel.dart      # DM controls overlay
```

-----

## Claude Sessions — Scoped Implementation Phases

Each session is sized to be completable in one Claude Code conversation.

### Session 1 — Foundation: UVTT Parser + Map Display + Camera
**Covers:** Phase 1 + Phase 2 + test asset download
- Download a sample .dd2vtt file for testing
- Create data model classes (`UvttMap`, `UvttResolution`, `UvttPortal`, `UvttLight`)
- Build `UvttParser` to parse .dd2vtt JSON + decode base64 image
- Create `VttState` (ChangeNotifier) with `loadMap()`
- Create `VttGame` (FlameGame) with `CameraComponent` pan/zoom
- Create `MapImageComponent` to render the map image
- Create `GridOverlayComponent` with toggle
- Create `VttScreen` with `GameWidget` + basic file picker
- **Test:** Load .dd2vtt, see map, pan/zoom, toggle grid
- **Status:** NOT STARTED

### Session 2 — Fog of War
**Covers:** Phase 4 + DM reveal controls
- Create `FogOfWarComponent` with saveLayer/dstOut rendering
- Add tap-to-reveal and tap-to-hide on grid cells
- Add reveal all / hide all to `VttState`
- Add basic DM control buttons (reveal all, hide all) to `VttScreen`
- **Test:** Map loads fully fogged, tap to reveal squares, buttons work
- **Status:** NOT STARTED

### Session 3 — DM Controls + Doors
**Covers:** Phase 5 + Phase 6
- Create `DmControlPanel` widget (load map, reveal/hide, grid toggle, walls toggle)
- Create `PortalComponent` with `TapCallbacks` for open/close
- Parse portal data from .dd2vtt and spawn PortalComponents
- Add `openPortals` set to `VttState`
- **Test:** DM panel works, doors toggle open/closed visually
- **Status:** NOT STARTED

### Session 4 — Walls + Calibration
**Covers:** Phase 3 + Phase 7
- Create `WallComponent` rendering line_of_sight polygons
- Add DM toggle for wall visibility
- Add physical calibration dialog (TV width in inches)
- Calculate and apply calibrated base zoom
- Clamp zoom-out to base zoom so grid matches physical inches
- **Test:** Walls visible in debug mode, grid matches 1-inch squares on TV
- **Status:** NOT STARTED

### Session 5 — Polish + Integration
- UX improvements: fog reveal brush size, long-press to reveal area
- Smooth fog edge transitions
- Test on actual Xiaomi TV Box via APK
- Performance profiling on target hardware
- Bug fixes from hardware testing
- **Status:** NOT STARTED
