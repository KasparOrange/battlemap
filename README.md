# Battlemap

A Flutter app that turns a TV into a D&D digital battlemap, controlled from a phone.

The TV lies flat on the table and players put their **real miniatures** on it (tabletop mode — the
focus). The app makes the map come alive: fog of war, doors, measuring, drawing, atmosphere. Dice,
HP and initiative stay on paper; a fully digital mode with tokens is a far-off stretch goal.

## How It Works

The same APK runs in two modes:

- **TV Mode** -- the TV (a Xiaomi TV Box sideloaded via ADB) displays the
  battlemap fullscreen. It has no touch, no keyboard, no mouse. It connects to a
  VPS WebSocket relay and waits for a companion phone to pair. Every map shows at
  **one square = one inch** (the minis' bases) in a centred window of whole squares —
  34 × 19 on our TV; bigger maps are moved across it from the tablet.
- **Companion Mode** -- the DM's Android tablet or phone (same APK; the web
  build in a browser is a fallback) connects to the same relay. All map loading,
  fog reveal, door toggling, measuring, drawing, and camera control happens here —
  plus **DM layers**: any number of pictures (a DM version of the map, notes, secrets)
  laid over the map on the DM's screen only; the TV never shows them. A picture map's drawn
  grid is found by itself, and a full-screen grid editor fits the squares by hand to a hundredth
  of a pixel (slide, stretch, two corners with a magnifier); a map with no grid gets its scale
  from something of known size (a door is one square) or from a file name like `Tavern_30x40`.
  Counts and lengths use steppers (±1/2/5/10, tap the number for a numpad). A game holds **several maps** (the
  tower's floors, town and cellar), each with its own fog, doors and tokens — switched in the
  Settings tab; maps come from the device or the **shared map library** on the VPS, which the
  tablet browses and fills in a game and from the library. On Android the
  game view runs full screen (system bars hidden; a button on the map brings them back).

The phone sends commands; the TV renders. Both communicate through a
lightweight Python WebSocket relay running on a VPS.

## Architecture

```
+------------------+         +------------------+         +------------------+
|   Phone (DM)     |         |   VPS Relay      |         |   TV (Display)   |
|                  |   WS    |                  |   WS    |                  |
| VttCompanionScreen+-------->  vtt_relay.py    +-------->  TvShell          |
| VttRelayClient   |<--------+ (WebSocket hub)  |<--------+ VttRelayClient   |
| VttGame (mirror) |         |                  |         | VttGame          |
| DmControlPanel   |         +------------------+         | MapLibrary       |
+------------------+                                      +------------------+
```

### Key Components

| Component | File | Role |
|-----------|------|------|
| [VttGame] | `lib/game/vtt_game.dart` | Flame engine game -- renders map image, grid, fog of war, walls, portals, tokens, and drawing strokes; on the DM's device also the DM layers (only a game given [DmOverlayImages] can draw them). Routes single-finger input to the active tool; two-finger gestures control the camera. |
| [VttState] | `lib/state/vtt_state.dart` | Central game state (ChangeNotifier) -- fog cells, portal states, tokens, strokes, the table view (TV calibration, camera mode, window), interaction mode. Serializes to JSON for relay sync. |
| [TvShell] | `lib/ui/tv_shell.dart` | TV entry point -- manages relay connection, map library, sessions, and view navigation. All interaction arrives via relay commands from the phone. |
| [VttCompanionScreen] | `lib/ui/vtt_companion_screen.dart` | Phone DM controller -- file picker, DM control panel, local VttGame mirror. Sends commands to TV through the relay. |
| [VttRelayClient] | `lib/network/vtt_relay_client.dart` | WebSocket client (web_socket_channel) -- works on both web and native. Handles registration, pairing, command/state forwarding, and chunked map transfers; drops commands while offline instead of replaying them late, reconnects within seconds, logs connection diagnostics. |
| [MapLibrary] | `lib/storage/map_library.dart` | Persistent on-device storage (Hive) for map files, saved sessions and map thumbnails. Native-only (stubbed on web). |
| [MapThumbnails] | `lib/storage/map_thumbnails.dart` | Small PNG previews of library maps, made lazily on the TV while it shows the library and sent to the companion (`lib.thumbnail`). |
| [ContinueSessionCard] | `lib/ui/library_cards.dart` | The companion library's top card (resume the last session), map thumbnails and dated default session names. |
| [SystemBars] | `lib/ui/system_bars.dart` | Hides Android's status and navigation bars (sticky immersive): the companion during a game (toggle on the map, stored on the device), the TV always. No-op off Android. |
| [GridEditorPage] | `lib/ui/grid_editor.dart` | The companion's full-screen grid editor (`showGridEditor`): fit a picture map's squares by hand — Move / Stretch / 2 corners / Known length (gridless maps), steps to 0.01 px, corner jumps, undo. |
| [NumberStepper] | `lib/ui/number_stepper.dart` | `−10 −5 −2 −1 [n] +1 +2 +5 +10` with a numpad behind the number (`showNumpad`) — every count and length in the grid dialogs and Measure the TV. |
| [TemplateDiscPanel] | `lib/ui/template_disc_panel.dart` | Measure tab ▸ Template disc: the acrylic AoE disc (radius rings, cubes, cones) on the map — show, turn, centre on the TV, its whole look configurable; drawn by `TemplateDiscComponent`, model `TemplateDisc`. |
| [SharedLibrarySheet] | `lib/ui/shared_library_sheet.dart` | The companion's shared map library (`showSharedLibrarySheet`): the VPS's maps with thumbnails — add to the game / play, delete, upload from the device. |
| [SharedLibraryClient] | `lib/network/shared_library.dart` | HTTP client for the VPS's shared map library (`/library` on the dev server). |
| [TvOverviewMap] | `lib/ui/tv_overview_map.dart` | The companion's overview: the whole map with a box around what the players see; tap or drag to move the TV's window. |
| [TvCalibrationStore] | `lib/storage/tv_calibration_store.dart` | The TV's own calibration (how wide its picture is), kept on the TV for every game. |
| [DeployRestore] | `lib/update/deploy_restore.dart` | Rolling deploy: launch routes `/restore` (TV reopens its game) and `/companion`, plus the TV's restore snapshot. |

### Data Model

| Class | File | Purpose |
|-------|------|---------|
| [UvttMap] | `lib/model/uvtt_map.dart` | Parsed Universal VTT map -- resolution, walls, portals, lights, environment, and the embedded map image. |
| [UvttParser] | `lib/model/uvtt_parser.dart` | Decodes `.dd2vtt` / `.uvtt` JSON files into [UvttMap] instances. |
| [GridDetection] | `lib/model/grid_detect.dart` | Finds a grid drawn into a picture map (edge profile → autocorrelation → both axes agree → phase); pre-fills the upload dialog. |
| [RasterGrid] | `lib/model/raster_grid.dart` | Where a picture map's squares lie on the picture (corner, square width/height, counts); the game maps it onto the squares, no cropping. Plus the editor's math (stretch, two corners). |
| [MapLibraryEntry] | `lib/model/map_library_entry.dart` | Metadata for a map stored in the TV's local library (grid size, file size, kind). |
| [Session] | `lib/model/session.dart` | A saved gameplay session -- the map on the table and the full DM state snapshot (fog, portals, tokens, camera, table window, the map's scale record, DM layer list); the game's other maps wait parked with their own state (`switchTo`). |
| [SharedMap] | `lib/model/shared_map.dart` | One map of the shared map library on the VPS (name, kind, squares, file and thumbnail path). |
| [TableGrid] / [TableLayout] / [MapFit] | `lib/model/table_fit.dart` | The table view: whole one-inch squares on the TV (34 × 19 on Konrad's TV), the camera that shows a map at one inch per square in a centred window, and the per-game record of the map's scale. |
| [DmOverlay] | `lib/model/dm_overlay.dart` | One DM-only picture layer (VPS url, visible, opacity); the TV stores the list, only the companion draws it. |
| [MapToken] | `lib/model/map_token.dart` | A single token on the grid (position, color, label). JSON-serializable. |
| [DrawStroke] | `lib/model/draw_stroke.dart` | A freehand drawing stroke (list of points, color, width). JSON-serializable. |

## Building and Running

### Prerequisites

- Flutter SDK ≥ 3.47 (stable channel)
- Android SDK (for APK builds)
- Python 3 (for the VPS relay and HTTP server)
- optional, Mac only: [flutter-tvos](https://github.com/fluttertv/flutter-tvos) to run the TV side on an Apple TV while developing (`docs/apple-tv-dev.md`)

### Development (web)

```bash
flutter run -d web-server --web-port=4242 --web-hostname=0.0.0.0
```

Open `http://<host>:4242` in a browser to test.

### Production (APK)

```bash
# Build the release APK
flutter build apk --release

# Sideload onto the TV box
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

Bump the `version` field in `pubspec.yaml` before each release (increment the
`+N` version code so Android recognises the upgrade).

### Live deploy to the real box and tablet (rolling, mid-game)

```bash
tools/deploy.sh            # tv + tablet + web; tv / tablet / web alone, --here = working tree
```

Builds while the old app keeps running, has the TV save its game, installs over the Wi-Fi
(latrine's `android` adapter, data kept) and relaunches straight back into the same game; the
tablet reopens in Companion Mode. The table pauses for about 15 s. Details: `docs/setup.md`
"rolling deploy".

### Apple TV (development only)

```bash
flutter-tvos run -d <simulator-or-apple-tv> [--release]
```

Hot reload on the tvOS simulator; `--release` on the physical Apple TV. The product
stays the Xiaomi box.

### Android bench and bench robot (Mac)

```bash
tools/android_bench.sh                                     # Google TV + tablet emulators, local relay + server
P=~/.local/share/battlemap/venv/bin/python
$P tools/bench_bot.py seed                                 # 10 real test maps into the TV library
$P tools/bench_bot.py run --stress                         # scripted game night, report + screenshots
$P tools/bench_bot.py prep                                 # a tabletop game in progress to play with
```

The emulators mirror the target devices (Google TV box, Android tablet). The robot drives the
TV over the relay and checks both its state and its actual picture. Details: `docs/setup.md`
"android bench", `docs/test-session.md`.

### VPS Relay and HTTP server

```bash
python3 tools/vtt_relay.py     # port 9090 — WebSocket hub between TV and phone
python3 tools/dev_server.py    # port 4242 — web build, APK, map uploads (DM layer pictures and the shared map library kept)
```

The relay listens for WebSocket connections from both the TV and the companion
phone, forwarding messages between them. Map files (`.dd2vtt`, images; PDFs are
rasterized to PNG on the phone first) go through the HTTP server, not the relay.

### AI-generated maps (experimental)

```bash
tools/mapgen/mapgen.py paint tools/mapgen/layouts/crypt.json --size 1K --n 2 --why "…" --judge --pack
tools/mapgen/mapgen.py judge tools/mapgen/out/crypt/<run> --pack   # Claude judges each draw, packs the best
tools/mapgen/mapgen.py fix tools/mapgen/out/crypt/<run> --judge --pack  # doorways cleaned up, packed
```

A layout we write (rooms, walls, doors, lights) is drawn as a colour-coded guide,
Nano Banana 2.1 paints over it, and the result is packed with our walls into a
`.dd2vtt` the TV loads like any map. Doorways are left open in the painting — a fix-up pass
removes the rails the model likes to draw across them — and battlemap draws the doors itself
and swings them open when the DM taps. Every draw gets free pixel checks (broken walls,
leftover guide markers); a Claude helper session judges it on request, and the map that gets
packed is the judge's pick. Each run lands on the test board by itself.
Needs a Gemini API key with billing. The same model also edits a published map: a photographed
dungeon page with its labels removed and its secret rooms hidden as rock for the TV, and
everything it removed as DM layers for the tablet (Juri's dungeon, on the table since
2026-10-10). Design, state, what works and what fails with the model, next steps: `docs/ai-art.md`; test images on the horizon board `battlemap-mapgen`
(`tools/mapgen/board.py`), the whole story as its walk `journey`.

## Documentation

Run `dart doc` to generate full API documentation from the source:

```bash
dart doc
# Output in doc/api/
```

Design notes, live work and history are in `docs/` — start with `docs/action.md`.
