# Battlemap

A Flutter app that turns a TV into a D&D digital battlemap, controlled from a phone.

The TV lies flat on the table and players put their **real miniatures** on it (tabletop mode — the
focus). The app makes the map come alive: fog of war, doors, measuring, drawing, atmosphere. Dice,
HP and initiative stay on paper; a fully digital mode with tokens is a far-off stretch goal.

## How It Works

The same APK runs in two modes:

- **TV Mode** -- the TV (a Xiaomi TV Box sideloaded via ADB) displays the
  battlemap fullscreen. It has no touch, no keyboard, no mouse. It connects to a
  VPS WebSocket relay and waits for a companion phone to pair.
- **Companion Mode** -- the DM's Android tablet or phone (same APK; the web
  build in a browser is a fallback) connects to the same relay. All map loading,
  fog reveal, door toggling, measuring, drawing, and camera control happens here.

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
| [VttGame] | `lib/game/vtt_game.dart` | Flame engine game -- renders map image, grid, fog of war, walls, portals, tokens, and drawing strokes. Routes single-finger input to the active tool; two-finger gestures control the camera. |
| [VttState] | `lib/state/vtt_state.dart` | Central game state (ChangeNotifier) -- fog cells, portal states, tokens, strokes, calibration, interaction mode. Serializes to JSON for relay sync. |
| [TvShell] | `lib/ui/tv_shell.dart` | TV entry point -- manages relay connection, map library, sessions, and view navigation. All interaction arrives via relay commands from the phone. |
| [VttCompanionScreen] | `lib/ui/vtt_companion_screen.dart` | Phone DM controller -- file picker, DM control panel, local VttGame mirror. Sends commands to TV through the relay. |
| [VttRelayClient] | `lib/network/vtt_relay_client.dart` | WebSocket client (web_socket_channel) -- works on both web and native. Handles registration, pairing, command/state forwarding, and chunked map transfers. |
| [MapLibrary] | `lib/storage/map_library.dart` | Persistent on-device storage for .dd2vtt map files and saved sessions. Native-only (stubbed on web). |

### Data Model

| Class | File | Purpose |
|-------|------|---------|
| [UvttMap] | `lib/model/uvtt_map.dart` | Parsed Universal VTT map -- resolution, walls, portals, lights, environment, and the embedded map image. |
| [UvttParser] | `lib/model/uvtt_parser.dart` | Decodes `.dd2vtt` / `.uvtt` JSON files into [UvttMap] instances. |
| [MapLibraryEntry] | `lib/model/map_library_entry.dart` | Metadata for a map stored in the TV's local library (grid size, file size, thumbnail path). |
| [Session] | `lib/model/session.dart` | A saved gameplay session -- references a map and captures the full DM state snapshot (fog, portals, tokens, camera). |
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
python3 tools/dev_server.py    # port 4242 — web build, APK, map uploads
```

The relay listens for WebSocket connections from both the TV and the companion
phone, forwarding messages between them. Map files (`.dd2vtt`, images; PDFs are
rasterized to PNG on the phone first) go through the HTTP server, not the relay.

### AI-generated maps (experimental)

```bash
tools/mapgen/mapgen.py paint tools/mapgen/layouts/crypt.json --size 1K --n 2 --why "…" --judge --pack
tools/mapgen/mapgen.py judge tools/mapgen/out/crypt/<run> --pack   # Claude judges each draw, packs the best
```

A layout we write (rooms, walls, doors, lights) is drawn as a colour-coded guide,
Nano Banana 2.1 paints over it, and the result is packed with our walls into a
`.dd2vtt` the TV loads like any map. The painting shows empty doorways; battlemap draws
the doors itself and swings them open when the DM taps. Every draw gets free pixel checks
(broken walls, leftover guide markers); a Claude helper session judges it on request, and
the map that gets packed is the judge's pick. Each run lands on the test board by itself.
Needs a Gemini API key with billing. The same model also edits a published map: a photographed
dungeon page with its labels removed and its secret rooms hidden as rock for the TV, and
everything it removed as DM layers for the tablet (Juri's dungeon, on the table since
2026-10-10). Design, state, what works and what fails with the model, next steps: `docs/ai-art.md`; test images on the horizon board `battlemap-mapgen`
(`tools/mapgen/board.py`).

## Documentation

Run `dart doc` to generate full API documentation from the source:

```bash
dart doc
# Output in doc/api/
```

Design notes, live work and history are in `docs/` — start with `docs/action.md`.
