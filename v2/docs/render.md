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
| `setDmCamera(c)`, `dmCamera()`, `panBy(dx, dy)`, `zoomAt(f, at)`, `fitDmCamera()`, `setDmInsets({top,right,bottom,left})` | **the one owner of the DM camera** (rv#8): centre in squares, px per square, quarter turns; clamped to zoom `[fit × 0.5, max(400, fit)]` and a centre on the map; fits every new map by itself into the host minus the panels' insets (24 px margin), refits on a resize while still fitted; ignored on the TV. The fit reads the host's size at fit time (`TableRenderer.syncSize`) and resizes reach the scene at once (`onResize`), not on the next frame — a phone layout that settles after the first draw can't leave a small fit (qa#8) Gestures use the pure `panCamera` / `zoomCameraAt` / `pinchCamera` of `camera.ts` (importable under `bun test`) and hand the result to `setDmCamera` |
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
| grid | `grid-layer.ts` | one quad, one shader: lines of 1.5 px (TV) / 1 px (DM) at any zoom, two-toned (dark core, faint light rim — reads on dark and light maps), faded out below 8 px per square |
| drawings | `drawings-layer.ts` | 32 strokes per `Graphics` (a new stroke re-tessellates one chunk), live stroke at 70 % |
| tokens | `tokens-layer.ts` | shadow / disc / ring sprites from one generated atlas (tinted), bitmap-font label 0.46 sq bold outlined, name pill 0.24 sq (fonts without kerning tables: 155 ms less per start); DM upright on screen, **TV turned toward the nearest table edge** (`label-facing.ts`: players sit on every side); hidden: left out (TV) / 45 % (DM); `fx` child per token |
| fog | `fog-layer.ts`, `fog-texels.ts` | one quad, one shader, RGBA8 texture of one texel per square |
| doors | `doors-layer.ts` | DM markers; drawn leaves (`drawDoors`) with swing; TV shows a drawn door only next to a revealed square; walls debug (DM) |
| fx.air | (effects) | |
| dmLayers | `dm-layers.ts` | DM only, laid with the map's grid scaled to the layer, ≤ 4096 px, freed when hidden |
| tools | `tools-layer.ts` | disc (tessellated once per look; move/turn = transform), measure line, ruler |
| dmFrame | `dm-layers.ts` (`PlayersFrame`) | DM only: what the TV shows, gold, with a grip; widths in screen px |
| tableMask | `table-mask.ts` | screen space, TV only: #111111 outside the window in table mode; the calibration pattern in any view (its words are TV mode's card, `TvCalibration.svelte`) |
| fx.screen | (effects) | screen space |

## Map pictures

`planDecode` (`tiles.ts`): the grid's rectangle on the file (a table copy is a scaled file —
the grid is mapped by the size ratio read from the header, `image-size.ts`), clipped to the
picture, decoded once by `createImageBitmap(blob, sx, sy, sw, sh, {resizeWidth, resizeHeight})`
at the wanted density: **TV** its ppi (≈ 56 px per square at 1080p) from the table copy when
there is one, **DM** the picture's own. Budgets: TV 128 MB map / 2048 px tiles, DM 192 MB /
4096 px tiles; over budget the density drops, never below 32 px per square (the floor wins).
**One texture budget** (`TextureBudget`, rv#17): map + "everything else" (TV 128 + 32 MB); the
effects registry gets `effectsBudget()` = everything else minus a 4 MB reserve for fog, the token
atlas and glyph pages (TV 28 MB); `stats().budget` reports it.

**Loads that lose the race** (a quick `map.switch`, a drop, a context restore) free every tile
and bitmap they made in one `finally` (rv#2). Tiles that leave the screen are taken off at once
and destroyed two frames later, after a render without them (qa#21: no "destroyed while bound"
— the same for DM layers). DM-layer bitmaps are closed after their upload; a layer is tried
three times, then the view raises `layer-failed` (rv#18).

**Memory warnings** (`memory.ts`, rv#3): only `RUNNING_LOW` (10), `RUNNING_CRITICAL` (15) and
≥ 60 (in the background) drop textures; 5, 20 (`UI_HIDDEN`, every trip to Home) and 40 are
logged and ignored. A drop reloads the map at ¾ density; full density comes back after 2 min
without another drop, and with the next map.
`planTiles` cuts the decode into even tiles with a 1 px apron (no seams under linear
filtering); tiles upload one per frame, then the bitmaps are closed (RAM back; a lost WebGL
context reloads the map). Mipmaps on the DM only (it zooms far out). Pixi's texture GC is off —
the layers free their own textures.

### Tile streaming for big maps (TV)

Decided 2026-10-26 (`docs/ai-art.md`): a map that would need more than **64 MB** of texture at
the TV's density (`TV_BUDGET.tiledAboveBytes`; the 4 × 4-screen outdoor map, 136 × 76 squares,
needs ~130 MB) is never decoded whole on the box; it streams **512 px tiles stored as separate
files**. Smaller maps keep the path above; the companion keeps it too (192 MB budget; 136 × 76
at the picture's 56 px per square is ~173 MB with mipmaps, it fits).

- **Cutting: the server** (`server-rs/src/files/tiles.rs`), on the first
  `GET /api/tiles/<hash>.<ext>?level=k`: decodes the original picture once (an image slot),
  scales it by 2^-k, cuts 512 px tiles **in picture space** with a 1 px apron (no seams under
  linear filtering), WebP q85, each tile a content-addressed file in `files/`; plus a
  ≤ 1024 px **preview** of the whole map. The manifest (`TileManifest`, `wire.rs`: level size,
  tile size, apron, tile refs row by row, preview ref) is a JSON file in the store, remembered in
  `derived.json` as `<hash>:tiles<k>`; the same set is never cut twice. Picture-space tiles don't
  depend on the grid, so a grid edit needs no new set; the TV maps tile pixels to squares through
  the `RasterGrid` exactly as it maps the whole picture today (fog, grid, tokens line up the same).
- **Cut at upload:** a picture stored through `POST /files` that a TV could stream starts its cut
  in the background right after the upload answers (`cut_at_upload`). The grid isn't known yet,
  so it cuts every level whose own pixels × 4 bytes pass the 64 MB threshold (`stream_levels`;
  the TV's density is at most the level's, so a level under it never streams) — level 0 for most
  big maps, levels 0 + 1 from one decode above ~67 Mpx. A TV asking during the cut waits for that
  same cut (one lock, the set looked up again under it); never cut twice. Measured 2026-10-28 on
  the Mac (M-series, release build): a painted 7616 × 4256 JPEG (3.9 MB) → 135 tiles (2.5 MB) +
  preview in **2.4 s**, the upload itself still answers in 0.16 s; a `GET /api/tiles` sent right
  after the upload answered when that cut finished.
- **Open point — the box as LAN server:** when the TV box runs the server for LAN play, the cut
  decodes the whole picture on the box once (7616 × 4256 RGBA ≈ 130 MB, plus the scaled copy at
  level ≥ 1) — exactly what streaming keeps off the box's 2 GB. Not fixed; options: ask the
  internet server (upstream) for the set and pull its tiles, or decode in strips.
- **Level:** the largest k with `cellW / 2^k ≥` the TV's px per square (a 256 px/sq export → k 2,
  64 px/sq; the 56 px/sq outdoor map → k 0); each tile is decoded resized to the TV's density.
- **TV window** (`tile-window.ts` pure maths, `tile-stream.ts` the loader): loaded = tiles under
  the screen + a ring of half a screen on every side, leaning a quarter screen into the last pan
  direction (¾ ahead, ¼ behind: the same memory, the next screen comes sooner); tiles outside
  that rect grown by a quarter tile are freed (two frames later, qa#21). Loads go visible first, then
  nearest the centre; 2 fetch + decodes in flight, uploads one per frame as today. The preview
  lies under the tiles, so a tile not loaded yet reads blurry, never black. The map is shown
  once the preview and the visible tiles are up. `stats().mapStream` counts loaded / queued /
  visible-missing / freed tiles. 2 × 2 screens of 34 × 19 at 56 px are 32 MB; whole 512 px tiles
  round that up: measured 2026-10-28 (`e2e/tile-stream.e2e.ts`, synthetic 7616 × 4256 numbered
  map, 135 tiles, 1920 × 1080, a serpentine of 12 one-screen pans): 26–38 MB at the map's edges,
  **56 MB peak** mid-map (9 × 6 tiles), never all tiles, every visible tile up after each pan
  settles (whole-picture decode would be ~130 MB). A small map (2000 × 1200) keeps the
  whole-picture path.
- **Offline:** tiles come through the TV's file cache (IndexedDB); the manifest is kept in the
  TV's settings (`tiles:<hash>:<k>`); after the window settles the rest of the set is fetched into
  the cache in the background, so the map plays without the server later. No manifest and no
  server (or the legacy Bun server, which has no `/api/tiles`) → the whole-picture path above.

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

## Map lights (RD-120)

`effects/map-lights.ts` (pure maths in `light-look.ts`): a soft pool at every light of the
`.dd2vtt` geometry — its colour, its range (radius, capped at 30 squares), its intensity — one
additive sprite per light from one 128 px glow texture (64 KB), all in one draw call, first
child of `fx.ground` (under the fog: the players see a torch once they find it). Warm lights
(red > blue) flicker ±16 % in brightness (size ±4 %), cold ones breathe ±5 %, on the shared
render clock under a `map-lights` lease capped at 30 fps. Effects quality: `full` flickers,
`low` draws still pools (no lease, 0 idle frames), `off` none; nothing shows while the game's
`effects` setting is off. Walls don't stop the light yet.

The switch is per game: `GameSettings.mapLights` (default **off**; the scene reads it
defensively until the shared schema has the field). The scene hands
`geometry().lights` to the runtime's `setMapLights` while it is on. Bench: scene `lights`
(80 torches, the castle's count) and `showcase&lights=1`.

## Render on demand

`scheduler.ts`: `invalidate()` coalesces into one rAF; `hold(name, maxFps?)` keeps frames coming
(uncapped, or at most `maxFps` through a timer); `onFrame` tickers (fog fade, door swings,
cloud drift, the bench) run before each render. The view invalidates only when a layer reports
a change or the camera moved. Idle = 0 frames. Leases that animate on their own: cloud fog (20 fps, only while the fog layer shows — rv#4) and map lights at full quality (30 fps, only with the switch on).

## TV start time (qa#11)

`tv/boot-timing.ts` marks the start's steps as User Timing marks (`bm:script`, `mounted`,
`booted`, `renderer`, `map-loading`, `map-shown`, `frame`; ms since navigation) and logs one
line, area `perf`, at the first frame with the map (with the map's fetch / decode / upload ms).
2026-10-25, Mac, headless Chromium + SwiftShader, built app, map in the device cache, machine
load 25–35: reload → first map frame **0.4–0.9 s typical** (script 30 · renderer +150–400 ·
boot (IndexedDB) +150–550 · map +100–300 · frame +1–70); outliers of 2–6 s were IndexedDB reads
of the cached map (fetchMs 2–3.7 s for 71 KB) under the machine load. Cut: kerning tables of the
three bitmap fonts (155 ms of `measureText`), one storage round trip at boot. Still open: the
first render's shader links (~50–140 ms in SwiftShader), the TV loading the companion's code
(`App.svelte` imports both modes statically).

2026-10-26 (W5-P): the bitmap fonts draw their glyphs on demand (0982e2c; the install drew ASCII
+ Latin into the atlases on every start). Same Mac, built app, Rust server, 6000 px tavern cached,
CPU throttled 4× (a box-like CPU), load ~12, 7 reloads each: reload → first map frame median
**849 → 665 ms** (766–1089 → 610–809).

**The tablet's first map view** (qa#26): the companion makes its one table view ahead while the
DM is on the library (`companion/game/dm-view.ts`, `?prewarm=0` turns it off). Fresh browser per
run, 1280 × 800 @2, 8 s on the library, then `game.new` with the tavern → map view fitted:

| | made on the tap | made ahead |
|---|---|---|
| Mac GPU (Metal) | 122–1142 ms (cold GPU process ~1.1 s) | **73 ms**, main thread held ≤ 30 ms |
| SwiftShader | 1.8–2.1 s, main thread held 1.4–2.0 s | **1.0–1.1 s** (the rest is the map's upload) |

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

2026-10-25, Mac (M2 Max, headed Chromium, ANGLE Metal, 1920 × 1080, load 25–38 from other
sessions), `everything` scene, before → after the wave-3 pass:

| | CPU ms avg / p95 | heap growth MB/s | sampled allocations | draw calls | idle frames |
|---|---|---|---|---|---|
| before | 1.80 / 4.6 | 2.03 | 180 MB in 5 s (36 MB/s), 95 % Graphics re-tessellation | 15 | 0 |
| after | 1.41 / 3.2 | 0.77 | 11.6 MB in 4 s (2.9 MB/s; the bench's own state building and fog base64 lead) | 13 | 0 |

The cause was the measure line: a dashed `Graphics` rebuilt on every move (`&omit=measure` took
the allocations from 180 MB to 7 MB). It is now a `TilingSprite` over a dash texture, moved by
transforms; the pill is redrawn only when its text changes. Profiling recipe: CDP
`Profiler` + `HeapProfiler.startSampling` while the bench says "measuring",
`everything&omit=strokes,tokens,disc,measure,fog,pan` to bisect.

Other scenes, same Mac: `lights` 0.24 / 0.5 ms CPU, 3 draw calls, 30 fps lease (idle frames
count the flicker); `fx:fireballs` 0.31 / 0.7 ms (the emulator's 5 / 31 ms is the WebView
under load: with Chrome's CPU throttled 6× it reads 7.3 / 35 ms, and the one texture upload in
the scene — the fireball atlas, 1974 × 1425, at the first burst — is the p95 spike; later bursts
reuse it from the registry cache). Import (qa#10): the castle's table copy 4.6 s → 1.8 s in the
browser worker (JPEG instead of WebP for copies over 4 MP: encode 7.5 s → 0.4 s, +13 % bytes),
`e2e/import-perf.e2e.ts` prints the split.
