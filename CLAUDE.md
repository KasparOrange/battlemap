# Battlemap - AI Assistant Guide

## Project Vision

A **Flutter app** that turns a TV (laid flat as a table surface) into a D&D digital battlemap. The same app runs in two modes:

- **TV Mode** — fullscreen display. The TV is a pure rendering surface. All interaction comes from the companion phone over WebSocket relay.
- **Companion Mode** — the DM's control surface on their phone. Connects to the TV via VPS relay. All map loading, fog reveal, door toggling, drawing, token placement, and camera control happens here.

**The phone controls everything. The TV only displays.**

**Focus: tabletop mode.** The TV lies flat with **real miniatures** on it; HP, initiative and
conditions stay on paper. Tokens are in (since 2026-10-10) as plain position markers for players
and monsters — the companion's leftmost, default tab; no HP bars in current work. The "digital mode"
(tokens, combat tracking) is a stretch goal far down the roadmap — its existing code stays dormant
behind session settings; don't polish or extend it. `docs/feature-ideas.md` "play modes".

Both modes are the **same Flutter APK**. The TV box (Android TV / Google TV) runs the APK; the DM's Android tablet/phone runs the same APK in Companion Mode. The web build (browser, e.g. Safari) remains a fallback companion.

## TV Remote Fallback Policy

**IMPORTANT:** The primary interaction is always phone → TV via relay. However, **every interactive UI element on the TV must be focusable and activatable via the Xiaomi TV remote** (D-pad + select button) as a fallback. This means:

- All buttons must have `autofocus` on the first element and proper `Focus` widget handling
- List items must be focusable and selectable via D-pad navigation
- The TV remote is NOT the primary input — it's an emergency fallback (e.g., if the phone disconnects and the DM needs to navigate back to the home screen)
- Use Flutter's `Focus`, `FocusTraversalGroup`, and `onKeyEvent` for TV remote support
- Test: every screen should be minimally navigable with just arrow keys + enter

## Development environments

The **VPS is the primary dev machine** (Flutter + Android SDK, relay, servers; worked from the
phone via mosh + Claude Code when outside). The **Mac** checkout (`~/code/battlemap`) is for
home: the **Android bench** (Google TV + tablet emulators, `tools/android_bench.sh`) is the main
local setup — the final devices are Android TV/Google TV + Android tablet/phone; the Apple TV dev
target (flutter-tvos) is secondary. The real devices on the home Wi-Fi (Xiaomi box, Konrad's
Tab A11+) are reached only through `latrine android …` — a session's own adb can't see the Wi-Fi;
`tools/deploy.sh` ships to them. Both sync through GitHub
`main`: commit + push where you worked, `git pull --ff-only` on the other side first. Details:
`docs/setup.md` "development environments".

## Documentation

Detailed documentation lives in `docs/`:

| File | Content |
|------|---------|
| `docs/architecture.md` | System overview, data flow, rendering order, interaction model |
| `docs/relay-protocol.md` | Every relay message type with fields and examples |
| `docs/setup.md` | VPS services, building, deploying, testing, log queries, Android bench on the Mac |
| `docs/sessions.md` | Session lifecycle, auto-save, what's persisted, thumbnails |
| `docs/packages.md` | All dependencies: current, adopted, considered, rejected |
| `docs/shorebird-setup.md` | OTA update setup (Shorebird code push) |
| `docs/apple-tv-dev.md` | Apple TV as a dev target (flutter-tvos): setup + what it forced on dependencies, tvOS caveats, PDF rasterized on the phone |
| `docs/ai-art.md` | Vision for AI-generated art + the API-driven map pipeline (Nano Banana 2.1): layout spec → guide image → model → QA → `.dd2vtt`; prompt baseline, prices |
| `docs/test-session.md` | Realistic game-night test script + the test-map set (`tools/fetch_test_maps.py`) |
| `docs/action.md` | **Live work** — the companion overhaul: bug list, decisions, planned workflow. Read first. |
| `docs/archive.md` | History, newest on top: one entry per prompt that changed docs or code (append-only) |

