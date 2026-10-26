# Battlemap — archive (history, newest on top)

Rule: **one entry per prompt that changed something** — in `docs/`, or in the code it
governs. Never per session. Heading = `### YY-MM-DD HH:MM - <session id>`; body = nested
bullets. What was learned goes into the docs it belongs to (`architecture.md`, `setup.md`,
`packages.md`, …); *that* it was learned, when, and why goes here. Newest entry goes
**above** the first heading.

### 26-10-26 06:30 - 907410 - forests that look like forests
- Konrad (handed over from the outdoor slice): the crowns read as stacked puffballs — find top-down forests on published battle maps, work out strategies
	- 12 references (itch.io, 2-Minute Tabletop, Forgotten Adventures, a Rügen drone photo) on board `battlemap-mapgen`, zone "Forest canopy references", with what makes them read as forest
	- built the recommended strategy: the canopy painted as one layer — `outdoor.py canopy` (crown plan in tiers, flat crown shapes on the ground painting, one edit pass, cut by our shapes), `prepare.py` cuts it back into trees and leaf clumps; wind, trunks and the party ghost kept; `ai-art.md` "Forests: the canopy painted as one layer"
	- layout `riverbend.json`: `edge_shrubs`, `trees` (the lone lime); `Ground` moved from `prepare.py` into `outdoor.py`; images $0.17

### 26-10-24 18:45 - abbf827c - TV Mode in a browser tab
- Konrad: start battlemap in the browser, load a random map, set up an example game
	- `tv_shell.dart` downloads through `httpDownloadWeb` (web: XHR, native: unchanged `httpDownload`) — the web TV's download was a stub returning null, so it could never load a map
	- `setup.md` "local bench": the whole table in two browser tabs (`#/restore` = TV, `#/companion`)

### 26-10-10 22:45 - remote site - Juri's PC as the door to the table
- Konrad: reach box + tablet from afar once he leaves Juri's — prepare it, message Juri with scripts and a canvas walk
	- `tools/remote-site/`: setup + remove scripts for Windows (Tailscale subnet router, two `/32` routes), board builder + walk; `setup.md` "remote site"
	- horizon board `battlemap-remote` (walk `explain`), shared by link; Telegram message to Juri with both scripts

### 26-10-10 22:50 - TV overscan - docs sweep
- Konrad (/ty): docs sweep after the overscan fix — pivot inset now from what the TV shows (`architecture.md`), deploy state 1.1.20+30 (`action.md`), README calibration store, `sessions.md` `tableCols`/`tableRows` = visible squares, and a `setup.md` gotcha: a tablet-only deploy leaves the box on an older build (why the pivot "did not show"), check `versionName` per device first

### 26-10-10 22:55 - dc488274 - box back after a power cut; docs sweep
- Konrad: the box was unplugged in between — still reachable, everything deployed?
	- box rebooted at 22:18, back on adb, battlemap closed on the Google TV home screen — relaunched with route `/restore`, the TV reopened its three-map game (session 173992e0) and paired with the relay
	- box, tablet and web on 1.1.20+30 (the overscan session's deploy on top of 1.1.19+29); nothing uncommitted
	- `setup.md` gotcha "box unplugged"

### 26-10-10 22:45 - dc488274 - session sweep: leftovers deployed, roadmap filled
- Konrad: search all of today's sessions (subagents), deploy what is built, merge unmerged branches, put the unbuilt on the roadmap
	- 39 transcripts read by four helper agents; no unmerged branches (GitHub's `claude/review-claude-md-BADKA` is merged, the VPS's stale `multi-map-sessions` was cherry-picked to main and deleted on GitHub), no extra worktrees or stashes
	- found a regression: 8ccd514 (relay no-late-replay) was built on an older tree and dropped the tablet's `sendCirclePreview` + its wiring (cf55b40); since 1.1.15+25 the circle preview never reached the TV — restored (6fcc043, hunk-only beside another session's edits)
	- 1.1.19+29 (2ffd4aa: fog edge trim, map from a link + Store as, circle preview fix; box also gets notices + ruler pivot) — 618 tests green, `tools/deploy.sh` to box, tablet and web, TV back in its game after 16 s
	- `action.md` "deploy state" + new "leftovers" (two bugs, several-maps gaps, layers with library maps, token tap, Pirate Lair chore, stale `version.json`, AI pipeline); `feature-ideas.md` planned items; CLAUDE.md tracker rows that still said "not in a build yet" corrected

