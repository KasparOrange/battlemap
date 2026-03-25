# Battlemap - AI Assistant Guide

## Project Vision

A **Flutter app** that turns a TV (laid flat as a table surface) into a D&D digital battlemap. The same app runs in two modes:

- **TV Mode** — fullscreen display. The TV is a pure rendering surface. All interaction comes from the companion phone over WebSocket relay.
- **Companion Mode** — the DM's control surface on their phone. Connects to the TV via VPS relay. All map loading, fog reveal, door toggling, drawing, token placement, and camera control happens here.

**The phone controls everything. The TV only displays.**

Both modes are the **same Flutter APK**. The TV box runs the APK. The phone runs the same app as a web build in Safari.

## TV Remote Fallback Policy

**IMPORTANT:** The primary interaction is always phone → TV via relay. However, **every interactive UI element on the TV must be focusable and activatable via the Xiaomi TV remote** (D-pad + select button) as a fallback. This means:

- All buttons must have `autofocus` on the first element and proper `Focus` widget handling
- List items must be focusable and selectable via D-pad navigation
- The TV remote is NOT the primary input — it's an emergency fallback (e.g., if the phone disconnects and the DM needs to navigate back to the home screen)
- Use Flutter's `Focus`, `FocusTraversalGroup`, and `onKeyEvent` for TV remote support
- Test: every screen should be minimally navigable with just arrow keys + enter

## Documentation

Detailed documentation lives in `docs/`:

| File | Content |
|------|---------|
| `docs/architecture.md` | System overview, data flow, rendering order, interaction model |
| `docs/relay-protocol.md` | Every relay message type with fields and examples |
| `docs/setup.md` | VPS services, building, deploying, testing, log queries |
| `docs/sessions.md` | Session lifecycle, auto-save, what's persisted, thumbnails |
| `docs/packages.md` | All dependencies: current, adopted, considered, rejected |
| `docs/shorebird-setup.md` | OTA update setup (Shorebird code push) |

## Architecture

See `docs/architecture.md` for the full system diagram. Key points:

- **VPS relay** (`tools/vtt_relay.py`, port 9090) — WebSocket relay, both TV and phone connect as clients
- **HTTP server** (`tools/dev_server.py`, port 4242) — serves web build, APK downloads, map file uploads
- **Log server** (`tools/log_server.py`, port 4243) — structured JSONL logging from both devices
- **Map files** travel phone → HTTP upload → VPS → HTTP download → TV (not through the relay)
- **Commands** travel phone → relay → TV (small JSON messages)
- **State** broadcasts TV → relay → phone (50ms throttle)

## Hardware

Target TV device: **Xiaomi TV Box S 3rd Gen** (~$60-70)
- CPU: Amlogic S905X5M, A55 x4 @ 2.5 GHz
- GPU: Mali-G310 V2 (~42 GFLOPS)
- RAM: 2 GB — be mindful of texture sizes, dispose unused assets
- Storage: 8 GB (~4-5 GB usable for maps + sessions)
- Wi-Fi 6

## Development Workflow

**This project is developed entirely from an iPhone via SSH to a VPS.**

1. Kaspar describes features via Claude Code on the VPS
2. Claude writes code
3. Build web (`flutter build web --release`) for phone testing in Safari
4. Build APK (`flutter build apk --release`) for TV
5. Deploy: copy APK to web dir, update version.json, restart dev server
6. Test on phone + TV, report back
7. Commit & push when working

## Code Conventions

- Keep it simple — creative/game project, not enterprise
- Prioritize **visual quality and performance** over architecture purity
- GPU is the bottleneck — optimize draw calls and effects
- Dispose textures when not in use (2 GB RAM)
- All control elements must be **focusable** for TV remote fallback (see policy above)

### Documentation Policy

**IMPORTANT: All code documentation must be kept up to date at all times.**

- **Every** public class, method, field, and enum must have `///` doc comments
- Doc comments must be informative and cover: purpose, parameters, return values, exceptions, cross-references
- Use `[ClassName]`, `[paramName]`, `[ClassName.methodName]` for cross-references
- Use `/// Throws [StateError] if ...` for exception documentation
- Use `/// See also:` to link related classes/methods
- When modifying code, update its doc comments in the same change
- When adding new code, write doc comments before or during implementation — never leave undocumented code
- The `docs/*.md` files must also be kept current — update them when the feature they describe changes
- HTML API docs are generated via `dart doc` and hosted at `http://<VPS_IP>:4242/api/`

