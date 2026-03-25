# Battlemap

A Flutter app that turns a TV into a D&D digital battlemap, controlled from a phone.

## How It Works

The same APK runs in two modes:

- **TV Mode** -- the TV (a Xiaomi TV Box sideloaded via ADB) displays the
  battlemap fullscreen. It has no touch, no keyboard, no mouse. It connects to a
  VPS WebSocket relay and waits for a companion phone to pair.
- **Companion Mode** -- the DM's phone (web build in Safari or APK) connects to
  the same relay. All map loading, fog reveal, door toggling, token placement,
  drawing, and camera control happens here.

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

- Flutter SDK (stable channel)
- Android SDK (for APK builds)
- Python 3 (for the VPS relay server)

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

### VPS Relay

```bash
python3 tools/vtt_relay.py
```

The relay listens for WebSocket connections from both the TV and the companion
phone, forwarding messages between them.

## Documentation

Run `dart doc` to generate full API documentation from the source:

```bash
dart doc
# Output in doc/api/
```

See the `docs/` directory for additional design notes (if present).