### 26-10-10 22:40 - TV overscan - Measure the TV: edges the set cuts off, pattern switch, back to auto
- Konrad: Measure the TV misbehaves — the pivot does not show on the TV (show it, switch it on and off); the TV should hold 35 × 19 squares but says 38 × 21, and no fine-tuning hits it; look for logic errors; a button back to auto (34 × 19)
	- pivot: the box still ran 1.1.17+27, built before the pivot commit (tablet had 1.1.18) — fixed by deploying
	- 38 × 21: MwLog shows the width stepped in 1 cm steps up to ~39 in; 35 × 19 visible at that scale means the Thomson cuts ~5 % off each edge (overscan), so the app counted squares nobody sees. Logic gap: `TableGrid` assumed every pixel is on the glass. The Thomson's EDID (58 × 32 cm, 2011, "DTV") is generic, no help
	- `TableGrid.overscanPercent` + `visible`: squares counted in what the set shows, inch unchanged, pivot inside; `VttState.tvOverscanPercent` stored on the TV (`TvCalibrationStore`), `vtt.setOverscan`, in `vtt.fullState`; the pattern paints cut-off strips red with a blue border line
	- dialog: "Edges the TV cuts off" stepper (0–12 %), "Pattern and ruler on the TV" switch, "Back to auto (34 × 19)" button (resets width + overscan, undo) replacing the small Reset action; 1.1.20+30, 624 tests green
	- also repaired this file's header: an earlier insert had split the rule line and left a fragment between entries

### 26-10-10 22:05 - fog edge trim - docs sweep
- Konrad (/ty): docs sweep after "trim revealed edges" — test steps in `action.md` + `test-session.md` (house map), feature list, number stepper note (side rail fits only ±1/±2), and a CLAUDE.md rule against the read-after-truncate script after it struck twice today

### 26-10-10 21:58 - fog edge trim - Fog tab: trim revealed edges
- Konrad: a Fog tab setting for how much of the rim of a connected revealed area is shown — to show a little less around the edges — with the − / + stepper of the measuring dialog
	- `SessionSettings.fogEdgeInset` (0–45 % of a square, default 0, per game, sent with `vtt.updateSessionSettings`); Fog tab "Trim revealed edges" with `NumberStepper`, applied locally at once so quick taps add up
	- `fogRevealRects`: revealed squares shrink on the sides that border fog, inner corners get a notch (an even erosion), the map border stays; standard/soft/cloud draw all revealed squares as one path (no seams), atmospheric ignores it; `architecture.md` "Trim revealed edges", tracker #57
	- incident: this session's commit script repeated the `open(p,'w').write(f(open(p).read()))` truncation (21:58) and emptied this file; rebuilt at once from HEAD + the 22:20 entry from the link-import session's transcript

### 26-10-10 22:40 - 5adc8842 - docs sweep: map from a link
- Konrad (/ty): docs sweep after the link import — README (features, sheet/client rows, dev server line), `action.md` test list for #56, `test-session.md` step 4.4 (Dyson link), `packages.md` Pillow on the dev server, `setup.md` Hive-in-widget-tests gotcha, `architecture.md` web clipboard caveat

### 26-10-10 22:20 - 5adc8842 - shared library: map from a link, Store as WebP
- Konrad: the shared library upload should take a link too — paste button + free text field — with options to convert what is behind it; mark the best size/quality format (we once landed on WebP?) as recommended if it really is
	- no earlier session (Mac or VPS transcripts) recorded a format decision; measured instead on the test maps: WebP 90 ~20 % under JPEG 90 at 41–42 dB on painted maps, lossless WebP a third of the PNG on Dyson line art (lossy is bigger there), PNG 4–5× the WebP on painted maps; WebP tops out at 16383 px (the 17100 px stress castle → JPEG)
	- dev_server: `GET /fetch?url=` (public addresses only, redirects checked, Drive/Dropbox/page og:image, kind sniffed, other pictures → PNG) and `PUT /library/…&format=webp|jpeg|png` (also the picture inside a `.dd2vtt`; same pixels so grids stay valid; smaller original kept); Pillow installed on the VPS (`python3-pil`); 11 new server tests
	- companion: link field + paste-and-fetch button + Store as chips (WebP · recommended, default As is per the opt-in rule, kept in Hive `libraryUpload`); a link runs the same grid detection + squares dialog (`_pickMapFile` split into pick + `_prepareMapFile`); the notice says what it became ("as WebP, 0.4 → 0.1 MB (lossless)")
	- docs: `architecture.md` "shared map library", `relay-protocol.md` `/fetch` + conversion, `setup.md` Pillow, tracker #56

