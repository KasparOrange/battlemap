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
1. **Device test** (Konrad, phone + TV): walk the six tabs once. Specifically check
   - pinch/two-finger pan on the phone never paints fog; the dashed TV frame is where the TV
     looks; "TV follows the phone" moves the TV live; "match TV" jumps the phone to it
   - undo/redo buttons light up after a fog stroke made from the phone
   - measure line and distance appear on the TV while dragging on the phone
   - AoE: tap places the chosen shape/size; drag aims a cone; the panel's shape/size buttons
     change the template in place
   - ruler: 10 squares long, readable numbers, draggable in any mode, rotate on the Measure tab
   - scale slider only after calibration; draw width slider; the bottom-sheet panel is usable
     one-handed and does not hide the map when collapsed
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
- **Needs deploying** (Konrad: not now — first refine on the bench): all 2026-10-10 fixes exist only
  in the debug build on the emulators. Deploy = restart the VPS relay with the new
  `tools/vtt_relay.py` (`replaced` message, `bot` role), bump the version, build the release APK.
- Device test (next 1) can now run on the bench first: TV emulator + tablet emulator, following
  `test-session.md` (scripted game night with 10 real maps, incl. a 30 MB stress map).
- **Big maps**: confirmed on the bench (castle showed an empty screen), fixed — map pictures are
  decoded at most 4096 px on the long side. Still to check on the real Xiaomi: memory and look of
  the castle at TV scale (36 px per square after the shrink).

## UX review 2026-10-10 — open design decisions (Konrad picks)

A helper played a session on the bench as a first-time DM (14 findings). The 4 broken ones are
fixed (archive 26-10-10 "UX review fixes"). Open, with the recommendation:

1. ~~What players see: NPC names + HP bars on the TV~~ — dropped: tokens/HP belong to the
   digital mode, a far-off stretch goal (focus = tabletop mode, `feature-ideas.md` "play modes").
2. **Door markers on the TV**: loud green/orange boxes over the map's own doors → tablet only.
3. ~~Tokens: drag/tap/occupied squares~~ — dropped (digital mode).
4. **Camera wording/framing**: "Fit on tablet" / "Fit on TV"; linked camera frames for the TV's screen.
5. **Ruler**: appears at the TV view's centre, numbers stay upright.
6. **Panel layout**: bottom panel eats 40–65 % of the tablet → side panel in landscape; Fog tab
   "Brush | Room" segmented control, "Live mode" → "Players see changes instantly / Preview first".
7. Smaller: "Continue last session" card + thumbnails + dated default names in the library; minimum
   on-screen size for TV token labels; undo snackbar for Reveal all / Hide all / Clear all tokens.

Not testable on the bench: pinch/two-finger pan, the real Xiaomi remote.

## kept on purpose: direct TV connection (no relay)
## DM layers (2026-10-10, 1.1.6+16) — needs a device test

Companion Layers tab: DM-only pictures over the map (archive 26-10-10 "DM-only picture
layers"). Deployed: web build on the VPS, 1.1.6+16 on the box (18:15). Check on the tablet:
add 2–3 pictures at once (and a PDF), eye, opacity, up/down, delete + undo, master eye; reload
the page → layers come back; the TV never shows them.

## rolling deploy (2026-10-10) — first real run pending

`tools/deploy.sh` (`setup.md` "rolling deploy"). The box's 1.1.6+16 predates the restore code,
so the first run restores through the relay (session from `diag.status`, route
`/restore?session=…`); from then on `deploy.prepare` + the snapshot work too. The same deploy
ships the takeover fix (a companion replacing another got no map).


`lib/network/vtt_server.dart` + `vtt_server_stub.dart` are the original pre-relay design:
the TV hosts a WebSocket server on the LAN and the phone connects to its IP. Unreferenced
and behind the current protocol, but it is the starting point for **play without internet**
(friend's place, hotspot). Roadmap #39. Not to be deleted as "dead code".

## deploy state

Version bumped to 1.1.5+15 with the overhaul. Web build from the Mac is rsynced to the VPS
(`setup.md` "deploying a web build from the Mac"); **the APK must be built on the VPS**
(`git pull --ff-only`, then the full deploy sequence) — until then the TV runs 1.1.4+14, which
still understands every old message but sends no `canUndo`/`measure`/`vw`/`vh`, so on the
phone undo stays greyed, no TV frame is drawn, and measure/`vtt.setCamera` are ignored.

## other live work: AI map pipeline (#40)

Separate sub-project, own hand-off: `ai-art.md` § "Next — pick up here" (doors drawn by
battlemap, ruins in the layout, free checks + Claude judge — done 2026-10-10; next: board
from data, TV test, 4K + tuning).
Test images live on the horizon board `battlemap-mapgen`.
