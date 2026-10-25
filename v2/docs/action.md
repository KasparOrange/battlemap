# battlemap v2 — live work

The orchestrating session's plan. Done waves move to `archive.md` when it exists; this file
holds only what is open.

## Where we are (2026-10-25 evening)

| Wave | What | State |
|---|---|---|
| 1 | architecture + shared + scaffold, parity inventory + roadmap, fluent kit, effects library (150), Android shell + WebGL probe | done |
| 2 | server (live: `https://battlemap.srv1189697.hstgr.cloud/app/`), storage + API, map import, TV mode | done |
| 2 | renderer, companion game/tools (4a), companion library/tabs (4b), effects runtime, QA harness | ~80–90 %, cut off by the session limit; work committed (`33b2d8a`) |
| 2.5 | integration pass (test hook; e2e 44 pass / 8 fail; soak 2,900 commands converge; 25 bugs in `qa.md`) + code review (0 blockers, 8 major in `review.md`) + Rust server (contract 72/72, VPS port 5930 side by side) | done |
| 3 | W3-A core/TV/harness · W3-B1 companion game + map tabs · W3-B2 companion frame, library, dialogs, settings, developer screen · W3-C renderer, effects runtime, import, torch glow · W3-D Effects tab · W3-E shell, embedded Rust server, LAN play, VPS switch to Rust | running (ownership in each brief; camera + hit tests owned by the renderer) |

## Next

1. **Wave 3 — finish and fix** (about five helpers at a time, fresh, from `qa.md` + `review.md`):
   renderer finish + bench on the emulators; companion 4a/4b gaps; effects in the companion
   (cast an effect at a spot or area, weather, map loops); bug fixes by area; a second review;
   **the server in Rust** (roadmap N13: one binary for the VPS and the TV box's shell, the Bun
   server's tests as the contract, wire types generated from one source).
2. **Wave 4 — polish:** a UI pass against `design.md` with screenshots on tablet, phone and TV.
3. **Wave 5 — roadmap** (`roadmap.md` tiers): curtain + scene presets, lighting from walls,
   ambient sound, LAN play through the shell, v1 games import.

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

- Old v1 services on the VPS (dev_server 4242, relay 9090) don't start by themselves after a
  reboot (they were down since 2026-10-16 until the server helper restarted them).
- About half the effects (JB2A free set) are CC BY-NC-SA: fine for the table, not for a sale.
- Remove `~/.config/battlemap/gemini.key` when the v2 work ends (or rotate the key).