### 26-10-10 22:15 - TV set off - box stays awake for good, Juri gets the TV to-do
- Konrad: the table TV went off (energy saving timer?) and the box remote does not bring it back — what happened; then: make the box robust and awake whenever in use; send Juri a to-do for the TV set's own buttons
	- the box was fine (awake, 4 h uptime, not rebooted): at 21:40:02 the box logged the HDMI link lost — the old Thomson (TCL-built, EDID says TCL) hit its own 4 h auto standby; 6 s later a red-button press put the box to sleep. The TV NACKs every CEC message, so the box remote cannot wake it
	- box: stay on while powered, screen timeout max, screensaver off, no CEC standby to the TV on sleep — set over latrine, `deploy.sh tv` reapplies it; `setup.md` "box asleep mid-game" + "TV set off, box fine"
	- Juri on Telegram: switch off auto standby / no-signal power off / sleep timer from the TV's buttons, optional power-on-after-power-loss and T-Link

### 26-10-10 21:55 - 4c6e75db - docs sweep: notices
- Konrad (/ty): docs sweep after the notices — every "snackbar" in the docs and doc comments now says notice (action, feature ideas, setup, tracker #43, DM panel, state, relay client; the companion's few go with the link-import session's edit); `architecture.md` "notices" gains the `pumpAndSettle` test gotcha
	- incident: the sweep script did `open(p,'w').write(f(open(p).read()))` — Python opens the output (truncating) before reading the input, so 11 files went empty for a minute; the companion screen, relay client and action.md held other sessions' uncommitted edits, rebuilt from their transcripts (HEAD + the same diffs: `sendCirclePreview`, the `onCirclePreview` hook, the moved "kept on purpose" heading) and confirmed with the session working there. Read fully, then write

### 26-10-10 21:30 - shared library fill - today's maps in the shared map library
- Konrad: put all maps used today — the AI-generated ones and the example maps — into the shared library
	- the library was empty; 15 maps added over `PUT /library` with squares, own-grid flag and a 288 px thumbnail each (a script must send the thumbnail itself): Juri's cave + dungeon, AI keep, AI keep (variant), AI crypt, the ten test maps (Dyson tavern 25 × 25, own grid)
	- left out: the older keep runs, crypt v0, the April PirateLair/PNG uploads still on the box; Juri's DM layers don't travel with a library entry → `architecture.md` "shared map library", `ai-art.md`, `test-session.md` "maps"

### 26-10-10 22:05 - TV stays awake - TV box no longer sleeps mid-game
- Konrad: the TV turns itself off while the app is open — didn't we have stay-awake?
	- we did and it works: the box held `KEEP_SCREEN_ON` for battlemap; the culprit is Google TV's inattentive sleep (`secure attentive_timeout` = 4 h without a remote key, ignores wake locks), then HDMI-CEC turns the TV off
	- set to `-1` on the box over latrine; `tools/deploy.sh tv` re-applies it each deploy; `setup.md` "box asleep mid-game"

### 26-10-10 21:27 - 4c6e75db - Notices instead of snackbars
- Konrad: redesign the tablet's snackbars (plain and with a button) as one reusable component, floating centred near the bottom, with a discreet countdown bar and a close button — and fix that they don't go away on their own
	- cause of the bug: since the newer Flutter, a `SnackBar` with an action persists until tapped (`persist` defaults to true with an action) — every Undo and the "Reconnect" one (which also had a 1-day duration); and snackbars queued behind each other
	- `lib/ui/notice.dart`: `Notice.show` / `Notice.dismiss`, `NoticeHost` in `MaterialApp.builder`; every notice times out (`Notice.autoDuration`), a new one replaces the old, a held finger pauses, × closes; all 30 snackbar call sites moved (companion, DM panel, grid editor, shared library sheet — whose own `ScaffoldMessenger` is gone); `architecture.md` "notices"
	- 603 tests green (7 new in `test/notice_test.dart`: closes by itself with and without a button, button runs + closes, ×, replace + stale id, pause while held, durations); not in a build yet, no device test

### 26-10-10 21:50 - 230ef3ba - Measure the TV: a fixed pivot for the ruler
- Konrad: we couldn't tell which point stays put when the scale changes, so we couldn't lay the ruler there — assume a sensible pivot, and let us pick a corner or the centre
	- before: the 10-inch bar sat centred on the window's square boundaries — every calibration change (and every change of the square count) slid its zero, the ruler had to be moved each time
	- now the bar starts at a pivot fixed in screen pixels (`CalibrationPivot`, `TableGrid.pivotPoint`): a corner inset 8 % of the screen's height, or the centre; marked with a gold ring, numbers on the near-edge side, the caption on the far side; the title moves to the bottom when the bar runs along the top
	- default bottom left: nearest the DM when the picture reads upright for them, and the bezel gives the ruler an edge; the dialog's small TV picture has five spots (corners + centre), a tap moves the TV's bar at once; the choice is kept while the app runs
	- `vtt.showCalibration` carries `pivot` (missing = bottom left, older companions work); the bar's length is a pure function of the width (`TableGrid.barInches`) so the tablet divides by the same length the TV draws
	- 596 tests green (pivot geometry, fixed under a changed calibration, picker sends the pivot); the pattern checked as rendered pictures for three pivots; not in a build yet

### 26-10-10 22:10 - 67d95074 - docs sweep: template disc
- Konrad: /ty → README (feature line + companion paragraph), sessions.md (per-map fields), test-session.md (step 6), architecture.md (drag in every mode), action.md (table check), setup.md (Hive in widget tests hangs)

### 26-10-10 21:55 - 67d95074 - Template disc: look kept across restarts, reset, sections
- Konrad: the shape's settings must be saved and come back after closing the app; a button to reset to the defaults; the settings better organised in sections
	- saving existed (tablet Hive), but the saved look reached the map only when the disc was switched on — a disc already shown (resumed game, another map) kept the game's look; now the panel lays the saved look on a shown disc that differs (`_syncLook`, after the frame)
	- "Back to the classic disc" → **Reset to defaults** at the top of Shape, with **Undo reset**
	- Shape grouped in framed sections: Radius rings / Cubes / Cones (on/off in the header; Sizes, Colour, Line; cones + Tips, Width), Disc, Lines and labels, Placement
	- found: Hive writes never finish under a widget test's fake clock and then block every later open — the panel tests keep the look in memory (`TemplateDiscStore.memory`), a plain test checks the real Hive round trip across a close; 611 tests green

### 26-10-10 21:40 - 67d95074 - Template disc on box + tablet (1.1.17+27)
- Konrad: deploy now → version 1.1.17+27, `deploy.sh` from a clean worktree of 93bda8a: TV back in its game after 15 s, tablet companion relaunched, web on the VPS

### 26-10-10 21:20 - 67d95074 - Measure tab: AoE template disc
- Konrad (photo of an acrylic AoE template disc): add a self-built, highly configurable shape that rebuilds it exactly, as a new tool in the DM panel's Measure tab
	- measured from the photo: the cubes are centred on the middle; both cones share one base line (the 30 ft cone's left edge = the 30 ft cube's), so the 30 ft tip sits 15 ft east and the 15 ft tip on the middle; the marks are 12 at 30° between the 15 and 20 ft rings, the top one hidden by the labels; the edge sits just outside the 30 ft cube's corners (~21.2 ft) — all rebuilt as `TemplateDisc.classic` (`lib/model/template_disc.dart`)
	- `TemplateDiscComponent` draws it on the TV and the tablet (gold turning knob tablet-only); `vtt.setTemplateDisc` carries the whole disc; the TV saves it per map and echoes it in `vtt.fullState`; the tablet remembers its look (Hive `templateDisc`)
	- Measure tab ▸ Template disc: show (TV centres it), ±15°, to the TV's middle, **Shape** unfolds the whole look (`architecture.md` "Template disc"); drag middle/edge to move, knob to turn, in every tab
	- 592 tests green (26 new: geometry vs the photo, JSON, echo guard, session per map, render, panel); a render of the classic disc checked against the photo; not in a build yet, no device test

### 26-10-10 21:20 - 230ef3ba - Map scale for gridless maps + number stepper
- Konrad: the measuring should be the scale of each map (building on the grid detection), also for maps with no grid drawn in — not something of the TV or the app; and the step buttons should be MitWare's: the number in the middle, −1 −2 −5 −10 left, +1 +2 +5 +10 right, a tap on the number opens a numpad
	- what existed: the map's scale was already per map (`RasterGrid`, stored with the map); "Measure the TV" is the TV's own inch, set once per TV — both stay, the dialogs now say which is which. Missing was a way to scale a map with **no squares to count**: the upload dialog asked to "count the squares along the top edge"
	- grid editor tool **Known length**: a line over something of known size (door, corridor, scale bar), its length in squares or feet (5 per square) → square squares, lines through the line's start (`RasterGrid.fromLength`); the upload dialog says "no grid lines found" and offers "Measure on the picture" (opens there); in a game "Set this map's scale on the picture" when battlemap draws the grid
	- squares read from the file name when no grid is detected (`gridCountsFromName`: `Tavern_30x40`, `[22 x 30]`, either order, only counts giving square squares ≥ 20 px)
	- `NumberStepper` + `showNumpad` (`lib/ui/number_stepper.dart`): map squares across/down, editor square size (±.01/.1/1/5 px), corner counts, squares across; Measure the TV's Smaller/Bigger and "picture width" field became one stepper on the width (±1/2/5/10 mm); steps that don't fit a narrow row are left off
	- found: the editor tests tapped canvas-local points as screen points (y off by the app bar) — the corners test only checked x; tests now use the canvas's position (`gridEditorCanvas` key)
	- 566 tests green (new: stepper + numpad, map squares dialog gridless, `fromLength`, file-name counts, Known length in squares and feet, Measure the TV stepper); not in a build yet, no device test

### 26-10-10 21:05 - ef2b737d - Games with several maps + shared map library
- Konrad: a session holds several maps — switch between them in the tablet's DM settings, and add maps not only from the device but from a shared map library on the server, filled from there and from outside a game
	- model: `Session.mapIds` + `parkedMaps` (per-map fields `Session.perMapKeys`), `switchTo` / `withoutMap` (pure, tested); old sessions load with one map; deleting a map drops it from every game, deletes games where it was the only one
	- TV: `vtt.switchMap` = save + park + resume (`TvShell._switchMap`); `lib.openSharedMap` downloads a shared map once (`MapLibraryEntry.serverMapId`) and adds it to the game or starts a new one; `vtt.fullState.sessionMapIds`; no double state listener when a game opens inside a game
	- VPS: `dev_server.py` `/library` (list, upload with meta, thumbnail, delete; `uploads/library/index.json`, outside the 7-day cleanup); `tools/test_dev_server.py`
	- tablet: Settings tab "Maps in this game" (rows, From device, Shared library); shared library sheet (Add to game / Play, delete, upload); library screen gets "Shared library"; every device upload goes into the shared library, its thumbnail made on the tablet; "Loading <map>…" overlay during a switch; just-uploaded bytes reused instead of downloading them back
	- checks: 525 tests green (new: session switching, map deletion across games, SharedMap, panel map list, sheet); bench probe on a throwaway TV emulator with its own relay + dev server (ports 19090/14242 via `adb reverse`) so the shared bench stayed untouched — 20/20 (new game from the shared library, picture map joins, back and forth with each map's fog and tokens, same shared map reused, resume after the library, unknown map → error, shared copy deleted but the TV's plays on)
	- worked in a git worktree (`../battlemap-multimap`) because other sessions were editing the same files; the tablet UI is widget-tested only, no device click-through yet
	- landed on main past other sessions' uncommitted edits (snapshot their diff, ff-merge, re-apply, checked identical); VPS checkout pulled + dev server restarted (`/library` live — down ~1 min: `kill $(pgrep -f …)` inside the ssh command killed its own shell, `setup.md`); `deploy.sh` 1.1.16+26: TV back in its game after 16 s, tablet relaunched, web on the VPS; the box's `diag.status` reports `sessionMapIds`

### 26-10-10 21:00 - 9393ef96 - 1.1.14+24 on box + tablet
- Konrad: deploy → `deploy.sh tv tablet` from a clean worktree of 4b29370 (no preview tint on the TV, live circle resize, token rename dialog); TV 1.1.12 → 1.1.14, back in its game after 16 s; tablet 1.1.13 → 1.1.14, companion relaunched

### 26-10-10 20:30 - 0d5d9ed1 - relay: no late replay, quicker reconnect
- Konrad: go ahead (the two proposed fixes + deploy)
	- found on the way: while the tablet had no socket, every 6th tap counted as a "send failure" and re-armed the reconnect timer with the next backoff step (1→3→10→30→60 s) — tapping during an outage pushed the reconnect out; likely most of the 65 s of 19:56
	- commands made while not registered are dropped, not queued in the socket; the tablet says "Not connected to the TV — that wasn't sent" (once per 3 s); logged as `Dropped while offline` on the next registration
	- backoff 1/2/3/5 s, a connection attempt without registration after 8 s is retried, the app resuming reconnects at once
	- 1 new test (connecting drops); relay restarted on the VPS with the diagnostics; 1.1.15+25 on box + tablet
	- first new tablet lines: right after the deploy the app went to the background (`App lifecycle: paused`) and its socket died ~5 s later (1006) — Android cuts a paused app's connection; likely what happened at 19:56 (the tablet's screen off or another app in front)
