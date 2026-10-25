# effects

The effects runtime (work package 7): plays the effects library (`v2/assets/effects/`, served as
`/app/effects/`) on the table. The renderer creates it on its slots and feeds it the state:

```ts
const fx = createEffectsRuntime(slots, { profile, scheduler, log });
fx.update(map.effects, state.live.shots, Date.now());   // on every state change
```

| File | Job |
|---|---|
| `runtime.ts` | the seam: diffing, loading, parenting into slots / token containers, the frame clock (`onRender` of a node per slot), the render lease, quality + degrade, stats |
| `registry.ts` · `cache.ts` | `index.json` and manifests on first use; textures ref-counted, kept in an LRU within a byte budget (64 MB TV, 96 MB companion) |
| `diff.ts` | lasting effects start/change/stop; one-shots play once per id, stale ones (older than their length + 1.5 s) are skipped |
| `anchors.ts` | anchor → placement in squares; circle / cone / line / cube polygons (`params.shape` tells the art how to fit) |
| `budget.ts` | cost estimates from manifests; the frame governor (slow frames → degrade level 1–2: fewer particles, slower flipbooks, no crossfade, smaller filters, no sprite band shaders) |
| `motion.ts` · `particle-sim.ts` | pure maths of motion recipes, flipbook frames and particles (typed arrays, seeded, no per-frame allocation) |
| `shaders.ts` | library GLSL → Pixi filters with `uTime`, `uSquarePx`, `uMapOrigin` and manifest uniforms (params named `u…` override) |
| `instances/` | one file per technique: `sheet` (sheet, set, layers), `texture`, `particles`, `shader` (filter on the map / mask on a shape), `create` (factory + composite), `screen` (built-in `screen-shake`, `screen-flash`) |
| `bench.ts` | `effectsBenchScenes` for the renderer's bench page |
| `demo/` | development only: a stage with the runtime (`/app/src/lib/effects/demo/index.html?scene=heavy`), `shoot.mjs` (screenshots + timing), `bench-run.mjs` (the renderer bench's effect scenes) |

**Params** every effect understands: `shape`, `scale`, `size` (squares across), `rotation` (deg),
`toX`/`toY` (beam target), `opacity`, `speed`, `color` (tint), `variant` (sets), `intensity`
(particle rate), `layer` (`ground`/`air`), `radius` (mask shapes at a point), `light` (radius of a
torch's pool under the `night` shader), any `u…` shader uniform.

**Rules the runtime keeps:** idle = no lease (still decals cost 0 frames); weather filters sit on
the renderer's `filterTarget` (the map) and are counted — more than one raises the degrade level;
an aura lives in its token's container and is gone while the token isn't drawn; placed one-shots
replay after a 1 s pause; shots made while effects are off never replay.

Tests: `app/test/effects/` (logic + the runtime against the library on disk, every effect instantiated headless).
