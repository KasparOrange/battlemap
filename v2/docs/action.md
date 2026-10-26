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
| 3 | W3-A core/TV/harness · W3-B1 companion game + map tabs · W3-B2 companion frame, library, dialogs, settings, developer screen · W3-C renderer, effects runtime, import, torch glow · W3-D Effects tab · W3-E shell, embedded Rust server, LAN play, VPS switch to Rust | done (545 unit tests; LAN play on the emulators; production on the Rust server) |
| 4 | W4-Q regression (unit 584/0, e2e Rust 77/79, soak 0 lost on Rust, LAN ok) · W4-C companion fixes, "Tables nearby" picker, import after confirm, looping previews, visual pass · W4-T TV LAN join code + QR, label turning, grid contrast · W4-F curtain + scene presets | done |
| 5 | W5-P start-up + import speed, e2e on Rust by default, flaky flows · W5-1 fog-honest thumbnails, reveal animations, prepared reveal areas, secret doors + traps · W5-2 spotlight, TV timer, handouts, DM notes · W5-3 sound library + soundscapes · W5-4 v1 import, PDF page picker, players' view, installable companion | cut off by the usage limit 2026-10-25 21:45; restarted 2026-10-26 00:30 as five fresh helpers that read the old transcripts, judge the plan, commit the inherited work and finish |

## Next

1. **Wave 3 — finish and fix** (about five helpers at a time, fresh, from `qa.md` + `review.md`):
   renderer finish + bench on the emulators; companion 4a/4b gaps; effects in the companion
   (cast an effect at a spot or area, weather, map loops); bug fixes by area; a second review;
   **the server in Rust** (roadmap N13: one binary for the VPS and the TV box's shell, the Bun
   server's tests as the contract, wire types generated from one source).
2. **Wave 4 — polish:** a UI pass against `design.md` with screenshots on tablet, phone and TV.
3. **Wave 5 — roadmap** (`roadmap.md` tiers): curtain + scene presets, lighting from walls,
   ambient sound, LAN play through the shell, v1 games import.

## Wave 3 leftovers (collected from the reports, for wave 4)

- import: upload only after the squares dialog is confirmed (W3-B2 request; W3-C done).
- Effects browser: small looping previews instead of stills.
- Bench run on the emulator and, when reachable, the box.
- **Spoiler:** game thumbnails on the TV home and library show the whole unfogged map to the players — fog-honest thumbnails (roadmap S24) or none on the TV.
- Reveal animations (roadmap S4) — not started (W4-T stopped near its budget).
- renderer: the first fit on a phone uses a too-small host size (the companion refits after the first draw as a workaround).
- companion table picker: list `discoverLanTables()` when `canDiscoverLan()`, else a code field (`decodeLanCode` → `joinTable`); run `checkServerChoice()` once after the companion boots (W3-E's LAN API in `config.ts`).
- e2e: the full run against the Rust server: 23 of 25 failures pass with emulators off and one worker; two app-timing failures left.
- e2e: a game-night run wrote under another helper's ports (6411/6412) — check the harness respects `BATTLEMAP_*_PORT`.

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