### 26-10-10 20:50 - 9393ef96 - preview tint no longer on the TV
- Konrad: with "Preview first", a tapped room shows blue on the tablet — and on the TV too, which must not happen
	- `FogOfWarComponent.showPreview` (false on the TV, `tableDisplay`): staged squares stay plain fog for the players until applied; the companion's local mode keeps the tint
	- 2 new render tests (`test/fog_preview_test.dart`); not in a build yet

### 26-10-10 20:37 - 303b3806 - token dialog: rename instead of the combat editor
- Konrad: tapping a token's name opens a big "Edit" window that doesn't seem to work — what is it for?
	- it was the digital-play editor (name, HP, ten conditions); its button row held a `Spacer` inside `AlertDialog.actions` (not a Flex) — in a release build that breaks the row, Save included
	- now "Rename token": name field (autofocus, Enter saves), Cancel/Save, 340 px wide; HP and conditions only with `hpBars` / `conditions` on, otherwise the token keeps its values; Delete left the dialog (the row has it)
	- widget test, suite 533 green
	- deployed 1.1.13+23 to the tablet only (`tools/deploy.sh tablet`; the change is companion-only, the TV kept running 1.1.12+22)

### 26-10-10 20:26 - a9469a3d - Deploy 1.1.12+22: doors above the fog on the box
- Konrad: deploy
	- `tools/deploy.sh tv tablet` from a clean worktree of HEAD `0d25df0` (doors above the fog + the other sessions' committed tokens tab, circle reveal, grid editor): box and tablet 1.1.11+21 → 1.1.12+22, TV back in the "AI keep" game after 15 s, tablet relaunched into Companion Mode

### 26-10-10 20:35 - 9393ef96 - circle reveal: radius − / + resizes the circle waiting in the preview
- Konrad: in preview mode, after putting a circle down and before applying it, the radius plus and minus should change that preview live
	- `VttState.previewCircle(cells, center:, replaceLast:)` keeps the preview from before the circle; a radius change (`onRevealRadiusChanged` → `VttGame._resizeLiveCircle`) swaps in the circle at the new radius; apply, discard, any other fog change, a new circle or leaving the preview ends it (`liveCircleCell`); the tablet ignores an empty TV broadcast for 1.5 s after placing
	- relay: `vtt.roomReveal` gains `circle: new | replace` (old TVs treat it as a room); Fog tab hint "− / + resizes the circle waiting in the preview."
	- 9 new tests (`test/circle_preview_test.dart`); not in a build yet

### 26-10-10 20:21 - 303b3806 - Tokens tab: off-map tokens, place, jump, hide, delete
- Konrad: create tokens without putting them on the map; the list shows whether each is on the map, jumps the DM view to it, hides/shows it for the players, deletes it with one tap
	- `MapToken.placed` / `hidden` (JSON, old data = placed + visible); `VttState.createToken`, `setTokenHidden`, `placingTokenId` (tablet-local) + `setPlacingToken`; `moveToken` places an off-map token, its undo takes it off again (`TokenMoveAction.fromPlaced`); labels stay unique
	- relay `vtt.createToken`, `vtt.setTokenHidden` (TV handlers in `tv_shell.dart`); `TokenLayer` skips off-map tokens and, on the TV, hidden ones; the tablet draws hidden tokens faded
	- Tokens tab: name field + add, rows with where-it-is line, place/jump, eye, delete (snackbar with Undo); `VttGame.centerOnSquare` for the jump
	- 7 new tests (state + panel), suite 516 green — run in a clean worktree, because another session's relay-client edits were mid-way

### 26-10-10 20:21 - a9469a3d - AI keep on the table (box + tablet)
- Konrad: put the generated map on the TV, open on both devices
	- the fixed keep (run 5) uploaded to the VPS and sent as `bot` (`vtt.mapUploaded`, "AI keep"), then `nav.newSession` "AI keep" in table view, fully fogged; the upload's own "Session 1" deleted
	- found: a `vtt.mapUploaded` from the bot opens the map on the TV only — the TV assumes the uploader is the companion (`sendMapToCompanion: false`), so the tablet kept Juri's picture under the new grid; `nav.newSession` afterwards sends it the map
	- the box runs 1.1.11+21: drawn doors still under the fog there (the fix `8277fb4` is not deployed)

### 26-10-10 20:17 - a9469a3d - Drawn doors above the TV fog
- Konrad: follow up on the recommendation from step 5 — a door opened into a fogged room vanished under the fog
	- `PortalComponent.forPlayers` (TV): a drawn door renders at priority 11, above the fog (10), and only while the fog is off or a square on either side of the doorway is revealed (`visibleToPlayers`); the DM tablet and marker doors unchanged
	- 5 new tests in `drawn_doors_test.dart`, suite 508 green; checked on `bm_tv` (debug build): the keep's open south and east doors show over the fog, the corridor's far door (both sides fogged) stays hidden
	- `architecture.md` render order, `ai-art.md` step 5 finding (a) fixed; not on the box yet

### 26-10-10 21:30 - a494e8fa - grid editor: click-through fixes, 1.1.12+22 deployed
- bench click-through by a helper (cave 32 px and lair 72 px via 2 corners exact, TV fit within a TV pixel, a 0.1 px adjustment keeps the fog) found:
	- **a pinch edited**: the first finger's slide / mark stayed (the scale recogniser ends and restarts per added finger) → the editor counts fingers (`Listener`), reverts at the second finger, commits at the last finger up; drags follow from touch-down
	- 2 corners trusted a wrong current size (16 × 12 instead of 17 × 12) → `RasterGrid.cornerCounts` takes the pair both directions agree on, down follows across, implied size + > 1 % warning
	- detected line 0.49 px outside the edge opened as "partial edges" → threshold 15 % of a square; magnifier showed < 1 square → ~1.5; tool buttons 106 px high in portrait → 44 px; the tablet's view jumped after Apply → kept
	- not ours: TV `LateInitializationError` for the thumbnails box when the listing goes out before the library opened
- deployed HEAD as 1.1.12+22 (with the tokens list and circle radius) to box, tablet, web; TV back in its game after 15 s

### 26-10-10 20:40 - a494e8fa - picture grid + grid editor
- Konrad: build user-friendly, capable, powerful but precise ways to scale the map by hand afterwards, to correct the grid detection's errors
	- the grid became a property of the picture (`RasterGrid`: corner, square width/height, counts) mapped onto the map's squares by the renderer → no cropping (the detection's crop is gone), partial edge squares and non-square photo squares possible; library entry, `vtt.imageUploaded`/`vtt.setMapGrid` `grid`, `vtt.fullState` `rasterGrid`
	- grid editor (`lib/ui/grid_editor.dart`): tools Look / Move / Stretch / 2 corners with a magnifier, size steps to 0.01 px, position to 0.1 px, ½ / ×2, squares across, whole/partial edges, corner jumps to check drift, undo/redo, detect again; from the upload dialog and the Map tab; same counts keep the game's fog → `architecture.md` "picture grid and grid editor"
	- found: the map decode shrank the picture to the map's proportions (fine while the grid covered the whole picture) → decodes at the picture's own size now; `pixelsPerGrid` stays `round(cellW)` like before
	- 30 new tests (grid math, state, editor widget incl. portrait/phone layout), suite 498 green; committed from a HEAD-based index because two other sessions had staged/unstaged edits in the same files

