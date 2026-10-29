# summervale — step 3b handover: roofs + small plants (2026-10-28) — DONE

**Spend: $0.504** (15 roof edits at 1K: 12 + 3 redos). Plants: $0 (the slice's atlas reused).
Run folder: `out/summervale/261028-191924-master/` (beside ground + canopy). Look:
`plants/sheet.jpg` (ground + roofs + plants + canopy, 15 px/sq, screens drawn on) and full-size
crops `plants/crop-village.jpg` (34–68 × 12–31, one screen), `crop-mill-bank.jpg` (reeds, lilies),
`crop-forest-edge.jpg` (beech grove / thicket edge by the burial mound); `roofs/roofs-sheet.jpg`
(per building: crop | roof on it — only the last batch's buildings; `--n 0` re-cuts all).

## Roofs — `roofs/`

12 roofed buildings (inn, chapel, smithy, cottage west/south, weaver's house, barn, farmhouse,
watermill, fisher's hut, woodcutter's hut, hermit's hut); the keep and tower (`roof: "none"`) get
none. One 1K edit per building crop (footprint ±1.5 sq grown to an offered aspect, `aspect_box`),
cut by our footprint + 0.45 sq eave + what the edit changed (`roof_cut`, the slice's cut).
All fit their walls, chimneys sit on the painted hearths, light from the upper left, the map's style.
Redos (draw 2 picked): barn + chapel (had a chimney — layout now says `"chimney": false`, prompt
"No chimney"), hermit's hut (turf roof covered only ⅔ of the walls; prompt now adds "the roof must
reach every outer wall"). Draw 1 picked for the other nine.

| file | what |
|---|---|
| `roofs/roof_<slug>.png` | RGBA sprite in map px (56 px/sq), crop-sized; 5.5 MB total (PNG; WebP for the TV ≈ ⅕) |
| `roofs/roofs.json` | `roofs[]`: id, file, `x`,`y`,`w`,`h` (sprite's box in ground.png px), `footprint` (squares), roof style, `draw`, `alpha_box` (tight px box of its pixels), `cells` (512 px cells it touches); `draws[]`, `pick{}`, `cost_usd` |
| `roofs/raw/roof_<slug>_<k>.jpg` | every edit |

Lift-on-token / tap: step 4's (the slice's riverbend.html does: token inside `footprint` → fade).

## Small plants — `plants/`

`python3 tools/mapgen/plants.py <run>` (10 s + 6 s sheet/crops), all from our layout + masks:

| type | n | where |
|---|---|---|
| hazel / elder / bramble | 44 / 31 / 26 | wood's edge just past the canopy rim (0.15–1.1 sq outside it, outside the forest zone), by the village houses' backs (0.9–2.2 sq off a wall), hedges along garden/farm fences, a few at field edges |
| fern | 283 | forest floor ≤ 3 sq inside the forest edge (many under the canopy — seen when it lifts) + clearing rims |
| reed / cattail | 30 / 22 | calm (speed ≤ 0.2), deep (shallow ≤ 0.35) banks, along the bank ±12°, denser round the mill |
| lily | 25 | calm deep water 0.6–1.6 sq in from the bank, off the ford, rocks, bridges, jetty |
| trunk1 / trunk2 | 248 / 283 | a trunk base under every canopy tree (`tree` = trees.json id, scale from its crown `d`) |

Never on roads/paths, buildings, props, bridges (layout), fences/walls (0.7 sq), the ruin (1.2 sq),
garden beds (bushes 1 sq off), or painted grain/dirt (ground pixel R > G + 12, not dark — caught a
bush in a wheat field the zone polygon missed). Rotation ±15° (reeds along the bank), never
mirrored, scale 0.85–1.15, brightness tint 0.96–1.04.

`plants/plants.json`: `plants[]` = type, layer (lily · reed · trunk · low · bush, draw order),
x/y (squares), rot (°), scale, tint (one brightness factor), cell (`cx_cy`, 512 px cells at
56 px/sq = the ground/canopy cells), trunks also `tree`; `cells{}` = plant indices per cell (119
cells); `types` = the slice's type records (atlas rects for still / shadow / under / clumps, kind,
squares, centre); `mesh`; `reach_sq` 2.02 (largest half-size — a plant reaches ≤ 2 sq past its cell,
inside the loaded ring). **Atlas** `plants/atlas.webp`: 2048 × 448, **3.5 MB GPU, 0.15 MB WebP**
(64 px/sq, shadows at half; hazel/elder/bramble cut into clumps, built by prepare.py
`build_types` from `docs/mockups/outdoor/veg/`). One atlas for the whole map — shared sprites.

## Ground leftovers (item 3)

- Lone-tree mounds: already under their canopy crowns (step 3a) — nothing to do.
- Stray stones below the burial mound: read as a broken stone ring round it; harmless, left.

## Code

- `outdoor.py roof`: big-map form — `--out roofs` (own folder, `raw/`), 4 draws at a time, `--only`,
  `--n 0` re-cuts the picks, `--pick "id=raw/…;…"`, skips `roof: none`, layout `chimney: false`,
  `roofs-sheet.jpg`, `alpha_box` + `cells`; the cut is `roof_cut`. Riverbend's call still works.
- `prompts/edit-roof.txt`: `{chimney}` slot + "must reach every outer wall".
- New `tools/mapgen/plants.py` (placement + atlas + composite sheet/crops; `draw()` composites any box).
- Layout: barn + chapel `"chimney": false`.

```
R=tools/mapgen/out/summervale/261028-191924-master
GEMINI_API_KEY=… python3 tools/mapgen/outdoor.py roof $R ground.png --out roofs [--only barn --n 1]
python3 tools/mapgen/outdoor.py roof $R ground.png --out roofs --n 0 [--pick "barn=raw/roof_barn_1.jpg"]
python3 tools/mapgen/plants.py $R
```

## Open

- Step 4: draw the plants by the slice's shader (wind field, clump sway, reed/bush meshes, lily
  turn) from `plants.json`; roofs per `cells`, fade on token inside `footprint`; ship roofs as WebP.
- Ferns: 283, mostly under the canopy; if the TV finds them too many quads, drop the ones whose
  canopy alpha is 1 (not seen until a lift).
- The smithy has a painted stone yard wall not in the layout — one bush sits on it (harmless).
- Willow redraw not done (not needed: no willows on summervale).
