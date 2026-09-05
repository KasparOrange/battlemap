# feature ideas

## play modes

the app supports two composable play modes, selected via session settings. individual features can be toggled on/off — the modes are just presets.

### pen & paper mode (default)

the TV is a living, breathing map surface. all game mechanics (HP, initiative, conditions) happen at the real table with dice, paper, and pencils. the app's job is to make the MAP amazing and give the DM tools to create atmosphere.

players place real miniatures on the TV. the DM controls the spectacle from the phone.

### digital mode

full virtual tabletop. everything from pen & paper PLUS digital game mechanics — HP tracking, initiative order, conditions, dice rolling, automated combat.

## session settings

a dialog that opens when creating a new session and can be reopened during play. tabbed layout:

- **template tab** — pick "Pen & Paper" or "Digital" preset (populates the toggles)
- **map tab** — grid config, calibration, ruler
- **features tab** — individual feature toggles grouped by category
- **atmosphere tab** — animations, sound, weather, lighting

all settings saved per session and restored on resume.

---

## pen & paper features

these make the map visually stunning and give the DM atmosphere tools. no game mechanics.

### done
- [x] fog of war with brush reveal/hide
- [x] shadow/dry-edit fog mode (preview before commit)
- [x] room reveal (flood-fill bounded by walls)
- [x] door/portal toggling
- [x] freehand drawing on the map
- [x] measure tool (D&D distance)
- [x] L-ruler with scale calibration slider
- [x] PDF and image map support
- [x] undo/redo (50 actions)

### next up
- [ ] **torch/light animations** — flickering glow around light sources. .dd2vtt files include light position, range, intensity, and color. render as animated radial gradient with subtle flicker.
- [ ] **water animation** — subtle shimmer/flow on water areas. could use a noise shader or animated UV offset.
- [ ] **weather particles** — rain, snow, embers, floating dust motes. particle system overlay controlled from atmosphere tab. adjustable intensity.
- [ ] **location-triggered effects** — DM taps a spot on the map → visual effect plays: explosion, magic circle appearing, smoke cloud, fire burst. library of preset effects.
- [ ] **global effects** — screen shake (earthquake), flash (lightning), fade to black (scene transition), pulse glow. triggered from DM panel.
- [ ] **ambient soundscapes** — layered audio from TV speakers. base atmosphere (dungeon echo, forest, tavern) + triggered SFX (door slam, sword clash, thunder). controlled from phone.
- [ ] **day/night cycle** — gradually dim the map, shift lighting color temperature. DM controls time-of-day slider.
- [ ] **animated fog edges** — fog rolls in/out with particle wisps instead of hard cell edges. soft gradient fog boundary.
- [ ] **door animations** — doors visually swing open/shut instead of instant toggle.
- [ ] **narrative text overlay** — DM pushes text that fades in on the TV: "You enter the throne room..." dramatic reveal moments.
- [ ] **timer/countdown** — visible countdown on the TV for timed puzzles or dramatic tension. DM sets duration from phone.
- [ ] **miniature spotlight** — dramatic light cone on a specific grid area. useful for "a beam of moonlight falls on the altar."

### planned
- [ ] **grid configuration after load** — re-adjust grid offset, rotation, scale after loading. drag handles. essential for PDF maps that don't align.
- [ ] **session thumbnails** — capture game canvas as PNG for library browser.
- [ ] **multiple maps per session** — switch between dungeon floors without losing state per floor.
- [ ] **map annotations (DM only)** — invisible sticky notes on the map. "trap here", "DC 15 lock". only visible on the phone.

---

## digital mode features

these add game mechanics on top of the pen & paper visuals.

### done
- [x] token placement (tap to place, drag to move)
- [x] token names and HP bars
- [x] condition markers (10 D&D conditions)
- [x] AoE templates (circle, cone, line, square)

### next up
- [ ] **initiative tracker** — turn order widget on phone. add combatants, roll initiative, tap to advance. highlight active token on TV with a glow ring.
- [ ] **token sizes** — large (2x2), huge (3x3), gargantuan (4x4). a dragon should fill 4 squares.
- [ ] **custom token images** — upload PNG portraits for creature tokens instead of colored circles.
- [ ] **line-of-sight** — show what a token can see based on wall data. dim areas outside LOS.

### planned
- [ ] **digital dice** — 3D animated dice roll on the TV. tap to roll from phone.
- [ ] **automated damage** — select token, enter damage, HP auto-updates, death save prompts.
- [ ] **condition duration tracking** — conditions auto-expire after N rounds.
- [ ] **spell slot tracking** — track used/remaining spell slots per caster token.
- [ ] **character sheets** — basic stat block stored per token (AC, saves, speeds).
- [ ] **combat log** — scrolling text log of actions on the companion phone.

---

## shared features (both modes)

- [x] VPS WebSocket relay (phone controls TV)
- [x] map library with persistent storage (Hive)
- [x] session save/restore (auto-save, resume)
- [x] in-app updates (Shorebird OTA + APK fallback)
- [x] structured logging + developer screen
- [ ] **logs → MwLog** — code done 2026-09-05, ships with the next APK build (`--dart-define=MWLOG_AUTH`)
- [ ] **rasterize PDFs on the phone** — TV only ever receives images; unblocks the Apple TV dev target
- [ ] **Apple TV as dev target** — flutter-tvos fork, hot reload on the living-room TV (`docs/apple-tv-dev.md`)
- [x] medieval-themed DM control panel
- [x] TV remote fallback (D-pad navigation)
- [ ] **session settings dialog** — template picker + feature toggles
