# test session — a realistic game night

**Automated (since 2026-10-10):** nobody has to click through this. With the android bench
running (TV in TV Mode, tablet connected as companion):

```bash
P=~/.local/share/battlemap/venv/bin/python
$P tools/bench_bot.py seed          # upload the test maps into the TV library (once)
$P tools/bench_bot.py run --stress  # play scenes 0–7, ~2 min, report + screenshots
$P tools/bench_bot.py prep          # leave a game in progress to play with by hand
```

The robot joins the relay as `bot` (next to the tablet, see `relay-protocol.md`), sends the
companion's commands, checks the TV's `vtt.fullState`/`lib.listing`/`diag.status`, kills and
restarts the TV app for scene 5, and checks every screenshot for an actually visible map (pixel
coverage — catches "state is right, screen is empty/stale"). Report: `build/bench-report/<time>/
report.md`, opened in ledger. What still needs eyes: grid alignment on image maps, how things
*look*. What it does not test: the companion's touch UI (gestures, panel) — that stays manual
on a real phone.

The scenes below are the script it follows.

One evening of play, compressed into ~30 minutes, on the Android bench (`setup.md` "android bench")
or the real devices. Each scene names what it exercises. Write down what breaks, with the scene
number; fixing happens afterwards, from code (`action.md`).

## maps

`tools/fetch_test_maps.py --push <tablet serial>` downloads them into `test_assets/maps/`
(gitignored — other people's maps, local testing only) and pushes them, plus `test_map.pdf`, to
the tablet's Download folder. The grid size is in the file name.

| file | what it is | why it's in the set |
|---|---|---|
| `01-eldrica-house-10x8.dd2vtt` | one small house, 2 doors, 4 lights | tiny map: centred on the 1-inch table, zoom limits |
| `02-small-home-16x18.uvtt` | blueprint-style house, **61 walls, 29 doors/windows** | `.uvtt` extension; door-heavy fog + wall occlusion |
| `03-przerzut-16x16.dd2vtt` | tavern with a bar, 12 doors, 8 lights | the classic "you meet in a tavern" opener |
| `04-vampire-lair-19x14.dd2vtt` | dungeon, 5 doors, 12 lights | combat map: tokens, AoE, measure |
| `05-tower-ground-11x11.dd2vtt` / `06-tower-upper-11x11.dd2vtt` | two floors of one tower | switching maps mid-scene and back |
| `07-STRESS-castle-114x64-30MB.dd2vtt` | huge castle, 2142 walls, 57 doors, 80 lights, **17100×9600 px** | upload progress, memory, texture size; far bigger than the 34 × 19 table |
| `08a-vampire-lair-image-19x14.jpg` | the image of 04, no walls | image upload path (jpg), grid must line up at 19×14 |
| `08b-small-home-image-16x18.webp` | the image of 02, no walls | image upload path (webp), 16×18 |
| `09-dyson-twelve-goats-tavern-6000px.png` | Dyson Logos line-art tavern with grid, 6000×6000 | big PNG; grid alignment by eye |
| `../test_map.pdf` | the existing PDF map | PDF → PNG on the phone (#36) |

Sources: Dungeondraft exports from public GitHub repos (MasterCoookie/DND_Dreams,
mixtli/dungeon-lab, guebertn/DNDMaps) and Dyson Logos' blog ("Cartography by Dyson Logos",
commercial map license). None of it is committed.

**Big maps:** 07's 17100×9600 image showed an empty screen on the bench (above GPU texture
limits, ~650 MB decoded); since 2026-10-10 map pictures are decoded at most 4096 px on the long
side (`VttGame.maxMapTextureSide`) and 07 renders. The emulator has more headroom than the real
box, so the Xiaomi still needs its own check (memory, look at 36 px per square).

**Tabletop focus:** the scenes still place tokens — that keeps the dormant digital-mode code from
regressing; tokens are not part of tabletop play (`feature-ideas.md` "play modes").

