# Battlemap — archive (history, newest on top)

Rule: **one entry per prompt that changed something** — in `docs/`, or in the code it
governs. Never per session. Heading = `### YY-MM-DD HH:MM - <session id>`; body = nested
bullets. What was learned goes into the docs it belongs to (`architecture.md`, `setup.md`,
`packages.md`, …); *that* it was learned, when, and why goes here. Newest entry goes
**above** the first heading.

### 26-10-10 19:41 - 0f0ee4a5 - AI maps: doorway edit pass (`mapgen.py fix`, run 5)
- Konrad: go on the fix-up pass → rails out, wall stubs back
	- trial on floor-through image 2: plain edit instruction removed every rail and kept the walls; magenta holes (Juri trick) erased the wall stubs → plain
	- removing the rails showed the real width: openings 1.5–1.9 squares; the edit won't narrow them, a pixel check can't tell a missing stub (planks vs flagstones) → `close_stubs()` always copies the wall band (±0.22 squares, outlines included) from two units further along the line
	- `fix <run> [image] [--n] [--judge] [--pack]` writes a new run (`fix_of`, `edit_N.png`, `doorways_before.jpg`); `finish_image()` shared with `paint`; board titles fix plates by their source
	- results: image 2 retry 7 → use 8/10, the new test map; image 3's corridor ends fixed, retry for a wall break that was already there (the first judge missed it); ~$0.13

### 26-10-10 19:50 - a494e8fa - Juri's cave map + embedded grid detection
- Konrad: Juri sent another map (Telegram, 1280 × 960, cave with a drawn grid) → on the TV once the table-view session is done, with everything built so far; devise a formula to detect a grid already drawn into a map; mid-way: deploy the table-view build to both devices
	- formula (edge profile → autocorrelation → fraction rule → both axes agree → phase) prototyped in Python on all test maps, then `lib/model/grid_detect.dart`; the companion's upload runs it before the squares dialog (pre-fill, own-grid box, crop a grid that starts inside the picture) → `architecture.md` "embedded grid detection"
	- found: the first rule ("first autocorrelation peak") took the double edges of 2 px lines for a 30 px grid; 12 px stone texture in the AI maps passed as a grid; the engine's own downscale (and FilterQuality.medium) erased Dyson's 1 px grey lines → own box average, ≤ 3072 px
	- 10 unit tests, suite 461 green
	- deployed 1.1.9+19 (table view) with `tools/deploy.sh`: box 1.1.6+16 → 1.1.9+19 (back in its game after 16 s), tablet 1.1.8+18 → 1.1.9+19, web on the VPS
	- on the table: "Juri's cave" (detected 40 × 30 of 32 px, aligned) uploaded over the relay as `bot` with `hasGrid` → `drawGrid` off; session "Juri's cave" in table view (window at column 3, row 6), all revealed, the upload's own "Session 1" deleted
	- found: the `bot` role no longer receives `vtt.fullState` (only `lib.listing`), so the old `juri_table.py` waits forever for the session — check with `tv_ctl.py status` instead
	- the TV's library holds two `PirateLair_Lit_Grid_52x64` uploads at the 20 × 15 default — exactly the case the detector fixes (not yet in a build)