### 26-10-10 20:20 - 9393ef96 - 1.1.11+21 on box + tablet
- Konrad: deploy both apps → version bump, `deploy.sh tv tablet` from a clean worktree of dd3063f (circle reveal, picture grid editor, relay diagnostics, TV without chrome); TV back in its game after 15 s, tablet companion relaunched
	- fixed: the circle-reveal entry and 5c5b7461's "no chrome" entry had never reached git (lost between staged indexes) — restored here, entries put back in time order

### 26-10-10 20:10 - 0d5d9ed1 - relay diagnostics: why the TV reacted late
- Konrad: the TV reacted late to a tablet action — was something stuck in the relay? if the logs can't show it, log both sides so they can
	- from the VPS relay's own forward log: the tablet's socket died at 19:56:10 (close 1006, no close frame), it came back only at 19:57:15; the 31 commands made in that minute (window moves, a brush stroke) waited in the tablet's socket buffer and reached the TV in the same instant as the new `register` — the delayed reaction
	- why the socket died and why the reconnect took 65 s was invisible: the companion sent nothing to MwLog (only DevLog, on the tablet), the clients logged no connection events, the relay only to `/tmp` on the VPS
	- now: companion logs as `src=companion` (DevLog lines too, tag `devlog`); both clients log every attempt, drop (close code, lifetime), outage, commands sent while offline / dropped, late messages by a new `sent` stamp, round trips (stamped pongs now forwarded by the relay), slow handlers, event-loop stalls, app lifecycle; the relay ships connects, drops, post-register bursts, no-peer drops and a per-minute traffic line as `src=relay`; failed log posts are retried instead of dropped
	- `docs/setup.md` "relay diagnostics", `docs/relay-protocol.md` heartbeat; 5 new tests; not in a build yet, relay not restarted on the VPS (Konrad is playing)
	- open: the behaviour fix — drop or confirm commands made while offline instead of replaying them late, and a connect timeout so a hanging attempt doesn't wait out the OS's ~60 s

