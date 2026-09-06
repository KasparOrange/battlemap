# action — live work (companion overhaul, started 2026-09-06)

Read this first in the next session. Done items move to `archive.md`, they do not accumulate here.

## state

The 12-point companion bug list (found 2026-09-06 by a full code read, see archive 26-09-06
01:10) is **fixed in code as of 2026-09-06 (session 01JM3a…)**: `flutter analyze` clean, 361
tests green, web build compiles. What is fixed and how is in `archive.md` (entry 26-09-06) and
in the docs it touched (`relay-protocol.md` "camera commands"/"tool overlays"/"state
broadcast", `architecture.md` "interaction modes"). **Nothing has been tested on a real phone
or TV yet.**

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
3. **Dead code to delete** (nothing imports it; `main.dart` only uses `TvShell`,
   `VttCompanionScreen`, `DevScreen`): `lib/companion_screen.dart`, `lib/table_screen.dart`,
   `lib/game_state.dart`, `lib/game/battlemap_game.dart`, `lib/game/components/grid_component.dart`,
   `pdf_background_component.dart`, `lib/ui/vtt_screen.dart`, `lib/network/client*.dart`,
   `server*.dart`, `vtt_client*.dart`, and the `GameState` instance methods in `pdf_helper.dart`
   (keep the static `renderPdfPage`). **Keep `lib/network/vtt_server.dart`** (see below).
4. Optional visual pass on the local bench (`setup.md` "local bench"): a handful of
   screenshots, not a click-through. Playwright + Flutter semantics (`SemanticsBinding
   .instance.ensureSemantics()` behind a define) is the plan for a subagent-driven
   click-through; `terminal-browser`/agent-browser snapshots don't work (canvas, no DOM).

## kept on purpose: direct TV connection (no relay)

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
