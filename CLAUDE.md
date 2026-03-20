# Battlemap - AI Assistant Guide

## Project Vision

A **Flutter app** that turns a TV (laid flat as a table surface) into a D&D digital battlemap. The same app runs in two modes:

- **Table Mode (TV)** — fullscreen display only. **The TV has no touch screen and no usable remote.** It is a pure rendering surface. All interaction comes from the companion phone over WebSocket.
- **Companion Mode (Phone)** — the DM's control surface. Connects to the TV over local Wi-Fi. All map loading, fog reveal, door toggling, camera control, and drawing happens here.

**This is the core interaction model: the TV only displays, the phone only controls.** There is no direct user interaction on the TV. The TV box has no mouse, no keyboard, no touch — the Xiaomi TV remote is not used. The app on the TV should start in Table Mode automatically and wait for a companion to connect.

Both modes are the **same Flutter APK**. The TV box runs the Table Mode APK installed via sideload. The phone runs the same APK in Companion Mode, connecting to the TV over local Wi-Fi.

**Web builds** (GitHub Pages) are used only for rapid testing during development — the production target is native Android APK.

## Hardware

The target TV device is the **Xiaomi TV Box S 3rd Gen** (~$60-70), chosen after comparing alternatives:

| Spec | Xiaomi Box S 3rd Gen | Google TV Streamer | Why it matters |
|------|---------------------|-------------------|----------------|
| CPU | Amlogic S905X5M, A55 x4 @ **2.5 GHz** | MediaTek MT8696, A55 x4 @ 2.0 GHz | Flutter UI thread performance |
| GPU | **Mali-G310 V2 (~42 GFLOPS)** | PowerVR GE9215 (~20 GFLOPS) | Glow effects, alpha blending, sprites |
| RAM | 2 GB | 4 GB | Manageable with smart texture management |
| Wi-Fi | **Wi-Fi 6** | Wi-Fi 5 | Phone-to-TV communication |
| Price | **~$60-70** | ~$100 | Budget friendly |

The Xiaomi's **2x GPU advantage** is critical for the visual effects we want (glow, bloom, sprite animations). The 2 GB RAM tradeoff is acceptable for a single-purpose app — just be mindful of texture atlas sizes and dispose unused assets.

The app is sideloaded as an APK onto the TV box via ADB. Version codes in `pubspec.yaml` handle upgrades (`adb install -r` replaces lower version codes automatically).

## Features Roadmap

### Core (MVP)
- Grid-based battlemap canvas with pinch-to-zoom and drag-to-pan
- Companion mode: draw on the map from the phone, see it on the TV
- Basic token placement and movement

### Planned
- **PDF map support** — load PDF battlemaps as background layers
- **Custom sprite animations** — animated tokens, spell effects, creature movements
- **Visual effects** — glow, fog of war, lighting, bloom effects on the canvas
- **Drawing tools** — freehand draw, shapes, area-of-effect markers from companion app

## Technology

| Tech | Purpose |
|------|---------|
| Flutter (Android APK) | Production build — sideloaded onto TV box and phone |
| Flame Engine | Game rendering — component model, sprites, effects, Canvas-based |
| Flutter Web | Development testing only — quick iteration via GitHub Pages |
| GitHub Actions | CI/CD — builds web for testing, can build APK for releases |

### Deployment

**Production (APK):**
- Build: `flutter build apk --release`
- Install on TV box: `adb install -r build/app/outputs/flutter-apk/app-release.apk`
- Update: bump `version` in `pubspec.yaml` (e.g. `1.0.0+1` → `1.0.1+2`), rebuild, reinstall with `adb install -r`
- The `+N` part is the **version code** — Android uses this integer to determine if an APK is an upgrade. Always increment it.

**Development (Web):**
- Auto-deploys to GitHub Pages on push to `main` for quick phone/browser testing
- Live URL: `https://kasparorange.github.io/battlemap/`
- Workflow: `.github/workflows/deploy.yml`

### After Every Feature Implementation

**IMPORTANT:** After every feature is implemented, run this full deploy sequence so the TV always has the latest build:

1. **Bump version code** in `pubspec.yaml` — increment the `+N` part (e.g. `+2` → `+3`)
2. **Build web** — `flutter build web --release`
3. **Build APK** — `flutter build apk --release`
4. **Copy APK to web server** — `cp build/app/outputs/flutter-apk/app-release.apk build/web/battlemap.apk`
5. **Restart dev server** — `pkill -f dev_server; python3 tools/dev_server.py &`
6. **TV downloads update** — open `http://<VPS_IP>:4242/battlemap.apk` in TV browser, install over existing app

## Development Workflow

**This project is developed entirely from an iPhone. This is a core guideline and will not change.**

The setup:
- **Kaspar** uses **Prompt 3** (iOS SSH client) to connect to a **rented VPS**
- **Claude Code** runs on the VPS and writes all the code
- **Flutter SDK is installed on the VPS** — enables local web dev server with hot reload
- **GitHub Actions** handles CI/CD (web deploy to GitHub Pages, APK builds for releases)

The workflow:
1. **Describe features** conversationally to Claude Code via SSH from the phone
2. **Claude writes code**
3. **Test locally** using `flutter run -d web-server --web-port=4242 --web-hostname=0.0.0.0` for instant hot reload
4. **Test on phone** by opening `http://<VPS_IP>:4242` in a browser, or via GitHub Pages after push
5. **Test on TV** by sideloading the APK onto the Xiaomi Box via ADB
6. **Report back** with feedback ("glow effect lags", "tokens too small", etc.)
7. **Commit & push** when the feature is working