Example:
```dart
/// Loads a map from the TV's local library and starts a new game session.
///
/// The [mapId] must reference an existing [MapLibraryEntry] in the library.
/// Creates a new [Session] with a unique ID, saves it to disk, and switches
/// the TV to [TvView.game].
///
/// If [sendMapToCompanion] is true, sends a [vtt.downloadMap] message so
/// the companion can download the map from the VPS via HTTP.
///
/// Throws [StateError] if the map file is missing from disk.
///
/// See also:
/// - [_resumeSession] for restoring a previously saved session
/// - [MapLibrary.loadMapBytes] for the underlying file read
Future<void> _startNewSession(String mapId, String name, {
  bool sendMapToCompanion = true,
}) async {
```

## After Every Feature Implementation

**IMPORTANT:** Run the full deploy sequence:

1. Bump version code in `pubspec.yaml` (increment `+N`)
2. `flutter build web --release`
3. `flutter build apk --release`
4. `cp build/app/outputs/flutter-apk/app-release.apk build/web/battlemap.apk`
5. Update `build/web/version.json` with new version
6. `dart doc` — regenerate API documentation
7. `cp -r doc/api build/web/api` — copy docs to web server
8. Restart dev server
9. TV updates via in-app update button or Shorebird patch

API docs are then browsable at `http://<VPS_IP>:4242/api/`

## Progress Tracker

**Update after every action.**

| # | Feature / Task | Status | Notes |
|---|---------------|--------|-------|
| 1 | Project scaffold | Done | Flutter project created |
| 2 | Mode selector | Done | 3 buttons: TV Mode, Companion, Developer |
| 3 | GitHub Actions deploy | Done | Auto-deploys to GitHub Pages |
| 4 | Grid-based canvas | Done | Pinch-to-zoom, drag-to-pan |
| 5 | Token placement | Done | Tap to place, drag to move, colored & numbered |
| 6 | Freehand drawing | Done | Color picker, brush size, draw/token mode |
| 7 | Phone-to-TV networking | Done | WebSocket relay via VPS |
| 8 | PDF map support | Done | PDF backgrounds with page nav |
| 12 | Flame engine migration | Done | Replaced CustomPainter with Flame |
| 13 | VTT map display | Done | .dd2vtt parser, map image, grid overlay |
| 14 | Fog of war | Done | saveLayer + dstOut, brush reveal |
| 15 | Doors + walls + DM panel | Done | Portal toggle, wall debug, collapsible panel |
| 16 | Calibration + brush reveal | Done | Physical TV calibration, drag-to-reveal |
| 17 | VTT WebSocket sync | Done | All controls via companion phone |
| 18 | VPS WebSocket relay | Done | Both devices connect as clients |
| 19 | HTTP map transfer | Done | Phone → VPS HTTP → TV HTTP (no relay for large files) |
| 20 | Fog painting from companion | Done | Drag-to-reveal forwarded via relay |
| 21 | Map Library | Done | Persistent storage on TV, phone browsing |
| 22 | Sessions | Done | Auto-save, resume, persist fog/tokens/drawings |
| 23 | Phone-driven TV nav | Done | Phone controls all TV views via relay |
| 24 | In-app updates | Done | Version check, APK download, install intent |
| 25 | Unified mode merge | Done | Drawing + tokens + fog in one mode |
| 26 | DM panel: mode toggle | Done | Fog/Draw/Token mode switch |
| 27 | Structured logging | Done | JSONL logs from TV + companion + relay |
| 28 | Developer screen | Done | Scrolling log viewer, diagnostics |
| 29 | Relay reliability | Done | Ping/pong, zombie detection, backoff, rate limiting |
| 30 | Storage reliability | Done | Index recovery, atomic writes, error responses |
| 31 | 74 unit tests | Done | Relay routing, state, session, map entry |
| 32 | Hive integration | Not started | Replace raw JSON files with cross-platform DB |
| 33 | Shorebird OTA updates | Not started | Code push without APK reinstall |
| 34 | PDF in VTT mode | Not started | Load PDF as alternative to .dd2vtt |
| 9 | Custom sprite animations | Not started | Animated tokens, spell effects |
| 10 | Visual effects | Not started | Glow, fog lighting, bloom |
| 11 | Shape drawing tools | Not started | Circles, cones, area-of-effect markers |
