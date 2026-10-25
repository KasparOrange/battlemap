# render — the table renderer

How `app/src/lib/render/` draws the table, what it costs, and how to measure it. The design
reasons are in [`architecture.md`](architecture.md) "rendering", "table view maths",
"performance budgets"; this page is the as-built map.

## The seam

`createTableView(host, { profile, log, files?, serverUrl?, effects?, onEvent?, listenToShell? })`
from `lib/render/index.ts` returns a `TableView` at once; `ready` resolves when WebGL runs, and
`update()` calls before that are kept (the latest state wins).

| Member | What |
|---|---|
| `update(state)` | draws a `RootState`; each part is diffed by reference, so a command that touched the tokens re-does the tokens only |
| `setDmCamera(c)`, `dmCamera()`, `panBy(dx, dy)`, `zoomAt(f, at)`, `fitDmCamera()`, `setDmInsets({top,right,bottom,left})` | **the one owner of the DM camera** (rv#8): centre in squares, px per square, quarter turns; clamped to zoom `[fit × 0.5, max(400, fit)]` and a centre on the map; fits every new map by itself into the host minus the panels' insets (24 px margin), refits on a resize while still fitted; ignored on the TV. Gestures use the pure `panCamera` / `zoomCameraAt` / `pinchCamera` of `camera.ts` (importable under `bun test`) and hand the result to `setDmCamera` |
| `onCameraChange(cb)` | `(camera, why: 'map'\|'fit'\|'set'\|'resize'\|'state')` after every change of the camera in use; returns the unsubscribe |
| `camera()`, `viewport()` | the camera in use (the TV's comes from the state: `tvView`), the host size in CSS px |
| `screenToSquares(p)`, `squaresToScreen(p)` | host CSS px ↔ map squares |
| `hitTest(p)`, `hits(p)` | **the one hit test** (rv#32, `hit.ts`, pure `hitsAt` exported): `{kind:'disc', part:'knob'\|'move'}`, `ruler`, `{kind:'token', id}`, `{kind:'door', index}`, `frame` — priority order of `architecture.md` "input"; at least 22 px of grab room |
| `geometry()` | the active map's walls, doors, lights (schema-checked), null until loaded — the companion needs no second fetch (rv#19) |
| `setSelectedToken(id)` | DM: a gold selection ring on that token (rv#20) |
| `setDmLayersShown(on)`, `setWallsShown(on)` | device-local DM switches (master eye, walls debug) |
| `dropTextures()` | frees what can be rebuilt; the map reloads at ¾ density. Called by itself on the shell's `memory` event (level ≥ 10) |
| `stats()` | frames, last frame ms, texture bytes by part, tokens, map density, GPU name |
| `scheduler` | the render-on-demand loop (`hold(name, maxFps?)`, `invalidate()`, `onFrame()`) |

**Files:** pass `files: (ref) => storage.files.get(ref)`; without it the view fetches
`<serverUrl ?? page origin>/files/<hash>.<ext>` — wrong inside the shell (its origin is
`appassets…`), so TV mode and the companion must pass one of the two.

**Events** (`onEvent`): `map-loading`, `map-shown {ms, pxPerSquare, tiles, bytes}`, `map-failed`,
`renderer-failed`, `textures-dropped`, `geometry-loaded`, `geometry-failed`, `layer-failed {id, error}` — for the notice or spinner the IO rule asks for.

**Effects slots** (`EffectSlots`, handed to `effects(slots, {profile, scheduler, log})` —
`createEffectsRuntime` from `$lib/effects`): `ground` (under the fog), `air` (above it),
`screen` (CSS px, on top), `token(id)` (the token's own container, origin at its centre, gone
while the token isn't shown), `unitsPerSquare` (64), `filterTarget` (the map container),
`viewport()`, `camera()`, `shake(dx, dy)`. The view calls `update(effects, shots, now)` when the
map's effects, the shots, the tokens or the `effects` setting change.

## Scene graph

World units: **64 per square** (`SQUARE`), so Pixi tessellates circles finely; the state stays in
squares. The world container carries the camera (position = screen centre, pivot = camera
centre × 64, rotation = quarter turns, scale = zoom ÷ 64).

| Layer | File | Notes |
|---|---|---|
| map | `map-layer.ts` | #0B0B0B under the map rect, picture tiles; culled to the view |
| fx.ground | (effects) | |
| grid | `grid-layer.ts` | one quad, one shader: lines of 1.5 px (TV) / 1 px (DM) at any zoom, faded out below 8 px per square |
| drawings | `drawings-layer.ts` | 32 strokes per `Graphics` (a new stroke re-tessellates one chunk), live stroke at 70 % |
| tokens | `tokens-layer.ts` | shadow / disc / ring sprites from one generated atlas (tinted), bitmap-font label 0.46 sq bold outlined, name pill 0.24 sq, upright on screen; hidden: left out (TV) / 45 % (DM); `fx` child per token |
| fog | `fog-layer.ts`, `fog-texels.ts` | one quad, one shader, RGBA8 texture of one texel per square |
| doors | `doors-layer.ts` | DM markers; drawn leaves (`drawDoors`) with swing; TV shows a drawn door only next to a revealed square; walls debug (DM) |
| fx.air | (effects) | |
| dmLayers | `dm-layers.ts` | DM only, laid with the map's grid scaled to the layer, ≤ 4096 px, freed when hidden |
| tools | `tools-layer.ts` | disc (tessellated once per look; move/turn = transform), measure line, ruler |
| dmFrame | `dm-layers.ts` (`PlayersFrame`) | DM only: what the TV shows, gold, with a grip; widths in screen px |
| tableMask | `table-mask.ts` | screen space, TV only: #111111 outside the window in table mode; the calibration pattern in any view |
| fx.screen | (effects) | screen space |

## Map pictures

`planDecode` (`tiles.ts`): the grid's rectangle on the file (a table copy is a scaled file —
the grid is mapped by the size ratio read from the header, `image-size.ts`), clipped to the
picture, decoded once by `createImageBitmap(blob, sx, sy, sw, sh, {resizeWidth, resizeHeight})`
at the wanted density: **TV** its ppi (≈ 56 px per square at 1080p) from the table copy when
there is one, **DM** the picture's own. Budgets: TV 128 MB map / 2048 px tiles, DM 192 MB /
4096 px tiles; over budget the density drops, never below 32 px per square (the floor wins).
`planTiles` cuts the decode into even tiles with a 1 px apron (no seams under linear
filtering); tiles upload one per frame, then the bitmaps are closed (RAM back; a lost WebGL
context reloads the map). Mipmaps on the DM only (it zooms far out). Pixi's texture GC is off —
the layers free their own textures.

## Fog

Texel channels (`fog-texels.ts`): R revealed · G reveal fade · B bits (staged reveal/hide, a
fogged / revealed neighbour) · A atmospheric distance step (0–4, Chebyshev, two-pass). A
change writes the new texels into a scratch buffer, copies only the rows that differ
(`changedRows`) and uploads those rows (`BufferImageSource.update(start, end)`).

The shader (`fog-layer.ts`): squares with no fogged neighbour return clear and squares with no
revealed neighbour return fog after one texel fetch; only rim squares look at their 3 × 3
neighbourhood. There it takes a signed distance — outside the fog: to the nearest fogged square
grown by the trim inset (the old `fogRevealRects` rule: sides pulled in, inner-corner notches,
map border never trimmed); inside: to the nearest revealed square's core — and smooths it over
the style's edge width in screen px (standard 4, soft 16, cloud 1 with drifting bumps at a
20 fps lease, atmospheric = bilinear distance steps 0.35 / 0.55 / 0.75 / deep). Fog opacity: TV
1, DM 0.7 (deep atmospheric 0.9); DM tints staged squares blue 30 % / red 20 %. The reveal fade
(`FogFade`) gives newly revealed squares full fog in G and eases it out over 500 ms under a
render lease; hiding is instant; a new map or snapshot never fades.

## Render on demand

`scheduler.ts`: `invalidate()` coalesces into one rAF; `hold(name, maxFps?)` keeps frames coming
(uncapped, or at most `maxFps` through a timer); `onFrame` tickers (fog fade, door swings,
cloud drift, the bench) run before each render. The view invalidates only when a layer reports
a change or the camera moved. Idle = 0 frames (cloud fog is the one exception: 20 fps).

## Bench

`app/bench.html` (`Bench.svelte`, scenes in `bench-scenes.ts`):
`?scene=all|empty,big-map,fog-paint,tokens,drawings,everything|showcase` `&profile=players|dm`
`&seconds=8&warmup=1&fx=all|none|<id>`. Effects scenes come from `$lib/effects`'s
`effectsBenchScenes` when it exports them. Per scene: fps avg and 1 % low (rAF deltas), frame
p95/max, CPU ms per frame (tickers + render, the bench's own state building excluded), draw
calls (counted on the context), GPU ms (`EXT_disjoint_timer_query_webgl2`, when there), texture
MB, heap and its growth, idle frames afterwards — on screen, in `window.__bench`, and one log line
per scene (area `bench`, `Scene <id>`). `showcase` is a still scene of every layer for looking
(`&fogStyle=…&inset=…&turns=…&zoom=…&cx=…&cy=…&pattern=1`).

Headless Chromium throttles rAF to ~10–25 fps whatever the GPU, so fps numbers need a headed
window (or the device); CPU and GPU ms are meaningful either way.

### Results

RESULTS_PLACEHOLDER