No IDE, no desktop. Just SSH + chat + hot reload.

## Code Conventions

- Keep it simple — this is a creative/game project, not enterprise software
- Prioritize **visual quality and performance** over architecture purity
- The GPU is the bottleneck on the target hardware — optimize draw calls and effects
- Test on actual target hardware (TV box via APK) regularly, not just phone
- Dispose textures and assets when not in use (2 GB RAM constraint)

## Progress Tracker

**IMPORTANT:** Update this tracker after every action — feature added, bug fixed, refactor done, etc. Keep it current so we always know where the project stands.

| # | Feature / Task | Status | Notes |
|---|---------------|--------|-------|
| 1 | Project scaffold (pubspec, main.dart, web/) | Done | Flutter web project created |
| 2 | Mode selector (Table / Companion) | Done | Landing screen with two mode buttons |
| 3 | GitHub Actions deploy workflow | Done | Auto-deploys to GitHub Pages on push to main |
| 4 | Grid-based battlemap canvas | Done | 24x16 grid, pinch-to-zoom, drag-to-pan via InteractiveViewer |
| 5 | Basic token placement & movement | Done | Tap to place, drag to move, long-press to remove, colored & numbered |
| 6 | Companion mode drawing | Done | Freehand drawing with color picker, brush size, draw/token mode toggle |
| 7 | Phone-to-TV networking | Done | WebSocket server on TV, client on phone, JSON state sync, auto-reconnect |
| 8 | PDF map support | Done | Load PDF battlemaps as backgrounds, page nav, network sync |
| 12 | Flame engine migration | Done | Replaced CustomPainter with Flame game engine components |
| 13 | VTT table mode — UVTT parser + map display | Done | Load .dd2vtt files, display map, grid overlay, camera pan/zoom |
| 14 | VTT fog of war | Done | saveLayer + dstOut rendering, tap/drag to reveal, brush sizes |
| 15 | VTT doors + walls + DM panel | Done | Portal toggle, wall debug view, collapsible control panel |
| 16 | VTT calibration + brush reveal | Done | Physical TV calibration, drag-to-reveal, soft fog edges, camera controls |
| 17 | VTT WebSocket sync (phone→TV) | Done | All VTT controls routed through companion phone via WebSocket |
| 18 | Web-compatible WebSocket (web_socket_channel) | Not started | Allow iOS Safari to connect to TV as companion (fallback for iPhone users) |
| 9 | Custom sprite animations | Not started | Animated tokens, spell effects |
| 10 | Visual effects (glow, fog, bloom) | Not started | GPU-heavy features |
| 11 | Drawing tools (shapes, AoE) | Not started | Freehand, shapes from companion |

## Directory Structure
battlemap/
├── lib/
│   ├── main.dart              # App entry point & mode selector
│   ├── game_state.dart        # Shared state: tokens, drawings, grid config
│   ├── pdf_helper.dart        # PDF loading & rendering (pdfrx)
│   ├── table_screen.dart      # Table Mode — TV display with zoom/pan/tokens
│   ├── companion_screen.dart  # Companion Mode — phone drawing & token controls
│   ├── game/
│   │   ├── battlemap_game.dart           # FlameGame — orchestrates all components
│   │   ├── vtt_game.dart                 # FlameGame — VTT table display
│   │   └── components/
│   │       ├── grid_component.dart       # Grid lines renderer
│   │       ├── pdf_background_component.dart # PDF map background
│   │       ├── strokes_component.dart    # Drawing strokes
│   │       ├── live_stroke_component.dart # Real-time stroke preview
│   │       ├── token_component.dart      # Single token renderer
│   │       ├── token_layer.dart          # Token container with diff sync
│   │       ├── map_image_component.dart  # VTT map image renderer
│   │       ├── grid_overlay_component.dart # VTT grid overlay
│   │       ├── fog_of_war_component.dart # VTT fog of war (saveLayer + dstOut)
│   │       ├── wall_component.dart       # VTT wall outlines (DM debug)
│   │       └── portal_component.dart     # VTT door/portal indicators
│   ├── model/
│   │   ├── uvtt_map.dart      # UVTT data classes (map, resolution, portal, light)
│   │   └── uvtt_parser.dart   # .dd2vtt JSON parser
│   ├── state/
│   │   └── vtt_state.dart     # VTT runtime state (fog, portals, calibration)
│   ├── ui/
│   │   ├── vtt_screen.dart    # VTT screen — GameWidget + DM overlay
│   │   └── dm_control_panel.dart # Collapsible DM control panel
│   └── network/
│       ├── server.dart        # WebSocket server (TV side, uses dart:io)
│       ├── server_stub.dart   # No-op stub for web builds
│       ├── client.dart        # WebSocket client (phone side, uses dart:io)
│       └── client_stub.dart   # No-op stub for web builds
├── web/
│   ├── index.html           # Flutter web shell + remote console logger
│   └── manifest.json        # PWA manifest (fullscreen, landscape)
├── .github/
│   └── workflows/
│       └── deploy.yml       # GitHub Pages auto-deploy
├── pubspec.yaml             # Flutter dependencies
└── CLAUDE.md                # This file
