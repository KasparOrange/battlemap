# Effects library

The effects battlemap v2 can put on the table: weather over the whole map, spell areas, bursts on a
spot, auras that follow a token, and map loops that dress a map (torches, braziers, water, lava).
Everything ships in `v2/assets/effects/` as small WebP textures plus one JSON manifest per effect;
the runtime (`app/src/lib/effects/`, see `architecture.md` "Effects runtime") draws them with
PixiJS v8 on WebGL2. Built 2026-10-25 (helper session "effects library").

<!-- numbers:start -->
**150 effects, 31 MB on disk** (target was ≤ 80 MB). No loop over 6 MB of GPU memory, no
one-shot over 12 MB; most are 1–6 MB.

| category | count | | technique | count | | licence | count |
|---|---|---|---|---|---|---|---|
| global | 18 | | sheet (frames) | 77 | | CC BY-NC-SA 4.0 (JB2A, non-commercial) | 72 |
| regional | 57 | | texture + motion | 38 | | CC0 (Unity Labs, Kenney) | 29 |
| point | 25 | | shader | 14 | | own, generated (Gemini) | 29 |
| aura | 17 | | particles | 12 | | own (shaders, recipes, composites, layered circle) | 17 |
| map-loop | 33 | | set (variants) | 4 | | CC BY 3.0 (johndh) | 2 |
| | | | composite | 4 | | Lottie Simple License | 1 |
| | | | layers | 1 | | **commercial use allowed** | **78** |

Checked: every effect plays in `preview.html` (headless Chrome screenshots per category, looked
at — fixed on the way: clipped flame frames, a wrong flipbook grid, magenta fringes on keyed art,
too-strong torch glows); every shader compiles under WebGL2; `tools/check_loops.py` finds no loop
whose seam is bigger than 2.5 × its typical frame step (the one offender, candle smoke, now
crossfades its tail into its start).
<!-- numbers:end -->

## Where things live

