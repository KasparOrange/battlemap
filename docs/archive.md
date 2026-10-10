# Battlemap — archive (history, newest on top)

Rule: **one entry per prompt that changed something** — in `docs/`, or in the code it
governs. Never per session. Heading = `### YY-MM-DD HH:MM - <session id>`; body = nested
bullets. What was learned goes into the docs it belongs to (`architecture.md`, `setup.md`,
`packages.md`, …); *that* it was learned, when, and why goes here. Newest entry goes
**above** the first heading.

### 26-10-10 - ai art doc sweep
- End-of-session sweep: `ai-art.md` made true to v0 code (QA has no retry yet, upload is manual, `--refs` untested, prompt section points at `prompts/baseline.txt` instead of a drifting copy, money in €21.99 style) + setup gotchas (3-D Secure blocked in telescope, no PayPal, wrong Google account, 429 without billing); README gained "AI-generated maps (experimental)"

### 26-10-10 - paint the still, render what moves
- Konrad likes "doors drawn by battlemap" and wants it as a direction: later also fire, light, water etc. as effect layers over a still painting → `ai-art.md` principle + Next step 7 (try list, once effects exist)

### 26-10-10 - ai art hand-off
- Konrad: doors are drawn side-on (not top-down) and differ per draw; judge with Claude (subscription) rather than Gemini; prepare the hand-off → `ai-art.md` § "Next — pick up here": doors drawn by battlemap as top-down sprites per portal (model paints empty doorways), ruins as a layout flag, script checks + Claude helper session as judge (Gemini only for unattended server runs), board built from run data, TV test, then 4K + tuning; pointer in `action.md`, tracker #40

