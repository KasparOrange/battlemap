# battlemap v2 — live work

The orchestrating session's plan. Done waves live in `archive.md`; this file holds only what is open.

## Where we are (2026-10-26)

Waves 1–5 are done (history in `archive.md`): parity with v1 plus curtain, scenes, effects,
LAN play, Rust server in production, fog reveals and secrets, table moments, sound, players' view,
installable companion, v1 import. Nothing has run on the real box and tablet yet.

## Next

1. **Fix the wave-5 leftovers** below — qa#36 first (it breaks the tablet's Undo/Redo).
2. **Real devices at Juri's:** the WebView gate (roadmap N1) and the table test (N4) decide plan B.
3. **Roadmap** — the open items of `roadmap.md` (light from walls S5, select a token by tapping N10,
   several-maps gaps N9, prep mode S17, …), a few helpers at a time, from short exact briefs.

## Wave 5 leftovers

- **qa#36 (major):** the rail's 11 tabs (Moments, Secrets, Sound added) push Undo/Redo off a 1280 × 800 tablet; 3 companion-game-flow tests fail on it.
- TV save on page hide/reload doesn't await the storage write — the last ~2 s before a reload can be lost (`tv/games.ts`).
- Sound: one-shot pads have no volume of their own.
- Players' view and installable companion: never tried on real phones; sound, moments, secrets never on the real box.
- e2e: a game-night run once wrote under another helper's ports (6411/6412) — check the harness respects `BATTLEMAP_*_PORT` (from wave 3).

## Plan B for the TV renderer

Only if the real box fails the WebView gate (roadmap N1), and only after the two cheap steps of
roadmap N14 (Pixi's WebGPU backend, a lower table resolution) didn't save it. Then the TV side
moves to a native renderer in Rust, drawing into a native surface under a transparent web view;
the web app keeps networking, state, storage and menus and sends scene changes over the shell.
WebGPU alone is not plan B: it keeps every browser cost and only makes draw calls cheaper.

The generic engine exists; what we write is battlemap's scene on top of it (map tiles, fog shader,
grid, tokens, doors, drawings, ruler, template disc, effects — the Pixi renderer's list again)
plus the bridge. Two candidates (Konrad 26-10-25: Bevy):

| | **Bevy** (recommended) | **Macroquad** |
|---|---|---|
| What it is | full Rust game engine on wgpu, large community | small Rust game library on miniquad, mostly one maintainer |
| Graphics on the box | Vulkan or OpenGL ES via wgpu | OpenGL ES 2/3 |
| Companion DM view | same code as WebAssembly on WebGPU or WebGL2 | same code as WebAssembly on WebGL |
| Built in | sprites, 2D cameras, custom WGSL shaders, text, asset loading, ECS | sprites, simple shaders (GLSL), basic text; we write batching, tiling, the effect layer |
| Expect | Pixi-equivalent features, modern shaders incl. compute | the most headroom on 2 GB: tiny binary, fast start, least memory |
| Cost | pre-1.0: a breaking release every few months to migrate; larger binary, slower builds, more memory than Macroquad (still far below a WebView) | more hand-built code; no compute shaders; bus factor of one |
| Shared cost | port the scene (≈ the wave-2 renderer work again); both expect to own the Android activity, so drawing under a transparent web view in our Kotlin shell needs custom glue | |

## Waiting on the real devices

The Xiaomi box and the Tab A11+ stand at Juri's (Tailscale `battlemap-table`, offline on
2026-10-25). The WebGL gate (probe ≥ 50 fps avg, 1 % low ≥ 30) and the bench can only be decided
there — `shell.md` has the one-line command.

## Open for Konrad

- Production (`battlemap.srv1189697.hstgr.cloud`) runs on the Rust server since 2026-10-25;
  switch back with `server-rs/switch.sh to-bun`. At Juri's: the nine steps in `shell.md` "At Juri's".

- Old v1 services on the VPS (dev_server 4242, relay 9090) don't start by themselves after a
  reboot (they were down since 2026-10-16 until the server helper restarted them).
- About half the effects (JB2A free set) are CC BY-NC-SA: fine for the table, not for a sale.
- Remove `~/.config/battlemap/gemini.key` when the v2 work ends (or rotate the key).
