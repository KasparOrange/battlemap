# parity — everything battlemap v1 does

The checklist for porting the Flutter app (repo root, 1.1.20+30, HEAD `ca5ea05`, 2026-10-24) to v2.
A porter builds from this without opening the Dart code; QA ticks it off. Written 2026-10-25 from a
full read of `lib/`, `tools/` and `docs/`.

**Marks:** **P** port (active behaviour, v2 must have it) · **D** dormant (digital mode: HP,
conditions, AoE combat templates, initiative — listed, not ported now) · **X** drop (obsolete; the
reason is on the line). A "v1 bug:" note on a P line means v2 does the corrected behaviour; all bugs
are collected in [Lessons](#lessons--what-v2-must-not-repeat).

**Refs:** `ui/x.dart:N` = `lib/ui/x.dart` line N (same for `game/`, `model/`, `state/`, `network/`,
`storage/`, `update/`); `tools/…` as is; docs as `arch §table view` (`docs/architecture.md`),
`proto` (`relay-protocol.md`), `sessions`, `setup`, `action`, `archive YY-MM-DD`. Abbrev.: TV = the
table display, C = companion (DM tablet), sq = grid square, wpx = world (map) pixels.

**Conventions v1 uses everywhere:** cell index = `row × gridCols + col`; tokens, ruler, disc, AoE in
grid squares; measure, strokes, camera in wpx; 1 sq = 5 ft; colours ARGB (strokes as 8-hex string
`"ffe53935"`, `drawColor` as int — unify in v2); new features default off.

---

## 1. Start, modes, routes

- [ ] P · ST-01 · One bundle, mode chosen at start: **TV Mode** ("Display on TV (no touch)"), **Companion Mode** ("DM control via relay"), **Developer** ("Logs & diagnostics") · `main.dart:82-137`
- [ ] P · ST-02 · Mode buttons are D-pad targets: TV Mode autofocused; select / enter / gamepad A activate; focused = white 20 % bg, 2 px border, chevron · `main.dart:107-118,221-279` — v1 bug: Xiaomi OK (DPAD_CENTER) did not open TV Mode, only Enter (`action` leftovers)
- [ ] P · ST-03 · Launch routes: `/restore[?session=…&map=…]` → TV reopens that game (or its own snapshot); `/companion` → networked companion without the selector; anything else → selector. Web: `#/restore`, `#/companion` · `update/deploy_restore.dart:56-88`
- [ ] P · ST-04 · A route target sits on top of the selector, so back returns to the selector · `main.dart:63-73`
- [ ] X · ST-05 · Companion dialog "Connect / Local Mode / Cancel" and local mode (tablet alone, no relay, nothing uploaded) — a test aid; v2 tests with TV + companion in two browser tabs on a local server · `main.dart:146-191`, `ui/vtt_companion_screen.dart:1275-1358`
- [ ] X · ST-06 · Phoenix app-restart wrapper — only served Shorebird's `patch.restart` · `main.dart:15-19`
- [ ] X · ST-07 · Hive init in the tvOS cache dir — tvOS dev target and Hive both gone · `main.dart:28-34`

## 2. TV: lifecycle, views, chrome, remote

### lifecycle
- [ ] P · TV-01 · Screen stays on while the app runs; system bars hidden for the whole run · `ui/tv_shell.dart:196-197` — Google TV's inattentive sleep (4 h, counts only remote keys) ignores wake locks: the deploy sets `attentive_timeout -1`, `stay_on_while_plugged_in 7`, screensaver off, no CEC standby (`tools/deploy.sh:111-117`, `setup` "box asleep mid-game") — the shell or its install script must do the same
- [ ] P · TV-02 · On start: load the TV calibration (width 34.5 in, overscan 0 %), open the library, connect as role `table`; a `/restore` launch reopens the game · `ui/tv_shell.dart:200-268,1056-1075`
- [ ] P · TV-03 · Companion pairs while the TV shows the waiting screen → TV switches to the library and sends listing + state · `ui/tv_shell.dart:256-262`
- [ ] P · TV-04 · Every view change writes the restore snapshot (view, mapId, sessionId) · `ui/tv_shell.dart:175-178,1044-1048`
- [ ] P · TV-05 · No autostart after a power cut (box boots to Google TV home) — v2 shell: consider boot-start into TV mode with `/restore` (`setup` "box unplugged")

### views
- [ ] P · TV-10 · Views `waiting` (start), `library`, `game` · `ui/tv_shell.dart:45-57,122`
- [ ] X · TV-11 · `settings` view — placeholder ("not yet implemented"), only via `nav.goToSettings` · `ui/tv_shell.dart:2096-2110`
- [ ] P · TV-12 · Waiting screen, icon 64 + text by relay state: paired "Companion connected" (green check) · connected "Connected to relay / Open VTT Companion on your phone" · connecting "Connecting to relay..." · disconnected "Connecting to {host}..." · replaced "Another TV took over the relay" · `ui/tv_shell.dart:1963-1994`
- [ ] P · TV-13 · TV library: empty → "Map Library is empty / Upload a map or PDF from your phone"; else grid of cards ≤ 300 px (aspect 1.3): icon (PDF / map), name (2 lines), "{cols}x{rows} grid • [PDF •] X.X MB" — maps only, no sessions, no thumbnails · `ui/tv_shell.dart:2001-2094`
- [ ] P · TV-14 · Selecting a TV library card starts a NEW game named "Session" (the remote cannot resume a game — roadmap) · `ui/tv_shell.dart:2054-2057`
- [ ] P · TV-15 · Game view on #111111; no map → shows the waiting view · `ui/tv_shell.dart:1950-1957`
- [ ] P · TV-16 · Overlays, top of stack: rendering card (gold spinner + label: "Rendering PDF...", "Updated — reopening the game…", "Updating battlemap — back in a few seconds" auto-clears after 60 s); transfer card "Receiving map... N%" with bar · `ui/tv_shell.dart:2185-2251`

### chrome — nothing on screen while all is well
- [ ] P · TV-20 · Back arrow top-left (16,16): always focusable, drawn only for 5 s after any remote key-down (200 ms fade, each key restarts it, key not consumed) · `ui/tv_shell.dart:1378-1387,1879-1895`
- [ ] P · TV-21 · Problem badge top-right, empty while paired. Priority: a TV error (`tv.error` sent) shows 8 s (red). Else by relay state: "Companion not connected" (orange) · "Connecting to relay..." (orange) · "No connection to the relay" (red) · "Another TV took over" (red). Pill black54, monospace 13, max 480 px, 2 lines · `ui/tv_shell.dart:1391-1399,2116-2183`
- [ ] P · TV-22 · Replaced → "Take over" button in the badge, focus jumps to it, press reconnects and claims the slot · `ui/tv_shell.dart:250-254,2133-2151`

### remote (D-pad + OK) — the fallback rule
- [ ] P · TV-30 · Back / Escape / BrowserBack → navigate back; system back exits the app only from `waiting` · `ui/tv_shell.dart:1849-1869`
- [ ] P · TV-31 · Back debounced 400 ms (Android TV delivers one press as key + system back) · `ui/tv_shell.dart:1919-1928`
- [ ] P · TV-32 · Back targets: game → library (flush save, send listing) · library → waiting · waiting → exit · `ui/tv_shell.dart:1929-1941`
- [ ] P · TV-33 · The game canvas must never take key focus (Flame's autofocus swallowed every key = dead remote); focus parks on the back arrow · `ui/tv_shell.dart:179-185,1950-1957`
- [ ] P · TV-34 · Library cards: arrow-key traversal, select / enter / A open; focused = green border 2 px · `ui/tv_shell.dart:2292-2341`
- [ ] P · TV-35 · No D-pad pan/zoom in the game (not built; candidate for the fallback)
- [ ] X · TV-36 · Every key press sent over the relay as `tv.log` — noise; log locally/MwLog only · `ui/tv_shell.dart:1860`

## 3. Rendering (shared by TV and companion)

### layers, bottom first
- [ ] P · RD-01 · Order: 0 map · 1 grid · 2 strokes · 3 live stroke · 4 tokens · 5 walls · 6 door markers (TV: drawn doors at 11) · 8 torch glow · 10 fog · 12 DM layers (C only) · 15 AoE · 20 measure · 22 template disc · 25 ruler · 28 TV frame (C only) · 30 global effects · screen-space: table mask + calibration pattern (TV only) · `game/vtt_game.dart:358-508`, `arch §rendering order`
- [ ] P · RD-02 · TV renderer differences (`tableDisplay`): no door markers, opaque fog, no preview tint, no disc knob, no TV frame, no DM layers at all (it has no layer cache), hidden tokens left out · `game/vtt_game.dart:979`, `ui/tv_shell.dart:978-981`
- [ ] P · RD-03 · Grid / walls / fog visibility follow `showGrid` / `showWalls` / `fogEnabled` on every state change · `game/vtt_game.dart:307-309`

### map image
- [ ] P · RD-10 · Decode ≤ 4096 px on the long side, straight to target size (17100 × 9600 castle = empty screen before) — v2: tile instead of shrinking · `game/vtt_game.dart:152-160,329-341`
- [ ] P · RD-11 · Picture decoded at its own size, the `RasterGrid` maps it onto the squares (no crop, no resample); #0B0B0B under the picture, clipped to the map rect · `components/map_image_component.dart:53-70`
- [ ] P · RD-12 · New map identity rebuilds every layer; old texture disposed; a decode finishing after a newer load discards itself · `game/vtt_game.dart:95-97,282-348`, `components/map_image_component.dart:38-42`
- [ ] P · RD-13 · Camera sync arriving during decode is held and applied after load (a resumed free camera was overwritten by fit) · `game/vtt_game.dart:126-128,517-521`
- [ ] P · RD-14 · Default after load: centre + fit, then the TV view mode applies · `game/vtt_game.dart:526-533`
- [ ] P · RD-15 · Re-grid of the same picture keeps the tablet's view (centre fraction + zoom × width) · `game/vtt_game.dart:288-298`

### grid
- [ ] P · RD-20 · Grid lines over the map when `showGrid` · `components/grid_overlay_component.dart` — v1 bug: 0.5 wpx wide = ~0.1 screen px at table zoom; v2 draws them in screen px

### fog
- [ ] P · RD-30 · Colour: TV #000000 fully opaque (players saw through 90 % before); companion #B3000000 (70 %, DM reads the layout) · `components/fog_of_war_component.dart:43-59`
- [ ] P · RD-31 · Revealed area drawn as one path (no seams between squares) · `components/fog_of_war_component.dart:162-169`
- [ ] P · RD-32 · Fog modes (session setting `fogMode`, default `standard`): **standard** = fog with revealed path cut out + 4 px blur · **soft** = 16 px blur · **cloud** = no blur, 3 circles (r 0.3 sq) per fog-bordering edge, bumps drift `sin(t·0.5+seed+i)·0.03 sq` · **atmospheric** = per-square opacity by distance from revealed (0.35 / 0.55 / 0.75 / deep 1.0 TV, 0.9 C), ignores edge trim · `components/fog_of_war_component.dart:139-362` — v1 bug: cloud bumps lopsided (0.45 sq into fog S/W, 0.15 N/E)
- [ ] P · RD-33 · Trim revealed edges (`fogEdgeInset` 0–45 % of a sq): sides bordering fog pulled in, inner corners get an inset × inset notch, map border never trimmed; standard / soft / cloud only · `components/fog_of_war_component.dart:153-169,430-460`, `arch §Trim revealed edges`
- [ ] P · RD-34 · Reveal animation (`fogAnimation`, default on): newly revealed squares fade out over 0.5 s; hiding is instant · `components/fog_of_war_component.dart:105-134,368-380` — v1 quirks: fade starts at 90 % not 100 %; on load/resume every revealed square replays it
- [ ] P · RD-35 · Preview tint on the companion only: staged reveal #4D7B68EE (blue 30 %), staged hide #33E53935 (red 20 %); the TV draws staged squares as plain fog · `components/fog_of_war_component.dart:51-76,384-396`

### doors
- [ ] P · RD-40 · Door markers (Dungeondraft maps paint their own doors): companion only — box + 8 px, min 32 × 32, closed #AA4400, open #00AA00, border #88FFFFFF; the TV draws nothing · `components/portal_component.dart:70-137`
- [ ] P · RD-41 · Drawn doors (`battlemap.draw_doors` in the .dd2vtt, AI maps): wooden leaf #6E4B2C 0.14 sq thick, grain, iron straps at 20/80 %, hinge pin, shadow; on every screen · `components/portal_component.dart:92-200`
- [ ] P · RD-42 · Door swing: 0.4 s ease-in-out to 85°, hinge at `bounds[0]`, opens south/east, a toggle mid-swing reverses from where it is, no swing on map load · `components/portal_component.dart:202-289`
- [ ] P · RD-43 · On the TV a drawn door sits above the fog, drawn only while fog is off or a square beside the doorway is revealed (doors deep in fog give nothing away) · `components/portal_component.dart:143-175,221-225`
- [ ] P · RD-44 · Door hit area on the tablet: box + ¼ sq each side; door taps work in Tokens, Fog brush, Room and Circle modes · `game/vtt_game.dart:1423-1448,1091-1116`

### walls
- [ ] P · RD-50 · Wall debug lines (line_of_sight + objects_line_of_sight): #88FF0000, 2 px, round caps; `showWalls` synced, so the TV draws them too (under the fog); default off · `components/wall_component.dart:7-39`

### tokens (position markers for minis and monsters)
- [ ] P · RD-60 · Only placed tokens drawn; TV leaves out hidden ones, companion draws them at ~45 % · `components/token_layer.dart:49-52`, `components/token_component.dart:161-167`
- [ ] P · RD-61 · Circle r 0.4 sq, shadow, colour fill, white24 2 px border; label = next free number, white bold; name pill above (#AA000000) · `components/token_component.dart:118-290` — v1 bug: label/name in fixed wpx (≈3.5 screen px at table zoom on 256 px squares); v2 scales with the square
- [ ] P · RD-62 · Colour cycle: #E53935 red, #43A047 green, #1E88E5 blue, #FDD835 yellow, #8E24AA purple, #FF8F00 orange · `model/map_token.dart:98-105`
- [ ] D · RD-63 · HP bar under the circle (3 px, red→yellow→green) and condition dots (r 2.5, one row) · `components/token_component.dart:210-328` — v1 bug: drawn whenever maxHp > 0, ignoring the `hpBars`/`conditions` settings

### drawings
- [ ] P · RD-70 · Strokes: colour + width in wpx, round cap/join; live stroke at 70 % alpha; a stroke needs ≥ 2 points · `components/strokes_component.dart`, `components/live_stroke_component.dart`, `game/vtt_game.dart:1452-1476`

### ruler (L-square)
- [ ] P · RD-80 · L with 10 sq arms (`rulerArmSquares`), 0.6 sq wide, wood #D95C3A1E, border #3A2410; ticks every sq (0.22) and half (0.12); numbers 1–10 bold 0.3 sq, always upright on every screen (undo camera + ruler rotation) · `components/ruler_component.dart:37-212`
- [ ] P · RD-81 · On show, the TV centres the L's middle in its own view, rotation = its camera's quarter turns; rotate turns 90° CW about the L's middle; position = corner in squares · `game/vtt_game.dart:901-908`, `state/vtt_state.dart:1556-1613`
- [ ] P · RD-82 · Draggable on the tablet in every mode (hit = arms + 0.15 sq) · `game/vtt_game.dart:1564-1577`

### measure line
- [ ] P · RD-90 · Gold #D4A76A dashed (0.04 sq wide, dash 0.2 / gap 0.1), end dots; label "N ft" white bold 0.35 sq on #CC000000 pill at the midpoint; hidden under 1 px · `components/measure_component.dart:52-171`
- [ ] P · RD-91 · Distance = 5e rule: straight squares × 5, diagonals alternate 5/10 (`(d÷2)·15 + (d%2)·5`) · `components/measure_component.dart:87-96`

### template disc (acrylic AoE disc, tabletop)
- [ ] P · RD-100 · Drawn on TV and tablet when visible: tint, rim (#B3E8EEF2), rings / cubes / cones in their colour, solid or dotted, compass marks (#141414), middle mark (one-square circle + cross); geometry cached per look · `components/template_disc_component.dart:57-245`
- [ ] P · RD-101 · Labels "N' RADIUS" / "N' CUBE" / "N' CONE" as pills, flipped when they would read upside down for that screen · `components/template_disc_component.dart:97-109,264-295`
- [ ] P · RD-102 · Gold turning knob (r 0.32 sq, rotate icon) on the rim, cones' open side — tablet only · `components/template_disc_component.dart:111-135`
- [ ] P · RD-103 · Tablet gestures in every tab: drag middle or rim band = move; knob = turn (whole degrees, snaps to 45° within 4°); a token under the finger in Tokens mode wins over the middle · `game/vtt_game.dart:1587-1636`

### global effects (live, DM-triggered)
- [ ] P · RD-110 · Gated by session setting `globalEffects` (default on); a new effect replaces the running one; plays on TV and tablet · `components/global_effects_component.dart:60-79`
- [ ] P · RD-111 · flash 0.3 s white 80 %→0 · danger 0.4 s red rgb(200,0,0) 40 %→0 · fade 3 s to black (in ⅓, hold, out ⅓) · pulse 1.5 s gold ring growing to 0.6 × map width, stroke 10→2 px · shake 0.6 s camera offset `sin(40t)·5` px x, 0.7× y, then restored · `components/global_effects_component.dart:82-158` — v1 quirks: drawn in world space over the map rect, not the screen; shake moves the camera and so triggers broadcasts + autosave

### torch glow (light animations)
- [ ] P · RD-120 · Opt-in (`lightAnimations`, default off): per .dd2vtt light a radial gradient of its colour, alpha `(0.15 + 0.04·sin(3t + 1.7i)) × intensity` → 0, radius = range sq, screen blend, under the fog · `components/torch_glow_component.dart:16,50-81`

### AoE templates (digital)
- [ ] D · RD-130 · Fill #33FF4444, white 2 px outline; circle r · cone 90° (±45°) reach r · line 1 sq wide, length r · square side 2r; tap places, drag aims cone/line or moves circle/square · `components/aoe_template_component.dart:32-136`, `game/vtt_game.dart:1280-1324`

### table mask and calibration pattern (TV, screen space)
- [ ] P · RD-140 · In table mode with a map: everything outside the window of whole squares painted #111111 — never a cut square at the edge · `components/table_frame_component.dart:60-77`
- [ ] P · RD-141 · Calibration pattern (`showCalibration`): window dimmed #B3000000; overscan strips red #B3261E with a blue #4FC3F7 4 px line round the visible area; inch grid #59FFFFFF 1 px, every 5th #A6FFFFFF 1.5 px; gold 3 px window outline · `components/table_frame_component.dart:79-125`
- [ ] P · RD-142 · Measuring bar: white 8 px from the pivot, length `max(1, min(10, floor(room − 0.1)))` in (room = width − inset, or width/2 from the centre), ticks 0.9 / 0.6 (every 5) / 0.35 in, numbers every 5 in; pivot = gold ring 0.3 in + line, inset 8 % of the visible area's shorter side; right-corner pivots run left · `components/table_frame_component.dart:126-154`, `model/table_fit.dart:186-228`
- [ ] P · RD-143 · Captions on a #CC000000 plate: "Ruler's zero on the gold ring — it stays put. The bar should be exactly N in (X cm). Type what you measure into the tablet." + "C × R squares of 1 inch · picture W × H in[ · P % cut off each edge] · the blue line should show on all four edges" (top of window, bottom for top pivots) · `components/table_frame_component.dart:157-218`
- [ ] P · RD-144 · v1 limitation: pattern lives in the game, so "Measure the TV" shows nothing with no map open — v2 should draw it in any view · `game/vtt_game.dart:219-231`

## 4. Table view — one square = one inch (`arch §table view`)

- [ ] P · TB-01 · Calibration belongs to the TV, not a game: picture width in inches (default 34.5 = 34 × 19 sq with ~¼ in spare), clamp 10–90; overscan % per edge, clamp 0–12; stored on the TV · `state/vtt_state.dart:1128-1146`, `storage/tv_calibration_store.dart:21-83`
- [ ] P · TB-02 · `TableGrid`: ppi = screen width / width in; visible = screen minus overscan per edge; cols = `max(1, floor(w·(1 − 2o/100)/ppi + 1e-6))`, rows likewise; window = cols × rows inches centred, leftover split evenly · `model/table_fit.dart:95-181`
- [ ] P · TB-03 · `TableLayout`: zoom = ppi / map px per square; per axis a map that fits is centred (start may be negative), a bigger one shows the window from `clamp(req ?? centred, 0, map − win)` in whole squares; 90°/270° swaps the window's cols/rows · `model/table_fit.dart:296-347`
- [ ] P · TB-04 · Camera modes (synced + saved): **table** (default, unknown → table) · **fit** = whole map for players, rotation-aware · **free** = zoomed off the table · `model/table_fit.dart:11-32`, `game/vtt_game.dart:602-612`
- [ ] P · TB-05 · Table view re-laid on every state change, resize and map load (no-op while decoding); angle snapped to 90°; window start stored (`null` = centred on an axis that fits) · `game/vtt_game.dart:238-243,568-599`
- [ ] P · TB-06 · Pan in whole squares: `panTable` ±1 and `setTableWindow` both force table mode; TV clamps · `game/vtt_game.dart:626-647`
- [ ] P · TB-07 · `setCamera` in table mode moves only the window's centre (whole squares, one inch stays, angle kept); otherwise → free, zoom clamped `[fit × 0.5, 10]` · `game/vtt_game.dart:884-893`
- [ ] P · TB-08 · Zoom ± = ×/÷ 1.3 → free mode; zoom-to-fit → fit mode; rotate ±90° / reset, the window keeps its centre · `game/vtt_game.dart:658-671,757-849`
- [ ] P · TB-09 · Camera moves are reported at most once per frame (0.01 px, 1e-4 zoom/angle, 0.5 px viewport) and trigger a broadcast + autosave; before 1.1.9 a camera-only change never reached the tablet · `game/vtt_game.dart:271-280`
- [ ] P · TB-10 · Companion rebuilds the same layout from the TV's camera snapshot (`vw`, `vh`, angle) + synced table fields · `arch §table view`
- [ ] P · TB-11 · `MapFit` record saved per game per map (informational, recomputed on load): cellPx, cols, rows, tvZoom, screenWidthInches, pxPerInch, tableCols/Rows (visible), fitsTable, drawGrid · `model/table_fit.dart:366-455`
- [ ] P · TB-12 · Pivots: bottomLeft (default), bottomRight, topLeft, topRight, center — fixed in screen px so the ruler's zero never moves while the calibration changes; not stored on the TV · `model/table_fit.dart:44-71` — v1 quirk: a `showCalibration` without pivot resets it to bottomLeft
- [ ] X · TB-13 · Per-session calibration (`tvWidthInches`, `calibratedBaseZoom`) and the 0.5–2× scale slider / `vtt.setScaleFactor` — broke the one-inch rule; old sessions open on the table · `sessions`, `proto §table view`

## 5. Companion shell

### connection
- [ ] P · CS-01 · Registers as role `companion`; sets log source `companion`, sends device info · `ui/vtt_companion_screen.dart:178-184,322`
- [ ] P · CS-02 · View follows the TV: `tvView` library → library screen, game → game view, else waiting; starts on waiting · `ui/vtt_companion_screen.dart:103,1367-1373`
- [ ] P · CS-03 · Waiting screen: back arrow (only way out), icon 48 (green check when paired), text "Connected to TV" / "Waiting for the TV..." / "Another phone took over the TV" / "Connecting..."; replaced → autofocused "Reconnect" · `ui/vtt_companion_screen.dart:1426-1474` — v1 quirk: paired but no `tvView` yet = stuck on "Connected to TV"
- [ ] P · CS-04 · Connection dot (10 px + wifi icon): paired green, connected/connecting orange, disconnected/replaced red · `ui/vtt_companion_screen.dart:2139-2167`
- [ ] P · CS-05 · Replaced → warning notice "Another phone took over the TV" + **Reconnect**, 10 s; closed by id when the state recovers · `ui/vtt_companion_screen.dart:507-516`
- [ ] P · CS-06 · Commands while not connected are dropped with "Not connected to the TV — that wasn't sent" (at most once per 3 s) · `ui/vtt_companion_screen.dart:324-334`
- [ ] P · CS-07 · `deploy.ready` → info "TV is updating — back in a few seconds"; `tv.error` → error notice "TV: <msg>", ends loading guards; `tv.rendering` → spinner card over every view · `ui/vtt_companion_screen.dart:454-470,1376-1413`

### library screen (outside a game)
- [ ] P · CL-01 · Header: back, "Map Library", update icon (→ §24), connection dot · `ui/vtt_companion_screen.dart:1488-1516`
- [ ] P · CL-02 · Buttons "Upload Map / PDF" (→ shared library, then a new game on it, no settings dialog) and "Shared library" (sheet, "Play") · `ui/vtt_companion_screen.dart:1520-1541,916-929` — v1 quirk: this upload ignores the saved Store-as choice
- [ ] P · CL-03 · Transfer bar (green 3 px); empty → "No maps yet / Upload a .dd2vtt or .pdf file to get started" · `ui/vtt_companion_screen.dart:1544-1588`
- [ ] P · CL-04 · **Continue** card on top: newest session whose map exists — "CONTINUE", name, "<map> • <ago>", 112 × 70 thumbnail, progress while loading; one tap resumes · `ui/library_cards.dart:116-165`, `ui/vtt_companion_screen.dart:1643-1673`
- [ ] P · CL-05 · Map row: 64 × 40 thumbnail (fallback icon), name, "c×r • N doors • X.X MB" (PDF: "c×r • PDF • X MB"); tap / play = new session → Session Settings dialog → `nav.newSession{mapId,name,settings}` · `ui/vtt_companion_screen.dart:1690-1735`, `ui/library_cards.dart:36-63`
- [ ] P · CL-06 · Default name "Session N · Sat 10 Oct" (N = sessions on that map + 1) · `ui/library_cards.dart:10-18`
- [ ] P · CL-07 · Session rows under their map (the map on its table): play icon, name, age ("just now", "Nm ago", "Nh ago", "Nd ago", else date) or "N %" with a growing fill while loading; resume → "Loading session..." + `nav.goToGame{mapId,sessionId}` · `ui/vtt_companion_screen.dart:1763-1812,2169-2176` — v2: use a European date
- [ ] P · CL-08 · Delete map: "Delete Map?" / "Delete "<name>" and all its sessions?" → `lib.deleteMap` + "Map deleted" · Delete session: "Delete Session?" / "…Fog, tokens and drawings of this session are lost." → `lib.deleteSession` + "Session deleted" · `ui/vtt_companion_screen.dart:1737-1883`
- [ ] P · CL-09 · Thumbnails: ask `lib.getThumbnail` once per app run for maps with `thumbnailAvailable`; held in memory · `ui/vtt_companion_screen.dart:404-427`
- [ ] P · CL-10 · Double-tap guard on load/resume/switch: one at a time, self-clears after 30 s · `ui/vtt_companion_screen.dart:281-295`
- [ ] P · CL-11 · No rename of maps or sessions in the UI (`lib.renameSession` exists on the TV, unused) — roadmap

### game view
- [ ] P · CG-01 · Layout: landscape tablet (wider than tall, shortest side ≥ 600) → map | panel side by side; else map above a bottom panel; bg #111111 · `ui/vtt_companion_screen.dart:1967-1990`
- [ ] P · CG-02 · Top-left: back to library (`nav.goToLibrary`); connection dot next to it · `ui/vtt_companion_screen.dart:1998-2023`
- [ ] P · CG-03 · Top-right chip: "C × R squares" + " · TV 1 in" / " · TV shows W × H" / " · TV whole map" / " · TV zoomed" · `ui/vtt_companion_screen.dart:2041-2061,2118-2135`
- [ ] P · CG-04 · Full-screen toggle top-right (Android): "Full screen" / "Show system bars" → §25 · `ui/vtt_companion_screen.dart:2026-2038`
- [ ] P · CG-05 · Map switch overlay 'Loading "<name>"…' with bar, auto-clears after 60 s or on arrival / TV error; activeMapId change → "Loading the next map…" · `ui/vtt_companion_screen.dart:345-354,995-1018,2064-2094`

### map arriving on the companion
- [ ] P · CM-01 · Map via chunks (`vtt.mapStart/Chunk/End`) or `vtt.downloadMap{url}`; a URL naming the file just uploaded reuses those bytes · `ui/vtt_companion_screen.dart:386-403`
- [ ] P · CM-02 · Loader tries .dd2vtt first, else image; grid from fullState `gridCols/gridRows/rasterGrid` (never from the previous map) · `ui/vtt_companion_screen.dart:597-625`, `state/vtt_state.dart:654`
- [ ] P · CM-03 · Keep the last `vtt.fullState` and re-apply it once the map is ready (state arriving before the map reset the fog) · `ui/vtt_companion_screen.dart:563-582`
- [ ] P · CM-04 · Download failure → "Couldn't download the TV's map — check the connection" · `ui/vtt_companion_screen.dart:627-651` — v1 bug: decode/download exceptions reached only the dev log
- [ ] P · CM-05 · The TV's camera never moves the tablet's view; it only moves the TV frame · `ui/vtt_companion_screen.dart:373-377`

### map canvas gestures (tablet)
- [ ] P · CV-01 · Two fingers = pinch zoom + pan (by pointer count, not pinch scale); zoom clamped `[fit × 0.5, 10]`; wheel ×1.15 · `game/vtt_game.dart:1021-1087`
- [ ] P · CV-02 · A tool starts only after 4 px of one-finger travel; a second finger landing cancels the tool (live stroke dropped) — a pinch never paints · `game/vtt_game.dart:1022,1034-1043,1258-1271`
- [ ] P · CV-03 · Drag priority: TV-frame grip → ruler (when shown) → template disc (knob / middle / rim) → the mode's tool · `game/vtt_game.dart:1125-1152`
- [ ] P · CV-04 · Taps by mode: Tokens = door, else place (armed token or a new one; occupied square = nothing) · Fog brush = door, else one square · Room = door, else flood fill · Circle = door, else circle · Draw = nothing · Measure = clear · AoE (D) = place · `game/vtt_game.dart:1089-1121` — v1 bug: a single brush tap toggled the square on the tablet only, `vtt.toggleReveal` was never sent
- [ ] P · CV-05 · Drags by mode: brush = circular stamp, one `vtt.brushReveal` per square entered (deduped) · draw = live stroke · tokens = move · measure = line stays after release · `game/vtt_game.dart:1153-1216,1393-1421`

### TV frame and overview (what the players see)
- [ ] P · CF-01 · Dashed gold frame (#D4A76A, 2.5 px, dash 14 / gap 8 screen px, corner dots): in table view exactly the window; plus a gold grip (r 16 px, 4-way arrow) 24 px above it when the TV can pan · `components/tv_viewport_component.dart:94-206`
- [ ] P · CF-02 · Grip drag (hit 1.8 × 16 px) previews at once, sends `vtt.setTableWindow` throttled 80 ms, final position at once; preview yields when the TV confirms or after 1.5 s · `game/vtt_game.dart:713-746,1547-1555`, `ui/vtt_companion_screen.dart:540-559`
- [ ] P · CF-03 · Overview map (Camera tab): whole map ≤ 220 px high, outside the window dimmed #99000000, gold box; tap/drag moves the window and wins the gesture on touch-down (the panel must not scroll); fit/free views show the TV screen as a rotated quad, no touch · `ui/tv_overview_map.dart:30-206`

## 6. DM panel — layout

- [ ] P · DP-01 · Bottom sheet on phones/portrait: header, content (≤ 45 % of screen height, scrolls), tab bar at the bottom edge · `ui/dm_control_panel.dart:679-706`
- [ ] P · DP-02 · Side rail on landscape tablets: 72 px rail at the right edge, 320 px content unfolding to its left (open 220 ms, close 150 ms); undo/redo at the rail's foot, reachable while folded · `ui/dm_control_panel.dart:60-63,713-780` — v1 quirk: in the bottom sheet undo/redo live in the header, unreachable when folded
- [ ] P · DP-03 · Header: icon + tab name, undo, redo (dimmed by the TV's `canUndo`/`canRedo`), gear (Session Settings → `vtt.updateSessionSettings`), fold chevron · `ui/dm_control_panel.dart:785-834`
- [ ] P · DP-04 · Tabs in order: Tokens, Fog, Draw, Measure, Combat (D), Layers, Camera, Settings; Draw needs `drawingTools`, Measure `measureTool`, Combat `aoeTemplates`; a hidden active tab falls back to Tokens · `ui/dm_control_panel.dart:523-564`
- [ ] P · DP-05 · **Tabs are modes**: Fog → its remembered tool, Draw → draw, Measure → measure, Combat → aoe, Tokens/Layers/Camera/Settings → token; switching sends `vtt.setMode`; tapping the active tab only folds/unfolds · `ui/dm_control_panel.dart:568-625,860-871`
- [ ] P · DP-06 · A mode set elsewhere (TV restore, bot) switches the tab without unfolding — ignored for 1.5 s after the panel's own request (echo guard) · `ui/dm_control_panel.dart:631-647`
- [ ] P · DP-07 · Starts folded, on the tab owning the current mode (new games: Tokens) · `ui/dm_control_panel.dart:486,650-656`
- [ ] P · DP-08 · ≥ 44 px targets, 14 px text; sliders preview locally and send on release; bulk actions confirm with an Undo notice · `arch §interaction modes`
- [ ] P · DP-09 · Leaving the Tokens tab cancels an armed placement · `ui/dm_control_panel.dart:864-871`
- [ ] P · DP-10 · v1 gap: panel controls have no D-pad focus (companion is touch-first; fine) · —

## 7. Tokens tab (tokens = where minis and monsters stand)

- [ ] P · TK-01 · Hint: "Tap an empty square to place a new token, drag a token to move it. Tap a door to open or close it." / while armed: "Tap the map where {name} stands." · `ui/dm_control_panel.dart:965-975`
- [ ] P · TK-02 · Map: tap empty square → `vtt.addToken{gridX,gridY}`; drag → `vtt.moveToken{id,gridX,gridY}`; door tap → `vtt.togglePortal` · `network/vtt_relay_client.dart:988-993`
- [ ] P · TK-03 · "New token" field (hint "e.g. Thorin, Goblin 2", Enter submits) + add → `vtt.createToken{name}`: a token not on the map yet · `ui/dm_control_panel.dart:977-1030`
- [ ] P · TK-04 · Row: colour dot with number (faded when hidden), name or "Token N", status "On the map" / "Not on the map" / "Tap the map…" + " · hidden from players" · `ui/dm_control_panel.dart:1111-1177`
- [ ] P · TK-05 · Not on the map → **place** arms it (tablet-local); next tap on an empty square places it via `vtt.moveToken` (undo takes it off again) · `ui/dm_control_panel.dart:1207-1212`, `state/vtt_state.dart:1337`
- [ ] P · TK-06 · On the map → **jump** centres the tablet's own view on it (TV stays) · `ui/dm_control_panel.dart:1200-1205`
- [ ] P · TK-07 · **Eye** → `vtt.setTokenHidden{id,hidden}`: TV leaves it out, tablet draws it faded; no undo · `ui/dm_control_panel.dart:1213-1217`
- [ ] P · TK-08 · **Delete**, one tap → `vtt.removeToken` + "Token deleted" with Undo · `ui/dm_control_panel.dart:1218-1222`
- [ ] P · TK-09 · Tap a row → "Rename token" dialog (name autofocus, Enter = Save, 340 px) · `ui/dm_control_panel.dart:1278-1359`
- [ ] P · TK-10 · "Clear All Tokens" → `vtt.clearTokens` · `ui/dm_control_panel.dart:1012-1016` — v1 bug: no confirm, no undo, and a later undo of a token move then throws; v2: Undo notice
- [ ] P · TK-11 · Labels stay unique (smallest unused number); ids unique · `state/vtt_state.dart:1285-1321`
- [ ] D · TK-12 · HP row (− cur/max +) and HP / conditions fields in the dialog (10 conditions: poisoned, stunned, frightened, prone, concentrating, blinded, charmed, restrained, invisible, unconscious) → `vtt.editToken` · `ui/dm_control_panel.dart:1180-1266,1360-1467` — v1 bug: networked HP ± sent empty name/maxHp and wiped them
- [ ] P · TK-13 · v1 gap: tapping a token on the map doesn't select it (only the list does) — roadmap

## 8. Fog tab

- [ ] P · FG-01 · Tool: Brush | Room | Circle (segmented, remembered) → `vtt.setMode fogReveal / roomReveal / circleReveal` · `ui/dm_control_panel.dart:1527-1541`
- [ ] P · FG-02 · Hint per tool: "Drag over the map to {reveal|hide} squares." / "Tap a room to {verb} all of it." / "Tap the map to {verb} {r} squares around it — walls and closed doors stop it." · `ui/dm_control_panel.dart:1543-1552`
- [ ] P · FG-03 · Reveal | Hide (default Reveal) → `vtt.toggleRevealMode` when it differs · `ui/dm_control_panel.dart:1554-1563`
- [ ] P · FG-04 · Brush size chips "1" / "3" / "5" = radius 0 / 1 / 2 (default "3"); round brush `dc² + dr² ≤ r² + r` → `vtt.setBrushRadius` · `ui/dm_control_panel.dart:1580-1607`
- [ ] P · FG-05 · **Room**: 4-neighbour flood fill from the tapped square, never across a wall or closed door (whole map without walls); the tablet computes the squares → `vtt.roomReveal{cells}` · `game/wall_grid.dart:307-344`
- [ ] P · FG-06 · **Circle**: radius − n + ("N squares"), 1–30, default 4, tablet-local (not synced/saved); flood fill limited to the circle (`dc² + dr² ≤ r² + r`), walls and closed doors stop it, open doors let it through; picture maps without walls → plain circle · `game/wall_grid.dart:349-420`, `ui/dm_control_panel.dart:1564-1571`
- [ ] P · FG-07 · Live circle in the preview: − / + redraws the waiting circle in place (`circle: "replace"`) until applied, discarded, another fog change, a new circle or leaving the preview; hint "− / + resizes the circle waiting in the preview." · `state/vtt_state.dart:216-227,1233`, `arch §Circle reveal`
- [ ] P · FG-08 · Wall grid: walls → blocked square edges; axis-aligned segments on grid lines block every square they span, others at each crossed line; closed doors add edges, open doors remove them; rebuilt when doors change · `game/wall_grid.dart:61-282` — v1 bug: a diagonal polyline corner exactly on a grid line blocks nothing there (leak)
- [ ] P · FG-09 · "Players see changes: Instantly | Preview first" (default Instantly) → `vtt.toggleShadowMode`; staged squares tinted on the tablet only · `ui/dm_control_panel.dart:1612-1623`
- [ ] P · FG-10 · In preview: "{n} squares waiting — show them?" + green ✓ → `vtt.commitShadow` ("Fog changes applied", one undo step of what actually changed) / red ✗ → `vtt.clearShadow` ("Shadow cleared"); a brush tap in preview cycles the square through the staging sets · `ui/dm_control_panel.dart:1625-1656`, `state/vtt_state.dart:893-948`
- [ ] P · FG-11 · "Fog layer" on/off → `vtt.toggleFog` (default on) · `ui/dm_control_panel.dart:1658-1663`
- [ ] P · FG-12 · "Trim revealed edges" + "Shows a little less at the rim of every revealed area — in % of a square.": stepper 0–45, steps 1/2/5/10, applied locally at once, per game (`fogEdgeInset`) → `vtt.updateSessionSettings` · `ui/dm_control_panel.dart:1666-1716` — v2: debounce (v1 sends the whole settings on every tap)
- [ ] P · FG-13 · Reveal all / Hide all → `vtt.revealAll` / `vtt.hideAll` + "Whole map revealed / hidden" with Undo; "Nothing changed" when nothing did; in preview "… in the preview — apply it to show the players" (no Undo) · `ui/vtt_companion_screen.dart:251-268,1153-1164`

## 9. Draw tab

- [ ] P · DR-01 · Hint "Drag on the map to draw. The players see it on the TV."; live stroke streams `vtt.strokeUpdate`, then `vtt.addStroke` · `ui/dm_control_panel.dart:1734`
- [ ] P · DR-02 · Colours: red #E53935 (default), green #43A047, blue #1E88E5, yellow #FDD835, orange #FF8F00, white → `vtt.setDrawColor` · `ui/dm_control_panel.dart:1722-1771`
- [ ] P · DR-03 · Width: presets S 2 / M 4 (default) / L 8 / XL 14 + slider 1–20 (whole px), preview while dragging, sent on release → `vtt.setDrawWidth` · `ui/dm_control_panel.dart:1774-1812`
- [ ] P · DR-04 · "Clear" → `vtt.clearDrawings` + "Drawings cleared" with Undo · "Undo stroke" → `vtt.undoStroke` · `ui/dm_control_panel.dart:1817-1829` — v2: fold "Undo stroke" into the one undo stack (v1's bypasses it)

## 10. Measure tab

- [ ] P · MS-01 · Hint "Drag on the map to measure. Tap to clear. The players see the line on the TV." → `vtt.setMeasure{x1,y1,x2,y2}` / empty = clear · `ui/dm_control_panel.dart:1845`
- [ ] P · MS-02 · "Ruler on the map" toggle → `vtt.toggleRuler` (TV centres it); visible → "Rotate ruler" → `vtt.rotateRuler` + "Drag the ruler on the map to move it (in any mode)." → `vtt.setRulerPosition{x,y}` · `ui/dm_control_panel.dart:1852-1872`

### template disc panel
- [ ] P · DS-01 · "Template disc on the map": show = remembered look + visible + `center: true` (TV centres it in its view, snapped); hide = visible false · `ui/template_disc_panel.dart:161-202`
- [ ] P · DS-02 · Visible: "↺ 15°" / "{rot}°" / "↻ 15°", "To the middle of the TV", hint "Drag its middle or edge to move it, the gold knob to turn it and aim the cones (in any tab)." · `ui/template_disc_panel.dart:205-245`
- [ ] P · DS-03 · Every change sends the whole disc `vtt.setTemplateDisc{disc,center?}` (drags too); tablet ignores the TV's echo for 1.5 s after its own change · `state/vtt_state.dart:1623,1910-1915`
- [ ] P · DS-04 · Look remembered on the tablet (`templateDisc`/`look` = shape only) and laid on a shown disc that differs (resumed game, other map) once per frame when the tab is open; "Saved on this tablet — every disc you show uses it." · `ui/template_disc_panel.dart:25-159`
- [ ] P · DS-05 · "Shape" unfolds the editor in place; "Reset to defaults" → classic look (place kept), then "Undo reset" until the next look change · `ui/template_disc_panel.dart:247-296`
- [ ] P · DS-06 · Sections Radius rings / Cubes / Cones: header taps on/off; "Sizes (feet)" chips (tap = select; "+" adds largest + 5, max 120); selected: −5 / +5 (5–120, no duplicates), delete; Colour (8: #E0402C red, #141414 black, #1F4FB8 blue, #FFFFFF, #F2C14E gold, #3DBB6B green, #9B59D0 purple, #29B6F6 sky); Line Solid / Dotted; Labels on/off · `ui/template_disc_panel.dart:297-509`
- [ ] P · DS-07 · Cones: Tips "One base" (default) / "From the middle"; Width "5e (53°)" (53.13°, default) / 60° / 90° · `ui/template_disc_panel.dart:304-312`
- [ ] P · DS-08 · Disc: Middle circle (on), Edge (on), Compass marks None/4/8/12 (12), Tint Clear 0 / Light 0.1 / Half 0.25 / Strong 0.4 (0) · Lines and labels: Line width Thin 0.035 / Normal 0.05 / Bold 0.08 sq; Label size Small 0.15 / Normal 0.2 / Large 0.28 · Placement: middle snaps to Free / square centres / corners (re-snaps at once) · `ui/template_disc_panel.dart:314-373`
- [ ] P · DS-09 · Classic disc (from the acrylic disc's photo): red solid rings 5/10/15/20 ft · black dotted cubes 10/20/30 centred · blue dotted 5e cones 15/30 on one shared base (30 ft cone centred, 15 ft tip on the middle) · 12 marks between the two largest rings (the one under the ring labels left out, within 14° of the top) · one-square middle circle · edge just outside the farthest outline (0.06 sq margin) · 20 ft ring = 4 in on the table · `model/template_disc.dart:198-326`, `archive 26-10-10 21:20`
- [ ] P · DS-10 · Model clamps on read: coneDegrees 10–170, markers 0–36, tint 0–0.8, lineWidth 0.01–0.3, labelSize 0.08–0.8; sizes sorted, deduped, > 0; missing fields fall back to classic · `model/template_disc.dart:57-64,368-425`
- [ ] P · DS-11 · Saved per map in the session (`templateDisc`) · `model/session.dart:378-380`

## 11. Combat tab (digital)

- [ ] D · CB-01 · Shown only with `aoeTemplates`; hint "Tap the map to place. Drag to aim a cone or line, or to move a circle or square."; Shape circle/cone/line/square; Size 10/15/20/30/60 ft (default circle 20 ft); changes edit a placed template in place → `vtt.setAoe`; "Clear AoE" → `vtt.clearAoe` · `ui/dm_control_panel.dart:1036-1104` — v1 bug: `activeAoe` missing from fullState (a reconnecting tablet never sees it)

## 12. Layers tab — DM-only pictures (`arch §DM layers`)

- [ ] P · LY-01 · Intro "Pictures only you see, laid over the map — a DM version of the map, notes, secrets. The TV never shows them." · `ui/dm_control_panel.dart:2136-2139`
- [ ] P · LY-02 · "Add pictures": multi-pick PNG/JPG/WebP/PDF (page 1 rasterised); progress "Preparing…" / "Rendering PDF i of n…" / "Uploading i of n: <name>"; PUT `/upload/dm/<name>` (kept forever); result "Layer added — only you see it" / "N layers added — only you see them" / "[N added, ]M skipped: a, b" · `ui/vtt_companion_screen.dart:1038-1128`
- [ ] P · LY-03 · "Show layers" master eye — this device only, never sent, default on · `ui/dm_control_panel.dart:2150-2160`
- [ ] P · LY-04 · List "Layers (n) — top first": eye, name, status "Loading…" / "Couldn't load — hide and show to retry"; ↑ / ↓; delete → 'Removed "<name>"' with Undo (back at its index); opacity slider 0–100 % (default 60 %), sent on release · `ui/dm_control_panel.dart:2177-2305`
- [ ] P · LY-05 · Whole list sent on every edit `vtt.setDmOverlays{overlays (bottom first), rev}`; rev = max(rev + 1, now ms); the tablet ignores TV lists until one echoes its rev (or 3 s) · `state/vtt_state.dart:1730-1746`, `proto §DM layers`
- [ ] P · LY-06 · Stored in the TV's session (metadata only), echoed in fullState; the TV never downloads or draws them · `proto §DM layers`
- [ ] P · LY-07 · Tablet cache: download, decode ≤ 4096 px only while visible, free when hidden; failed layer retries when shown again; drawn above the fog, fitted into the map (aspect kept, centred) · `game/dm_overlay_images.dart:23-169`, `components/dm_overlay_component.dart:42-70`
- [ ] P · LY-08 · v1 gap: layers don't travel with a shared-library map (Juri's dungeon needs its two layers re-added per game) — roadmap

## 13. Camera tab

- [ ] P · CA-01 · **Players see**: "1-inch table" → `vtt.setTvCameraMode table` / "Whole map" → `fit` (free only by zooming) · `ui/dm_control_panel.dart:1906-1929`
- [ ] P · CA-02 · Info line: "One square = one inch; the TV holds c × r squares." / "The whole map (c × r squares) fits the table (tc × tr), centred, one inch per square." / "The TV shows w × h of the map's c × r squares. Tap or drag the box, the arrows, or the gold grip on the map to move it." / "The whole map is on the TV — squares are not one inch. Tap 1-inch table to play on it." / "The TV is zoomed freely — …Tap 1-inch table to go back." · `ui/dm_control_panel.dart:2060-2083`
- [ ] P · CA-03 · Overview map (CF-03) + arrows (only on axes that pan, dimmed at the edge) → `vtt.panTable{dx,dy}` ±1 · `ui/dm_control_panel.dart:1935-1945,2088-2119`
- [ ] P · CA-04 · **Tablet**: "Pinch and drag with two fingers to move your view. The dashed frame is what the TV shows."; "Fit on tablet"; "Jump to TV" (warning "The TV hasn't sent its view yet" if none) · `ui/dm_control_panel.dart:1950-1976`
- [ ] P · CA-05 · **TV**: "TV follows the tablet" toggle (starts off, not synced; notices "TV follows the tablet" / "TV stays where it is"; streams `vtt.setCamera` ≥ 80 ms apart, latest wins); "Show my view on the TV" (one `vtt.setCamera` + "TV shows your view"); hint "On the 1-inch table the TV takes only the middle of your view." · `ui/dm_control_panel.dart:1980-2003`, `ui/vtt_companion_screen.dart:523-535`
- [ ] P · CA-06 · "TV zoom (leaves the 1-inch table)" − / + → `vtt.zoomOut` / `vtt.zoomIn`; "TV rotation" ↺ / 0° / ↻ → `vtt.rotateCCW` / `resetRotation` / `rotateCW` · `ui/dm_control_panel.dart:2006-2054` — v1 gap: `vtt.zoomToFit` unreachable from the panel networked

## 14. Settings tab

- [ ] P · SE-01 · **Maps in this game**: rows with 48 × 36 thumbnail + name; the active one gold-bordered "On the table"; tap another → `vtt.switchMap{mapId}` + 'Loading "<name>"…'; note "Each map keeps its own fog, doors, tokens and drawings." · `ui/dm_control_panel.dart:2312-2351,2952-3013`
- [ ] P · SE-02 · "From device" → upload into the shared library, then the map joins the game (`lib.openSharedMap{intoGame:true}`); "Shared library" → sheet with "Add to game" ("In this game" for maps already in) · `ui/vtt_companion_screen.dart:939-978`
- [ ] P · SE-03 · **Table scale**: "One square = one inch on the TV. It holds c × r squares (picture w in wide), centred." + "Measure the TV…" (§15) · `ui/dm_control_panel.dart:2376-2390`
- [ ] P · SE-04 · **Grid**: "Draw a grid over the map" → `vtt.toggleGrid` (remembered on the map's library entry); note "Off when the picture has its own grid lines — remembered for this map." · `ui/dm_control_panel.dart:2394-2423`, `ui/tv_shell.dart:1001-1007`
- [ ] P · SE-05 · Picture/PDF maps: "Fit the grid on the picture" (grid off) or "Set this map's scale on the picture" (grid on, opens Known length) → grid editor; "Map squares: c × r — change" → squares dialog ("Apply", warning "The fog of this game is cleared (its squares change). Drawings, layers and tokens stay; the map keeps the new grid.") · `ui/dm_control_panel.dart:2516-2569`
- [ ] P · SE-06 · Both send `vtt.setMapGrid{cols,rows,grid?}` + "Map squares: c × r" / "Grid: c × r squares of N.NN px"; same counts keep fog, staging, window and undo; new counts clear them; tokens, drawings, layers, ruler, disc always stay; only picture/PDF maps ("Only picture and PDF maps can be re-gridded") · `state/vtt_state.dart:689`, `ui/tv_shell.dart:1014-1029,1737-1742`
- [ ] P · SE-07 · "Walls" toggle → `vtt.toggleWalls` (debug lines, default off) · `ui/dm_control_panel.dart:2425-2430`
- [ ] P · SE-08 · **Effects**: Flash / Shake / Fade / Pulse / Danger → `vtt.triggerEffect{effect}`, also played on the tablet (RD-111) · `ui/dm_control_panel.dart:2434-2480`
- [ ] X · SE-09 · "Load Map" (.dd2vtt picker, local mode only) — local mode dropped (ST-05) · `ui/dm_control_panel.dart:2367-2372`

## 15. Measure the TV dialog (calibration, once per TV)

- [ ] P · CT-01 · Open → `vtt.showCalibration{on:true,pivot}`; any close → `{on:false}`; width = screen − 96, 240–420 · `ui/dm_control_panel.dart:2597-2660,2821-2824`
- [ ] P · CT-02 · Intro "This TV only, once: the TV shows its one-inch squares and a {bar}-inch bar. Measure the bar with a ruler and type what you get. Each map's own scale is set with the map (Map squares)." + live "Now: c × r squares · picture w in (cm) wide[ · o % cut off each edge]" · `ui/dm_control_panel.dart:2666-2682`
- [ ] P · CT-03 · "Back to auto (34 × 19)" → `vtt.resetCalibration` + "TV scale back to auto: 34 × 19 squares, no edges cut off." with Undo (re-sends old width + overscan) · `ui/dm_control_panel.dart:2635-2688`
- [ ] P · CT-04 · "Pattern and ruler on the TV" switch (default on) · `ui/dm_control_panel.dart:2690-2698`
- [ ] P · CT-05 · "Ruler's zero on the TV": small black TV picture with five spots (corners + centre), default bottom left, a tap moves the TV's bar at once and turns the pattern on; kept for the app run; hint "The bar starts at the gold ring there. That point never moves while you adjust — lay the ruler's zero on it once, then watch the far end." · `ui/dm_control_panel.dart:2700-2717,3346-3404`
- [ ] P · CT-06 · "The bar measures" field, unit cm (default) / inches, comma accepted; Apply: empty/≤ 0 → "Enter what the bar measures."; ratio outside 0.5–2 → "That is far from {bar} in — measure the bar again."; ok → `vtt.calibrate{tvWidthInches: width × measured / bar}`, dialog stays open · `ui/dm_control_panel.dart:2619-2736,2828-2851`
- [ ] P · CT-07 · "Fine tune: the picture is this wide" ("Wider = smaller squares. Tap the number to type it."): stepper cm .1/.2/.5/1 (25–500) or in .05/.1/.2/.5 (10–200); each step → `vtt.calibrate` at once · `ui/dm_control_panel.dart:2742-2762`
- [ ] P · CT-08 · "Edges the TV cuts off" (raise until the blue line shows on all four edges; 0 with "Just scan" / "Screen fit"): stepper .25/.5/1/2, 0–12 % → `vtt.setOverscan{percent}` · `ui/dm_control_panel.dart:2763-2789` — found on the Thomson: ~5 % per edge (38 × 21 counted vs 35 × 19 visible)

## 16. Session Settings dialog (new game + gear)

- [ ] P · SS-01 · Presets "Pen & Paper" (default) / "Digital" (= P&P + tokens, hpBars, conditions, aoeTemplates); the matching one highlighted · `ui/session_settings_dialog.dart:333-392`, `model/session.dart:127-169` — v1 bug: highlight goes stale after fog-mode/animation/effects changes
- [ ] P · SS-02 · Working toggles: Drawing Tools (on; Draw tab), Measure (on; Measure tab), Fog Mode Standard / Soft / Cloud / Atmos, Fog Animation (on), Light Animations (off; torch glow), Global Effects (on) · `ui/session_settings_dialog.dart:164-211`
- [ ] D · SS-03 · HP Bars, Conditions, AoE Templates (all off; Combat tab, token HP UI) · `ui/session_settings_dialog.dart:186-192`
- [ ] X · SS-04 · Fog of War, Shadow Mode, Door Toggles, Ruler toggles — read nowhere in v1 (the Fog tab, preview, doors and ruler are always offered); v2 shows only settings that do something · `ui/session_settings_dialog.dart:164-181`
- [ ] X · SS-05 · `tokens` (legacy, tokens always on), `initiativeTracker` (no UI), "Ambient Sound" / "Weather Effects" ("soon", greyed) — keep the JSON keys readable, build the features from the roadmap · `model/session.dart:36-70`
- [ ] P · SS-06 · Max 400 wide, 85 % high; × / Cancel = no change; Save returns the settings; all settings per game, restored on resume · `ui/session_settings_dialog.dart:109-251` — v1 gap: no focus/keyboard support

## 17. Getting a map in (upload / import)

- [ ] P · UP-01 · File picker accepts any type (Safari doesn't know .dd2vtt), decided by extension: .dd2vtt / .uvtt / .pdf / .png / .jpg / .jpeg / .webp; else "Unsupported file. Use .dd2vtt, .uvtt, .pdf, .png, .jpg, or .webp files."; empty → "Could not read file. Try downloading it to your phone first, then pick from local storage." · `ui/vtt_companion_screen.dart:669-717`
- [ ] P · UP-02 · iOS Safari: picks must survive the window focus event (file_picker cancelled every pick) · `network/file_picker_options_web.dart:13`
- [ ] P · UP-03 · PDF → page 1 rasterised on the tablet ("Rendering PDF page 1..."; fail "Could not render this PDF"), long side 4096 px, stored as `<name>.png`; the TV never gets a PDF · `ui/vtt_companion_screen.dart:724-736`, `pdf_helper.dart:59-115` — v1: small pages upscaled to 4096; no page picker (roadmap)
- [ ] P · UP-04 · .dd2vtt / .uvtt parse (UVTT `format` 0.2/0.3): required `image` (base64), `resolution.map_origin`, `map_size`, `pixels_per_grid`; optional `line_of_sight`, `objects_line_of_sight` (grid-unit polylines); `portals` (position, bounds[2], rotation, closed, freestanding; open = `closed:false`); `lights` (position, range, intensity, colour, shadows); `environment` (baked_lighting, ambient_light); extension `battlemap.draw_doors` · `model/uvtt_parser.dart:38-66`, `model/uvtt_map.dart:114-294` — v1 bug: throws TypeError on missing fields; v2 gives a readable error
- [ ] P · UP-05 · Embedded grid detection on pictures before the dialog ("Looking for a grid in the picture...", ≤ 0.2 s, companion only — ~150 MB for 6000 px, never on the TV): profile on luminance (transparent = white) `Σ min(|ΔL|, 24)` per column/row on the picture box-averaged to ≤ 3072 px → minus 15-sample moving average → blur [1 2 3 2 1] → autocorrelation, strongest peak in [20 px, n/3), smallest fraction d = 6…2 keeping ≥ 50 % (a fraction < 20 px = texture → none), parabola sub-sample + multiple refine → both axes within 3 %, strengths ≥ 0.25 → phase by circular mean → counts ≥ 2 each way · `model/grid_detect.dart:152-446`, `arch §embedded grid detection`
- [ ] P · UP-06 · Found → counts + offset pre-filled, "own grid lines" ticked, green note "Found a drawn grid: C × R squares of P px[, starting X px in, Y px down]. Check it with "Fit on the picture"." — a grid starting inside the picture becomes a picture grid, nothing cropped · `ui/vtt_companion_screen.dart:750-759`
- [ ] P · UP-07 · Nothing found → counts from the file name `(?<!\d)(\d{1,3})\s*[xX×]\s*(\d{1,3})(?!\d)` (counts 1–200, squares ≥ 20 px, ≤ 3 % off square, either order; skips 1920x1080) → note "The file name says C × R squares. Check it with "Measure on the picture" (a door is one square)."; else 20 across · `model/grid_detect.dart:252-272`, `ui/vtt_companion_screen.dart:764-770`
- [ ] P · UP-08 · Map squares dialog: intro ("Picture W × H px. Count the squares along the top edge; the rows follow." / gridless "…no grid lines found. This sets the scale of this map only: tap "Measure on the picture"…"); steppers "Squares across" / "Squares down" 1–400, rows follow (square squares) until edited; "One square = N px of the picture"; table line ("fits the TV (34 × 19), centred" / "fits turned 90°, otherwise the TV pans" / "bigger than the TV… you move it from the tablet"); > 3 % off square warning; checkbox "The picture has its own grid lines / Then battlemap draws no grid over it."; "Fit on the picture" or "Measure on the picture" (gridless) → grid editor; Cancel / Upload · `ui/map_grid_dialog.dart:55-389`
- [ ] P · UP-09 · Result: counts, own-grid flag (→ `drawGrid: false` on the map), `RasterGrid` kept only while counts unchanged and not the whole picture · `ui/map_grid_dialog.dart:340-361`
- [ ] P · UP-10 · Every device upload goes into the shared library (meta: name, kind, gridCols, gridRows, hasOwnGrid, grid), thumbnail made on the tablet (288 px PNG) and PUT afterwards, best effort; "Uploading map..." progress; failure "Upload failed" · `ui/vtt_companion_screen.dart:866-907`
- [ ] P · UP-11 · `RasterGrid` model: x, y (may be negative), cellW, cellH (sub-pixel), cols, rows, picture w/h (JSON x, y, w, h, cols, rows, pw, ph); `whole()` = counts stretched over the picture; map px per square = round(cellW); `forPicture` rescales for another render size; edge tolerance 15 % of a square (a sliver < 15 % still counts as whole); min square 4 px · `model/raster_grid.dart:31-411`
- [ ] X · UP-12 · Legacy upload paths `vtt.mapUploaded` / `vtt.imageUploaded` / `vtt.pdfUploaded` (TV renders PDF) and plain `/upload/` — superseded by the shared library + `lib.openSharedMap`; the bot/script path needs only the new one · `ui/tv_shell.dart:343-562`, `proto §map transfer` — v1 bug: `vtt.mapUploaded` from a script opened the map on the TV only, the tablet kept the old picture

## 18. Grid editor (full screen, companion)

- [ ] P · GE-01 · Title "Fit the grid", Close ×, Undo / Redo (≤ 200 steps, a drag = one step), "Back to the start", ✓ Apply ("Upload" from the upload flow); leaving with changes asks "Leave without applying?" ("Keep editing" / "Leave"), system back blocked while changed · `ui/grid_editor.dart:70-98,257-285,681-746`
- [ ] P · GE-02 · Picture ≤ 4096 px, grid drawn over it, outside dimmed #AA000000; layout ≥ 900 px wide → canvas + 360 px side panel, else canvas over controls; first fit 94 % · `ui/grid_editor.dart:230-249,458-466,709-764`
- [ ] P · GE-03 · Tools Look / Move grid / Stretch / 2 corners / "Known length (no grid in the picture)", 44 px buttons, each with its hint text · `ui/grid_editor.dart:1057-1106`
- [ ] P · GE-04 · Fingers: one touch = first finger down to last up; only a one-finger touch edits; a second finger landing reverts what the first did and the touch becomes view pan/pinch (counted by hand, the scale recogniser restarts per finger); zoom 0.02–60; wheel ×0.9 / ×1.1; Zoom in / out (×1.5), Whole picture · `ui/grid_editor.dart:480-637,802-844`
- [ ] P · GE-05 · Magnifier during one-finger drags (not in Look): 170 px circle, 40 px above the finger, ~1.5 squares, crosshair, marks hidden · `ui/grid_editor.dart:851-881`
- [ ] P · GE-06 · Move = slide by the finger; Stretch = top-left stays, the grabbed line follows (needs ≥ 1.5 squares of leverage, else "Start the stretch on a line farther from the top-left corner.") · `ui/grid_editor.dart:491-613`, `model/raster_grid.dart:219-235`
- [ ] P · GE-07 · 2 corners: tap mark 1, mark 2 (third tap restarts; drag a mark within 36 px), counts across/down auto from the pair both directions agree on (within 1 %), down follows across with square squares; "Gives squares of N px." or "Across gives …, down gives …" + > 1 % warning; "Use these corners" (least squares) / "Clear marks"; < 1 square apart → "Put the two corners at least one square apart." · `ui/grid_editor.dart:374-415,1108-1166`, `model/raster_grid.dart:247-356`
- [ ] P · GE-08 · Known length: tap/drag a line over something of known size, "The line is N px long. It is:" Squares (0.5–400, default 1) | Feet (5 per square; 2.5–2000, steps 5/10/25/50); "Gives squares of N px: the map is C × R squares, fits the TV / bigger than the TV (it pans)." or "Squares that small make no map…"; "Use this length" → square squares, lines through the line's start + "Squares of N.NN px — C × R on the table." · `ui/grid_editor.dart:1200-1276`, `model/raster_grid.dart:325`
- [ ] P · GE-09 · Square size stepper ±.01/.1/1/5 px (2 decimals; W/H rows when not square), "½ size", "× 2 size", "Square squares" (on = average W and H) · `ui/grid_editor.dart:904-926,1168-1198`
- [ ] P · GE-10 · Position: arrows by 1 px / 0.1 px, tap "x N y N" to type (signed, comma ok), "Lines on the picture edge" · Squares across stepper 1–400 ("Stretches the squares over the whole width") · Edge squares "Whole only" / "Include partial" · `ui/grid_editor.dart:1278-1333,934-949`
- [ ] P · GE-11 · Check the fit: zoom chips Top left / Top right / Centre / Bottom left / Bottom right / Whole picture (~6 squares on the short side) + drift hint · `ui/grid_editor.dart:951-964`
- [ ] P · GE-12 · Start over from: "Detected C × R", "Detect again" ("No drawn grid found — fit it by hand." / "Found C × R squares of N px."), "Whole picture, N across" · `ui/grid_editor.dart:966-974`
- [ ] P · GE-13 · Lines: colour cycle cyan #00E5FF / magenta #FF2BD6 / yellow #FFEA00 / green #76FF03; Bold (2 px) · keyboard: arrows nudge (Shift 10×), + / − size by 0.01 (Shift 0.1) · `ui/grid_editor.dart:22-27,653-674,976-1001`
- [ ] P · GE-14 · Readout: "C × R squares", "Square N px" (or W × H), "On the table: C × R in." + fit text, skew warning > 0.5 % ("…the table shows them square") · `ui/grid_editor.dart:1027-1051`

## 19. Shared map library (VPS) + link fetch

### sheet (companion)
- [ ] P · SL-01 · Sheet 85 % high: "Shared map library", Reload, Close, "Maps on the server, for every game. Everything uploaded from a device lands here too." · `ui/shared_library_sheet.dart:77-318`
- [ ] P · SL-02 · "Upload from device" (→ "Uploading…"), one upload at a time, progress bar (also while reloading) · `ui/shared_library_sheet.dart:181-198,319-351`
- [ ] P · SL-03 · Link field ("Or a link: picture, PDF, .dd2vtt, page, Drive, Dropbox") + paste-and-fetch button (empty clipboard → "Nothing to paste — long-press the field and paste there"; plain http has no clipboard API) + fetch button (empty → "Type or paste a link first"); "Getting the map behind the link..." → the usual grid detection + squares dialog; errors "Couldn't get the map: <msg>" / "Couldn't download the map from the server" · `ui/shared_library_sheet.dart:211-400`, `ui/vtt_companion_screen.dart:831-854`
- [ ] P · SL-04 · "Store as" chips: "WebP · recommended" / JPEG / PNG / "As is" (default As is, opt-in rule), hints ("Smallest, looks the same. Line art stays lossless." / "Small and safe everywhere, slightly softer lines." / "Lossless, but big for painted maps." / "Stored exactly as it came."), kept on the tablet · `ui/shared_library_sheet.dart:30-48,406-448`, `network/shared_library.dart:17-48`
- [ ] P · SL-05 · Success '"<name>" is in the shared library[ as WebP, 1.6 → 0.3 MB (lossless)]', link field cleared, list reloads · `ui/shared_library_sheet.dart:193-209`
- [ ] P · SL-06 · List: thumbnail 64 × 48, name, "C × R squares · picture" or "Dungeondraft map", " · N MB"; action "Play" (new game, after the settings dialog) / "Add to game" / "In this game"; states: spinner, "Can't reach the shared library — check the connection.", "No maps yet…" · `ui/shared_library_sheet.dart:163-178,450-544`
- [ ] P · SL-07 · Remove: "Remove from the shared library?" / '"<name>" is removed from the server. Games that already use it keep their copy on the TV.' → '"<name>" removed' / "Couldn't remove…" · `ui/shared_library_sheet.dart:239-274`
- [ ] P · SL-08 · TV: `lib.openSharedMap{map,intoGame,name?,settings?}` reuses its copy by `serverMapId`, else downloads (progress; "Could not download "<name>" from the shared library" / "…is not a map battlemap can read"); `hasOwnGrid` → drawGrid false; intoGame with a game open → joins it, else a new game · `ui/tv_shell.dart:939-976,1541-1555`
- [ ] P · SL-09 · Library entry = the map only (name, kind, squares, own-grid flag, raster grid) — no fog, tokens, layers · `arch §shared map library`

### server (`tools/dev_server.py`, port 4242, threaded — a single-threaded server hung every download)
- [ ] P · SV-01 · `GET /library` → `{maps:[…]}` newest first · `tools/dev_server.py:391-394`
- [ ] P · SV-02 · `PUT /library/<name>?meta=<json>[&format=webp|jpeg|png]` → entry `{id (12 hex), name, kind vtt|image, gridCols, gridRows, hasOwnGrid, grid?, file, url /uploads/library/<file>, thumbUrl null, size, addedAt, originalSize?, convertNote?}`; 400 bad meta / empty, 413 > 200 MB; index `uploads/library/index.json` written atomically under a lock; paths relative · `tools/dev_server.py:91-129,419-456`
- [ ] P · SV-03 · `PUT /library/<id>/thumb` (≤ 2 MB PNG) sets `thumbUrl`; `DELETE /library/<id>` removes file + thumb + entry (404 unknown); TVs keep their copies · `tools/dev_server.py:132-163,408-432`
- [ ] P · SV-04 · Conversion keeps pixel size (grids stay valid): webp = q90 method 4, lossless (≤ 50 MP) kept when ≤ 1.5× the lossy size ("lossless"); side > 16383 px → JPEG ("over 16383 px, stored as JPEG"); not smaller → original kept ("already smaller as it was"); jpeg q90, transparency onto black; png optimized; a .dd2vtt converts only its `image`; failure → stored as is ("not converted: …") · `tools/dev_server.py:172-224` — measured: WebP ~20 % under JPEG 90 at 41–42 dB, line art lossless at ⅓ of PNG
- [ ] P · SV-05 · `GET /fetch?url=` (always 200; `{url, name, size, kind}` or `{error}`): http(s) only, every resolved IP and redirect must be public ("that address is not on the internet"), 30 s per socket op, 200 MB; Drive (`file/d/<id>`, `open?id=`, virus-scan confirm form) and Dropbox (`dl=1`) turned into downloads; HTML → confirm form, `og:image` / `twitter:image`, `image_src`, first `<img>` ("no picture found on that page"); kind sniffed from bytes (PNG, JPEG, WebP, PDF, UVTT JSON); other pictures (GIF, AVIF, TIFF, BMP) → PNG; stored in `uploads/` (7-day cleanup) · `tools/dev_server.py:227-345,395-405` — v1 bug: DNS resolved twice (rebinding gap)
- [ ] P · SV-06 · `PUT /upload/dm/<name>` → `uploads/dm/`, never cleaned (saved sessions point at it) · `tools/dev_server.py:458-516`
- [ ] P · SV-07 · Cache headers no-store on everything; CORS `*` + OPTIONS · `tools/dev_server.py:526-540` — v1 bugs: no CORS on static GETs / errors; `/uploads/` directory listing on; cleanup only at start
- [ ] X · SV-08 · `PUT /upload/<name>` top-level uploads (7-day cleanup), `POST /*` legacy browser log sink, serving `battlemap.apk` / `version.json` / `/api/` dart doc — legacy paths, APK update and dart doc go · `tools/dev_server.py:458-527`

## 20. Games (sessions) and persistence

- [ ] P · SN-01 · A game = map(s) + DM state; stored on the TV, survives restarts and updates; ids UUID v4 · `sessions`
- [ ] P · SN-02 · Per-map state (`perMapKeys`): revealedCells, openPortals, showGrid, fogEnabled, showWalls, tvCameraMode, tableCol, tableRow, mapFit, tokens, strokes, map kind (pdf/image), ruler (visible, x, y, rotation), templateDisc, DM layers, camera (x, y, zoom, angle) · `model/session.dart:405-412`
- [ ] P · SN-03 · Per-game state: id, name, createdAt, lastModifiedAt, settings, brushRadius, revealMode, drawColor, drawWidth, interactionMode, mapIds (join order, always contains the active map), parkedMaps {mapId → per-map snapshot} · `model/session.dart:262-434`
- [ ] P · SN-04 · Switch map = flush save → park the current map's state → restore the target's, or a fresh start (all fogged, no tokens, table centred, grid by the map's `drawGrid`) → resume like a reopened game; the target joins `mapIds`; switching to the active map just broadcasts · `model/session.dart:495-519`, `ui/tv_shell.dart:897-929` — errors "Switch map: no game is open" / "…this TV has no map id"
- [ ] P · SN-05 · Delete a map from the TV library: removed from every game holding it; a game whose only map it was is deleted; one that had it on the table moves to its first other map · `model/session.dart:524-533`, `storage/map_library.dart:114`
- [ ] P · SN-06 · Autosave 2 s after the last change (incl. camera moves) while a game is open; a pending save is flushed before new / resume / switch / back to library (edits in the last 2 s were lost) · `ui/tv_shell.dart:1033-1039,1106-1115`
- [ ] P · SN-07 · Resume restores everything in SN-02/03 then syncs the camera; a session flagged PDF whose bytes aren't PDF loads as image (pre-1.1.2 data) · `ui/tv_shell.dart:715-878`
- [ ] P · SN-08 · Every map load resets the session layer: tokens, armed token, strokes, undo/redo, measure, AoE, ruler, staging, live circle, layers; disc hidden; camera mode table, window centred (tokens/drawings leaked into the next game before) · `state/vtt_state.dart:741`
- [ ] P · SN-09 · Not saved: preview mode + staged squares, measure line, AoE, calibration pattern/pivot, live stroke, armed token, circle radius, layer master eye, undo stack · `state/vtt_state.dart` (§5 of the read)
- [ ] P · SN-10 · Map library entry: id, displayName, size, gridCols/Rows, portalCount, addedAt, isPdf, isImage, pdfGridCols/Rows, vpsUrl, serverMapId, drawGrid (null = draw), rasterGrid; picture maps default 20 × 15 · `model/map_library_entry.dart:22-109`, `storage/map_library.dart:57`
- [ ] P · SN-11 · Library listing `lib.listing{maps (+thumbnailAvailable), sessions}`; sessions newest first; a game is listed under the map on its table; unparsable sessions skipped · `storage/map_library.dart:163`, `ui/tv_shell.dart:1296-1311` — v1 bug: one corrupt map entry breaks the whole listing
- [ ] P · SN-12 · Map thumbnails: made lazily by the TV only while it shows the library, one at a time (memory on the 2 GB box), 288 px long side PNG decoded straight to size, .dd2vtt image extracted off the main thread, pushed as `lib.thumbnail`; PDFs none; a failed one not retried until restart · `storage/map_thumbnails.dart`, `ui/tv_shell.dart:1313-1367`
- [ ] P · SN-13 · Companion-side stored settings: full screen (default on), Store as (default As is), template disc look · `ui/system_bars.dart:23`, `ui/shared_library_sheet.dart:30`, `ui/template_disc_panel.dart:25`
- [ ] X · SN-14 · Hive boxes (`mapIndex`, `mapFiles`, `sessions`, `thumbnails`, `tvSettings`, `deployRestore`, `companionSettings`, `libraryUpload`, `templateDisc`) and the unbuilt dart:io migration — v2 picks its own storage; the data shapes above are what counts · `storage/map_library.dart:27-32`
- [ ] X · SN-15 · `thumbnailPath` (session + entry), `saveIndex` — never written, dead · `model/session.dart:279`

## 21. Undo

- [ ] P · UN-01 · Lives on the TV; depth 50 (oldest dropped); a new action clears redo; the tablet's buttons mirror `canUndo`/`canRedo` from fullState · `state/vtt_state.dart:302-323,770`
- [ ] P · UN-02 · Undoable: fog changes (brush, room, circle, reveal/hide all), door toggles, token add / remove / move (incl. placing an off-map token), stroke add, clear drawings, preview commit · `model/undo_action.dart:21-141`
- [ ] P · UN-03 · Not undoable in v1: hide token, rename, clear tokens, toggles, settings, ruler, disc, measure, layers (own Undo notice), calibration (own Undo notice) · `state/vtt_state.dart` — v2: clear tokens gets undo
- [ ] P · UN-04 · Undo notices after one-tap destructive actions (reveal/hide all, clear drawings, delete token, delete layer, back to auto) — decided from the mirrored state, no Undo when nothing changed or only staged · `ui/vtt_companion_screen.dart:251-268`

## 22. Networking

### relay (`tools/vtt_relay.py`, ws, port 9090, no TLS, stateless)
- [ ] P · RL-01 · Roles `table` (TV), `companion`, `bot` (tests/scripts); one slot per role, no rooms; `register{role}` → `registered{role,paired}`; invalid role → `error` · `tools/vtt_relay.py:58-66,294-326`
- [ ] P · RL-02 · Routing: table → companion **and** bot; companion → table; bot → table; frames forwarded verbatim; unregistered sockets dropped · `tools/vtt_relay.py:62-66,368,383-391`
- [ ] P · RL-03 · Last registration wins; the old socket gets `replaced{role}` and is closed — clients stop auto-reconnecting on it (two devices swapped the slot every second before) · `tools/vtt_relay.py:300-316`
- [ ] P · RL-04 · `peer_connected` / `peer_disconnected` only between table and companion; the bot never pairs, so the TV broadcasts only while a real companion is there · `tools/vtt_relay.py:184-192,340-341`
- [ ] P · RL-05 · Relay pings every 20 s; > 45 s silent → close "zombie timeout"; unstamped pong swallowed, stamped pong `{t}` forwarded (round trip) · `tools/vtt_relay.py:214-238,288-291`
- [ ] P · RL-06 · Max frame 50 MB; bad JSON skipped; > 200 msg/s logged "High message rate" (warn only) · `tools/vtt_relay.py:49,195-211,280-284`
- [ ] P · RL-07 · Diagnostics to MwLog `src=relay`, tag `relay`: Registered, Disconnected (closeCode, upS, silentS), zombie close, "Burst right after register (sent while offline)", "Dropped while this side was away", "Traffic last minute" (per type), queue 5000 / batches 500 / retry 5 s · `tools/vtt_relay.py:87-181,329-444`, `setup §relay diagnostics`
- [ ] P · RL-08 · Must exit cleanly on SIGTERM (the September relay survived it holding live sockets → `kill -9`) and restart on its own (no systemd units in v1) · `setup §starting services`

### client (TV and companion)
- [ ] P · CN-01 · States disconnected / connecting / connected (registered, no peer) / paired / replaced · `network/vtt_relay_client.dart:19`
- [ ] P · CN-02 · Backoff 1, 2, 3, then 5 s forever, reset on `registered`; an attempt not registered within 8 s is retried; > 5 send exceptions in a row → reconnect · `network/vtt_relay_client.dart:195-214,342`
- [ ] P · CN-03 · Ping every 15 s with `sent`; no data for > 30 s → reconnect; pong `{t}` gives RTT ("Slow round trip" > 1 s) · `network/vtt_relay_client.dart:205-206,503-521,1262`
- [ ] P · CN-04 · App resumed (Android cuts a paused app's socket ~5 s after it goes to the background) → reconnect at once · `network/vtt_relay_client.dart:318-330`
- [ ] P · CN-05 · Commands while not registered are **dropped**, never queued or replayed late (31 queued commands once hit the TV at once after 65 s); counted per type, logged "Dropped while offline" on the next registration; taps during an outage must not push the reconnect out · `network/vtt_relay_client.dart:680-710`, `archive 26-10-10 20:30`
- [ ] P · CN-06 · Every message stamped `sent` (epoch ms); receiver warns "Late message from peer" when > 1.5 s old, then "Late messages ended" (count, maxAgeMs) · `network/vtt_relay_client.dart:241,439,710`
- [ ] P · CN-07 · Watchdogs: handler > 250 ms → "Slow message handler"; event loop lag > 700 ms → "Event loop stalled (or app paused)"; lifecycle changes logged · `network/vtt_relay_client.dart:248-254,459,661`
- [ ] P · CN-08 · Companion takeover: a second `peer_connected` while paired → the TV resends listing, map and state · `network/vtt_relay_client.dart:535-544`, `ui/tv_shell.dart:238-241,270-297`
- [ ] P · CN-09 · Map to the companion on pairing / start / resume: .dd2vtt with a server URL → `vtt.downloadMap`; otherwise base64 chunks of 500 KB (`vtt.mapStart{chunks,displayName}`, `vtt.mapChunk{i,d}`, `vtt.mapEnd`); a peer drop discards a partial transfer · `network/vtt_relay_client.dart:291,563-593,794-814`, `ui/tv_shell.dart:675-692` — v1 quirk: chunks have no flow control

### state broadcast
- [ ] P · BC-01 · TV → companion `vtt.fullState`, ≤ 20 Hz (50 ms tick, only when dirty **and** paired); many commands also broadcast at once · `ui/tv_shell.dart:312-339`
- [ ] P · BC-02 · Fields: tvView, activeMapId, activeSessionId, sessionMapIds, hasMap, gridCols, gridRows, rasterGrid, portalCount, revealedCells, openPortals, showGrid, fogEnabled, showWalls, brushRadius, revealMode, tvWidthInches, tvOverscanPercent, tvCameraMode, tableCol, tableRow, tableCols, tableRows, showCalibration, calibrationPivot, interactionMode, tokens (id, label, color, gridX, gridY, placed, hidden, name), strokes, drawColor, drawWidth, shadowMode, shadowRevealCells, shadowHideCells, rulerVisible/X/Y/Rotation, templateDisc, sessionSettings, canUndo, canRedo, dmOverlays, dmOverlaysRev, measure, camera {x, y, zoom, angle, vw, vh}, sent · `state/vtt_state.dart:1774-1822`, `ui/tv_shell.dart:299-308` — v2: consider diffs; 20 Hz full fog arrays are heavy on big maps
- [ ] P · BC-03 · Echo guards on the tablet: mode 1.5 s, template disc 1.5 s, DM layers by rev (3 s), live circle 1.5 s, table-window preview until confirmed · see DP-06, DS-03, LY-05, FG-07, CF-02
- [ ] P · BC-04 · A just-joined script gets no fullState until something changes → `diag.status` (view, relayState, mapCount, activeMapId, activeSessionId, sessionMapIds, hasLoadedMap, hasGame, revealedCells/openPortals counts, fogEnabled, showGrid, tvWidthInches, tvCameraMode, table "34x19", tableWindow) · `ui/tv_shell.dart:1187-1211`

### command catalogue (companion → TV unless marked; full fields in `proto`)
- [ ] P · MSG-01 · nav: `nav.goToLibrary`, `nav.goToGame{mapId,sessionId?,name?}` (mapId required: "nav.goToGame: missing or empty mapId"), `nav.newSession{mapId,name?,settings?}` · `ui/tv_shell.dart:1427-1462`
- [ ] P · MSG-02 · lib: `lib.requestList`, `lib.deleteMap{mapId}`, `lib.deleteSession{sessionId}`, `lib.renameSession{sessionId,name}`, `lib.getThumbnail{mapId}`, `lib.openSharedMap{…}`; TV → `lib.listing`, `lib.thumbnail{mapId,png}` · `ui/tv_shell.dart:1465-1555`
- [ ] P · MSG-03 · fog/doors: `vtt.toggleFog`, `vtt.toggleRevealMode`, `vtt.setBrushRadius{radius}`, `vtt.revealAll`, `vtt.hideAll`, `vtt.toggleReveal{index}`, `vtt.brushReveal{indices}`, `vtt.roomReveal{cells,circle?:new|replace}`, `vtt.toggleShadowMode`, `vtt.commitShadow`, `vtt.clearShadow`, `vtt.togglePortal{index}`, `vtt.toggleGrid`, `vtt.toggleWalls` · `ui/tv_shell.dart:1650-1788`
- [ ] P · MSG-04 · tokens: `vtt.addToken{gridX,gridY}`, `vtt.createToken{name}`, `vtt.moveToken{id,gridX,gridY}`, `vtt.setTokenHidden{id,hidden}`, `vtt.removeToken{id}`, `vtt.clearTokens` · `ui/tv_shell.dart:1610-1629`
- [ ] D · MSG-05 · `vtt.editToken{id,name,maxHp,currentHp,conditions}`, `vtt.setAoe{shape,originX,originY,radius,angle}`, `vtt.clearAoe` · `ui/tv_shell.dart:1620-1627,1791-1794`
- [ ] P · MSG-06 · draw: `vtt.addStroke{stroke}`, `vtt.strokeUpdate{stroke|null}`, `vtt.strokeEnd`, `vtt.clearDrawings`, `vtt.undoStroke`, `vtt.setDrawColor{color}`, `vtt.setDrawWidth{width}` · `ui/tv_shell.dart:1632-1647`
- [ ] P · MSG-07 · camera/table: `vtt.zoomIn`, `vtt.zoomOut`, `vtt.zoomToFit`, `vtt.rotateCW`, `vtt.rotateCCW`, `vtt.resetRotation`, `vtt.setCamera{x,y,zoom,angle}`, `vtt.setTvCameraMode{mode}`, `vtt.setTableWindow{col,row}`, `vtt.panTable{dx,dy}`, `vtt.calibrate{tvWidthInches}`, `vtt.setOverscan{percent}`, `vtt.resetCalibration`, `vtt.showCalibration{on,pivot}`, `vtt.setMapGrid{cols,rows,grid?}` · `ui/tv_shell.dart:1678-1751`
- [ ] P · MSG-08 · tools: `vtt.setMode{mode}`, `vtt.setMeasure{x1..y2 | none}`, `vtt.toggleRuler`, `vtt.setRulerPosition{x,y}`, `vtt.rotateRuler`, `vtt.setTemplateDisc{disc,center?}`, `vtt.setDmOverlays{overlays,rev}`, `vtt.undo`, `vtt.redo`, `vtt.updateSessionSettings{settings}`, `vtt.triggerEffect{effect}`, `vtt.switchMap{mapId}` · `ui/tv_shell.dart:1532-1838`
- [ ] P · MSG-09 · TV → companion: `vtt.fullState`, `vtt.downloadMap{url,displayName}`, map chunks, `tv.error{msg}`, `tv.log{msg}`, `tv.rendering{active,label}`, `deploy.ready`, `diag.statusResponse`; unknown types ignored; a handler exception → `tv.error "Command dispatch error: …"` · `ui/tv_shell.dart:1406-1843`
- [ ] X · MSG-10 · `vtt.clearMap` (leaves an empty game), `nav.goToSettings`, `vtt.setScaleFactor` (ignored since 1.1.9), `diag.ping` (no handler), `vtt.mapLoaded` (LAN server) — dead or legacy

### errors the TV reports
- [ ] P · ER-01 · Every TV failure the DM must know reaches the tablet as `tv.error` (notice "TV: …") and the TV badge for 8 s · `ui/tv_shell.dart:1391-1399` — v1 bugs: .dd2vtt download failure, image decode, "session not found" and resume exceptions were only logged

## 23. Logs and diagnostics

- [ ] P · LG-01 · One logger → MwLog (VictoriaLogs tenant `battlemap`): POST `<base>/insert/jsonline?_stream_fields=app,src&_msg_field=msg&_time_field=ts`, `Content-Type: application/json` (form bodies are silently dropped), basic auth from build config (never in source); fields app, src (tv | companion | relay), level, tag, msg, ts + extras · `network/remote_log.dart:57-137`, `setup §logs`
- [ ] P · LG-02 · Failed posts stay queued (≤ 2000, oldest dropped) and retry every 5 s, so an outage's lines arrive afterwards · `network/remote_log.dart:72,234-242`
- [ ] P · LG-03 · Device info line at start (platform, OS, app version/build, screen size, pixel ratio) · `network/remote_log.dart:179`
- [ ] P · LG-04 · Relay diagnostics on both clients (tag `relay`): Connecting, Socket open (connectMs), Registered (connectMs, outageMs), Relay connection lost (closeCode, upS, lastDataAgoMs), Forcing reconnect (reason), Reconnect scheduled (delayS), Dropped while offline, Sent while the peer was away, Late messages, Round trip, Slow handler, Event loop stalled, App lifecycle · `setup §relay diagnostics`
- [ ] P · LG-05 · Web build logs too (v1's web build had a no-op stub — the web companion was blind) · `network/remote_log_stub.dart`
- [ ] P · LG-06 · Developer screen: back (autofocus), auto-scroll toggle (default on), clear, info (relay host:port, platform, line count), log lines monospace coloured (error red, warn orange, [TV] cyan); buffer 500 lines `[HH:MM:SS]`, also to MwLog tag `devlog` · `ui/dev_screen.dart:28-211`, `ui/dev_log.dart:22-50`
- [ ] P · LG-07 · v1 quirk: no level filtering, debug ships in production — v2 decides a floor · `network/remote_log.dart:97`

## 24. Updates and deploy

- [ ] P · UD-01 · `deploy.prepare` (bot → TV): overlay "Updating battlemap — back in a few seconds" (60 s max), save the game now, write the restore snapshot, reply `deploy.ready{view,mapId,sessionId}` (companion shows "TV is updating…") · `ui/tv_shell.dart:1081-1100`
- [ ] P · UD-02 · Restore snapshot (view, mapId, sessionId, savedAt) written on every view change and save (the install kills the app, nothing can be saved on the way out); `/restore` reopens the route's session, else the snapshot (only when view was game); overlay "Updated — reopening the game…"; a normal launch never restores · `update/deploy_restore.dart:93-137`, `ui/tv_shell.dart:1056-1075`
- [ ] P · UD-03 · Rolling deploy flow (v1 `tools/deploy.sh`): build first while the old app runs, ask the TV where it is, prepare, install keeping data, relaunch on `/restore?session=&map=`, wait until the same game is open (~15 s break); tablet relaunched on `/companion`; ask Konrad before restarting the TV mid-game · `tools/deploy.sh:84-146`, `setup §rolling deploy` — in v2 most deploys are a page reload: keep the "TV saves first, reopens the same game" contract
- [ ] X · UD-04 · In-app APK update: `update.check` / `update.versionInfo` / `update.download` / `update.progress`, `version.json`, `battlemap.apk`, install intent over `com.battlemap/update`, "App Update" dialog — v2 ships the app as web content; the shell updates rarely (stale `version.json` was a v1 bug anyway) · `update/update_service.dart`, `ui/vtt_companion_screen.dart:1887-1959`
- [ ] X · UD-05 · Shorebird OTA (`patch.check/download/restart`, `patch.status/progress`, "Shorebird patches are applied automatically") — never set up; a web app reloads · `update/shorebird_helper.dart`, `docs/shorebird-setup.md`
- [ ] X · UD-06 · Signing-key continuity (`install -r` kept data only with the Mac's debug key) — v2 has its own application id; note for the shell: one fixed signing key from the first install · `setup §TV update`

## 25. Notices, number stepper, full screen

### notices (`arch §notices`) — one component, never a snackbar
- [ ] P · NT-01 · Card centred near the bottom (28 above the safe area) over every route, dialog and sheet: kind icon (info gold, warning orange, error #FF6B5E), text, optional button (runs and closes), close ×, 3 px countdown line shrinking to the middle; bg #241e18, 280–560 wide · `ui/notice.dart:13-364`
- [ ] P · NT-02 · Always closes by itself: info 3 s, warning 4 s, error 5 s, ≥ 6 s with a button, + 1 s per 40 characters (code: 25 ms per char beyond 40), cap 10 s · `ui/notice.dart:84-94`
- [ ] P · NT-03 · A new notice replaces the current one (cross-fade, in 220 / out 160 ms), no queue; a held finger pauses the countdown; `show` returns an id, `dismiss(id)` closes only that one · `ui/notice.dart:53-79,173-189,266-291`
- [ ] P · NT-04 · Screen-reader live region · `ui/notice.dart:292-293`

### number stepper + numpad
- [ ] P · NS-01 · `−10 −5 −2 −1 [ n ] +1 +2 +5 +10` (steps per use), value box 76 px, biggest steps dropped when the row is narrow (side rail fits ±1/±2 only), min/max disable the ends, value shows unit; buttons focusable · `ui/number_stepper.dart:54-185`
- [ ] P · NS-02 · Tap the number → numpad dialog: first key replaces (calculator style), keys 7-9/4-6/1-3/. 0 ⌫, "." only with decimals, digits after the dot capped, out of range = orange + OK disabled, range line "min – max"; hardware keys (digits, . or ,, Backspace, Enter); no minus key · `ui/number_stepper.dart:198-416`
- [ ] P · NS-03 · No long-press auto-repeat in v1 (candidate)

### full screen (companion, Android)
- [ ] P · FS-01 · Game view hides status + navigation bars (sticky immersive; edge swipe shows them briefly; back gesture works); toggle at the map's top right, stored on the device, default on; library/waiting screens keep the bars · `ui/system_bars.dart:27-64`, `ui/vtt_companion_screen.dart:209-224`

## 26. Remote fallback — consolidated checklist

- [ ] P · RF-01 · Start screen: TV Mode reachable and activatable with OK (DPAD_CENTER) and Enter (ST-02)
- [ ] P · RF-02 · TV library: every card reachable by arrows, OK opens (TV-34); v2 adds resuming a game and a map list for the game's maps (roadmap)
- [ ] P · RF-03 · Game: back arrow always focusable, back key leaves the game (TV-20, TV-30–33)
- [ ] P · RF-04 · "Take over" focused when replaced (TV-22)
- [ ] P · RF-05 · Waiting screen: nothing to press except back/exit — fine
- [ ] P · RF-06 · Test: every TV screen navigable with arrows + OK alone (`test-session` scene 0.3)

## 27. Test and ops tools (spec for v2's own)

- [ ] P · QA-01 · Bench robot as a `bot` client: seed the test maps, play the game night, assert on fullState / listing / diag.status, kill + restart the TV, screenshot check that the map is really visible (> 15 % of pixels outside the #121212 band; before/after differ) · `tools/bench_bot.py:65-498`
- [ ] P · QA-02 · Game-night scenes (the QA script): 0 prep (≥ 9 maps, remote reaches every entry, measure the TV) · 1 tavern 03: 6 tokens, move, brush 84 squares, table mode · 2 house 02: ≥ 20 doors, toggle 0/2/4/6/8, fog stops at walls, circle + preview + trim, measure · 3 fight 04: reveal/hide all, AoE (D), undo/redo of a 5 × 5 stroke, a drawing, ruler, template disc · 4 tower 05 → 06 → 05 in one game: fog + tokens per map kept · 5 kill the TV app: reconnect + resume with fog; relay down 10 s: both recover; double-tap load = one load · 6 picture maps 08a (19 × 14 detected) / 08b (gridless → Known length) / 09 (6000 px, pans) / PDF · 7 stress castle 07 (30 MB, 57 doors, 17100 × 9600): progress, loads or errors visibly, memory freed after · `docs/test-session.md`, `tools/bench_bot.py:333-493`
- [ ] P · QA-03 · Test maps: `tools/fetch_test_maps.py` (10 files into gitignored `test_assets/maps/`, third-party, never committed); all also in the shared library · `tools/fetch_test_maps.py:31-87`
- [ ] P · QA-04 · `tv_ctl`-style bot commands: status, prepare, resume MAP SESSION, wait-session · `tools/tv_ctl.py:54-112`
- [ ] X · QA-05 · `diag.py` and `test_relay.py` register as companion and kick the real tablet — v2 tools use the bot role
- [ ] X · QA-06 · `tools/log_server.py` (retired 2026-09-05), Android bench AVDs as such (v2 keeps emulator testing for the shell only), `tools/remote-site/` and `tools/mapgen/` (not app runtime; mapgen's `.dd2vtt` output stays an input v2 must load — UP-04)

## 28. Dropped — summary

| What | Why |
|---|---|
| Shorebird OTA (#33), APK self-update, `version.json`, install intent | v2 is web content in a shell; updates are a reload |
| Hive (#32) and its boxes, dart:io migration TODO | v2 chooses its own storage; only the data shapes carry over |
| tvOS host project, `*_tvos` packages, Hive cache-dir rule, Apple TV caveats | Apple TV was a dev target only; Android TV / Google TV + tablets are the targets |
| Flame engine specifics (GameWidget focus, component priorities as numbers) | PixiJS; the layer order (RD-01) is what counts |
| Local mode, "Load Map" in Settings | test aid; v2 tests in two browser tabs |
| TV `settings` view, `vtt.clearMap`, `nav.goToSettings`, `vtt.setScaleFactor`, `diag.ping` | placeholder / dead / legacy |
| Legacy uploads (`vtt.mapUploaded`, `vtt.imageUploaded`, `vtt.pdfUploaded`, TV-side PDF render) | the shared library + `lib.openSharedMap` cover them |
| Session settings without effect (Fog of War, Shadow Mode, Door Toggles, Ruler, tokens, initiative) | read nowhere in v1 |
| Per-session calibration, scale slider | broke one square = one inch |
| `lib/network/vtt_server.dart` (LAN server, port 8080) | code goes; the idea (offline play, #39) is on the roadmap |
| Phoenix restart, `tv.log` for every key press | Shorebird-only / noise |

## Lessons — what v2 must not repeat

Each was a real v1 bug or incident (date = `archive`).

| # | Lesson | Origin |
|---|---|---|
| L1 | Notices always time out, replace instead of queueing, pause on hold, close by id | Material snackbars with an action never closed and queued (26-10-10) |
| L2 | Count pointers, start tools only after 4 px of one-finger travel, cancel (and in the grid editor revert) on a second finger | pinch painted fog; pinch edited the grid (26-09-06, 26-10-10) |
| L3 | Companion keeps the last full state and re-applies it after the map arrives | everything fogged after reconnect (26-10-10) |
| L4 | A picture map's grid always comes from the TV's state, never from the previous map; an image download never goes through the .dd2vtt parser | Juri's map stretched to the lair's 19 × 14 (26-10-10) |
| L5 | Renderer subscribes on mount, unsubscribes on unmount, catches up on reattach | TV renderer stopped following state after one trip to the library (26-10-10) |
| L6 | New map = rebuild layers, dispose the old texture, discard stale decodes | map picture never changed after the first map (26-10-10) |
| L7 | Map load resets tokens, drawings, undo, measure, ruler, staging, layers | they leaked into the next game (26-10-10) |
| L8 | Flush the pending autosave before any session/map change | last 2 s of edits lost (26-10-10) |
| L9 | Textures ≤ 4096 px a side; tile big maps | 17100 × 9600 castle = empty screen (26-10-10) |
| L10 | Offline commands are dropped with a notice, never replayed; the reconnect timer is not pushed out by taps; 8 s connect timeout; reconnect on resume | 31 commands hit the TV at once after 65 s (26-10-10) |
| L11 | `replaced` stops auto-reconnect; reclaiming is an explicit button | two TVs swapped the slot every second (26-10-10) |
| L12 | The TV resends library + map + state when a new companion takes the slot | takeover companion got no map (26-10-10) |
| L13 | Every echo of the tablet's own change is guarded (mode, disc, layers rev, live circle, window preview) | drags jumped back, old layer lists flashed (26-10-10) |
| L14 | The game canvas never steals key focus; back is debounced 400 ms; DPAD_CENTER counts as OK | remote dead in game; one press = two screens; OK didn't open TV Mode (26-10-10) |
| L15 | Answer library requests only after storage is open | TV startup race, `LateInitializationError` (26-10-10, open) |
| L16 | Preview tint, door markers, DM layers, chrome: never on the TV — test the TV render for each | blue preview showed on the TV (26-10-10) |
| L17 | Drawn doors above the fog when a neighbour square is revealed | door opened into a fogged room vanished (26-10-10) |
| L18 | TV fog fully opaque | players saw the dungeon through 90 % fog (26-10-10) |
| L19 | Calibration belongs to the TV; count only squares the set shows (overscan); the bar's zero is a fixed pivot | per-game calibration, 38 × 21 counted vs 35 × 19 visible, sliding bar (26-10-10) |
| L20 | Every UI action has a path to the TV — test the networked path, not just the local state | Room taps never reached the TV; brush tap only toggled the tablet; AoE clear only on the TV (26-10-10, 26-09-06) |
| L21 | Changes built on an old tree must be checked against HEAD's wiring (protocol tests end to end) | relay fix dropped the circle preview wiring (26-10-10) |
| L22 | A script/bot upload must open the map on both sides | AI keep: tablet kept the old picture (26-10-10) |
| L23 | The HTTP server must be concurrent | one stalled keep-alive hung every download (26-10-10) |
| L24 | Server processes exit on SIGTERM and restart by themselves | relay survived SIGTERM holding sockets; services down after reboots (26-10-10, 26-09-05) |
| L25 | Grid detection: clip edge steps, prefer the smallest strong fraction, reject sub-20 px periods (texture), average down yourself (engine downscale erases 1 px lines) | double 2 px edges read as a 30 px grid; 12 px stone texture; Dyson's grey lines (26-10-10) |
| L26 | Decode a picture at its own size and map the grid onto it — never crop or squash | decode shrank the picture to the map's proportions (26-10-10) |
| L27 | Dialog/form state is disposed only after the close animation | crash closing the token / calibration dialog (26-10-10) |
| L28 | iOS Safari file picks must not cancel on window focus | "picked a PNG, nothing happened" (26-09-06) |
| L29 | Plain-http web has no clipboard API — say so in the notice | paste button found nothing on the web companion (26-10-10) |
| L30 | Google TV sleeps after 4 h without remote keys despite wake locks; the box needs its power settings; the TV set may have its own auto standby and no CEC | TV went black mid-game (26-10-10) |
| L31 | The shell must appear on the Google TV home row (LEANBACK_LAUNCHER, banner, leanback feature, touchscreen not required) | v1 launchable only via Settings ▸ Apps (`action`) |
| L32 | Sizes on the table are in squares or screen px, never fixed map px | token labels and grid lines invisible at table zoom (found in this read) |
| L33 | Show every IO failure to the DM (notice / `tv.error`) | several download/decode/resume failures only logged (found in this read) |
| L34 | Undo for every one-tap destructive action, incl. clear tokens | clear tokens had no undo and could crash a later undo (found in this read) |
| L35 | Scripts that rewrite a file read it fully before opening it for writing | `open(p,'w').write(f(open(p).read()))` emptied files twice (26-10-10) |
| L36 | A deploy to one device leaves the other on the old build — show each device's version | ruler pivot "did not show on the TV" (26-10-10) |
