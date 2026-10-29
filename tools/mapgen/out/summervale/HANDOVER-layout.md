# summervale — step 1 handover: layout + guide (2026-10-28)

Spend: $0 (no image calls). Read the shared protocol first; this note is what step 2 (tiled
painting) needs on top.

## What exists

| file | what |
|---|---|
| `tools/mapgen/layouts/summervale.json` | the layout, 136 × 76 squares (committed) |
| `out/summervale/guide.png` | whole guide, **40 px per square** → 5440 × 3040 (16:9, 0.6 % off) |
| `out/summervale/guide-sheet.jpg` | contact sheet, 15 px/square, 4 × 4 screen borders + names `r<row>c<col>`, single trees as outlines |
| `out/summervale/prompt.txt` | the whole-map prompt (13 KB, ~75 area lines) |
| `out/summervale/crops/guide_r<r>c<c>.png` | 16 guide crops, one per TV screen, cut from guide.png (1636 × 920 px each) |
| `out/summervale/crops/prompt_r<r>c<c>.txt` | per-crop prompt: only what reaches into the crop, squares counted from the crop's corner, size 41 × 23 |
| `out/summervale/crops/crops.json` | every box (see below) |
| `out/summervale/water.png`, `water2.png` | flow/speed/alpha + shallow/bank/foam at 16 px/square (2176 × 1216) |
| `out/summervale/footprints.png` | L, building index + 1, 16 px/square; ruins (`roof: none`) left out |

Regenerate (free, ~12 s, 1.4 GB peak): `tools/mapgen/outdoor.py guide tools/mapgen/layouts/summervale.json`
(writes everything above). Only the crops again: `outdoor.py crops <layout> [--margin 2]`.
The layout JSON was written by a throwaway generator (rocks placed from the river's centre line);
edit the JSON directly now.

## The map (screens r = row 0–3 top→bottom, c = column 0–3 left→right; a screen = 34 × 19)

| | c0 | c1 | c2 | c3 |
|---|---|---|---|---|
| r0 | wheat/barley fields, west road, lone linden | village N: square + well + market stall, inn, chapel + churchyard, smithy | forest, woodcutters' clearing + hut + log piles | forest, hermit's glade + hut + big oak, forest path to E edge |
| r1 | river enters (W edge y≈21), watermill + wheel, rye, mill lane | village S: 3 cottages, weaver, barn, farmhouse, gardens + fences, bridge road | forest, forest path, shrine glade + deer track | stone-circle clearing (7 stones + altar), campfire, ford trail starts |
| r2 | river bend, fisher's hut + jetty, sheep paddock + beehives, lone oak | **stone bridge**, riverside trail W | **rapids** (11 boulders) + fallen-tree crossing, burial mound | **ford** (8.5 wide, shallow) + 3 stepping stones, ford trail |
| r3 | SW wood, charcoal clearing + kiln, riverside trail to W edge | south wheat, hay meadow + haystacks, wayside shrine, road S | ruin road, sheepfold, lone oak, beech grove | **ruined keep** (breached walls, tower), dungeon stair in the tower + trapdoor in the courtyard, rubble |

Roads 2–2.2 squares; forest path, ford trail, riverside trail, mill lane, woodcutters' track 2;
hermit's path / deer track 1.6, fisher's path 1.4, house path 1.2. River widths 3 (rapids) – 8.5 (ford).

## Crops (`crop_boxes`)

- Each screen + `CROP_MARGIN` = 2 squares → 38 × 23, grown to the nearest offered aspect (16:9)
  → **40.9 × 23 squares = 1636 × 920 guide px**. Overlap: ~3.45 squares left/right, 2 top/bottom
  between interior neighbours; at the map's edge the box is shifted inward (all overlap on the
  inner side: c0 boxes start at x 0, c3 end at 136, r0 at y 0, r3 at 76).