### 26-10-10 19:40 - battlemap-35 - table view: one square = one inch, 34 × 19 window (1.1.9+19)
- Konrad: improve scaling/measuring/fitting on the TV; measured 34 × 19 one-inch squares with a bit of gap both ways → centre the map, split the leftover — the optimal result for all maps; bigger maps need pan/zoom from the tablet, an overview with the players' square; each game file saves the map's scale and whether we draw a grid
	- found: calibration lived per session (`tvWidthInches` + `calibratedBaseZoom`, re-entered per game, its dialog offered TV *diagonals* as presets), the 0.5–2× scale slider broke the one-inch rule, no window snapping, no masking, a camera change alone was never broadcast (fresh small map → no frame on the tablet)
	- built: `lib/model/table_fit.dart` (`TableGrid`, `TableLayout`, `MapFit`, `TvCameraMode`); calibration on the TV (`TvCalibrationStore`, default 34.5 in = 34 × 19); `VttGame(tableDisplay)` lays out table/whole map/free, masks the leftover and draws the calibration pattern (`TableFrameComponent`); tablet frame = the window with a drag grip, Camera tab "Players see" + overview map (`TvOverviewMap`) + arrows; "Measure the TV…" dialog (bar in cm/in, picture width, ±¼ %); session `tvCameraMode`/`tableCol`/`tableRow`/`mapFit`; `MapLibraryEntry.drawGrid`; upload dialog `showMapGridDialog`; `vtt.setMapGrid` + `VttState.regridRaster`; new relay commands in `relay-protocol.md` "table view"
	- also fixed: a resumed free camera was overwritten by the load's fit (`syncCamera` now waits for the decode); debug builds showed a red screen on the `/restore` launch (`home` + `onGenerateInitialRoutes` assert, `main.dart`)
	- 21 new tests, suite 452 green; bench probe over the relay 25/25 (lair, 60 × 60 tavern, rotation, calibration, re-grid)
	- tablet click-through (helper on the bench): a vertical drag on the overview scrolled the panel → the overview's pan wins the gesture arena on touch-down; its box was unclipped in whole-map/zoomed views → clipped to the picture; arrows dimmed at the map's edge; squares dialog in the panel's gold palette, its fog warning only after a change; the TV's calibration captions on a dark plate

