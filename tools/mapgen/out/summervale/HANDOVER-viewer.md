# summervale — viewer handover: 4a core + 4b interactions (2026-10-28) — DONE

**Page:** `docs/mockups/outdoor/summervale/index.html` (serve the folder statically, e.g.
`python3 -m http.server 8765 -d docs/mockups/outdoor/summervale`). Spend: $0 (no images).
Shots (half size) + numbers: `out/summervale/261028-191924-master/viewer/` (`sheet.jpg` = village,
rapids + fallen tree, forest path + standing stones, ruin, great forest, whole map; `report.json`;
`rapids-motion-0-0.6s.png` = the rapids at t = 10 s and 10.6 s).

## Step 4b — interactions + the ring knob (spend $0)

Shots (downscaled `*-small.jpg`, full PNG beside) + logs: `out/summervale/viewer-4b/`
(`forest-ghost-on/off`, `ghost-pair.jpg`, `roof-lift`, `roof-tap`, `roof-pair.jpg`, `dial-turning`,
`shoot.log`, `report.json`, `ring.log`, `ring-{0,150,400}.json`).

- **Tokens** (`index.html`): 4 DOM tokens A–D on square centres in map squares (`ui.party`, shared
  with the viewer as `sv.party`), dragged in whole squares, clamped to the map; hidden outside the
  shown window and in the overview; they stay put in map space when the window pans. Start: the
  middle of the first window, or `#party=x,y;x,y…`. Placed from `ui.layout(geo)`, called every frame.
- **Canopy ghost**: `ghost(sq)` in the shader HEAD (uniforms `u_party[8]`, `u_nparty`, `u_ghost`) =
  the slice's `mix(0.22, 1, smoothstep(1.4, 2.8, d))`; multiplies clumps (at the clump's rest
  position), the under-silhouette and the canopy shadow. Trunk bases are plants → stay. Toggle
  "Canopy opens". `HEAD` needs `precision highp int` (vertex/fragment int precision must match).
- **Roofs**: `roofOpen[i]` (tap) / `roofAlpha[i]` eased at 6/s; open = tapped or a token inside the
  footprint ("Roof opens" toggle). A tap = pointer up within 6 px of its down on the canvas (a drag
  still pans); hit = footprint ± 0.3 sq. Roof + its shadow × alpha (`u_alpha`).
- **Wind dial** (`index.html`): the slice's dial; it sets `state.windAim`, the viewer's frame eases
  `windAngle` towards it at 1.6/s (~1 s behind); cloud drift was already integrated per frame.
- **Ring knob**: `state.ring` (screens per side) — bench fold in the bar: ¼ screen · ½ screen ·
  none; the lean into the pan direction is min(¼, ring), sides never below 0. `state.loadDelay`
  (ms before every cell fetch) stands in for a slower device. **Default now ¼** (table below).
- **Hooks** for tests: `sv.party`, `sv.roofOpen`, `sv.roofAlpha`, `sv.roofs`, `sv.trees`, `sv.plan()`,
  `sv.toScreen(x, y)` (squares → CSS px), `sv.trace(ms)` (per-frame stand-ins, wind, aim, cloud
  drift, shown window), `sv.read(x, y, w, h)` (mean RGB of a box in squares, read after the draw).

### Exit check (`node shoot.mjs [base] [out]`, all pass, 0 page errors)

| check | result |
|---|---|
| ghost: 4 tokens on trees in the great forest, 2 × 2 sq read with ghost / without / no canopy | opened 0.86 · 0.36 · 0.42 · 1.1 of the way to bare ground (plants under the crown stay) |
| roof lift: token in the inn → steps out | alpha 0 → 1 |
| tap: smithy tapped → tapped again | alpha 0 → 1 |
| dial: half a turn (2.98 rad) dragged | jump ratio 1.0 (no frame turns more than the easing allows), cloud step max 0.0022 vs mean 0.0014, within 0.1 rad 3.4 s after the drag began, final miss 0.016 rad |
| pan (¼ ring): 47 positions | 0 failures, settle ≤ 0.22 s, max 85 MB |

Headless frames run 50–130 ms (rAF throttled), so raw dial steps reach 0.17 rad — the jump ratio
is the check. python's http.server resets a few fetches under load: counted apart as
`serverResets` (the viewer retries them).

### Ring bench (`node shoot.mjs [base] [out] ring [delayMs]`)

GPU MB at the five windows (village · rapids · stones · ruin · great forest); pans: 16 one-square
steps crossing cell borders both ways, 6 one-screen pans; "preview" = window cells drawn from the
preview after the move (until when, ms after the key). Delay = extra ms before each cell's fetch.