### 26-10-10 - ai art test board
- Konrad: all test images individually on a horizon canvas with notes + arrows to features, why they were chosen, the next images; keep it updated → board `battlemap-mapgen` built by `tools/mapgen/board.py` (pins in grid squares, notes coloured by worked/problem/open, QA overlays, NEXT slots); rule recorded in `ai-art.md`
	- learned: a horizon `PUT` stores edges as sent — without `id` + `props` the app renders nothing at all (fixed in the builder; lesson added to horizon's board handbook)

### 26-10-10 - ai art pipeline v0
- Konrad: go API-driven, set up the key in telescope → AI Studio terms, project + key; first on dmcdoofman by mistake (deleted), then ko (no billing yet); billing paid on Bao's account (prepaid €20) → key in 1Password `Gemini API - battlemap (Bao billing)`
	- learned: AI Studio prepaid billing; 3-D Secure card check is blocked inside telescope (Cloudflare) → pay in a normal browser; no PayPal for Google Cloud in Germany (card or bank debit); free tier = 0 image requests
	- built `tools/mapgen/mapgen.py`: layout JSON → guide PNG → `gemini-nano-banana-2.1` (generateContent, imageConfig aspect/size, optional thinkingLevel) → QA overlay → `.dd2vtt` (WebP, walls between rooms, doors as portals, lights); sample layouts crypt + keep; prompt v0 in `prompts/baseline.txt`
	- result: geometry held almost exactly on both layouts at 1K; ~$0.20 spent on tests
	- docs: `ai-art.md` "built", `CLAUDE.md` tracker #40

### 26-10-10 - ai art pipeline design
- Konrad: AI image generation for maps/characters/items/effects; pick a model; then focus on a fully API-driven map workflow on Nano Banana 2
	- researched models (Midjourney, GPT Image 2, Nano Banana 2/2.1/Pro, FLUX.2, pixel/game-asset tools) → Nano Banana 2.1 via the Gemini API
	- learned: no subscription-style API quota — image models have no free tier, pay per image ($0.034–0.113, batch half); Google AI Pro (21,99 €) only adds $10/month Cloud credit; `gemini-3.1-flash-image` deprecated 2026-10-06 → `gemini-nano-banana-2.1`
	- design: our layout spec is the truth, the model only repaints a color-coded guide image, QA checks wall alignment, output packed as `.dd2vtt` (no TV change); prompt baseline v0 + tuning plan
	- docs: new `ai-art.md`, `CLAUDE.md` (docs table, tracker #40), `feature-ideas.md`

### 26-10-10 - battlemap relay takeover loop
- Konrad (bench screenshot): TV and tablet badges flip between "Waiting for companion" and "Disconnected" every second → the tablet had been put into TV Mode too; two `table` clients took the relay slot from each other (`replace` → reconnect after 1 s backoff, which `registered` resets → forever)
	- fix: relay sends `{"type":"replaced"}` to the old client before closing it; `VttRelayClient` gets `RelayConnectionState.replaced` and stops reconnecting; TV badge "Another TV took over" + "Take over" button (focused for the remote), companion "Reconnect" snackbar/button
	- verified on the bench: second TV stops, "Take over" via D-pad select works, companion pairs afterwards, no more `replace` lines; `flutter analyze` clean, 363 tests (+2)
	- the VPS relay needs a restart with the new `vtt_relay.py` for this to reach the real devices

### 26-10-10 - battlemap test maps
- Konrad: "give me a realistic test case with battle maps from online" → `docs/test-session.md` (game night in 8 scenes) + `tools/fetch_test_maps.py` (10 maps into gitignored `test_assets/maps/`, pushed to the tablet emulator)
	- sources: public GitHub Dungeondraft exports (no license → never committed) and a Dyson Logos tavern; 2-Minute Tabletop only serves previews without checkout, a sparse AI-generated inn map was dropped
	- found while picking: no image downscaling in `lib/` → `action.md` prediction for the 30 MB map

### 26-10-10 - battlemap android bench
- Konrad: final devices are Android TV / Google TV + Android tablet/phone; develop on the Mac → Android bench set up instead of iPhone/Apple TV simulators
	- installed `emulator` + `google-tv` API 34 and `google_apis` API 36 arm64 images; AVDs `bm_tv` (tv_1080p, 2 GB) and `bm_tablet` (pixel_tablet); `flutter config --jdk-dir` → Homebrew openjdk@17 (doctor could not find Java before)
	- `tools/android_bench.sh`: boot AVDs, relay + dev server, `adb reverse` 9090/4242; relay venv now at `~/.local/share/battlemap/venv`
	- verified: debug APK (`RELAY_HOST=localhost`) on both, TV registers, tablet pairs; `flutter analyze` clean, 361/361 tests
	- found: no Leanback launcher entry/banner in the manifest → `action.md` "direction: Android"
	- docs: `setup.md` "android bench" + environments table, `action.md`, `CLAUDE.md`

### 26-09-14 - session_016jcYHtEqjZJn1HWLA2qq13
- Coordinator (Konrad away): `action.md` next 3 → dead code deleted. Verified first that nothing outside the set imports it (only `main.dart` → `TvShell`/`VttCompanionScreen`/`DevScreen`). Removed: `lib/companion_screen.dart`, `lib/table_screen.dart`, `lib/game_state.dart`, `lib/game/battlemap_game.dart`, `lib/game/components/grid_component.dart`, `lib/game/components/pdf_background_component.dart`, `lib/ui/vtt_screen.dart`, `lib/network/{client,client_stub,server,server_stub,vtt_client,vtt_client_stub}.dart`; `lib/pdf_helper.dart` reduced to the static `renderPdfPage` (legacy `loadPdf`/`setPage`/`clear`/`dispose` gone). `lib/network/vtt_server.dart` + stub kept on purpose (offline play, roadmap #39). `flutter analyze` clean, `flutter test` 361/361 green (SDK: `~/code/flutter-tvos/flutter/bin`, the Mac has no other `flutter` on PATH). `docs/plans/vtt-table-display.md` still names `vtt_screen.dart` — historical plan, left as is.

### 26-09-06 03:30 - 01JM3aYboxge6YgQfEwedt2y
- Konrad: "Fix the open bugs noted in the documentation" → all 12 groups of `action.md` (2026-09-06 list) fixed in code, from the code alone (no walkthrough); `flutter analyze` clean, 361 tests (346 + 15 new in `test/companion_overhaul_test.dart`), web build compiles; **not yet tested on phone/TV**
	- **Camera** (1, 10): phone camera independent — `vtt.fullState.camera` is no longer applied on the phone, it is drawn as a dashed gold frame (`TvViewportComponent`, needs the new `vw`/`vh` in the broadcast); new `vtt.setCamera` (TV) fed by "TV follows the phone" (throttled 80 ms via `VttGame.onCameraChanged`), "send this view", "match TV"; `VttGame.isDisplay` — only the TV enforces calibration; min zoom = fit × 0.5 instead of 0.1
	- **Gestures** (2): multi-touch by `pointerCount`, tool starts on the first single-finger move (4 px), late second finger cancels the tool (`_toolCancel`), scroll-wheel zoom
	- **Undo/redo** (3): `canUndo`/`canRedo` in `fullState`, `VttState` reads them once received
	- **Measure** (4): `measureStart/End` in `VttState` + `fullState.measure`, `vtt.setMeasure`; `MeasureComponent` reads state, sizes scale with `pixelsPerGrid`
	- **AoE** (5, 9): `VttState.aoeShape/aoeRadius` (phone-local tool settings), tap places, drag aims cone/line or moves circle/square, panel buttons edit the template in place; the game's own `setAoe` now forwards via `onAoeChanged` (before, taps on the phone never reached the TV); "AoE Mode" and "Room" highlight
	- **Ruler** (6): 10 squares × 0.6, ticks/labels scale with the grid, draggable in any mode (`_rulerHitTest`, `onRulerMoved` → `vtt.setRulerPosition`), controls moved to the Measure tab
	- **Sliders** (7, 8): scale slider only when calibrated (hint otherwise), draw width 1–20 + S/M/L/XL presets, both preview locally and send on release; `drawWidth` default 3 → 4 so a preset is lit
	- **Panel** (11): rewritten as a bottom sheet in a `Column` under the map — tab bar at the bottom with labels, tap the active tab to collapse, ≥ 44 px targets, 14 px text, 20 px icons; `DmCallbacks` unchanged except optional additions (`onRemoveToken`, `onSetCameraLink`, `onSendView`, `onMatchTv`, `onPhoneZoomToFit`)
	- **Smaller** (12): Fog tab = Reveal|Hide segmented brush mode vs "Reveal all/Hide all"; session delete with confirmation and 44 px target; back button on the connecting screen; brush deduped per cell; portal pad 0.25 square; `tv.error` ends the loading guard; effects also play on the phone; `applyRemoteState` shadowMode default false (old test asserting `true` corrected); token dialog "Delete"
	- Docs: `relay-protocol.md` (camera commands, tool overlays, broadcast fields), `architecture.md` interaction modes, `action.md` rewritten to "next" (device test, dead code, visual pass), `CLAUDE.md` row 38
	- Committed together with the 2026-09-06 01:10 hand-off files (local bench: `RelayConfig` overrides, `dev_server.py` `BATTLEMAP_WEB_DIR`) so the VPS can pull a coherent tree

### 26-09-06 01:10 - b408acee-a920-4916-94df-47880a18ddaa
- Konrad: "find a way that you can go through that app by yourself, the phone version, and find all the bugs" → full read of the companion/DM-panel/game/state/relay code instead of a click-through; 12-point bug list + fix order written to **`docs/action.md`** (new, registered in `CLAUDE.md`, roadmap #38)
	- Local bench built: `RelayConfig.host` via `--dart-define=RELAY_HOST`, `RelayConfig.httpBase` for all HTTP URLs, `tools/dev_server.py` honours `BATTLEMAP_WEB_DIR`; relay in a venv, web build against localhost, TV on the Apple TV simulator paired with the local relay — `setup.md` "local bench"
	- Browser driving: Claude-in-Chrome extension not connected; terminal-browser closed on request (canvas → no accessibility tree, same finding as 01:05); Playwright + Flutter semantics is the plan, screenshots only in a lean pass or in a subagent (context cost)
- Konrad: "do we need Flutter there? … a web framework like Svelte" → **keep Flutter** for the companion (phone = full map editor sharing renderer/state/protocol; bugs are design bugs); Svelte only as a later second client on the JSON protocol
- Konrad: LAN question → correction: no spare box exists and the docs never mentioned a LAN mode; the pre-relay design was the TV hosting the server (`lib/network/vtt_server.dart`, unreferenced) → **kept**, roadmap #39 "direct TV connection without relay"
- Konrad: "do this with the next session … make sure the documentation is clear" → this entry, `action.md`, `setup.md` bench, `CLAUDE.md` rows 38/39, `feature-ideas.md`; bench processes stopped; changes left uncommitted on the Mac

### 26-09-06 01:05 - 389d2c14-05de-4f55-9d3c-6695b9d6b48e
- Konrad: "make sure the documentation is up to date" → sweep for what the day made stale
	- `CLAUDE.md`: log server line → MwLog, apple-tv-dev.md description; `README.md`: Flutter ≥ 3.47, Apple TV dev target, dev_server next to the relay, PDFs rasterized on the phone; `architecture.md` maps flow + render-order row; `setup.md` dropped the retired 4243 health check; `packages.md` pdfrx row; `apple-tv-dev.md` audit row (legacy path still touches pdfrx); `feature-ideas.md` Apple TV item ticked

### 26-09-06 00:45 - 389d2c14-05de-4f55-9d3c-6695b9d6b48e
- Konrad: picked a PNG on the phone, "nothing happened afterwards" → relay showed companion + Apple TV paired (the TV's "Library loaded: 0 maps" also proves the Hive cache-dir fix on the real device) but no upload ever reached the dev server → the pick returned null
	- Cause: `file_picker_web` ≥ 3 cancels the pick on the window `focus` event by default; iOS Safari fires it when the Files sheet closes. The deprecated top-level flag is ignored by the web plugin — only `FilePickerWebOptions` counts, so `lib/network/file_picker_options_{stub,web}.dart` (conditional import, `file_picker_web` now a direct dependency)
	- Version 1.1.4+14, web deployed from the Mac; APK rebuilt on the VPS (Flutter 3.47.2) with the MwLog define

### 26-09-06 00:20 - 389d2c14-05de-4f55-9d3c-6695b9d6b48e
- Konrad: "make everything ready for me to test … how I upload a PDF … to the rasterizing pipeline" → #36 built, services up
	- **Phone-side PDF rasterizing** (`_pickAndUploadMap`): pdfrx 2.x PDFium-WASM renders page 1 → PNG → existing image upload → `vtt.imageUploaded`; TV keeps the legacy `vtt.pdfUploaded` path. Version 1.1.3+13
	- VPS: relay + dev server restarted (detached via setsid; they had been down since 2026-07-07), Flutter upgraded 3.41.4 → 3.47.2 (pdfrx floor), web build deployed from the Mac by rsync (VPS built nothing yet)
	- Not verified in a browser: terminal-browser clicks on the Flutter canvas were unreliable (no accessibility tree) — first real test is Konrad on the phone; relay has one table slot, so the simulator app was terminated to leave it to the Apple TV
	- Learned: `ssh host 'pkill -f dev_server.py; …'` kills its own shell; plain `nohup &` over ssh dies with the session (`docs/setup.md`)

### 26-09-05 23:35 - 389d2c14-05de-4f55-9d3c-6695b9d6b48e
- Konrad: "check the plans … for the new plan to make a development build for TVOS and then start executing that" → `docs/apple-tv-dev.md` setup executed on the Mac
	- `fluttertv/flutter-tvos` 1.10.0 cloned to `~/code/flutter-tvos` (Flutter 3.47.2), CocoaPods via brew, `tvos/` host project generated and committed (bundle `com.example.battlemap`, team from the dev cert)
	- **Runs on the tvOS simulator** (mode selector → TV mode via select key, logs "Device info … platform tvos" into MwLog). **Physical Apple TV**: `--release` runs and logs into MwLog (osVersion 26.6); debug's wireless lldb attach times out three times running → simulator for hot reload, release on the TV. Hive moved to the cache dir on tvOS (Documents is read-only on the real device — `openBox` threw)
	- Dependency fallout (all platforms, VPS needs Flutter ≥ 3.47 now): `pdfrx` → 2.6.1 (+ `pdfrxFlutterInitialize()`), `package_info_plus` → 10, `file_picker` → 12 (API migrated in the two pickers), `wakelock_plus` pinned <1.8 (its own tvOS pod breaks `pod install`), four `*_tvos` ports added; `flutter analyze` clean, 346 tests green
	- Not done: the relay is still stopped on the VPS, so TV mode on the Apple TV only shows "Connecting to relay…"; #36 (PDF on the phone) still needed for PDF maps on tvOS

### 26-09-05 23:10 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad: "explain how did it happen that it's not the primary" → the Mac/VPS drift reconstructed and written down
	- 2026-04-08: VPS pushed `e6b869e` (quality pass) + `87871c9` (PDF resume fix, version 1.1.2+12); 11 min later a Mac session committed `e4e22d1` "Bump version to 1.1.1+11" on the OLD base, never pushed — obsolete, kept as tag `backup/stale-version-bump-2026-09-05`
	- No content was lost; the lesson is the pull-before/push-after rule in `docs/setup.md`
- `docs/archive.md` created (this file) per the ~/code documentation doctrine

### 26-09-05 23:00 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad confirmed the workflow: **VPS = primary dev machine** (phone + mosh + Claude Code when outside, sees the companion output directly), **Mac = home + Apple TV target**
	- Written into `CLAUDE.md` "Development environments", `docs/setup.md` "development environments", `docs/apple-tv-dev.md` "where this runs"
	- Committed as `9d40331` from the Mac, pushed; VPS working copy (identical patch) discarded and fast-forwarded — both checkouts clean at the same commit

### 26-09-05 22:40 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad: "do we have a local project? put all of this in its documentation" (from the my-tube session that built MwLog)
	- Local `~/code/battlemap` found stale (ahead 1 obsolete commit, behind 2) → reset to origin/main, MwLog patch applied
	- New `docs/apple-tv-dev.md`: flutter-tvos fork as a Mac-only dev target, dependency audit (only `pdfrx` blocks — native PDFium, no tvOS build), plan to rasterize PDFs on the phone, tvOS caveats (purgeable storage, pixel ratio, dart:io bypasses ATS)
	- `architecture.md` diagram + data flow → MwLog; `packages.md` "adopted: MwLog" + tvOS ports; `feature-ideas.md` + `CLAUDE.md` roadmap #35 (logs → MwLog, needs APK rebuild), #36 (PDF on phone), #37 (Apple TV dev target)

### 26-09-05 22:20 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad: "set that up" → logs moved off the hand-started `tools/log_server.py` (down since the 2026-07-07 VPS reboot, log file in /tmp gone) to **MwLog**: VictoriaLogs + Caddy on the same VPS, tenant `battlemap` (AccountID 2) next to MyTube's
	- `lib/network/remote_log.dart`: JSON lines, basic auth, `app`/`ts` stamped on every entry, credential via `--dart-define=MWLOG_AUTH` (repo is public → never in source), silent when absent; `dart analyze` clean on the VPS
	- `docs/setup.md` "logs": build define + `logq.sh` queries; `log_server.py` retired
	- Measured on the way: VictoriaLogs silently drops form-encoded bodies (answers 200) — always send `Content-Type: application/json`; the Caddyfile is bind-mounted by inode, so a replaced file needs `docker compose restart caddy`, not `caddy reload`
	- Not done: APK rebuild with the define; relay/dev server still stopped (no systemd units)
