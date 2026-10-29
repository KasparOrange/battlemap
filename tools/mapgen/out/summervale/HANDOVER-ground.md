# summervale — step 2 handover: the ground (2026-10-28) — DONE

**Final ground:** `out/summervale/261028-191924-master/ground.png` (7616 × 4256, **56 px/square**,
60 MB) + `ground.webp` (q 90, 9 MB). Look: `ground-sheet.jpg` (15 px/sq, screens drawn on),
`seams.jpg` (24 border midpoints). Picks + blend settings: `ground.json`; every draw: `tiles.json`.
Seam verdict: no visible seam — no doubled detail, no colour steps; one look, light from the upper
left, across all 16 screens (defaults `--match 4`, soft 1.5, sharp 0.4 — no tuning needed).

**Spend: ≈ $1.94** (1K drafts $0.17 + thinking tokens ~$0.03, 4K masters ×2 $0.23, 30 tile draws
at 2K $1.51).

Step 1's handover (`HANDOVER-layout.md`) still holds for the layout and guide.

## The run, in order

1. 1K master drafts (`261028-191537-master-1k`, `-191642-master-1k-th`, `-191815-master-1k-b`):
   the first kept river/bridge/rapids+fallen tree/ford/village/keep/roads but dropped the SW wood,
   beech grove and SE thicket (the compact prompt merged the 4 forests into one line). `--thinking
   high` was worse (invented buildings, painted tree crowns, moved the stones). Fix: area (zone)
   lines stay unmerged in the compact prompt → woods came back.
2. 4K master `261028-191924-master/out_1.jpg` (5504 × 3072, 40.5 px/sq) = the master. Keeps all of
   the layout, no crowns/roofs; only the beech grove is missing (the r3c2 tile paints it).
   `out_2.jpg` was worse (stones moved into the meadow, extra buildings).
3. 16 tiles at 2K: same palette, light and style as the master, all features kept. But objects cut
   by a crop's edge were painted whole and pushed inside the frame → doubles 2–3 squares in from
   the border after assembling (fisher's hut r1c0, barn + garden r1c2, keep walls r2c3 and r3c2).
   A prompt line ("a cut object stays cut") fixed only r1c0 (draw 2).
4. **Code fix — `crop_boxes(whole=True)`**: the crop box is the smallest one in any of the model's
   aspects that keeps `CROP_KEEP` 1.7 squares past each inner screen border and cuts no building,
   bridge or prop (rects padded `OBJ_PAD` 0.25 — the guide draws walls ±0.15 round a rect).
   10 of 16 boxes changed (3:2, 5:4, 4:3, 16:9; 762–1348 sq², 55–67 px/sq). `crops/` rewritten.
   `assemble` places each pick by the box recorded with its draw (old draws stay valid).
   8 tiles redone with the new boxes (`*_whole_*`): all doubles gone.
5. r2c0 redone (draw 2): draw 1 had moved the fisher's hut + jetty 6 squares east.

Picks (redos and why): r0c0 whole_2, r0c1 whole_2 (box changed), r1c0 _2 (hut doubled),
r1c1 whole_2 (box), r1c2 whole_3 (barn doubled, twice), r2c0 _2 (hut misplaced), r2c1 whole_3
(pale water past the bridge, then an invented house), r2c3 whole_3 (keep walls doubled),
r3c2 whole_3 (keep's west wall doubled), r3c3 whole_2 (box); r0c2 r0c3 r1c3 r2c2 r3c0 r3c1 draw 1.

Also fixed: `assemble` blurred σ 224 px at full size (>6 min, killed); `_blur` now blurs a copy
shrunk by σ/8 and scales back (18 s for the whole ground, error < 1 level).

## How to run (from ~/code/battlemap; key via `GEMINI_API_KEY`)

```
python3 tools/mapgen/outdoor.py paint tools/mapgen/layouts/summervale.json --size 4K --tag master
python3 tools/mapgen/outdoor.py tiles tools/mapgen/out/summervale/<run> --master out_1.jpg [--only r2c0]
python3 tools/mapgen/outdoor.py assemble tools/mapgen/out/summervale/<run> --pps 56 [--pick r2c0=tiles/r2c0_1.jpg]
```

## Open (for step 3: canopy + roofs + plants)

- Guide circles (the layout's single trees: lone oak, lone linden) were painted as small round
  grassy mounds in places (e.g. r2c3 west edge); the canopy covers them.
- Below the burial mound (r2c2/r3c2 border, col ~93 row ~57) a few stray standing stones —
  r3c2 painted the mound's stone ring lower than r2c2 painted the mound. Small; a redo of r3c2
  or a touch-up if it reads wrong.
- The sheepfold (r3c2) is a stone-wall oval, the guide has a fenced rectangle. The mill's garden
  (r1c0) is a plank deck instead of tilled soil. Both harmless.
- A churchyard wall runs right beside the forest at the r0c1|r0c2 border (a straight forest edge
  there) — the guide's forest edge, not a seam.
- `canopy --plan` defaults to `out_1.jpg` — pass `ground.png` (or a per-screen crop; the canopy
  for the big map is still the per-crop edit noted in `HANDOVER-layout.md`). `roof`: skip
  `roof: none` (the keep). Cutting into 512-px tiles for the TV: from `ground.png`.
- The `whole` boxes also apply to `canopy`/`roof` per-crop work if they reuse `crop_boxes`.