| ring | max MB | village · rapids · stones · ruin · forest | 1-square pans, preview seen (0 / 150 / 400 ms delay) | 1-screen pans, preview seen until (0 / 150 / 400) |
|---|---|---|---|---|
| ½ screen | 119.5 | 110.8 · 109.5 · 87.0 · 48.8 · 119.5 | never · never · never | 0 · 370 · 946 ms (9 cells) |
| **¼ screen** | 98.5 | 68.1 · 81.7 · 69.0 · 36.5 · 98.5 | never · never · never | 34 · 384 · 935 ms (12 cells) |
| none | 62.8 | 39.1 · 46.4 · 51.7 · 36.5 · 62.8 | never · 2/16, 184 ms · 2/16, 406 ms | 0 · 445 · 983 ms (12 cells) |

Reading: a one-screen pan always reloads half the window (½ ring holds only half of the next
screen), so it waits for the device's load time whatever the ring; ½ buys nothing over ¼ there.
A one-square pan stays clean with ¼ even at 400 ms a cell; with no ring a border crossing shows a
column of preview for the load time. → **¼ is the default** (−21 MB in the forest, −43 MB in the
village). Canopy (up to 41 MB at ¼) is now the larger half; still ~3× the ~35 MB plan → compressed
textures (ETC2/ASTC) remain v2's call.

## Files (all committed, 14 MB in the folder)

| file | what |
|---|---|
| `prepare.py` | run → assets here (~50 s). `python3 docs/mockups/outdoor/summervale/prepare.py [run]` |
| `viewer.js` | the stage: streaming, shaders, draw order, GPU readout, `window.sv` hooks |
| `index.html` | toggles, readout, input; hash `#at=x,y` `#whole` `#repeat=20` `#clean` |
| `shoot.mjs` | the exit check (Playwright from `v2/node_modules/@playwright/test`, Metal ANGLE) |
| `manifest.json` (0.37 MB) | cols/rows/pps/cell, per-cell entries, trees `[x,y,R]`, `polys` (crown outlines, sq), clumps `[x0,y0,x1,y1,pivotX,pivotY,tree,seed]` (map px), roofs, plants (`types`, `mesh`, atlas, `list` = `[type,layer,x,y,rot,scale,tint]`) |
| `cells/<cx>_<cy>.g.webp` | ground, 512² (edge cells smaller), q 86 — 6.3 MB for 135 |
| `cells/<k>.c.webp` / `.ids.png` | canopy RGBA + 8-bit clump ids (copied from `canopy/cells/`) — 5.2 MB, 104 cells |
| `cells/<k>.w1.png` / `.w2.png` | water at ¼ (128² + 1 px gutter), 31 cells, 0.27 MB. w1 = R,G along-river coordinate mod 32 (twice, half a period apart), B speed, A mask; w2 = R shallow, G bank distance, B boulder foam, A across-river coordinate |
| `roofs/*.webp`, `atlas.webp`, `preview.webp` | 12 roofs (0.46 MB), the plant atlas, the whole map at ¼ (1904 × 1064, 0.49 MB) |
| `water-mask.png` | the fitted water mask at ¼, to check by eye (not loaded) |

Cell entry: `x,y,w,h` (map px), `canopy` (1 if any), `clumps` (global ids in id-map order:
id k → `clumps[k-1]`), `water` ([w,h] texels inside the gutter), `plants` (indices into the list),
`roofs` (indices).

## Data flow

