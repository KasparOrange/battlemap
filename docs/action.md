# action — live work (companion overhaul, started 2026-09-06)

Read this first in the next session. Done items move to `archive.md`, they do not accumulate here.

## state

The 12-point companion bug list (found 2026-09-06 by a full code read, see archive 26-09-06
01:10) is **fixed in code as of 2026-09-06 (session 01JM3a…)**: `flutter analyze` clean, 361
tests green, web build compiles; dead code removed 2026-09-14 (`next` 3). What is fixed and how is in `archive.md` (entry 26-09-06) and
in the docs it touched (`relay-protocol.md` "camera commands"/"tool overlays"/"state
broadcast", `architecture.md` "interaction modes"). **Nothing has been tested on a real phone
or TV yet** — but since 2026-10-10 it runs end to end on the Android bench (emulators, bench robot
59/59, a helper's UX click-through; see "direction: Android" below).

Decision (2026-09-06): **the companion stays Flutter** (phone = whole map editor sharing
renderer, state model and protocol with the TV). A Svelte surface only as a later *second*
client (player tablet, button-only remote) on the JSON relay protocol.

## next

0. **Konrad looked at the result (2026-09-06, after deploy 1.1.5+15) and saw problems he
   will fix in the next session** — he did not list them; ask first, then fix from code.
1. **Device test** (Konrad, phone + TV): walk the tabs once. Specifically check
   - pinch/two-finger pan on the phone never paints fog; the dashed TV frame is where the TV
     looks; "TV follows the tablet" moves the TV live; "Jump to TV" jumps the tablet to it
   - undo/redo buttons light up after a fog stroke made from the phone
   - measure line and distance appear on the TV while dragging on the phone
   - AoE: tap places the chosen shape/size; drag aims a cone; the panel's shape/size buttons
     change the template in place
   - ruler: 10 squares long, readable numbers, draggable in any mode, rotate on the Measure tab
   - Settings ▸ Measure the TV… (the TV shows its one-inch squares + a 10-inch bar); draw width
     slider; the bottom-sheet panel is usable one-handed and does not hide the map when collapsed
2. If bugs surface: fix from code, `flutter analyze` + `flutter test` (361 green at hand-off),
   no screenshot walkthroughs in the main session (memory rule); a subagent may click through.
3. **Dead code deleted 2026-09-14** (see archive entry): `lib/companion_screen.dart`,
   `table_screen.dart`, `game_state.dart`, `game/battlemap_game.dart`, `grid_component.dart`,
   `pdf_background_component.dart`, `ui/vtt_screen.dart`, `network/client*.dart`,
   `server*.dart`, `vtt_client*.dart`, and the `GameState` instance methods in `pdf_helper.dart`
   (only the static `renderPdfPage` remains). `flutter analyze` clean, 361/361 tests green —
   no test belonged to the deleted code. `lib/network/vtt_server.dart` kept (see below).
4. Optional visual pass on the local bench (`setup.md` "local bench"): a handful of
   screenshots, not a click-through. Playwright + Flutter semantics (`SemanticsBinding
   .instance.ensureSemantics()` behind a define) is the plan for a subagent-driven
   click-through; `terminal-browser`/agent-browser snapshots don't work (canvas, no DOM).

## direction: Android (decided 2026-10-10)

Final devices: **Android TV / Google TV** + **Android tablet/phone** (companion as the native APK,
the web build stays as a fallback). Local testing on the Mac's Android bench (`setup.md`
"android bench"); Apple TV/iPhone only for development.

- **Google TV launcher gap**: the manifest has no `LEANBACK_LAUNCHER` category, no `android:banner`
  and no `uses-feature` `android.software.leanback` / `touchscreen required=false` — so the app is
  missing from the Google TV home row (launchable only via Settings ▸ Apps or adb). Fix before
  calling it a Google TV app.
- **Bench robot (2026-10-10)**: `tools/bench_bot.py run --stress` plays the whole game night,
  59/59 green; it and the UX review found 11 bugs, all fixed (`archive.md` 26-10-10). Run it after
  every TV-side change; `bench_bot.py prep` leaves a tabletop game to play with by hand.
- **Deployed 2026-10-10 evening** (see "deploy state"): VPS relay on current main (`replaced`,
  `bot` role), threaded dev server, release APKs on the box and the tablet. Later fixes reach the
  devices with `tools/deploy.sh` (rolling deploy).
- Device test (next 1) can now run on the bench first: TV emulator + tablet emulator, following
  `test-session.md` (scripted game night with 10 real maps, incl. a 30 MB stress map).
- **Big maps**: confirmed on the bench (castle showed an empty screen), fixed — map pictures are
  decoded at most 4096 px on the long side. Still to check on the real Xiaomi: memory and look of
  the castle at TV scale (36 px per square after the shrink).

## table view (2026-10-10, 1.1.9+19) — needs the box + tablet

Every map at one square = one inch in a centred window of whole squares — Konrad's measured
**34 × 19** is the target for all maps (`architecture.md` "table view"). Built and checked on the
bench (relay probe: lair centred at 1 in, tavern 60 × 60 pans/clamps/rotates, whole map, free
zoom, calibration 40 in → 40 × 22 and back, grid remembered, re-grid 50 × 50). On the real
devices:
- **measure once**: Settings ▸ Measure the TV… → the TV shows a 10-inch bar; type what it
  measures (cm). The default 34.5 in is a guess from "34 × 19 with a bit of gap"; until measured
  a square may be ~1 % off. Then check a 1-inch mini base on several squares across the table.
- a map bigger than 34 × 19 (e.g. the castle, or a picture map with many squares): drag the gold
  grip above the dashed frame, tap the Camera tab's overview, arrows; the TV follows in whole
  squares; Whole map ↔ 1-inch table
- upload a picture map: the squares dialog shows its size, rows follow columns, "own grid
  lines" switches our grid off — and the next game on that map starts the same way
- Settings ▸ Map squares on a picture map re-grids it (fog of that game cleared)

## tabletop UX polish (2026-10-10, since 1.1.7+17) — needs a device test

The UX review's tabletop items are built (archive 26-10-10 "tabletop UX polish"; tokens/HP items
dropped as digital mode). The tablet half is on Konrad's tablet with 1.1.8+18 (panel, fog tab,
camera labels, undo snackbars, Continue card, session names). The TV half — ruler centred in
the TV's view, no door boxes on the TV, map thumbnails — needs the box on ≥ 1.1.7 (`deploy.sh
tv`); with the box's 1.1.6+16 the library shows map icons only and the ruler starts at the map's
corner. Check on the tablet + TV:
- landscape tablet: panel is a rail on the right, tabs unfold beside it; portrait/phone: bottom sheet
- Fog tab: Brush | Room, Reveal | Hide, "Players see changes: Instantly | Preview first"
- Reveal all / Hide all / Clear drawings → snackbar with Undo that really undoes on the TV
- ruler: appears in the middle of what the TV shows, numbers upright after Rotate and after a TV
  rotation; rotates in place
- TV shows no door boxes on Dungeondraft maps (tablet still does); AI-map doors on both
- library: Continue card on top, map thumbnails appear (castle: may take a few seconds on the box),
  new sessions named "Session N · <day>"
- still open from the review: pinch/two-finger pan and the real Xiaomi remote (not testable on the bench)

## kept on purpose: direct TV connection (no relay)
## DM layers (2026-10-10, 1.1.6+16) — partly device-tested

Companion Layers tab: DM-only pictures over the map (archive 26-10-10 "DM-only picture
layers"). Deployed: web build on the VPS, 1.1.6+16 on the box (18:15). Seen working on the
tablet (native 1.1.8+18, 18:56): Juri's two layers came from the TV's session, opacity slider
used. Still to check on the tablet: add 2–3 pictures at once (and a PDF), up/down, delete +
undo, master eye; reopen the app → layers come back; the TV never shows them.

## rolling deploy (2026-10-10) — first real run pending

`tools/deploy.sh [tv] [tablet] [web]` (`setup.md` "rolling deploy"). **Ask Konrad before a run
that restarts the TV while he plays.** The box's 1.1.6+16 predates the restore code, so the first
run restores through the relay (session from `diag.status`, route `/restore?session=…`); from
then on `deploy.prepare` + the snapshot work too. The same deploy ships the takeover fix (a
companion replacing another got no map — until then: `tools/tv_ctl.py resume MAP SESSION`).


`lib/network/vtt_server.dart` + `vtt_server_stub.dart` are the original pre-relay design:
the TV hosts a WebSocket server on the LAN and the phone connects to its IP. Unreferenced
and behind the current protocol, but it is the starting point for **play without internet**
(friend's place, hotspot). Roadmap #39. Not to be deleted as "dead code".

## deploy state (2026-10-10 18:56)

- **box**: 1.1.6+16 (no rolling-deploy restore, no takeover fix yet — `tools/deploy.sh tv` waits
  for Konrad's go). Open game: **"Juri's dungeon"** (image map 25×24, all revealed, TV grid off,
  DM layers "Secret rooms" + "Labels"; `ai-art.md` "On the table"); "The Countess's Lair —
  round 4" stays in the library.
- **tablet**: native companion 1.1.8+18 (`deploy.sh tablet`), image maps take the TV's grid.
- **VPS**: relay on current main (`bot` role), threaded dev server, web companion 1.1.6+16.
- APKs are built on the Mac now (`tools/deploy.sh`, clean worktree of HEAD), not on the VPS.

## other live work: AI map pipeline (#40)

Separate sub-project, own hand-off: `ai-art.md` § "Next — pick up here" (doors drawn by
battlemap, ruins in the layout, free checks + Claude judge — done 2026-10-10; next: board
from data, TV test, 4K + tuning).
Test images live on the horizon board `battlemap-mapgen`.