## Architecture

See `docs/architecture.md` for the full system diagram. Key points:

- **VPS relay** (`tools/vtt_relay.py`, port 9090) — WebSocket relay, both TV and phone connect as clients
- **HTTP server** (`tools/dev_server.py`, port 4242) — serves web build, APK downloads, map file uploads
- **Logs** go to MwLog (VictoriaLogs tenant `battlemap` on the same VPS) — `docs/setup.md` "logs"; `tools/log_server.py` is retired
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

**The table: 34 × 19 one-inch squares** (Konrad's TV, measured 2026-10-10, a bit of gap both
ways). That is the optimal result for **every** map: one map square = one physical inch, a
centred window of whole squares, the leftover split evenly on both sides; bigger maps pan in
whole squares from the tablet. The calibration belongs to the TV, not to a game.
`docs/architecture.md` "table view".

## Development Workflow

Outside: from the phone via SSH/mosh to the VPS. At home: on the Mac, against the Android bench
(`tools/android_bench.sh`), checked by the bench robot (`tools/bench_bot.py run`, `docs/test-session.md`).

1. Konrad describes features via Claude Code
2. Claude writes code
3. Build web (`flutter build web --release`) for the browser fallback companion
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

### Quality and Testing Policy

**IMPORTANT: One feature at a time, fully tested before the next.**

- Build one feature, test it end-to-end on real devices (phone + TV), then move to the next
- Do NOT implement 3-4 features in parallel agents touching the same state — this creates integration bugs
- New features default to OFF (opt-in, not opt-out) to avoid breaking existing functionality
- Every new feature needs: unit tests + manual integration test on real devices
- When something breaks, fix it before adding more features
- Use `tools/diag.py` to query TV state remotely before/after changes

### IO and Feedback Policy

**IMPORTANT: No IO operation without a loading indicator.**

- Every network request, file read, map load, or session save must show visible feedback
- Use progress bars for large transfers (map upload/download)
- Use snackbars for quick operations ("Loading session...", "Map saved")
- Use overlay spinners for blocking operations (PDF rendering)
- Never let the user tap something and see nothing happen — always show feedback immediately
- Debounce repeated taps on action buttons (prevent double-loading sessions)

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