## scenes

**0. prep (before the players arrive)**
1. TV: TV Mode. Tablet: Companion → Connect. Both show "connected".
2. Upload 01–06 one after another. Every upload shows progress; each appears in the library on
   both sides without a restart.
3. TV remote fallback: on the TV, arrow keys + Return alone reach every library entry and the back
   button.
4. Once per TV: Settings ▸ Measure the TV… — the TV shows its one-inch squares and a 10-inch bar;
   it must measure 25.4 cm (type what you measure, Apply, measure again). A 1-inch mini base then
   fits one square at every edge of the table.

**1. the tavern (03)**
1. Start a session on 03. The TV shows the whole map fogged, centred, one inch per square (it fits
   the 34 × 19 table); the tablet's dashed frame is the TV's 34 × 19 window.
2. Place 4 player tokens at the door and 2 NPC tokens at the bar; move one by drag.
3. Reveal the main room with the brush; the bar area stays hidden until "opened".
4. Pinch and two-finger pan on the tablet: never paints fog.
5. "TV follows the tablet" on: the TV moves live with the tablet (on the 1-inch table only its
   centre, in whole squares). "Jump to TV" jumps back.

**2. the house (02)**
1. Switch the session to 02. Tokens and fog from 03 are *not* carried over.
2. Open and close several doors from the tablet; the TV updates within a moment.
3. Reveal one room: does fog stop at walls? Through an open door, does it continue?
4. Measure from the front door to the kitchen; the line and distance show on the TV while dragging.

**3. the fight (04)**
1. Start a new session on 04, place 5 tokens.
2. AoE: a 20 ft circle (fireball) by tap, a 15 ft cone aimed by drag, change the size from the
   panel — the template changes in place on both screens.
3. Draw an arrow with the pen, change the width with the presets.
4. Fog stroke → undo → redo; the buttons light up on the tablet.
5. Ruler: 10 squares, appears in the middle of what the TV shows; rotate it on the Measure tab
   (turns in place, numbers stay upright), drag it in any mode.

**4. up the tower (05 → 06 → 05)**
1. Session on 05: reveal half, place 2 tokens.
2. Switch to 06, reveal a little, then back to 05: fog and tokens of 05 are exactly as left.

**5. something goes wrong**
1. Kill the TV app (`adb -s emulator-5556 shell am force-stop com.example.battlemap`), start it
   again, TV Mode: the companion reconnects; resume the last session — fog, tokens, drawings back.
2. Stop the relay for ~10 s and restart it: both sides show the disconnect and recover alone.
3. Double-tap "load" on a session: it loads once.

**6. improvised maps**
1. Upload 08a and 08b: the squares dialog shows the picture's size, the rows follow the columns
   (19 → 14, 16 → 18); with "the picture has its own grid lines" ticked the TV draws no grid, and
   the next game on that map neither. The tablet's chip (top right) shows the same squares as the
   TV, also after switching from another map and after a reconnect (before 1.1.8 it kept the
   previous map's grid and stretched the picture).
2. Upload 09 (6000 px PNG) with its real square count: bigger than 34 × 19, so the TV shows a
   window — move it with the gold grip above the tablet's frame, the Camera tab's overview and
   arrows; Whole map ↔ 1-inch table. A wrong count: Settings ▸ Map squares (clears that game's
   fog).
3. Upload `test_map.pdf`: the tablet rasterizes it, the TV gets an image.

**7. stress**
1. Upload 07 (30 MB): progress bar moves, the UI stays responsive.
2. Open it on the TV: loads, or fails with a visible error (not a silent black screen / crash)?
3. Afterwards, back to 04: memory released, the small map runs as smoothly as before.

## after the run

Note results per scene (works / broken + what was seen) in `action.md` "next", then fix one at a
time. Logs: the debug APK on the bench logs to the Developer screen; `/tmp/bm_relay.out` shows
every message the relay forwarded.