### 26-10-10 20:06 - 5c5b7461 - TV: no chrome while all is well
- Konrad: on the TV, hide the back arrow and "Companion connected" when everything is fine; show only errors, top right, with an informative icon
	- back arrow invisible (still focusable for the remote), drawn for 5 s after any remote key (`HardwareKeyboard` handler)
	- top-right badge empty while paired; otherwise "Companion not connected" / "Connecting to relay..." / "No connection to the relay" / "Another TV took over" with icon; TV errors (`_sendError`) show there for 8 s
	- not in a build yet

### 26-10-10 20:05 - a9469a3d - AI maps step 5: the fixed keep on the TV emulator
- Konrad: follow up on the map session's recommendation — put the fixed keep on the TV (step 5)
	- the fixed run-4 keep and the run-2 crypt loaded on AVD `bm_tv` (installed 1.1.9) in the table view, rooms revealed with `vtt.roomReveal`, doors toggled with `vtt.togglePortal` over the relay (a throwaway `bench_bot` probe)
	- fog edge on the painted walls, drawn doors read at table size and swing, the crypt's double door opens from the middle; no TV errors, ~420 MB
	- found: a door swinging into a fogged room is hidden under the fog (fix proposed: leaf above the fog when a neighbouring cell is revealed); the corridor's north wall, half a square high, lies under the fog
	- `docs/ai-art.md` step 5 ✅ + known gaps; board: `tv_bench_*.jpg` sides on the keep and crypt plates, journey stage "on the TV", next card "doors above the fog"