| Path | What | Committed |
|---|---|---|
| `v2/assets/effects/<id>/effect.json` | the manifest of one effect (fields below) | yes |
| `v2/assets/effects/<id>/*.webp` | its atlases / texture / particle sprites, and `thumb.webp` (128 px, for the companion's picker) | yes |
| `v2/assets/effects/index.json` | every effect: id, name, category, technique, tags, damage, spells, blend, licence, commercial, manifest, thumb, bytes, gpuBytes | yes |
| `v2/assets/effects/shaders/` | GLSL ES 3.0 filters for PixiJS v8 (`filter.vert` + one `.frag` per procedural effect) | yes |
| `v2/assets/effects/preview.html` | plays every effect from its manifest on a map-like floor (look-and-loop check) | yes |
| `v2/assets/effects/tools/` | `catalog.toml` (the recipe of every effect), `build.py`, `bake_lottie.mjs`, `gemini_generate.sh`, `shoot_preview.mjs`, `check_loops.py`, `contact_sheet.py`, `doc_table.py` | yes |
| `v2/assets-src/` | raw downloads, baked frames, Gemini pictures, decode cache — **never committed** (its own `.gitignore` is `*`) | no |

## Categories and how they anchor

| category | meaning | runtime anchor (`architecture.md`) | typical layer |
|---|---|---|---|
| `global` | the whole map: weather, light, mood | `global` | `fx.air` (shaders as a filter on the map container) |
| `regional` | an area in squares: a spell's sphere, cone or line, a cloud, a web | `region` or `point` | ground or air |
| `point` | a spot: a hit, a burst, a rune, loot glints | `point` | mostly `fx.air` |
| `aura` | follows a token: conditions, buffs, Spirit Guardians | `token` | the token's container |
| `map-loop` | dresses the map for the evening: torches, braziers, water, lava, fireflies | `point` / `region` | mostly `fx.ground` |

`layer` in a manifest says `ground` (decals, circles, water — under the fog, so fog hides them) or
`air` (bursts, clouds, weather — above the fog).

## The manifest

Every `effect.json` has these fields; a technique adds its own block.

| field | meaning |
|---|---|
| `id`, `name` | stable id (folder name) and a human name for the picker |
| `category` | `global` · `regional` · `point` · `aura` · `map-loop` |
| `technique` | `sheet` · `set` · `layers` · `texture` · `particles` · `shader` · `composite` (below) |
| `tags`, `damage`, `spells` | search words; D&D damage types (acid, cold, fire, force, lightning, necrotic, poison, psychic, radiant, thunder, bludgeoning, piercing, slashing); spell names it fits |
| `layer` | `ground` or `air` |
| `blend` | `normal` · `add` · `screen` · `multiply` (Pixi blend modes) |
| `tint` | true when the texture is white/grey and meant to be coloured by the runtime |
| `squares` | the catalogue's nominal size (width of the source frame in squares) |
| `size` | `{w, h}` in squares of the drawn (trimmed) picture — place it at this size |
| `anchor` | `[x, y]` 0..1 inside the trimmed picture: the point that sits on the map point (a cone's apex, a flame's foot) |
| `beam` | line effects only: `{start, end}` 0..1 along x — stretch/rotate so start→end spans caster→target |
| `gpuBytes` | GPU memory of its textures when loaded (RGBA8) |
| `licence` | `{id, url, commercial, shareAlike}` — `commercial: false` = may not ship in a paid product |
| `author`, `source`, `sourceFile`, `attribution` | who made it, where it came from, the credit line to show |
| `notes` | anything the runtime or the DM should know (scale hints, how to combine) |

**Techniques**

- `sheet` — a frame animation. `sheet = {atlases[{file,w,h}], frameW, frameH, frames[[atlas,x,y]…],
  fps, loop, crossfade}`; `duration` in seconds. All frames share one size (the union of their
  visible pixels), so a frame is a fixed rect. Loops are sampled evenly over the source loop, so
  frame N steps into frame 0 like any other step. `crossfade: true` (slow loops, < 11 fps): draw
  frame i and i+1 with alpha = the fraction between them — smooth at half the frames. One-shots
  play once and are released.
- `set` — variants, not an animation (`sheet.variants = true`): blood stains, scorch marks, runes.
  The runtime picks one per placement (random or by the DM).
- `layers` — one texture per layer, each with its own motion (`layers[{frame, rotate deg/s,
  pulse}]`): the hand-made magic circle indicator. No frames — smooth at any speed, ~1 MB.
- `texture` — one picture + a motion recipe (`motion`): `rotate` deg/s · `pulse {period, alpha,
  scale}` · `flicker {hz, alpha[min,max], scale[min,max]}` · `grow {from, duration}` · `fadeIn` /
  `fadeOut` s · `once` s (a one-shot) · `sway {angle, period}` · `glow {period, amount}` ·
  `color` (tint) · `shader` (`magic-circle.frag`: counter-turning ring bands). The cheapest way
  to make art move.
- `particles` — sprite textures + an emitter recipe: `emitter` (`screen` · `area {w,h}` · `point
  {radius}` · `ring {radius}`), `rate`/s or `burst`, `max`, `life` [s], `speed` [squares/s],
  `angle` [deg, 0 = right, 90 = down], `gravity` [x, y squares/s²], `size` [squares], `grow`
  (×size at death), `alpha` [start, middle, end], `colors` [start, end], `spin` [deg/s],
  `wobble` [amplitude squares, Hz], `flicker` Hz, `flip`, `alignToVelocity`. Suggested GPU
  implementation: positions as a function of time in the vertex shader (the tabletop board's
  particle demo), the CPU only seeds.
- `shader` — procedural, no art: `shader = {fragment, vertex, apply, uniforms, textures}`.
  `apply: "filter"` = a Pixi `Filter` on the map container (or a masked region); `apply: "mask"` =
  a Filter on a filled shape — the shape's alpha is kept and its colour becomes water/lava.
- `composite` — other effects placed together: `parts[{id, x, y, scale, phase}]` (offsets in
  squares from the anchor). A campfire = glow + stones + three flames + embers.

**Shader uniforms** (all fragments): Pixi supplies `uTexture`, `uInputSize`, `uOutputFrame`,
`uOutputTexture`, `uInputClamp`; battlemap supplies `uTime` (s), `uSquarePx` (screen px per
square), `uMapOrigin` (screen px of square 0,0) — so weather sticks to the map when the camera
pans — plus the effect's own uniforms from the manifest. Every shader is GLSL ES 3.0
(`#version 300 es`), at most one or two texture fetches, loops ≤ 8 (fbm 4 octaves, caustics 5,
lights 8). All 11 fragments compile under WebGL2 in the preview; 10 also run there (the
14 shader effects), `magic-circle.frag` is compile-checked only (the preview turns circles on
the canvas).

## Cost on the TV box (Xiaomi TV Box S 3rd gen: Mali-G310, 2 GB)

From the tabletop board's demos (`docs/mockups/effects/`, grades A cheap … E expensive):
sprite sheet Graphics B / Memory C / Processor A; GPU particles B / A / A (3,000 small); a shader
over the whole screen D / A / A (a pool alone B); Lottie A / A / C (paths rebuilt each frame on the
CPU); Rive B / A / B; video A / B / A but only 1–2 hardware decoders; GIF A / C / C.

What follows for the runtime:

- **Sheets** cost memory, not time: `gpuBytes` is the bill. Fog, tokens and effects share a
  32 MB budget (`architecture.md`), so the builder caps a loop at **6 MB** and a one-shot at
  **12 MB** (released after it plays), first by shrinking toward 40 px per square (1080p is
  ~56 px per square), then by dropping frames toward 16 and using `crossfade`. Many copies of
  one effect share one texture — six torches cost one torch.
- **Textures with motion** are nearly free (a 512 px circle = 1 MB) and smooth at any speed:
  prefer them for anything that only turns, pulses, flickers or grows.
- **Particles**: thousands of small additive sprites are cheap; big soft ones cost fill rate.
  The recipes here stay ≤ 600 live particles.
- **Shaders**: cost = pixels × math. Full-screen weather (rain, snow, fog, caustics) is Graphics
  B–C at 1080p; run one global shader at a time, and only while it animates (render leases).
  `heat-haze`, `water-flow`, `lava-flow` belong on a region (filterArea / mask), not the screen.
- **Lottie and Rive never run on the TV**: they are sources, baked to frames or layers here
  (`bake_lottie.mjs`), or used in the companion's UI only.
- Additive (`add`) effects over a bright map wash out; prefer `normal` with the effect's alpha
  for daylight maps, `add` for glows at night.

## Licences and attributions

| source | licence | commercial | what we took | credit |
|---|---|---|---|---|
| [JB2A free module](https://github.com/Jules-Bens-Aa/JB2A_DnD5e) (Jules & Ben) | CC BY-NC-SA 4.0 (`License.txt` in the repo) | **no** | most spell areas, rays, auras, markers, map loops, school circles | required: "Animation © JB2A — Jules&Ben's Animated Assets (jb2a.com), CC BY-NC-SA 4.0"; our sheets are derivatives under the same licence |
| [Unity Labs VFX flipbooks](https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks) | CC0 | yes | explosions, fire orbs, flames (also green/blue via their temperature maps), smoke and poison clouds, wisps, candle smoke | optional |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack), [Smoke Particles](https://kenney.nl/assets/smoke-particles) | CC0 | yes | light cookies, rings, sigil, particle sprites (dots, stars, sparks, smoke, explosion puffs) | optional ("Kenney.nl") |
| [Colored summoning circles](https://opengameart.org/content/colored-summoning-circles) (johndh, OpenGameArt) | CC BY 3.0 | yes, with credit | two summoning circles | required: "\"Colored summoning circles\" by johndh, CC BY 3.0" |
| [LottieFiles](https://lottiefiles.com/page/license) free animation "vortex" (ZhengWang) | Lottie Simple License | yes | one vortex ring, baked to frames | not required; same terms must travel with redistributed files; no compiling LottieFiles into a competing service |
| Gemini (Nano Banana 2.1) through the image engine | own (generated; Google's API terms leave the output to us) | yes | magic circles, glyph, rune sets, web, vines, thorns, frost, acid, blood and scorch decals, leaves, campfire/brazier bases, Hunger of Hadar, spirit ring, portal, lava and water tiles | none |
| battlemap's own | own | yes | the layered magic circle (from the tabletop board's hand-made Lottie), all shaders, particle recipes, composites | none |

**Before battlemap is ever sold or shipped commercially**, the JB2A effects must come out (filter
`index.json` on `commercial`) or be licensed from JB2A (their Patreon licence). The CC0 / own
effects cover every category on their own (fire, explosions, smoke, clouds, circles, runes,
weather, lights, decals), so the library stays usable without JB2A. The app needs a credits
screen listing JB2A and johndh (CC BY) — collect `attribution` of every effect that is loaded.

Considered and left out: pixel-art effect packs (BDragon1727, CodeManu, ansimuz, PVFX — they
clash with painted maps at 1 inch per square); TornadoGames' CC0 "magic sparks" (sheets of
18–114 MB, would need heavy cutting); inkharbor's "Ember flipbooks lite" (no licence stated);
Rive community files (CC BY, but a `.riv` can only be exported after remixing into an account);
LottieFiles in bulk (almost all UI icons; two Japanese magic circles there carry a baked-in
background and reveal animation — not worth fixing); JB2A's Patreon content (not free); Unity
Asset Store packs (store EULA, not redistributable).

## How to add an effect

1. Download the source into a new folder `v2/assets-src/<source>/` (treat it as untrusted data:
   never run anything from it). Record the licence; only take what allows use and redistribution.
2. If it is a new source, add a `[sources.<name>]` block to `tools/catalog.toml` (name, author,
   licence, licence_url, url, attribution, dir, input, blend, commercial/share_alike).
3. Add an `[[effect]]` block (copy a similar one). Sizes are in squares (`squares` = width of the
   source frame); `mode = "once"` for one-shots; `ops` for colour work (`unblack`, `lum_alpha`,
   `gradient`, `key`, `desaturate`, `alpha_scale`, `alpha_gamma`, `radial_fade`).
   A Lottie source: bake frames first with `tools/bake_lottie.mjs`. A painted gap: add a line to a
   prompts file and run `tools/gemini_generate.sh` (budget: about 60 pictures for the library).
4. Build it (a venv with Pillow + numpy, Python isolated):
   `python -I v2/assets/effects/tools/build.py <id>` — prints frames, size, disk and GPU bytes and
   rewrites `index.json`.
5. Look at it: serve `v2/assets/effects` and open `preview.html?only=<id>`, or
   `tools/shoot_preview.mjs` for a headless screenshot. Check top-down fit, clean loop
   (`tools/check_loops.py`), alpha edges (no black or coloured fringe). Shaders, particles and
   composites get their thumbnail from the preview: `shoot_preview.mjs <prefix> "only=<id>"
   1 0.3 1600 --thumbs`, then `build.py --index-only`.
6. `python -I v2/assets/effects/tools/doc_table.py` refreshes the catalogue below; commit the
   effect folder, `index.json`, `catalog.toml` and this file (`git commit -o …`, prefix `v2:`).

## Gemini use

<!-- gemini:start -->
28 pictures with Nano Banana 2.1 at 1K, one take each, no re-rolls: **$0.94** (Google's price
$0.034 a picture; the image engine's project `v2/assets-src/gemini/proj` keeps prompts, cost and
lineage — `ige -p … show`, `ige -p … cost`). Prompts: `v2/assets-src/gemini/prompts.tsv` (not
committed; the recipe is in each manifest's notes/attribution and the catalogue). Glow art was
painted on pure black and `unblack`ed; matte art on flat magenta / green / blue and keyed with
the image engine's keyer plus a despill. Budget left: ~30 pictures.
<!-- gemini:end -->

## Gaps still open

<!-- gaps:start -->
- **Commercial-safe versions** of what only JB2A covers: rays and bolts (lightning bolt, fire
  bolt, eldritch blast …), cones and breath weapons, condition markers, most auras, animated
  Spirit Guardians, Shatter / Thunderwave bursts. If battlemap goes commercial these need CC0 or
  own replacements (Kenney sparks + a particle/beam recipe would cover bolts).
- **Waterfall**: only its foot (JB2A splash) and a flowing stream (`water-pool` shader); a
  top-down falling sheet of water is missing (a scrolling-texture recipe or a generated clip).
- **Top-down CC0 fire**: the Unity flames are side views — fine for torches and braziers (they
  read 2.5D), but a fire seen straight from above is only in JB2A (campfire, bonfire).
- **Rive**: no community file used (export needs a remix in a Rive account); nothing missing
  because of it.
- **Runtime** (app/, not this folder): a GPU particle system that reads the particle recipe,
  the Pixi filter wiring with the uniforms above, the `crossfade` draw, composites, the `set`
  variant pick, and per-circle band radii for `magic-circle.frag` (the defaults suit most
  circles; tune `uBands` to the gaps of a texture).
- **Not measured on the box**: the cost notes come from the tabletop board's demos and the
  budgets the builder enforces; a bench run on the Xiaomi box with these files is still open.
- Sounds: none (not in scope).
<!-- gaps:end -->

## Catalogue

Generated by `tools/doc_table.py` from the manifests. Green-light rule: everything not marked
BY-NC-SA may be used commercially.

<!-- catalogue:start -->

### global (18)

| id | name | technique | frames | size (squares) | blend | disk / GPU | licence |
|---|---|---|---|---|---|---|---|
| `wind-streams` | Wind streaks | sheet | 16 @ 3.97 fps loop | 11.9×11.7 | normal | 115 KB / 4.1 MB | BY-NC-SA |
| `bad-omen` | Bad omen (dark vignette) | texture | 1 tex + motion | 34.0×19.1 | normal | 74 KB / 1.3 MB | BY-NC-SA |
| `embers` | Drifting embers (whole map) | particles | 1 tex | map | add | 3 KB / 0.0 MB | CC0 |
| `ash-fall` | Falling ash | particles | 1 tex | map | normal | 3 KB / 0.0 MB | CC0 |
| `dust-motes` | Dust motes (sunbeam) | particles | 1 tex | map | add | 3 KB / 0.0 MB | CC0 |
| `falling-leaves` | Falling leaves | particles | 9 tex | map | normal | 23 KB / 0.1 MB | own (Gemini) |
| `rain` | Rain | shader | rain.frag | map | normal | 3 KB / 0.0 MB | own |
| `rain-storm` | Rainstorm | shader | rain.frag | map | normal | 4 KB / 0.0 MB | own |
| `snow` | Snowfall | shader | snow.frag | map | normal | 4 KB / 0.0 MB | own |
| `blizzard` | Blizzard | shader | snow.frag | map | normal | 5 KB / 0.0 MB | own |
| `mist` | Mist (drifting) | shader | fog.frag | map | normal | 2 KB / 0.0 MB | own |
| `fog-thick` | Thick fog | shader | fog.frag | map | normal | 2 KB / 0.0 MB | own |
| `sandstorm` | Sandstorm | shader | fog.frag | map | normal | 2 KB / 0.0 MB | own |
| `heat-haze` | Heat haze | shader | heat-haze.frag | map | normal | 2 KB / 0.0 MB | own |
| `underwater` | Underwater (caustics) | shader | caustics.frag | map | normal | 3 KB / 0.0 MB | own |
| `night` | Night (darkness with lights) | shader | darkness.frag | map | normal | 2 KB / 0.0 MB | own |
| `cloud-shadows` | Passing cloud shadows | shader | cloud-shadows.frag | map | normal | 2 KB / 0.0 MB | own |
| `lightning-storm` | Lightning flashes | shader | lightning-flash.frag | map | normal | 2 KB / 0.0 MB | own |

### regional (57)

| id | name | technique | frames | size (squares) | blend | disk / GPU | licence |
|---|---|---|---|---|---|---|---|
| `fireball` | Fireball | sheet | 32 @ 9.3 fps | 7.8×7.9 | normal | 716 KB / 11.3 MB | BY-NC-SA |
| `burning-hands` | Burning Hands (cone) | sheet | 48 @ 8.92 fps | 3.0×3.0 | normal | 320 KB / 5.4 MB | BY-NC-SA |
| `breath-fire-cone` | Dragon breath — fire cone | sheet | 48 @ 7.09 fps | 6.0×6.0 | normal | 482 KB / 11.1 MB | BY-NC-SA |
| `breath-lightning-line` | Dragon breath — lightning line | sheet | 48 @ 8.06 fps | 6.0×1.0 | normal | 346 KB / 3.6 MB | BY-NC-SA |
| `cone-of-cold` | Cone of Cold | sheet | 48 @ 17.2 fps | 5.8×5.2 | normal | 1118 KB / 11.1 MB | BY-NC-SA |
| `thunderwave` | Thunderwave | sheet | 16 @ 25 fps | 3.0×3.0 | normal | 164 KB / 2.7 MB | BY-NC-SA |
| `shatter` | Shatter | sheet | 47 @ 19.71 fps | 4.0×4.0 | normal | 429 KB / 10.8 MB | BY-NC-SA |
| `darkness` | Darkness | sheet | 24 @ 4.8 fps loop | 6.0×6.0 | normal | 159 KB / 5.5 MB | BY-NC-SA |
| `fog-cloud` | Fog Cloud | sheet | 16 @ 3.17 fps loop | 8.0×8.0 | normal | 274 KB / 7.0 MB | BY-NC-SA |
| `cloudkill` | Cloudkill | sheet | 24 @ 8 fps loop | 7.7×7.8 | normal | 391 KB / 6.0 MB | BY-NC-SA |
| `black-tentacles` | Evard's Black Tentacles | sheet | 48 @ 9.6 fps loop | 4.2×4.3 | normal | 713 KB / 5.5 MB | BY-NC-SA |
| `plant-growth` | Plant Growth ring | sheet | 24 @ 5.94 fps loop | 4.8×4.9 | normal | 449 KB / 5.2 MB | BY-NC-SA |
| `call-lightning` | Call Lightning | sheet | 48 @ 11.75 fps | 4.0×4.0 | normal | 400 KB / 10.6 MB | BY-NC-SA |
| `ice-spikes` | Ice spikes burst | sheet | 36 @ 11.87 fps loop | 4.5×4.7 | normal | 654 KB / 6.6 MB | BY-NC-SA |
| `wall-of-fire-line` | Wall of Fire (5 squares) | sheet | 48 @ 12 fps loop | 5.0×0.5 | normal | 256 KB / 1.5 MB | BY-NC-SA |
| `wall-of-fire-ring` | Wall of Fire (ring) | sheet | 48 @ 12 fps loop | 4.0×4.0 | normal | 436 KB / 6.8 MB | BY-NC-SA |
| `wall-of-force` | Wall of Force (dome) | sheet | 48 @ 11.88 fps loop | 4.0×4.0 | normal | 547 KB / 6.8 MB | BY-NC-SA |
| `eruption` | Eruption | sheet | 48 @ 5.3 fps | 3.8×3.8 | normal | 623 KB / 9.7 MB | BY-NC-SA |
| `lightning-bolt` | Lightning Bolt | sheet | 48 @ 13.18 fps | 20.0×1.0 | normal | 419 KB / 2.6 MB | BY-NC-SA |
| `fire-bolt` | Fire Bolt | sheet | 29 @ 19.09 fps | 6.7×1.4 | normal | 90 KB / 3.5 MB | BY-NC-SA |
| `ray-of-frost` | Ray of Frost | sheet | 37 @ 19.29 fps | 7.1×1.5 | normal | 387 KB / 5.2 MB | BY-NC-SA |
| `eldritch-blast` | Eldritch Blast | sheet | 48 @ 13.06 fps | 7.9×2.0 | normal | 449 KB / 9.5 MB | BY-NC-SA |
| `magic-missile` | Magic Missile (one dart) | sheet | 33 @ 19.59 fps | 6.7×1.3 | normal | 103 KB / 3.7 MB | BY-NC-SA |
| `gust-of-wind` | Gust of Wind (line) | sheet | 24 @ 5.95 fps loop | 12.0×2.0 | normal | 285 KB / 4.2 MB | BY-NC-SA |
| `scorched-earth` | Scorched earth | sheet | 24 @ 3.84 fps loop | 5.9×6.0 | normal | 274 KB / 5.5 MB | BY-NC-SA |
| `ward-rune` | Glyph of Warding (animated) | sheet | 48 @ 8 fps loop | 2.5×2.4 | normal | 560 KB / 4.3 MB | BY-NC-SA |
| `school-circle-abjuration` | Magic circle — abjuration (JB2A) | texture | 1 tex + motion | 7.8×7.8 | normal | 210 KB / 1.0 MB | BY-NC-SA |
| `school-circle-conjuration` | Magic circle — conjuration (JB2A) | texture | 1 tex + motion | 7.9×7.9 | normal | 198 KB / 1.0 MB | BY-NC-SA |
| `school-circle-divination` | Magic circle — divination (JB2A) | texture | 1 tex + motion | 8.0×8.0 | normal | 184 KB / 1.0 MB | BY-NC-SA |
| `school-circle-enchantment` | Magic circle — enchantment (JB2A) | texture | 1 tex + motion | 8.0×8.0 | normal | 194 KB / 1.0 MB | BY-NC-SA |
| `school-circle-evocation` | Magic circle — evocation (JB2A) | texture | 1 tex + motion | 8.0×8.0 | normal | 207 KB / 1.0 MB | BY-NC-SA |
| `school-circle-illusion` | Magic circle — illusion (JB2A) | texture | 1 tex + motion | 8.0×8.0 | normal | 224 KB / 1.0 MB | BY-NC-SA |
| `school-circle-necromancy` | Magic circle — necromancy (JB2A) | texture | 1 tex + motion | 8.0×8.0 | normal | 204 KB / 1.0 MB | BY-NC-SA |
| `school-circle-transmutation` | Magic circle — transmutation (JB2A) | texture | 1 tex + motion | 8.0×8.0 | normal | 191 KB / 1.0 MB | BY-NC-SA |
| `circle-summoning` | Magic circle — summoning circle | texture | 1 tex + motion | 9.0×9.0 | add | 220 KB / 1.0 MB | own (Gemini) |
| `circle-ward` | Magic circle — warding circle | texture | 1 tex + motion | 9.0×9.0 | add | 265 KB / 1.0 MB | own (Gemini) |
| `circle-teleport` | Magic circle — teleportation circle | texture | 1 tex + motion | 9.0×9.0 | add | 270 KB / 1.0 MB | own (Gemini) |
| `circle-counterspell` | Magic circle — counterspell sigil | texture | 1 tex + motion | 8.6×8.5 | add | 252 KB / 1.0 MB | own (Gemini) |
| `circle-necromantic` | Magic circle — necromantic binding circle | texture | 1 tex + motion | 9.0×9.0 | add | 276 KB / 1.0 MB | own (Gemini) |
| `circle-celestial` | Magic circle — celestial circle | texture | 1 tex + motion | 9.0×9.0 | add | 224 KB / 1.0 MB | own (Gemini) |
| `circle-druidic` | Magic circle — druidic circle | texture | 1 tex + motion | 8.6×8.6 | add | 284 KB / 1.0 MB | own (Gemini) |
| `circle-infernal` | Magic circle — infernal pact circle | texture | 1 tex + motion | 9.0×9.0 | add | 238 KB / 1.0 MB | own (Gemini) |
| `circle-arcane` | Magic circle — arcane circle (simple) | texture | 1 tex + motion | 9.0×9.0 | add | 174 KB / 1.0 MB | own (Gemini) |
| `web` | Spider web | texture | 1 tex + motion | 5.0×5.0 | normal | 210 KB / 1.0 MB | own (Gemini) |
| `vines` | Entangling vines | texture | 1 tex + motion | 4.4×4.5 | normal | 172 KB / 1.0 MB | own (Gemini) |
| `spike-growth` | Spike Growth | texture | 1 tex + motion | 4.6×4.5 | normal | 101 KB / 1.0 MB | own (Gemini) |
| `frost-patch` | Frost / ice patch | texture | 1 tex + motion | 3.8×3.7 | normal | 100 KB / 1.0 MB | own (Gemini) |
| `acid-pool` | Acid pool | texture | 1 tex + motion | 2.6×2.5 | normal | 52 KB / 0.6 MB | own (Gemini) |
| `hunger-of-hadar` | Hunger of Hadar | texture | 1 tex + motion | 5.9×5.9 | normal | 35 KB / 1.0 MB | own (Gemini) |
| `magic-circle-indicator` | Magic circle indicator (layered) | layers | 7 layers | 3.8×3.8 | add | 32 KB / 1.2 MB | own |
| `summoning-circle-green` | Summoning circle — green (johndh) | texture | 1 tex + motion | 4.0×4.0 | add | 49 KB / 0.3 MB | BY 3.0 |
| `summoning-circle-red` | Summoning circle — red (johndh) | texture | 1 tex + motion | 4.0×4.0 | add | 40 KB / 0.3 MB | BY 3.0 |
| `smoke-cloud` | Smoke cloud | sheet | 48 @ 11.25 fps loop | 4.0×4.0 | normal | 373 KB / 6.8 MB | CC0 |
| `poison-cloud` | Poison cloud | sheet | 48 @ 11.25 fps loop | 4.0×4.0 | normal | 352 KB / 6.8 MB | CC0 |
| `holy-light` | Radiant light | texture | 1 tex + motion | 4.0×4.0 | add | 19 KB / 0.3 MB | CC0 |
| `moonlight-pool` | Moonlight pool | texture | 1 tex + motion | 4.0×4.0 | add | 19 KB / 0.3 MB | CC0 |
| `rune-motes` | Rising rune motes | particles | 4 tex | map | add | 20 KB / 0.1 MB | own (Gemini) |

### point (25)

| id | name | technique | frames | size (squares) | blend | disk / GPU | licence |
|---|---|---|---|---|---|---|---|
| `misty-step` | Misty Step (teleport) | sheet | 48 @ 18.31 fps | 2.0×2.0 | normal | 308 KB / 2.7 MB | BY-NC-SA |
| `cure-wounds` | Cure Wounds | sheet | 48 @ 18.8 fps | 1.8×1.8 | normal | 267 KB / 2.5 MB | BY-NC-SA |
| `sacred-flame` | Sacred Flame | sheet | 48 @ 9.46 fps | 1.9×1.8 | normal | 161 KB / 2.4 MB | BY-NC-SA |
| `toll-the-dead` | Toll the Dead | sheet | 48 @ 14.1 fps | 2.0×2.0 | normal | 235 KB / 2.7 MB | BY-NC-SA |
| `lightning-strike` | Lightning strike | sheet | 21 @ 19.2 fps | 2.1×2.6 | normal | 72 KB / 2.4 MB | BY-NC-SA |
| `explosion-arcane` | Arcane burst | sheet | 16 @ 23.68 fps | 2.0×1.9 | normal | 83 KB / 0.8 MB | BY-NC-SA |
| `impact-hit` | Hit impact | sheet | 15 @ 28 fps | 1.4×1.4 | normal | 51 KB / 0.4 MB | BY-NC-SA |
| `claw-slash` | Claw slash | sheet | 16 @ 21.43 fps | 0.8×0.8 | normal | 21 KB / 0.1 MB | BY-NC-SA |
| `ground-crack-impact` | Ground slam | sheet | 48 @ 9.79 fps | 3.0×2.9 | normal | 364 KB / 5.3 MB | BY-NC-SA |
| `frost-impact` | Frost impact | sheet | 48 @ 8.76 fps | 2.7×2.8 | normal | 697 KB / 4.8 MB | BY-NC-SA |
| `blood-splash` | Blood splash (hit) | sheet | 16 @ 26.47 fps | 1.8×1.7 | normal | 52 KB / 0.6 MB | BY-NC-SA |
| `dancing-lights` | Dancing Lights | sheet | 48 @ 12 fps loop | 0.9×0.9 | normal | 88 KB / 0.8 MB | BY-NC-SA |
| `glint` | Glints (loot) | sheet | 48 @ 10.38 fps loop | 1.0×0.9 | add | 39 KB / 0.9 MB | BY-NC-SA |
| `glyph-of-warding` | Glyph of Warding | texture | 1 tex + motion | 2.9×3.0 | add | 59 KB / 0.3 MB | own (Gemini) |
| `runes-arcane` | Arcane runes (16 variants) | set | 16 variants | 1.2×1.2 | add | 56 KB / 0.3 MB | own (Gemini) |
| `runes-ember` | Dwarven fire runes (16 variants) | set | 16 variants | 1.1×1.2 | add | 46 KB / 0.3 MB | own (Gemini) |
| `blood-stains` | Blood stains (4 variants) | set | 4 variants | 0.8×0.9 | normal | 7 KB / 0.0 MB | own (Gemini) |
| `scorch-marks` | Scorch marks (4 variants) | set | 4 variants | 2.2×2.2 | normal | 32 KB / 0.2 MB | own (Gemini) |
| `explosion-smoky` | Explosion (fire and smoke) | sheet | 25 @ 14.4 fps | 5.0×5.0 | normal | 418 KB / 8.7 MB | CC0 |
| `explosion-fiery` | Explosion (small, fiery) | sheet | 25 @ 14.4 fps | 2.8×3.0 | normal | 160 KB / 3.8 MB | CC0 |
| `dust-burst` | Dust burst | sheet | 25 @ 14.4 fps | 4.0×3.9 | normal | 271 KB / 5.3 MB | CC0 |
| `fire-orb` | Fire orb (flaming sphere) | sheet | 43 @ 16.12 fps loop | 1.8×1.8 | add | 214 KB / 2.5 MB | CC0 |
| `shockwave-ring` | Shockwave ring | texture | 1 tex + motion | 3.8×3.8 | add | 19 KB / 0.3 MB | CC0 |
| `explosion-puffs` | Explosion (puffs, CC0) | particles | 4 tex | map | normal | 24 KB / 0.2 MB | CC0 |
| `hit-sparks` | Hit sparks | particles | 1 tex | map | add | 3 KB / 0.0 MB | CC0 |

### aura (17)

| id | name | technique | frames | size (squares) | blend | disk / GPU | licence |
|---|---|---|---|---|---|---|---|
| `spirit-guardians` | Spirit Guardians | sheet | 24 @ 3.97 fps loop | 6.0×6.0 | normal | 1095 KB / 5.5 MB | BY-NC-SA |
| `healing-aura` | Healing aura | sheet | 28 @ 11.83 fps loop | 2.9×3.0 | normal | 380 KB / 4.0 MB | BY-NC-SA |
| `aura-arcane` | Aura — arcane | sheet | 44 @ 12 fps loop | 3.0×3.0 | normal | 446 KB / 5.4 MB | BY-NC-SA |
| `aura-frost` | Aura — frost orbit | sheet | 48 @ 12.1 fps loop | 2.8×2.7 | normal | 685 KB / 4.9 MB | BY-NC-SA |
| `token-ring` | Turn ring (spinning) | sheet | 48 @ 12 fps loop | 1.4×1.4 | normal | 179 KB / 1.3 MB | BY-NC-SA |
| `bless` | Bless | sheet | 48 @ 7.94 fps loop | 2.0×1.9 | normal | 324 KB / 2.6 MB | BY-NC-SA |
| `hunters-mark` | Hunter's Mark | sheet | 48 @ 12 fps loop | 1.5×1.5 | normal | 200 KB / 1.4 MB | BY-NC-SA |
| `shield` | Shield | sheet | 48 @ 11.9 fps loop | 2.0×2.0 | normal | 268 KB / 2.7 MB | BY-NC-SA |
| `swirling-leaves` | Swirling leaves | sheet | 48 @ 9.6 fps loop | 2.8×2.8 | normal | 122 KB / 5.0 MB | BY-NC-SA |
| `restrained-chains` | Restrained (chains) | sheet | 48 @ 9.6 fps loop | 1.9×1.9 | normal | 296 KB / 2.5 MB | BY-NC-SA |
| `marker-poisoned` | Poisoned | sheet | 48 @ 7.94 fps loop | 1.7×1.7 | normal | 271 KB / 2.4 MB | BY-NC-SA |
| `marker-frightened` | Frightened | sheet | 48 @ 7.94 fps loop | 1.8×1.9 | normal | 228 KB / 2.6 MB | BY-NC-SA |
| `marker-stunned` | Stunned | sheet | 48 @ 7.94 fps loop | 1.8×1.8 | normal | 270 KB / 2.3 MB | BY-NC-SA |
| `spirit-ring` | Spectral guardians ring | texture | 1 tex + motion | 6.5×6.5 | add | 181 KB / 1.0 MB | own (Gemini) |
| `vortex-ring` | Spiral vortex ring | sheet | 31 @ 16.18 fps loop | 1.9×1.8 | add | 149 KB / 1.6 MB | Lottie SL |
| `arcane-sigil` | Arcane sigil (pentagon) | texture | 1 tex + motion | 2.0×2.1 | add | 25 KB / 0.3 MB | CC0 |
| `healing-motes` | Healing motes | particles | 1 tex | map | add | 3 KB / 0.0 MB | CC0 |

### map-loop (33)

| id | name | technique | frames | size (squares) | blend | disk / GPU | licence |
|---|---|---|---|---|---|---|---|
| `campfire` | Campfire | sheet | 48 @ 9.6 fps loop | 2.0×2.0 | normal | 282 KB / 2.6 MB | BY-NC-SA |
| `bonfire` | Bonfire | sheet | 48 @ 9.66 fps loop | 3.0×3.0 | normal | 480 KB / 5.4 MB | BY-NC-SA |
| `flames-patch` | Burning ground | sheet | 48 @ 9.66 fps loop | 1.7×1.5 | normal | 205 KB / 2.0 MB | BY-NC-SA |
| `lava-cracks` | Glowing lava cracks | sheet | 32 @ 12 fps loop | 3.9×4.0 | normal | 742 KB / 6.8 MB | BY-NC-SA |
| `water-splash` | Waterfall foot / splash | sheet | 48 @ 9.22 fps loop | 2.9×2.9 | normal | 592 KB / 5.0 MB | BY-NC-SA |
| `bubbles` | Bubbles (swamp, cauldron) | sheet | 24 @ 12 fps loop | 1.9×1.9 | normal | 86 KB / 1.7 MB | BY-NC-SA |
| `steam-vent` | Steam vent | sheet | 48 @ 7.94 fps loop | 1.9×2.0 | normal | 195 KB / 2.6 MB | BY-NC-SA |
| `fog-patch` | Fog bank (patch) | sheet | 24 @ 8.11 fps loop | 7.0×7.5 | normal | 316 KB / 5.8 MB | BY-NC-SA |
| `fireflies` | Fireflies | sheet | 48 @ 6 fps loop | 3.8×4.0 | add | 267 KB / 5.7 MB | BY-NC-SA |
| `portal` | Portal (golden) | sheet | 48 @ 5.97 fps loop | 1.8×1.7 | normal | 193 KB / 2.3 MB | BY-NC-SA |
| `web-corner` | Corner cobweb | texture | 1 tex + motion | 3.5×3.5 | normal | 83 KB / 0.6 MB | own (Gemini) |
| `portal-swirl` | Portal swirl | texture | 1 tex + motion | 3.0×3.0 | add | 116 KB / 0.6 MB | own (Gemini) |
| `campfire-base` | Campfire stones and embers (base) | texture | 1 tex + motion | 1.7×1.6 | normal | 33 KB / 0.3 MB | own (Gemini) |
| `brazier-base` | Iron brazier (base) | texture | 1 tex + motion | 1.2×1.2 | normal | 22 KB / 0.1 MB | own (Gemini) |
| `flame-large` | Flame (large, side view) | sheet | 43 @ 16.12 fps loop | 1.9×3.8 | add | 289 KB / 5.0 MB | CC0 |
| `flame-small` | Flame (torch) | sheet | 43 @ 16.12 fps loop | 1.0×1.8 | add | 140 KB / 1.6 MB | CC0 |
| `flame-candle` | Flame (candle) | sheet | 43 @ 16.12 fps loop | 0.5×0.9 | add | 41 KB / 0.2 MB | CC0 |
| `flame-green` | Flame (green, fel / necrotic) | sheet | 48 @ 14.4 fps loop | 1.7×2.8 | add | 253 KB / 3.7 MB | CC0 |
| `flame-blue` | Flame (blue, spectral / holy) | sheet | 48 @ 14.4 fps loop | 1.7×2.8 | add | 256 KB / 3.7 MB | CC0 |
| `smoke-wisp` | Smoke wisps | sheet | 48 @ 11.25 fps loop | 1.8×1.8 | normal | 220 KB / 2.4 MB | CC0 |
| `candle-smoke` | Candle smoke | sheet | 47 @ 14.1 fps loop | 0.5×1.0 | normal | 44 KB / 0.3 MB | CC0 |
| `torch-glow` | Torch light (flickering glow) | texture | 1 tex + motion | 5.0×5.0 | add | 9 KB / 0.3 MB | CC0 |
| `candle-glow` | Candle light | texture | 1 tex + motion | 2.5×2.5 | add | 5 KB / 0.1 MB | CC0 |
| `embers-rising` | Embers rising (from a fire) | particles | 1 tex | map | add | 3 KB / 0.0 MB | CC0 |
| `sparkle-area` | Treasure sparkle (area) | particles | 1 tex | map | add | 4 KB / 0.0 MB | CC0 |
| `fireflies-cc0` | Fireflies (CC0) | particles | 1 tex | map | add | 3 KB / 0.0 MB | CC0 |
| `smoke-column` | Smoke column (CC0) | particles | 3 tex | map | normal | 13 KB / 0.1 MB | CC0 |
| `water-pool` | Water (flowing pool / river) | shader | water-flow.frag | map | normal | 32 KB / 1.0 MB | own (Gemini) |
| `lava-pool` | Lava (flowing) | shader | lava-flow.frag | map | normal | 91 KB / 1.0 MB | own (Gemini) |
| `campfire-cc0` | Campfire (CC0 + generated) | composite | torch-glow + campfire-base + flame-small… | 2.0×2.0 | normal | 4 KB / 0.0 MB | own |
| `brazier` | Brazier (CC0 + generated) | composite | torch-glow + brazier-base + flame-small… | 1.3×1.3 | normal | 3 KB / 0.0 MB | own |
| `wall-torch` | Torch (flame + light) | composite | torch-glow + flame-small | 1.0×1.0 | normal | 2 KB / 0.0 MB | own |
| `candle` | Candle (flame + light) | composite | candle-glow + flame-candle | 0.5×0.5 | normal | 2 KB / 0.0 MB | own |

<!-- catalogue:end -->
