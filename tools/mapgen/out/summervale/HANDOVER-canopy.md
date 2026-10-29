# summervale — step 3a handover: the forest canopy (2026-10-28) — DONE

**Run folder:** `out/summervale/261028-191924-master/canopy/` (beside the ground of step 2).
**Spend: $0.874** (2 × 1K drafts $0.067 + 16 × 2K $0.807). Look: `canopy-sheet.jpg` (ground +
canopy, 15 px/sq, screens drawn on); full-size crops `crops.jpg` (path into the forest, stone
circle clearing, bank alders, rapids forest edge) and `seams.jpg` (4 canopy tile borders inside
the forest — none visible). Matches the riverbend slice: closed canopy, dark crevices where crowns
meet, light from the upper left, the ground painting's own style; alders cast a dark band on the bank.

## Files (all in the canopy folder)

| file | what |
|---|---|
| `canopy.json` | the plan (`crowns`: 1,147 = top 133, mid 215, fill 712, bank alders 59, shrubs 21, lone 7), every draw with its box, `pick` per tile, `assembled` |
| `canopy_guide.png` / `-sheet.jpg` | crowns laid on `ground.png` as flat green shapes (56 px/sq), what each tile edit got |
| `tiles/r<r>c<c>_1.jpg` | the 16 2K edits (picks); `r0c2_d1_1`, `r1c2_d1_1` = the 1K drafts |
| `canopy.png` / `.webp` | **the canopy layer**, RGBA 7616 × 4256 (56 px/sq, = ground.png), 32 MB / 4.6 MB |
| `cells/<cx>_<cy>.webp` | the canopy cut into 512 px map cells (the TV's ground tile grid), 104 of 135 cells have canopy |
| `cells/<cx>_<cy>.ids.png` | 8-bit clump id map per cell: index + 1 into that cell's `clumps` list in trees.json, 0 = none (max 183 per cell) |
| `trees.json` | 552 trees, 3,532 clumps, the cells, `window_mb` (below) |
| `trees-labels.jpg`, `trees-crop.jpg` | the cut by eye: each tree a colour (¼ size); full size with tree seams magenta, clump seams yellow |

`trees.json`: `trees[]` = id, species, tier, trunk `x`/`y` + crown `d` (squares), `box` (map px of
its pixels), `poly` (16-point crown outline, squares — for lift/line of sight), `clumps` [first,
last] id. `clumps[]` = id, tree, `box` (map px), `pivot` (map px, its branch end), `r` (0 centre …
1 rim), `seed` (sway phase) — the slice's clump fields, but in map px. `cells{"cx_cy"}` = canopy,
ids, w, h, bytes, `clumps` (global ids touching the cell, in id-map order).

## Atlas layout: per 512 px map cell, in map space (not a packed atlas) — why

First built as the slice does it (each clump's box + under-copy + shadow shelf-packed, one atlas
per cell): clump boxes alone were 3.9× the canopy's pixels → 141 MB GPU for two forest screens,
123 MB for the worst window. Now **the canopy picture is the texture**: a clump is a quad over its
`box` that samples the canopy at its own map pixels shifted by its sway and keeps only the pixels
whose id (cell id map, nearest) is its own. Under-copy = the same canopy at a blurred mip,
darkened (fills the hairline gaps a sway opens, as in the slice); shadow = the canopy's alpha at a
blurred mip, offset down-right. No extra textures. Same grid as the ground's 512 tiles, so the TV
loads canopy cells exactly where it loads ground.

**GPU per window** (one screen + half a screen round it, all cells touching it; RGBA canopy 4 B +
R8 ids 1 B per px): **max 61.6 MB** (window at squares 80,18 — the great forest), **mean 36 MB**
over all window positions. Disk: 5.1 MB for all cells. Compressed textures (ASTC/ETC2 on the box)
would cut the canopy part by 4–8× — v2's call. A clump never crosses more than its own box; a tree's
trunk stands within ~3.5 squares of any of its pixels, inside the ring.

Edge: the canopy stops at the map's edge (no half-square pad like the slice); clamp to edge when
sampling a swayed clump there.

## Timings (Mac)

plan 11 s (was: tries fixed per screen → 621 crowns, O(n²)); guide 1.9 s (was hours: full-picture
blur per crown); 16 edits 4 at a time ~2 min; `canopy-assemble` 17 s (~6 GB peak); cut 24 s (4.4 GB
peak; the slice's per-crown full-picture discs + Python watershed would have taken hours).

## How to run (from ~/code/battlemap; key via `GEMINI_API_KEY`)

```
R=tools/mapgen/out/summervale/261028-191924-master
python3 tools/mapgen/outdoor.py canopy-tiles $R [--size 1K --only r0c2,r1c2 --tag d1]   # plan + guide + edits
python3 tools/mapgen/outdoor.py canopy-assemble $R [--pick r1c2=tiles/r1c2_2.jpg] [--only …]
python3 tools/mapgen/canopy_cut.py $R
```
`canopy-tiles` reuses the plan in `canopy.json` and `canopy_guide.png` if they exist — delete both
to re-plan (e.g. after a layout change). A redo of one screen: `--only r2c2`, then assemble + cut.

## Code changes

- `outdoor.py` `Ground`: zones and road distances are rasters (8 px/sq, 2 squares past the edge)
  — O(1) lookups; `blocked` vectorised. Same API (prepare.py's `scatter` uses it).
- `canopy_plan`: darts × area (16× on summervale), grid-hash spacing tests; alders
  (`river.bank_trees`) now line the whole river — in the open (meadow/field, not gardens or the
  square) as a loose row, `BANK_OPEN` 1.5 × their reach apart, so the water stays in view.
- `canopy_guide`: each crown drawn in its own small box.
- New `canopy-tiles` / `canopy-assemble` (`canopy_tiles`, `canopy_assemble`, `crown_box_mask`):
  per-screen edits on the ground's crop boxes (`crop_boxes`, whole objects), `CANOPY_TILE` prompt
  line ("a crown cut by the frame stays cut"); alpha = our crowns −0.1 sq + a leafy fringe ≤ 0.45
  sq where the edit changed the ground; joined two-band like the ground (premultiplied), a screen
  without crowns would be skipped and its neighbours reach in whole.
- New `tools/mapgen/canopy_cut.py`: the slice's `canopy_trees` for a big map (per-crown boxes,
  crevice cost blurred small, `watershed_ift` + distance tie-break for prepare.py's `flood`,
  clumps by prepare.py's `branch_pieces`, seeds walled in < 0.12 sq² merged).

## Open

- 552 trees from 1,147 crowns: a crown whose visible part is < 0.3 sq² (most `fill` crowns lie
  under bigger ones) goes to its neighbours — the TV's trunk list = `trees`, not the plan.
- Clump seams follow the crevices but are a bit stair-stepped (4-connected watershed); invisible
  at rest, check once on the TV with sway.
- Step 4 (v2): the map-space clump shader (id test, mip under-copy and shadow), loading cells with
  the ground; the ghost around the party per tree (`poly`/`box`).
- Step 3b: roofs, bushes, reeds, ferns. `edge_shrubs` gave only 21 shrubs (hazel/elder) in the
  canopy — the forest edges want more low bushes from 3b's pass. Ground guide-circle mounds
  (lone oak/linden) are now covered by their crowns.
- Riverbend slice: its plan now also puts alders on its open meadow bank (18 vs 8); its stored
  canopy (`canopy_v2.json`) is unaffected.