### 26-10-10 20:03 - 9393ef96 - Fog tab: Circle reveal with a radius in squares
- Konrad: Fog tab on the tablet — set a radius in squares (e.g. 4), tap the map, reveal a circle there; walls stop it so it doesn't spill into other rooms; works with "Preview first" so the DM can correct before the players see it
	- `InteractionMode.circleReveal`; Fog tab Tool = Brush | Room | Circle, radius stepper − n + (1–30, default 4, `VttState.revealRadius`, tablet-local)
	- `WallGrid.floodFillWithin` (flood fill limited to the circle, walls + closed doors block, open doors pass) and `circleCells` (picture maps without walls)
	- the tap's squares go to the TV as `vtt.roomReveal` → reveal/hide by the TV's setting, staged in shadow mode; no protocol change
	- fixed on the way: a Room tap on the networked tablet never reached the TV (`DmCallbacks.onRoomReveal` was never called) — now both forward through `VttState.onRoomReveal`
	- 5 new tests (wall grid circle + panel); deployed in 1.1.11+21, not yet tried at the table

### 26-10-10 19:54 - 303b3806 - DM panel: tabs are modes, Tokens tab
- Konrad: no way out of draw mode on the tablet; being on a tab should be its mode, not a button on the tab; a new leftmost tab for the normal mode with token placement, selection and management — tokens are needed at the tabletop after all, to remember where players and monsters stand
	- `dm_control_panel.dart`: tabs by id; switching tabs requests the tab's mode (Layers/Camera/Settings → token), the active tab only folds; "Draw Mode", "Measure Mode", "Place Token", "AoE Mode" buttons gone; the panel follows a mode set elsewhere (1.5 s grace for its own request)
	- new Tokens tab (always shown, leftmost); Combat keeps only AoE (shown when AoE templates are on); the settings dialog drops the Tokens switch; `VttState` starts in token mode; a door tap in token mode toggles the door
	- 2 new widget tests, suite 463 green
	- deployed 1.1.10+20 with `tools/deploy.sh tv tablet` (clean worktree of HEAD): TV back in its game after 15 s, tablet relaunched into Companion Mode
	- open: tapping a token on the map doesn't select it (the list does)

### 26-10-10 19:52 - 0f0ee4a5 - AI maps: the journey on the board + walk `journey`
- Konrad: show the development over time on the canvas (failures, successes, decisions) + a canvas walk of the whole journey and where we are
	- `board.py`: `JOURNEY` timeline zone down the left (idea → run 1 → doors → ruins → checks + judge → Juri → the rail → run 4 → fix pass → where we are), each stage a picture + worked/failed/decided text
	- board repacked: zones on shelves 11,000 px wide (was 18,900 px wide), run zones up to 3 plates a row, max 8 pins per plate, notes cut to 150 chars; the "~0.11 fit zoom" limit is outdated (horizon `MIN_ZOOM` 0.02)
	- walk `journey` (~800 words, 43 cues) saved in the board's `presentations/`, played once

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
	- found: with the tablet asleep (not paired) the TV broadcasts no `vtt.fullState`, so the bot sees none and the old `juri_table.py` waits forever for the session (`relay-protocol.md` "bot role") — check with `tv_ctl.py status` instead
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