### 26-10-10 19:20 - 716236d4 - real devices: wireless ADB kept alive across sessions
- Konrad: sessions kept losing the tablet's wireless ADB → find why, fix it in latrine so several sessions share the devices smoothly
	- cause (both devices' logcat, 18:18): Android turns Wireless debugging off on any Wi-Fi BSSID change; the FRITZ!Box moving them between bands is enough
	- fix in latrine (`5c3a6ee`): devices also kept on classic adb at IP:5555 (until reboot), one serial per device, adb verb refuses kill-server/usb/disconnect-all
	- `setup.md` gotcha rewritten: fixed serials for box and tablet, what to do after a reboot

### 26-10-10 19:12 - 0f0ee4a5 - AI maps: doorway close-ups for the judge, run 4 (floor through the doorways)
- Konrad: go on the doorway fix → prompt + per-doorway crops + one small keep run
	- baseline prompt: a doorway is exactly as wide as its gap, floor straight through, no threshold, sill, beam, rail, bar, door frame or posts (it had allowed "a plain stone threshold at most")
	- `review()` writes `doorways_N.jpg` (a labelled close-up per doorway, ≥ 80 px per square); `judge.txt` judges each doorway there and checks doorway width; the board shows it
	- tried a free rail check: doorway brightness steps overlap floor seams → not separable, rails stay with the judge
	- run 4 (keep × 3, ~$0.10): rails gone in 1 of 3, corridor ends still two squares wide in 2 of 3; image 2 the only "use" (7/10) → packed, new test map; next proposed: a doorway edit pass (`ai-art.md` "Doorway edit pass")

### 26-10-10 21:10 - companion full screen (Android system bars hidden)
- Konrad: the tablet companion still shows Android's bottom bar — can it go, with a full screen toggle?
	- nothing hid the bars before; `SystemBars` (sticky immersive / edge to edge, no-op off Android) — companion hides them in the game view when its toggle is on (map's top right, Hive `companionSettings`, default on), shows them on library / waiting and on leaving; TV hides them at start
	- `architecture.md` "Full screen"; analyzed clean against HEAD (the working tree had another session's unfinished calibration rework)

### 26-10-10 18:59 - docs sweep: DM layers + rolling deploy
- README: DM layers in "How it works", `DmOverlay` / `DeployRestore` in the tables, "Live deploy to the real box and tablet"; CLAUDE.md tracker: duplicate #42 → polish #43, rolling deploy #44 (first real run pending, ask Konrad first); action.md: stale "needs deploying" and "six tabs" fixed; setup.md: an old relay can survive SIGTERM holding live sockets → check `pgrep`, `kill -9`

### 26-10-10 18:52 - beb74b6e - Juri's dungeon on the table, image maps keep their grid on the companion (1.1.8+18)
- Konrad: replace the test map in the open game with Juri's map (labels removed by Nano Banana), on the TV and the tablet, with the overlay as a DM layer to show or hide
	- map + overlays warped onto an exact 25 × 24 grid of 52 px (the photo's grid drifts 51–52 px) → `ai-art.md` "On the table"
	- over the relay as `bot`: image upload → `nav.newSession` "Juri's dungeon" (tabletop settings), the upload's own "Session 1" deleted, reveal all, TV grid off, two DM layers (secret rooms, labels) in `uploads/dm/`; the Countess's Lair session stays in the library
	- **found: the tablet stretched the image map to the vampire lair's 19×14** — the companion guessed a raster map's grid from the map it showed before, and a `vtt.downloadMap` of an image (a reconnect) failed the `.dd2vtt` parse → `VttState.applyRemoteGrid` (+ `rasterImageSize`) re-grids from `vtt.fullState`, one loader `_loadMapBytes` for chunks and downloads; `relay-protocol.md` "upload PDF or image"; 5 tests, suite 429 green
	- companion-only fix → tablet deployed, the box stays on 1.1.6+16

### 26-10-10 18:28 - 0f0ee4a5 - AI maps: board from run data, pack follows the judge (ai-art step 4)
- Konrad: continue the map pipeline → step 4
	- `board.py` builds the run zones from the run folders: `meta.json` (`round`, `why`, `finding`, `packed`, `draw_doors`) + `judge_N.json` (`good` → green pins, issues by severity, rejected checks grey); hand-written only the layouts, `NOTES` (by-eye pins, keeping the walk's plate ids), `NEXT`, Juri's zone; zones packed into columns under 6,400 px
	- `mapgen.py`: `pack <run>` takes the judge's best ("use", then score) and records it; `paint --why --round --judge`; `judge --pack`; paint / judge --wait / pack rebuild the board; judge prompt asks for a short `title` per issue and up to 3 `good` spots
	- judged run 2 (crypt + keep) to try it: **a thin wooden rail crosses every doorway** in all 7 draws since run 2 — my by-eye notes ("empty doorway", "threshold only") were wrong; named it in `judge.txt`, re-judged run 3 → all retry, image 2 stays the packed test map (5/10, was use 8/10) → failure catalogue + "the judge is not stable yet" in `ai-art.md`
	- backfilled `round`/`why`/`finding`/`packed` into the old runs' `meta.json` (local, gitignored)

### 26-10-10 18:27 - 93f94292 - showcase scene on the box, native companion on the tablet
- Konrad: "open a map on the TV and show me a state of an impressive round half through a playthrough", then "make sure it works on the tablet, as a native app"
	- vampire lair (04) in tabletop preset, session "The Countess's Lair — round 4": rooms revealed up to the ritual chamber, doors open, the party's route and a blood trail drawn, a 20 ft measure; driven over the VPS relay (first version with tokens dropped: tabletop is the focus)
	- tablet (Tab A11+): native 1.1.6+16 installed through latrine's adb, Companion Mode, opens the session; the old web companion tab in Chrome was pointed at about:blank so it can't fight the app for the slot
	- **VPS dev server hung**: single-threaded `HTTPServer`, one stalled client blocked every download (tablet map at 0 %) → restarted, and `tools/dev_server.py` is now a `ThreadingHTTPServer` (needs a pull + restart on the VPS)
	- remote: OK (DPAD_CENTER) did not open TV Mode on the mode selector of 1.1.5, Enter did

### 26-10-10 18:22 - box on 1.1.6+16, tablet companion, rolling deploy
- Konrad: deploy the new app on the TV, same game afterwards; bring the companion up in the tablet's browser; build mytube's rolling update into battlemap
	- tablet (Tab A11+, Chrome) paired through latrine (`android pair`); box 1.1.5+15 → 1.1.6+16 by `latrine android install` from a clean worktree; the session was flushed via the library first and reopened with `nav.goToGame` (175 revealed, 5 doors — identical)
	- VPS: relay restarted on current main (the September process rejected the `bot` role; it lingered after SIGTERM holding the live sockets → `kill -9`); dev_server restarted for `uploads/dm/`
	- **found: a companion taking over the slot got no map** — the TV ignored the second `peer_connected` while already paired → `VttRelayClient.onPeerReconnected`, TV resends library + game
	- **rolling deploy**, after mytube's deploy restore: `tools/deploy.sh [tv] [web] [--here]` + `tools/tv_ctl.py` (relay bot: status, prepare, resume, wait-session); TV: `deploy.prepare` → save now + "Updating…" + `deploy.ready`; relaunch route `/restore?session=…` → `TvShell(restore:)` reopens the game; `DeployRestore` snapshot (Hive) as fallback; companion route `/companion` (web `#/companion`) skips the selector; `setup.md` "rolling deploy"
	- `test/deploy_restore_test.dart` (9 tests), suite 398 green; first real run held — another session has a showcase scene on the box

### 26-10-10 - battlemap tabletop UX polish (UX review items 2, 4–7, 1.1.7+17)
- Konrad: "build all of the recommendations" (tabletop-mode ones; tokens/HP dropped as digital mode) — built in a separate worktree while three other battlemap sessions edited the same files, rebased onto main
	- **door markers DM-only**: `PortalComponent.showMarker` = `!isDisplay`; the TV draws nothing for Dungeondraft doors (their painted door is what players see); drawn AI-map doors show everywhere
	- **ruler**: `vtt.toggleRuler` on show → the TV centres it in its own view, square to its screen (`VttGame.centerRulerInView`); rotate turns around the middle of the L instead of the corner; numbers counter-rotated (`RulerComponent.labelAngle`) so they stay upright on every screen
	- **camera tab by screen**: Tablet ("Fit on tablet", "Jump to TV") / TV ("TV follows the tablet", "Show my view on the TV", "Fit on TV", rotation); "Go to TV's view" was cut off at 320 px → "Jump to TV"
	- **panel**: landscape tablet (`DmControlPanel.sideLayoutFor`) → right-edge rail (72 px, undo/redo at its foot) + 320 px content unfolding beside it (`AnimatedSize`, closes quicker than it opens); phones and portrait keep the bottom sheet
	- **fog tab**: Tool Brush | Room segmented, hint line per tool, brush size only for the brush, "Players see changes: Instantly | Preview first" replaces "Live mode / Shadow mode"; `✓` glyph replaced by words (not in every font)
	- **undo snackbar** after Reveal all / Hide all / Clear drawings (decided from the mirrored state before sending: no Undo when nothing changed or when shadow mode only staged)
	- **library**: Continue card (most recent session, one tap), map thumbnails (TV makes them lazily, `lib/storage/map_thumbnails.dart`, new `lib.getThumbnail` / `lib.thumbnail`), new sessions named "Session N · Sat 10 Oct"
	- verified: analyze clean, all tests green (+26: panel layouts, fog controls, ruler geometry, door markers, thumbnails, continue card, relay parsing); layouts rendered off-screen with Roboto (bench emulators were busy with other sessions) — no device test yet

### 26-10-10 18:08 - fb99b910 - Juri's dungeon: labels off, secret rooms hidden
- Konrad: do Juri's Telegram request with Nano Banana → his photographed dungeon page as a clean map (labels, arrows, S/T marks gone, four secret rooms turned to rock) + a transparent overlay of everything removed; on the board `battlemap-mapgen` side by side and stacked
	- learnings → `ai-art.md` "Editing a published map": edits keep geometry to the pixel, paste patches into the original with colour matching, blank a room in magenta before asking for rock, name the stone size, one job per call
	- prompts kept as `tools/mapgen/prompts/edit-*.txt`; 11 images at 2K, ~$0.55
	- horizon image nodes paint an opaque frame → the stacked view is a merged picture (`board.py`)

### 26-10-10 - battlemap docs sweep (bench + Android companion)
- end-of-session sweep: companion = Android APK (web build = fallback) in `CLAUDE.md`, `README.md`, `architecture.md` diagram, `packages.md`; README gained "Android bench and bench robot"; `CLAUDE.md` tracker row 41; `setup.md` local-bench venv path + relay takeover caveat; `test-session.md` big-map result + tabletop note; `action.md` state/deploy lines (59/59, deploy deferred by Konrad)

### 26-10-10 - battlemap focus: tabletop mode
- Konrad: the focus is **tabletop mode** (real miniatures on the TV, no tokens/HP bars); the digital mode is a stretch goal far down the roadmap → written into `CLAUDE.md` (vision), `README.md`, `feature-ideas.md` "play modes" (tabletop = the "Pen & Paper" preset), `action.md` (token/NPC UX findings dropped)
	- `bench_bot.py prep` now starts a tokenless tabletop game (preset settings sent with `nav.newSession`)
	- found doing that: **after the TV went back to the library once, its renderer stopped following state** (stale tokens, stale map pictures): `VttGame` subscribed in `onLoad` (runs once) but unsubscribed in `onRemove` (runs on every detach) → subscribe in `onMount` + catch up
	- bot: `start()` now goes through the library like a DM, and checks the TV picture actually changed (fog lifted for that screenshot) — caught the bug on the old build; run 59/59 green after the fix

### 26-10-10 18:05 - DM-only picture layers (1.1.6+16)
- Konrad: upload any number of DM-only pictures and overlay them on the map as switchable layers, visible only to the DM → companion **Layers** tab
	- model `DmOverlay` (id, name, VPS url, visible, opacity); `VttState.dmOverlays` + edit methods; list order = draw order
	- phone draws them (`DmOverlayComponent`, priority 12 — above the fog, which hid exactly the secrets the DM needs); the TV's `VttGame` gets no `DmOverlayImages`, so it has no layer component at all
	- the TV stores the list in the session (`dmOverlayData`) and echoes it in `vtt.fullState`; new `vtt.setDmOverlays` carries the phone's whole list + a revision so stale broadcasts don't flash old lists back (`relay-protocol.md` "DM layers")
	- pictures: PUT `/upload/dm/<name>`, kept in `uploads/dm/` (dev server; the 7-day cleanup would have broken saved sessions); PDFs rasterized like map PDFs; decoded ≤ 4096 px only while visible
	- old TV build: ignores the command, layers work on the phone in memory only
	- `test/dm_overlay_test.dart` (14 tests), full suite 391 green, analyze clean; not tested on a device yet

### 26-10-10 - battlemap UX review fixes
- helper agent played a DM session on the bench (14 findings, open ones in `action.md` "UX review 2026-10-10"); the broken ones fixed:
	- **companion crashed to an error screen closing the token editor / calibration dialog**: controllers were disposed in `showDialog().whenComplete` while the exit animation still built the text fields → `_disposeAfterExit` waits for `TransitionRoute.completed`
	- **tablet showed everything fogged after reconnect/resume**: the TV's state arrived before the map download finished and `loadMap` reset it → companion keeps `_lastFullState` and re-applies it in `_onMapReady`
	- **AoE "Clear" only cleared the TV**: networked `onClearAoe` now `_state.clearAoe` (forwards via `onAoeChanged`)
	- **TV remote dead during a game**: Flame's `GameWidget` (autofocus) returns `handled` for every key → `autofocus: false`, focus parked on the back button (stronger focus look); one remote press arrived twice (key event + system back) → 400 ms debounce in `_navigateBack`
	- verified: bench run 48/48, remote back goes game → library once, tablet shows the revealed room after prep

### 26-10-10 17:58 - 93f94292 - TV app 1.1.5+15 on the Xiaomi box from the Mac
- Konrad: "deploy the current version of the TV app to the TV that is connected via wireless debugging" → release APK of `34d7c92` (VPS relay, MwLog on), built in a temporary worktree, `install -r` over 1.1.1+11; app started (mode selector)
	- the box's app is signed with the Mac's debug key (same SHA-256), so the update kept its data
	- a session's adb can't reach the box (Local Network privacy) → latrine got an `android` adapter for that; `docs/setup.md` "TV update" has the Mac route

### 26-10-10 - battlemap play-around prep + tablet map download
- Konrad: "play around, realistic scenario, refine UI/UX" → `bench_bot.py prep` leaves a game in progress (tavern, 4 named heroes + 2 NPCs with HP, common room revealed)
	- **the native companion could not download maps**: `httpDownloadWeb` in `http_upload_stub.dart` (the non-web side) returned `null` always — the Android tablet kept showing an old map. Now delegates to dart:io `httpDownload`; a failed download shows a snackbar
	- **fog**: TV fog fully opaque (players saw the dungeon through 90 % fog), phone fog 70 % so the DM reads the layout; atmospheric mode's deep fog opaque on the TV (`FogOfWarComponent.forPlayers`)
	- UX click-through of the companion handed to a helper agent; findings → `action.md`

### 26-10-10 - ai art doc sweep: learned so far
- Konrad: document how to get good results from Nano Banana and the failures, so the next session starts from them → `ai-art.md` gets "learned so far" (what works with evidence, failure catalogue with cause/mitigation/status, measured cost and timing, checks/judge practicalities), runs 1–3 moved into a run log, Next trimmed to the live steps, open failures added to the tuning plan, status/budget/test-map lines current (≈ $1.10 incl. Juri's edit); README AI section mentions checks + judge

### 26-10-10 - judge (ai art step 3)
- Konrad: "continue" → free checks in `mapgen.py` (`check()`: open-looking wall edges relative to the image's median, pure-yellow light dots; `suspects_N.jpg`, `grid_N.jpg`; run inside `paint`, `check <run>` re-runs; `--pack` prefers no high issue) — calibrated on all keep runs by eye
- Claude judge: `judge <run> [--wait]` starts a `claude-bridge headless` helper with `prompts/judge.txt` → `judge_N.json`; run 3: retry / use 8 / use 5, agrees with the eye, rejected the banner false positive, found torch-vs-light and doorway-frame issues
- the first judge hung on a permission prompt (acceptEdits + a shell command; Konrad asked if it was stuck) → `--permission-mode auto`, Read/Write only in the prompt, `--wait` exits when the session is gone

### 26-10-10 - ruins in the layout (ai art step 2) + grid preview
- Konrad: "go" (step 2) → layout areas take `"ruined": true` (prompt: damage inside, walls whole), prompt rule "every wall stays whole", lint warns on wall-breaking words in texts (`meta.json` → `lint`); keep layout moved its ruin from text to the flag
- run 3 (keep × 3, 1K, ~10 cents): all courtyard walls kept; one draw invented an exit through the south wall (and had the best QA score) → judge step now leads with an "unasked openings" check
- Konrad: overlay a grid to test the map → `mapgen.py doors … --grid` (exact squares like `pack`, battlemap's doors + grid); image 2 packed as the test keep; board zone "run 3"

### 26-10-10 - drawn doors (ai art step 1)
- Konrad: continue the AI map hand-off → step 1 done: doors are no longer painted
	- mapgen: guide leaves doorways as gaps (no red bar), prompt asks for empty doorways, `pack` writes `"battlemap": {"draw_doors": true}` and hinges a double door's second leaf at its far end; new `doors` command / `doors_N.jpg` previews
	- battlemap: `UvttMap.drawDoors` (parser reads the extension, default false); `PortalComponent` draws a top-down wooden leaf that swings open ~85° in 0.4 s (`DoorSwing`), always to the south/east side; Dungeondraft maps keep the marker; `test/drawn_doors_test.dart` (12 tests), full suite 377 green
	- run 2 (crypt + keep, 1K × 4, ~14 cents): no red, no side-on doors; ruins still break walls (step 2); board zone "run 2"
	- not deployed to a device yet (TV check = step 5)

### 26-10-10 - battlemap bench robot
- Konrad: "make it just work, I don't want to test manually" → `tools/bench_bot.py` (seed the library + play `test-session.md` over the relay, assertions on the TV's broadcasts, adb screenshots with a pixel-coverage check, report in `build/bench-report/`, opened in ledger); relay gets a `bot` role (forwarded table traffic, no pairing)
- bugs the robot found and that are fixed (all TV side, `flutter test` 375 green, run 51/51):
	- **map picture never changed after the first map**: `VttGame._onStateChanged` only loaded when `_mapImage == null`; now reloads on a new `UvttMap` identity, stale decodes discard themselves, the old image is disposed (`VttMapImageComponent.onRemove`)
	- **tokens/drawings/undo/measure/AoE/ruler leaked into the next session**: `VttState._resetSessionState()` in `loadMap`/`loadPdfAsMap` (+2 tests)
	- **image maps could not be opened from the library**: `_startNewSession` ignored `isImage` and fed JPG bytes to the UVTT parser; now the image path, image sent to the companion via chunks, errors reach the phone (`tv.error`)
	- **edits in the last 2 s before switching sessions were lost**: `_flushPendingSave()` before new/resume/back
	- **huge maps (17100×9600) rendered as an empty screen**: decode capped at 4096 px (`VttGame.maxMapTextureSide`)
- doc fix: `vtt.addStroke` color is an ARGB hex string, not an int
- a session restart killed the first full run; re-run after rebuild: 51/51

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