1. `plan()` on every move (v2's `tile-window.ts` maths): load rect = window ± the ring (¼ screen since 4b),
   leaning a quarter screen into the last pan direction; visible cells first, then by distance;
   6 fetches at a time; cells outside the rect + ¼ cell are freed (textures + clump VAO). A failed
   fetch is queued again after 0.5 s (python's http.server resets a few under load).
2. A cell is **live** once ground + canopy + small copy (¼, `createImageBitmap` resize) + ids (R8,
   nearest) + water are uploaded and its clump quads built. Only live cells are drawn; under the
   rest the preview shows (never black). The readout counts cells "on preview".
3. Plants: one vertex buffer rebuilt from the live cells' plant lists whenever the live set
   changes (the slice's `buildPlants`; tint is one brightness). Roofs: a sprite is loaded while
   any cell it touches is live.
4. Draw order (scissored to the 34 × 19 window): preview → ground cells → water cells → canopy
   shadow (small copy's alpha, blurred, offset 0.45/0.6 sq) → plants (shadows, then lily · reed ·
   trunk · low · bush, one call) → canopy under (silhouette at full res, colour from the small copy
   ×0.62) → clumps per cell (quad over box ∩ cell, swayed like the slice's kind 0; pixel kept where
   ids == its index) → roof shadow + roof. Clouds multiply everything but shadows.
5. Window: `s = min(W/34, H/19)` device px (56.5 at 1920 × 1080 ≈ the TV's 56); the shown
   window glides to the whole-square target in ~0.12 s. Whole map: preview only + clouds, tap = jump.

## Water: two fixes over the slice's approach

- **Masks fitted to the painting** (`prepare.py fit_water`): the model painted the rapids up to
  2 squares south of the layout's river and its boulders elsewhere → those rapids stood still and
  the mask wobbled the bank. Mask = painted water (teal, or bluish-white foam next to teal) within
  3 sq of the layout mask; holes < 0.15 sq² filled, holes 0.15–4 sq² = painted boulders (15) →
  their foam collar + 1.5 sq wake down the flow (as `outdoor.py masks`); flow/speed/shallow copied
  from the nearest layout water; bank distance recomputed. 162 sq changed.
- **Noise in river coordinates** (`river_coords`): the slice rotates the noise by the flow
  direction about the map origin; at |position| ≈ 80 sq every small turn of the flow shifts the
  noise by many texels per pixel → coarse mip + moiré, nothing moved. Now s = arc length along the
  layout's centre line (Catmull-Rom), n = across; periods along the river divide 32 sq; `textureGrad`
  from the non-wrapping channel. Rapids motion (two shots 0.6 s apart, mean |Δ| on fast water):
  2.2 → **9.8** (slice: 11.9); calm 4.1 (slice 6.0).
- The bed sample clamps at a cell's edge (no neighbour): a ≤ 9 px strip with less wobble at
  cell borders in fast water — not visible in the shots; watch on the TV.

## Numbers (4a, ½ ring; M2 Max, Chromium headless, ANGLE Metal, 1920 × 1080, draw ×20 per timed frame)

| window (top-left sq) | live cells | GPU MB | ground | canopy | GPU ms/frame |
|---|---|---|---|---|---|
| village 34,4 | 45 | 110.8 | 45.0 | 38.1 | 0.15 |
| rapids 62,38 | 45 | 109.5 | 45.0 | 44.6 | 0.47 |
| stones 96,17 | 30 | 87.0 | 29.4 | 38.6 | 0.48 |
| ruin 100,56 | 20 | 48.8 | 16.1 | 18.2 | 0.41 |
| great forest 80,18 | 45 | 119.5 | 45.0 | 48.6 | 0.46 |
| pan max (18,30) | — | 124.5 | 51.0 | 47.3 | — |

Shared: 12.7 MB (preview 7.7, atlas 4.7 with mips, noise); roofs 0–10 MB (no mips); vertices
1–6 MB. Canopy = RGBA 4 B + ids 1 B + small copy ¼. Load of a fresh window 80–240 ms (localhost).
Pan: 47 positions (screen serpentine + square steps along row 30), **0 failures** — every window
settles with no cell on the preview, max 0.33 s. Slice for comparison: 0.52–0.61 ms.

**Over budget:** cells (ground + canopy) are 83–96 MB in full windows vs. the ~36–62 MB planned
for canopy alone / ~35 MB for the window. The ring of half a screen per side = 2 × 2 screens ≈ 45
cells × 1 MB ground. Options (v2's call): ETC2/ASTC (ground 4–8×, canopy 4×), ground as RGB,
ring ¼ screen (~25 cells), or the preview-only ring (load full cells only for window + ¼ ring).

## Open (after 4b)

- Ghost opens a ~2-square hole, not whole crowns: big crowns (4–5 sq) keep their far side. Per-tree
  opening via `polys` (a tree id per clump is in the manifest) if the table wants it.
- A token is hidden as soon as its centre leaves the window; nothing marks "a token off screen".
- Roof tap uses the footprint ± 0.3 sq; no long-press menu (not needed in the mock).
- Load delay is a stand-in: measure real fetch + decode per 512 px cell on the box (WebP decode on
  the A55 likely 20–60 ms, plus upload) before tuning the ring further.
- Ferns (283) mostly under the canopy — drop the fully covered ones if the box is short of vertices.
- Stray dark 1-px specks at a few canopy rims (fringe pixels with id 0 or split clumps); tiny.
- The bed sample clamps at a cell's edge in fast water (≤ 9 px strip with less wobble) — watch on the TV.
- `debugWater`, `state.time`, `state.repeat`, `state.loadDelay` stay as test hooks.
- Whole-map view is a static picture (no water motion); the TV doesn't need it.