- `crops.json` per crop: `screen` [r, c], `screen_sq` (the screen in map squares), `box_px` (in
  guide.png px, ints, 40 px/sq), `box_sq` (map squares), `aspect` ("16:9"),
  `screen_in_crop_px` (the screen's rect inside the crop, guide px).
- Column boxes (squares): c0 0–40.9 · c1 30.55–71.45 · c2 64.55–105.45 · c3 95.1–136.
  Row boxes: r0 0–23 · r1 17–40 · r2 36–59 · r3 53–76.
- A 2K 16:9 draw is 2752 × 1536 → **67.3 px/square** for a crop (the TV draws ~56). A 4K master of
  the whole map (16:9) is 5504 × 3072 → **40.5 px/square**. To map a crop's painting back:
  scale = painting_w / (box_sq width), offset = box_sq origin.
- Guide crops are at 40 px/square (the master's resolution); send them as they are, or render a
  crop finer from the layout if needed (`draw_layout(d, spec, k, ox, oy)` draws any window).

## outdoor.py changes in this step (riverbend output byte-identical, checked)

- `render_guide`: a big map is drawn in 1024-px chunks (+4 px margin, supersampled ×4, cropped);
  a one-screen map still in one piece. Chunked vs one-piece on riverbend: 4 px differ (≤ 6 levels).
- `draw_layout` (shared drawer), new zone kind `field` (golden grain), new `fences` (thin
  rust-brown polylines, legend + prompt lines), `roof: "none"` = ruin (no footprint).
- `masks`: boulder foam per rock group (`rock_groups`, < 3 squares apart), each wake along its
  own stretch's flow (rapids vs ford stones); one group = the old code path.
- `build_prompt(spec, box=None)`: per-crop prompts (only what's in the box, relative squares;
  the river line only if the water reaches the box).
- `screens`, `crop_boxes`, `write_crops`, `write_sheet`; `guide` writes crops + sheet for maps
  bigger than one screen; `crops` subcommand.

## What paint / roof / canopy need for the big map (not changed — line refs in outdoor.py)

**paint** (`paint`, l. 762–789)
- l. 766 `write_layers(spec, run)` re-renders guide + masks per run (~12 s): fine; crops live in
  `out/summervale/crops/`, not in the run folder.
- l. 771/777: one call of the whole map at `--size`; the master = `paint … --size 4K` ($0.113/draw)
  sending the 5440 × 3040 guide. The ~75-line prompt may be too much for one call — consider a
  master prompt with fewer lines (e.g. one line for the stone ring; `standing stone 1–7` are
  separate props today).
- **Missing: the tile pass.** Per crop: inputs = guide crop + the master's crop (box_sq × master
  px/sq, upscaled to 2752 × 1536), prompt = `crops/prompt_<tag>.txt` + "refine the second image,
  keep its colours and light", 2K 16:9 ($0.05; 16 tiles ≈ $0.81, 1K drafts $0.54). Then assemble:
  resize each tile to the target px/square (56 or 64; 136 × 56 = 7616 × 4256), feather across the
  overlap band (2 squares vertical, ~3.4 horizontal), write the 512-px TV tiles. Nothing for this
  exists yet (`roof`'s `aspect_box` + crop logic is the closest pattern).

**roof** (`roof`, l. 455–505)
- l. 466 loop: skip `b.get("roof") == "none"` (the ruined keep + tower would get roofs).
- l. 461/463: reads one picture and `ppsx = img.width / cols` — works on the assembled big
  painting as long as it covers the whole map; 12 roofs × $0.034 (1K) ≈ $0.40.
- l. 474: 1K edit of a crop of a ~67-px/sq painting is fine (crops are ~10 × 9 squares).

**canopy** (`canopy_plan` l. 578–639, `canopy_guide` l. 669–690, `canopy` l. 692–750)
- l. 609 (`2500`/`5000` darts per tier) and l. 624 (`4000` shrub darts) are fixed counts tuned for
  one screen: on summervale they give 621 crowns (top 99, mid 152, fill 326, bank alders only 10,
  shrubs 27) — the canopy won't close. Scale the tries by area (`cols*rows / (34*19)` ≈ 16).
  It runs 3 s today; with 16× tries `fits` (l. 606, all crowns each try) and the shrub tests
  (l. 631/633) are O(n²) → add a grid hash or expect minutes.
- l. 684–685 `canopy_guide`: per crown a full-picture `Image.new` + `GaussianBlur` + `composite` —
  at 7616 × 4256 with ~2,000 crowns that is hours. Draw the shadows into one layer (or per crown
  in its own small box) and blur once.
- l. 719: one edit of the whole ground at `pick_aspect(spec)` and `--size` (≤ 4K = 40 px/sq) —
  too coarse for the tiles. Needs the same per-crop edit as the ground tiles (crop the canopy
  guide by `box_sq`, 2K each, ≈ $0.81 for 16), then assemble with feathered overlaps before the
  cut (l. 722–731).
- l. 658 `canopy_mask` draws at 2× the picture (15,232 × 8,512 L ≈ 130 MB per call, called twice):
  works, heavy; l. 724 the float64 diff of the whole picture ~800 MB — do it per tile.
- l. 813 `canopy --plan` default image `out_1.jpg`: the big map's assembled ground will have
  another name.
- `docs/mockups/outdoor/prepare.py` (cutting the canopy into trees, atlas) is written for the
  slice; the protocol's per-window loading means per-window atlases there.

## Open

- Konrad hasn't seen the layout; the sheet is the thing to show (`guide-sheet.jpg`).
- The village square is `path`-coloured like the forest path; the stone bridge uses the brown
  bridge colour (its desc says stone).
- Willow is not used (redraw pending); stands: beech/oak, alders on the banks, hazel/elder edges.