**Live development on the real box + tablet:** `tools/deploy.sh` (rolling deploy, `docs/setup.md`)
puts a build on the TV and the web companion mid-game; the TV reopens the running game itself, the
break is ~15 s. Deploy yourself when a change is ready, but batch changes — every deploy interrupts
the table.

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
| 27 | Structured logging | Done | JSON lines from TV + companion + relay |
| 35 | Logs → MwLog (VictoriaLogs tenant) | Done (APK 1.1.4+14) | `remote_log.dart` posts to the VPS VictoriaLogs; build with `--dart-define=MWLOG_AUTH` (docs/setup.md "logs") |
| 28 | Developer screen | Done | Scrolling log viewer, diagnostics |
| 29 | Relay reliability | Done | Ping/pong, zombie detection, backoff, rate limiting |
| 30 | Storage reliability | Done | Index recovery, atomic writes, error responses |
| 31 | 74 unit tests | Done | Relay routing, state, session, map entry |
| 32 | Hive integration | Not started | Replace raw JSON files with cross-platform DB |
| 33 | Shorebird OTA updates | Not started | Code push without APK reinstall |
| 34 | PDF in VTT mode | Done via #36 | PDF → PNG on the phone, TV gets an image map |
| 36 | Rasterize PDFs on the phone | Done (1.1.4+14), needs phone test | pdfrx WASM in the web build renders page 1 → PNG → HTTP upload → `vtt.imageUploaded`; TV keeps legacy `vtt.pdfUploaded` |
| 37 | Apple TV dev target (flutter-tvos) | Done (Mac) | `tvos/` host project + `_tvos` ports; runs on simulator + physical Apple TV; PDF maps need #36 |
| 38 | Companion overhaul (camera, panel, ruler, measure, AoE, dead buttons) | Code done (2026-09-06, 1.1.5+15), needs phone + TV test | Fixed from the code read; what was changed: `docs/archive.md` 26-09-06 03:30; next steps `docs/action.md`; local bench in `docs/setup.md` |
| 41 | Android bench + bench robot (Mac) | Done (2026-10-10) | Google TV + tablet emulators (`tools/android_bench.sh`); `tools/bench_bot.py` seeds 10 test maps and plays the game night over the relay (`bot` role), 59/59 — found and fixed 11 TV/companion bugs (`docs/archive.md` 26-10-10) |
| 39 | Direct TV connection without relay (LAN / hotspot) | Not started | Legacy `lib/network/vtt_server.dart` is the starting point — keep it |
| 40 | AI map pipeline (Nano Banana 2.1 API) | v0 works; doors drawn by battlemap, ruins in the layout, checks + Claude judge, board built from run data, doorway fix pass; Juri's published map edited (labels off, secret rooms hidden) and on the table with DM layers; the fixed keep checked on the TV emulator and open on the table as "AI keep", doors drawn above the TV fog (1.1.12+22) (2026-10-10) | `tools/mapgen/` layout → guide → model → `.dd2vtt`; `docs/ai-art.md` "built"; next steps: `docs/ai-art.md` § "Next — pick up here"; images on horizon board `battlemap-mapgen` |
| 42 | DM-only picture layers | Done (2026-10-10, 1.1.6+16, on the box + VPS); seen on the tablet (1.1.8+18) with Juri's two layers, the rest of the checklist open | Companion Layers tab: many pictures over the map, eye/opacity/order, never on the TV; `docs/architecture.md` "DM layers", `relay-protocol.md` `vtt.setDmOverlays`; VPS dev_server restart keeps `uploads/dm/` |
| 43 | Tabletop UX polish (UX review 2026-10-10) | Code done (2026-10-10, since 1.1.7+17); tablet half on the tablet (1.1.8+18), TV half (ruler centring, no door boxes, thumbnails) waits for the box deploy; needs a device test | Side panel on landscape tablets, Fog tab Brush \| Room + "Players see changes", camera tab by screen, ruler centred + upright numbers, door markers DM-only, undo snackbars, library Continue card + thumbnails + dated names; `docs/archive.md` 26-10-10 "tabletop UX polish" |
| 44 | Rolling deploy (mid-game patch) | Code done (2026-10-10), first real run pending — ask Konrad before restarting the TV while he plays | `tools/deploy.sh [tv] [tablet] [web]`: build while the old app runs, TV saves (`deploy.prepare`), install over the Wi-Fi, relaunch with `/restore` → same game again; tablet relaunched into Companion Mode (`/companion`). `docs/setup.md` "rolling deploy" |
| 45 | Companion full screen (Android) | Done (2026-10-10, 1.1.8+18 on the tablet; the TV half waits for the box deploy) | Game view hides the system bars (sticky immersive), toggle at the map's top right, stored in Hive `companionSettings`; `lib/ui/system_bars.dart`, `docs/architecture.md` "Full screen" |
| 46 | Table view: 1 square = 1 inch, 34 × 19 window | Code done (2026-10-10, 1.1.9+19), bench-checked (relay probe 25/25, bench robot 57/57), needs the box + tablet | TV calibration on the TV (measuring bar dialog), every map at 1 inch in a centred window of whole squares (mask), big maps pan from the tablet (frame grip, overview map, arrows), whole-map view, `mapFit` record + window in the session, grid drawn or not remembered per map, picture maps re-griddable; `docs/architecture.md` "table view", `docs/archive.md` 26-10-10 "table view" |
| 47 | Embedded grid detection | Done (2026-10-10, on box + tablet since 1.1.11+21) | Companion upload finds a grid drawn into a picture map (`lib/model/grid_detect.dart`): pre-fills cols × rows, ticks "own grid lines", crops a grid that starts inside the picture; `docs/architecture.md` "embedded grid detection" |
| 48 | Picture grid + grid editor | Done (2026-10-10, 1.1.12+22 on box + tablet), bench click-through fixed (pinch, corner counts, magnifier); needs a hand test on the tablet | Fit a picture map's squares by hand: `RasterGrid` (position, width/height, sub-pixel) mapped onto the squares, no cropping; full-screen editor (Move / Stretch / 2 corners + magnifier, steps to 0.01 px, corner jumps, undo); same counts keep the fog; `docs/architecture.md` "picture grid and grid editor" |
| 48 | DM panel: tabs are modes + Tokens tab | Done (2026-10-10, 1.1.10+20 on box + tablet), needs a test at the table | Being on a tab is its mode (no mode buttons); new leftmost Tokens tab = the normal mode (place, move, list, name; door taps); `docs/architecture.md` "Tabs are modes" |
| 49 | Fog tab: Circle reveal | Done (2026-10-10, 1.1.11+21 on box + tablet), needs a test at the table; live resize in the preview + no preview tint on the TV: 1.1.14+24 on box + tablet | Radius in squares (− n +), tap reveals/hides a circle stopped by walls and closed doors (`WallGrid.floodFillWithin`), staged under "Preview first"; also fixes Room taps from the networked tablet; `docs/architecture.md` "Circle reveal" |
| 50 | Relay diagnostics in MwLog + no late replay | Logging in 1.1.11+21 (box + tablet, companion lines arrive); reconnect fix code done (2026-10-10), 1.1.14+24 + relay restart | Companion logs to MwLog (`src=companion`); both clients log drops, outages, offline drops, late messages by `sent` stamp, round trips, stalls, lifecycle; the relay ships connects/drops/bursts (`src=relay`). Fix: commands made while not connected are dropped with a tablet notice (no late replay), backoff 1/2/3/5 s, 8 s connect timeout, reconnect on app resume, offline taps no longer push the reconnect out. `docs/setup.md` "relay diagnostics" |
| 49 | TV: no chrome while all is well | Code done (2026-10-10), not in a build yet | Back arrow drawn only 5 s after a remote key (still focusable); top-right badge only for problems (companion not connected, relay down, another TV, TV errors 8 s); `docs/architecture.md` "interaction model" |
| 50 | Tokens tab: list, off-map tokens, hide, jump | Code done (2026-10-10), not in a build yet | Add a named token without placing it, place it from the list with a tap on the map, jump the tablet's view to a token, hide/show it for the players, delete in one tap; `docs/architecture.md` "Tokens tab", `relay-protocol.md` `vtt.createToken`/`vtt.setTokenHidden` |
| 51 | Games with several maps + shared map library | Code done (2026-10-10), bench-checked (throwaway TV emulator over the relay, 20/20), not in a build yet; **VPS dev_server needs the new code** (`git pull` + restart) before a companion with this build uploads | A game holds several maps, each with its own fog/doors/tokens/drawings/layers (`Session.mapIds`/`parkedMaps`, `vtt.switchMap`); Settings tab ▸ Maps in this game; shared map library on the VPS (`/library`, `uploads/library/`) browsed, filled and pruned from the tablet in a game and in the library (`lib.openSharedMap`); every device upload lands there; `docs/architecture.md` "games with several maps" |
| 9 | Custom sprite animations | Not started | Animated tokens, spell effects |
| 10 | Visual effects | Not started | Glow, fog lighting, bloom |
| 11 | Shape drawing tools | Not started | Circles, cones, area-of-effect markers |
