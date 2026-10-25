# battlemap v2 — QA

How v2 is checked, what passes today, what fails (with where), and how to run everything on
the emulators and the real devices. Work package 8 (`architecture.md` "work packages").
Status as of **2026-10-25 evening** (wave 4 QA, tree `a6989ef`).

## Open (W4 QA, 2026-10-25)

No blocker. Majors: none open in the app — but the **Bun fallback server** still lacks five
review fixes the Rust server has (rv#5 pixel bomb, rv#7 body cap, rv#26 parallel fetches, rv#27
ids, rv#30 version slots): switching production back with `switch.sh to-bun` brings them back.

1. **qa#11 TV start** — reload → first frame with the map: Chromium 0.6–3.9 s, the TV emulator
   2.9–6.0 s (median ~4.5 s, budget 2 s); the marks say script ~0.7 s, map load + upload 1–2 s
   (load 25–38 on the Mac — measure on the box).
2. **#26 companion first view** — b2d0d2e fixed the reopen hang, but a companion page's *first*
   WebGL view still blocks its main thread for 13–20 s under SwiftShader (one flow per run fails
   with companions `busy`); check on a real tablet before acting.
3. **#28 PDF import long tasks** 55–143 (budget 50) in every run — pdf.js on the main thread.
4. **#27 lost commands on the Bun server** — `map.add` + the next undo timed out in the soak; Rust none.
5. **#31 companion e2e files run serial** — one slow start skips the file's other flows.
6. **#34 / #35 flaky flows under load** — tv-mode reload's `frame` mark, the box-reset flow (both
   pass alone on Bun and Rust).
7. Polish: #30 broken thumbnails on a LAN table without upstream, #32 table server start 3–4 s on the
   emulator.

Counts: bugs 1–25 → 23 fixed, 1 decided (#25), 1 open (#11); new 26–35 → 3 fixed (#29, #33,
#26 mostly), 7 open. Review 1–38 → 32 fixed, 5 only in Rust, #36 half (`review.md`).

## What there is

| Piece | Where | What it does |
|---|---|---|
| protocol client | `e2e/support/proto.ts` | the real protocol over a WebSocket, no browser: hello/welcome, `sync.cmd` with the TV's verdict, `sync.request` → snapshot, requests (`lib.list`, `game.open`, …), a confirmed copy folded with the shared reducer (the convergence check), `drop()` = network loss |
| private servers | `e2e/support/server.ts` | a server per test on a free port with a temp `DATA_DIR`; `kill()` / `restart()` for outages; pages reach it with `?server=` |
| tables | `e2e/support/table.ts` | `openTable(browser)` → TV page (1920 × 1080) + companion pages (1340 × 800) + the bot on one fresh table; `waitSynced` (TV, bot and pages on the same rev, bot copy = snapshot); `tvState` (hook, else snapshot) |
| fixture maps | `e2e/support/maps.ts`, `png.ts` | the ten maps of the old set (same names, squares, door counts) as generated pictures + four-room geometry; `uploadMap` stores them via `POST /files` |
| capabilities | `e2e/support/caps.ts` | `needs(t, 'tvStorage', …)` marks a test `fixme` while its feature hasn't landed (narrow probes: a 404, the TV's literal "can't do … yet", a missing hook) |
| fixtures | `e2e/support/fixtures.ts` | `table`, `privateServer`, `privateTable`; on failure the bot's last messages and the server's output are attached to the report |
| harness self-test | `e2e/harness.e2e.ts` | the harness checks itself |
| the game night | `e2e/game-night.e2e.ts` | `../../docs/test-session.md` scenes 0–7 as 33 flows, one beat each on its own table |
| soak bot | `tools/bot.ts` | a scripted companion: hundreds of random valid commands, bursts, reconnects, optional TV reloads; checks convergence, prediction, offline rule, order; logs to MwLog |
| device deploy | `tools/deploy-devices.sh` | build app → shell APK with it → `adb install -r` → start in a mode, optionally on a dev URL / server |
| device bench | `tools/bench-run.ts` | the shell's WebGL probe + the app's `bench.html` inside the device's WebView, numbers as JSON |

Run (always on your own ports, never 5884/5929):

```bash
cd v2
BATTLEMAP_APP_PORT=6181 BATTLEMAP_SERVER_PORT=6182 bun run e2e                      # every flow
BATTLEMAP_APP_PORT=6181 BATTLEMAP_SERVER_PORT=6182 bun run e2e game-night harness   # QA's flows
BATTLEMAP_E2E_SERVER=rust BATTLEMAP_APP_PORT=6181 BATTLEMAP_SERVER_PORT=6182 bun run e2e  # every server on Rust
bun tools/bot.ts --server http://localhost:6182 --app http://localhost:6181/app/ --commands 500
```

`BATTLEMAP_E2E_SERVER=rust` runs the shared server and every private per-test server on the Rust
binary: the config builds `server-rs` once per run (`cargo build --release`, rustup's cargo) and
copies it to `$TMPDIR/claude-v2-e2e-rs-<server port>/battlemap-server`, so another helper's
rebuild can't swap it mid-run. The harness checks `/health` says the kind asked for.

Results: `test-results/e2e-report-<app port>.json`; traces of failures in
`test-results/e2e-<app port>/<test>/trace.zip` (`bunx playwright show-trace …`). The config
writes per app port, so parallel runs of other helpers don't clean each other's results.
Workers default to 2 (`BATTLEMAP_E2E_WORKERS`); protocol waits are 15 s, because the Mac ran at
load 50 while eight helpers built in parallel.

## The test hook

Implemented 2026-10-25 in `app/src/lib/debug-hook.ts` (see Results); the spec it follows:

The flows work without it (the bot reads the TV's state through `sync.snapshot`, pages through
their `*-status` debug lines), but three kinds of checks need it: the companion's own
prediction equal to the TV's state, an offline tap through the real `dispatch` once the
skeleton's buttons are gone, and the renderer's texture accounting (scene 7). Wanted on
`window.__battlemap` when the page runs with `?debug=1` (type: `BattlemapHook` in
`e2e/support/table.ts`), set in `App.svelte` / `sessions.svelte.ts`:

```ts
window.__battlemap = {
  mode: 'tv' | 'companion',
  client: config.clientId,
  connection: () => session.connection,          // 'open', 'connecting', 'replaced', …
  state: () => tv ? session.state : session.view, // RootState | null
  rev: () => session.rev,
  epoch: () => tv ? session.host.epoch : session.client.epoch,
  pending: () => session.client.pendingCount,     // companion
  dispatch: (cmd) => session.dispatch(cmd),       // companion
  request: (msg) => session.request(msg),         // companion (TV: session.send)
  notices: () => lastNotices,                     // the last ~20 {text, kind, at}
  render: () => renderer?.stats() ?? null,        // TV: {frames, textures, textureBytes}
};
```

## Results

### Wave 4 QA (2026-10-25 evening)

Clean worktree of `main` (other helpers' uncommitted edits left out — the shared checkout had 5
failing import tests and 33 svelte-check errors from W4-C's work in progress), Mac at load 25–38
from other sessions the whole time, ports 6501/6502.

| Suite | Result |
|---|---|
| `bun test` | **584 pass, 0 fail** (`a6989ef`; at `2cc74dc`: 538 pass, 10 skip) |
| `bun run check` | **0 errors, 0 warnings** (1427 files) |
| `bun run build` | ok — biggest gzip chunks `pdf` 129 KB, `render` 112 KB, `index` 94 KB, `effects` 30 KB; TV and companion are separate lazy chunks since b61f120 |
| `cargo test --release` (server-rs) | **32 pass** |
| server contract against Rust (`server-contract/run.ts --target rust`) | **79 pass, 0 fail**; graceful stop 18 ms, sockets closed with 1001 |
| `bun run e2e` on **Bun**, 2 workers (`a6989ef`) | **76 passed, 3 failed** (13.9 min): game-night L7 (companion `busy`, #26), tv-mode box reset (#35), PDF long tasks 117 (#28); the first two pass alone |
| `bun run e2e` on **Rust** (`BATTLEMAP_E2E_SERVER=rust`), 2 workers | **77 passed, 2 failed** (11.6 min): `harness-fixes` rv#4 (30 s test timeout — raised to 90 s), tv-mode reload's `frame` mark (#34); both pass alone |
| earlier the same day at `2cc74dc` | Bun 57 pass / 4 fail / 10 not run; Rust 64 / 8 — the multi-map companion hang (#26, fixed in b2d0d2e), tv-ctl resume (#29), load |
| soak bot on **Rust**, 2000 commands, TV reload every 400, seed 42 | 2900 sent, 2837 applied, 63 refused (all expected), **0 lost**, 0 convergence failures in 41 checks, 0 prediction mismatches, 0 offline leaks, 0 order violations, 16 reconnects, 4 TV reloads, rtt p50 0.7 / p95 20 ms, exit 0 |
| soak bot on **Bun**, same seed | 0 convergence failures in 41, 0 offline leaks, 0 order violations — but **2 commands lost** (`map.add` i = 35 + the next undo, timeout; #27), exit 1 |
| LAN flow on the emulators (shell.md "Table server") | `bm_tv` hosting with no upstream (configured server dead): table server listening ~3 s after start (#32), TV page joined `127.0.0.1:5930` 2 s later, `/api/upstream` offline; `bm_tablet` (shell, `server=http://10.0.2.2:15930` over `adb forward`) joined as companion; a game started on the box's server reached the tablet in 0.7 s; the tablet's **Fog ▸ Reveal all** (tapped through Playwright's Android WebView) applied on the TV after 85 ms; the soak bot through the box: 453 sent, 448 applied, 7/7 convergence, 0 failures, rtt p50 7 / p95 111 ms (`docs/qa/w4-lan-tv.jpg`, `w4-lan-tablet.jpg`) |
| qa#11 TV reload → first frame with the map | Chromium (e2e annotation): 3.9 s on Bun, 0.6 s on Rust (load varies); **TV emulator** (shell, box's own server, tavern map): 4.7, 3.6, 3.0, 4.3, 8.9 s on `2cc74dc`; 5.2, 4.9, 6.0, 4.3, 2.9, 3.1 s on `a6989ef` (median ~4.5 s). Marks on the emulator: script 0.7–0.9 s · booted 0.9–1.1 · map-loading 1.5–3.1 · map-shown 2.5–5.1 · frame 2.5–5.1 |

The harness option `BATTLEMAP_E2E_SERVER=rust` (a1f07fb) was used for the Rust row; the harness
asserts `/health` says the asked-for server.

**Fixes checked in the running app (8):** qa#2 (a Room tap in the real lair's top room fills 36 of
266 squares, was 264), qa#3 (26 in survives a TV reload), qa#18 (TV home shows `tableCode`, the raw
id nowhere), rv#1 (follow on in free view: 0 revisions in 5 s idle, was ~12/s), rv#4 (cloud fog on:
8–16 frames / 3 s, fog off: 0), rv#5 (Rust, defaults: a 5.9 KB PNG claiming 40000 × 40000 refused
400 "1600 megapixels" in 8 ms, RSS 16 MB), rv#7 (Rust: 202 MiB upload → 413 "over 200 MB", RSS
unchanged at 16 MB; 100 MB accepted), qa#6 (Rust soak: 0 lost around 4 TV reloads, was 9); plus the
e2e-covered qa#9, #12, #13, #15, #16 and #26's reopen flow. The first five live on as
`e2e/harness-fixes.e2e.ts`.

**Bench inside the TV emulator** (`tools/bench-run.ts`, debug APK of `2cc74dc`, GPU = the Mac's
through the emulator's GL translator — says it runs, not whether the box passes):

| probe | avg fps | 1 % low | frame ms p50 / p99 / max | pass |
|---|---|---|---|---|
| WebGL probe | 26.9 | 3.9 | 16.7 / 200 / 433 | no (emulator under load 30) |

| scene | fps avg | 1 % low | frame p95 ms | CPU avg / p95 ms | draw calls | idle frames after |
|---|---|---|---|---|---|---|
| no game | 32.6 | 6.8 | 75.3 | 0.55 / 1.7 | 0 | 0 |
| big map 8192² panned | 35.2 | 5.5 | 82.0 | 0.81 / 3.2 | 3 | 0 |
| fog painted 30 Hz | 55.9 | 19.5 | 31.6 | 0.33 / 0.8 | 3 | 0 |
| 60 tokens moving | 55.3 | 19.1 | 32.7 | 0.42 / 1.0 | 3 | 0 |
| 400 strokes + live stroke | 57.5 | 19.0 | 26.8 | 0.49 / 0.9 | 17 | 0 |
| map lights (80 torches) | 54.8 | 17.7 | 37.0 | 0.32 / 0.6 | 3 | 49 (flicker lease) |
| everything | 55.5 | 17.1 | 31.4 | 0.62 / 1.2 | 13 | 0 |
| fx torches + rain | 56.2 | 19.1 | 29.7 | 0.59 / 1.2 | 5 | 103 (loops) |
| fx fireballs + shake | 54.1 | 17.4 | 35.8 | 0.28 / 0.7 | 3 | 73 |
| fx cloudkill + guardians | 56.4 | 18.1 | 28.7 | 0.50 / 1.0 | 6 | 117 (loops) |
| fx everything heavy | 56.3 | 18.8 | 34.8 | 0.65 / 1.2 | 14 | 115 (loops) |
| fx still decals | 54.9 | 17.2 | 33.4 | 0.24 / 0.6 | 4 | 0 |

Against wave 2's run: `drawings` 31.6 → 57.5 fps, `fx:fireballs` 14.9 → 54.1 (CPU 5.0 → 0.3 ms),
`fx:decals` 15.6 → 54.9; the CPU side stays ≤ 0.8 ms avg in every scene. The first two scenes ran
while the emulator was still warming up. Heap 9.5 MB flat (WebView 113 has no live
`performance.memory`).

### Integration pass (wave 2.5, 2026-10-25)

Integration pass of **2026-10-25** (tree at `69e0b85` + this pass's commits), on the Mac under a
heavy load from other sessions (load average 30–95 the whole time).

| Suite | Result |
|---|---|
| `bun test` | **463 pass, 0 fail** (37 files, 59 s) |
| `bun run check` | **0 errors, 0 warnings** (shared, server, app: 1357 files) |
| `bun run build` | ok — biggest chunks `pdf` 129 KB gzip, `render` 105 KB, `index` 74 KB (TV boot well under the 1 MB budget); server bundle 122 KB |
| `bun run e2e`, run 1 (2 workers) | 20 passed, 35 failed, 3 not run — mostly "table did not sync" |
| `bun run e2e`, run 2 (1 worker) | 27 passed, 26 failed |
| `bun run e2e`, run 3 (1 worker, after the fixes below) | **44 passed, 8 failed, 4 skipped, 2 not run** (17 min) |
| soak bot (`tools/bot.ts`, 2000 commands, a TV reload every 400, seed 42) | 2900 sent, 2830 applied, **0 convergence failures in 41 checks, 0 prediction mismatches, 0 offline leaks, 0 order violations**, 16 reconnects, 4 TV reloads, rtt p50 0.7 ms / p95 43 ms — but 9 commands lost (timeout) around one TV reload (bug 6) → exit 1 |

What changed the e2e picture between run 2 and run 3 — two fixes in this pass:
- the companion's `tv.status` effect read and wrote `busy` → `effect_update_depth_exceeded` on every
  map load (game start, map switch, reopen), after which the companion's "Loading …" card stuck and the
  page stopped following (`companion-status` at rev 0 while the TV was at 4) — `CompanionApp.svelte:58`;
- the e2e protocol client sent no heartbeat, so the relay closed the bot as a zombie after 45 s of
  silence (`server/src/config.ts` `zombieMs`) and longer flows lost it — `e2e/support/proto.ts`.

Per file, run 3: companion-game-flow 6/6 (+1 debug skip) · companion-lib-flows 1 pass, 1 timeout, 2
skipped · game-night 25 pass, 5 fail, 3 fixme · harness 4/4 · import-worker 6/6 · smoke 0/1 · tv-mode 2/3.

Still failing in run 3 (each is a row below): game-night "circle radius 4 with preview first" and
"template disc" and "picture maps … refit" (table did not sync — not yet looked into, may be load),
"the library lists the game under the map on the table" (bug 9), "a box reset restores the game from
the server backup" (TV page never connected after the reset, 15 s); `smoke.e2e.ts` (bug 12);
`tv-mode` "every TV screen works with the D-pad" (bug 13); companion-lib "the calibration dialog
changes the TV table" (90 s timeout). The three game-night pixel flows stay `fixme` because their
probe (`tvDrawsMap`, `game-night.e2e.ts:75`) sees a flat TV under SwiftShader, though the TV does
draw the map (bug 14).

**The test hook** is in: `app/src/lib/debug-hook.ts` (`window.__battlemap` only with `?debug=1`;
both sessions attach in their constructors, TV mode adds the renderer's counters in
`tv/table-view.ts`, `App.svelte` records the notices). `render()` gives `{frames, textures,
textureBytes, detail}`.

**Used like a DM** (headless Chromium, TV 1920 × 1080 + tablet 1280 × 800 + phone 390 × 844, built app
against a private server): pairing from the table picker, upload of the vampire lair (game on the TV
< 1 s), token place + drag, fog brush / Room / Circle / Reveal all / Hide all / Preview first (TV
pixels unchanged until Apply), door tap, a stroke, measure line ("30 ft"), ruler and template disc,
a second and third map (each keeps its own fog/tokens; the 30 MB castle shows 5.5 s after "Add to
the game", 67 MB of textures), a DM layer (0 bytes on the TV), the calibration dialog with the
pattern, TV remote (back arrow after a key, Escape → library, Enter reopens in 81 ms), reload of
both pages (game identical after the TV reload). Logs from TV and companion arrive in MwLog (tenant
`battlemap`, app `battlemap-v2-ui`). Idle TV: 1 frame in 5 s. What broke is in the bug list;
screenshots in `docs/qa/`.

## Parity coverage

Which `parity.md` areas have a flow (G = `game-night.e2e.ts`, H = `harness.e2e.ts`, B = the bot,
T = `tv-mode.e2e.ts` (TV package), C = `companion-*.e2e.ts` (companion packages), I =
`import-worker.e2e.ts` (import package), S = `smoke.e2e.ts`):

| § | Area | Flows | Not covered yet |
|---|---|---|---|
| 1 | start, modes, routes | S, T | the start screen's D-pad choice |
| 2 | TV lifecycle, views, chrome, remote | G scene 0 (remote in the library), 5 (restart, box reset, outage badge), T | `tv.reload`, Back from the shell, "Another TV took over" in a flow |
| 3 | rendering | G (map drawn, preview tint and DM layers never on the TV — pixel equality) | per-layer looks (doors, tokens, ruler, disc, mask) need eyes or the bench |
| 4 | table view, 1 sq = 1 in | G scenes 0, 1, 6 (34 × 19, overscan, window, pan, fit, rotate) | the mask's pixels on the TV |
| 5–6 | companion shell, DM panel | C | — (companion packages) |
| 7 | tokens | G scenes 1, 3; B | tap-to-select on the map (C) |
| 8 | fog | G scenes 1, 2, 3 (brush, room, circle + preview, trim, undo); B | fog styles' looks |
| 9 | draw | G scene 3; B | presets (C) |
| 10 | measure: ruler, line, disc | G scenes 2, 3; B | the disc's remembered look on the tablet (C) |
| 11 | combat (dormant) | — | dormant |
| 12 | DM layers | G scene 6 | the Layers tab (C) |
| 13 | camera / view | G scene 6; B | TV follows the tablet (C) |
| 14 | settings: maps in the game, grid | G scenes 4, 6 | — |
| 15 | measure the TV | G scene 0 | the dialog (C) |
| 16 | session settings dialog | — | C |
| 17 | getting a map in | G (fixture uploads), I | the real ten files end to end (I) |
| 18 | grid editor | G scene 6 (refit keeps fog, recount clears it) | the editor UI (C) |
| 19 | shared library + link fetch | G scenes 0, 4 | the real link fetch (needs internet; the guard only) |
| 20 | games and persistence | G scenes 4, 5 (listing, reopen, restart, backup restore, double load) | rename / delete stored games |
| 21 | undo | G scenes 1, 3; B | — |
| 22 | networking | G scene 5 (offline taps dropped with a notice, outage recovery), scene 7 (300-command burst in order), H; B (reconnects, convergence) | takeover (L11, L12) in a flow |
| 23 | logs and diagnostics | G scene 0 (`diag.status`); B logs to MwLog | the outbox after an outage |
| 24 | updates and deploy | `tools/deploy-devices.sh` | `server.build` → reload offer, `deploy.prepare` in a flow |
| 25 | notices, stepper, full screen | G scene 5 (the offline notice) | C |
| 26 | remote fallback | G scene 0, T | — |
| 27 | test and ops tools | this page | — |

## Devices

Checked 2026-10-25 on the Android bench (Mac, Apple M2 Max). The real box and tablet were offline (at a
friend's place). **The emulator GPU is the Mac's** ("Android Emulator OpenGL ES Translator (Apple M2 Max)"),
and the Mac ran at load 30–95 from other sessions, so the numbers below show that things *run*, not
whether the box passes.

| Step | Result |
|---|---|
| build | `bun run build` → `shell/build.sh debug` → `battlemap-0.1.0-debug.apk`, **33 MB** with the app and effects inside (shell.md still says ~2 MB) |
| install + start | `bm_tv` (Google TV 14, WebView 113, 1920 × 1080 at dpr 2 = 960 × 540 CSS) as TV, `bm_tablet` (Android 16, 2560 × 1600) as companion, both with `--es server http://10.0.2.2:6204`; both reach the Mac's server (ws over the https asset origin works) |
| a short game across them | pair from the tablet's table picker → upload `03-przerzut-16x16.dd2vtt` → game on the TV after 0.6 s, map texture after 1.1 s → Reveal all, a token, the template disc: all drawn on the TV emulator (`docs/qa/emu-tv-game.jpg`). The tablet threw the same `effect_update_depth_exceeded` as Chromium (bug 1). A token tap took 4.2 s to reach the TV under that load |
| driving the WebViews | Playwright `_android.devices()` → `webView({pkg})` works; `connectOverCDP` on a forwarded `webview_devtools_remote_*` socket does not (closes with 1006) |
| system noise | the tablet AVD shows "Bluetooth keeps stopping" and "System UI isn't responding" dialogs under load — the emulator's, not ours |

Probe (`--es page probe`, 20 s at 1920 × 1080, load 1), from logcat:

| avg fps | 1 % low | frame ms p50 / p99 / max | JS ms avg / p99 | frames > 33 ms | map gen / mipmaps | pass |
|---|---|---|---|---|---|---|
| 30.8 | 5.5 | 16.7 / 166.7 / 216.7 | 0.5 / 2.5 | 123 of 622 | 1262 / 105 ms | no (the emulator under load; earlier, on a quiet Mac: 55 / 14) |

Bench (`/app/bench.html`, all scenes; from MwLog area `bench`, because `tools/bench-run.ts` returned `{}` per scene — fixed, bug 17):

| scene | fps avg | 1 % low | frame p95 ms | CPU avg / p95 ms | draw calls | idle frames |
|---|---|---|---|---|---|---|
| empty | 42.2 | 7.4 | 55.1 | 0.46 / 0.9 | 0 | 0 |
| big-map | 56.2 | 17.7 | 29.7 | 0.32 / 0.7 | 3 | 0 |
| fog-paint | 54.7 | 17.0 | 33.8 | 0.26 / 0.5 | 3 | 0 |
| tokens | 54.6 | 17.8 | 38.4 | 0.36 / 0.7 | 3 | 0 |
| drawings | 31.6 | 5.7 | 89.4 | 1.11 / 3.6 | 17 | 0 |
| everything | 48.2 | 9.9 | 42.6 | 1.94 / 4.1 | 15 | 0 |
| fx:torches-rain | 33.0 | 7.0 | 82.9 | 1.61 / 6.0 | 5 | 0 |
| fx:fireballs | 14.9 | 3.1 | 221.5 | 5.04 / 31.3 | 3 | 0 |
| fx:spells | 52.4 | 17.7 | 42.0 | 0.39 / 0.9 | 4 | 0 |
| fx:heavy | 55.1 | 17.9 | 32.5 | 0.42 / 0.8 | 14 | 0 |
| fx:decals | 15.6 | 3.5 | 217.5 | 0.44 / 1.5 | 4 | 0 |

The CPU side stays ≤ 2 ms a frame except `fx:fireballs` (5 ms avg, 31 ms p95 — the only scene whose
JavaScript costs real time); `fx:decals` is slow on the GPU side with little CPU. The `fx:*` scenes
each took ~100 s to start (asset loading under load). `heapMb` read 10.1 in every scene and
`heapGrowthMbPerS` 0 — WebView 113 has no live `performance.memory`, so the heap budget isn't
measurable there. Idle frames after each scene: 0 (render on demand holds).

Desktop Chromium (headless shell, SwiftShader — software GL): the TV page draws 1 frame in 5 s idle;
a 19 × 14 map holds 3.3 MB of textures; the 114 × 64 castle **67 MB** (map 67.1, under the 128 MB map
budget) and shows 5.5 s after "Add to the game"; switching maps frees the old map's textures.
A TV reload brings the game back after ~7 s (SwiftShader; budget: first frame ≤ 2 s from cache).

On the real devices next (the commands): `tools/deploy-devices.sh box --server https://<vps>/`,
then `bun tools/bench-run.ts <serial>` over latrine's adb (`ANDROID_ADB_SERVER_PORT=5059`).

## Bugs found

Found in the integration pass of 2026-10-25. "Fixed" = fixed in this pass (trivial); everything else
is open. Screenshots: `docs/qa/*.jpg`.

| # | Sev | Area | What happens | Reproduce | Where | Evidence | Status |
|---|---|---|---|---|---|---|---|
| 1 | major (fixed) | companion-game | `effect_update_depth_exceeded` on every map load (game start, map switch, reopen) on tablet and phone layouts, Chromium and WebView 113; afterwards the "Loading …" card sticks and the page stops following the TV | start a game from the tablet; console | `CompanionApp.svelte:58` — the `tv.status` effect read `busy` and wrote a new `busy` object; now read with `untrack` | 39× in e2e run 1's log; Vite trace "updated at $effect (CompanionApp.svelte:89)" | fixed in 6970164 |
| 2 | major | shared | **Room and Circle reveal ignore walls that aren't on grid lines** — on the vampire lair a Room tap in the top room reveals 264 of 266 squares (whole map, outside the walls too). Dungeondraft walls sit mid-square (e.g. y = 4.876), and `segmentEdges` blocks only the grid lines a segment *crosses*, so a horizontal wall inside a row never blocks north–south steps. v1's `wall_grid.dart` has the same rule; the e2e fixtures have on-grid walls, so no test sees it | upload `04-vampire-lair-19x14.dd2vtt`, Fog ▸ Room, tap the top room; or `floodFill(buildWallGrid(19,14,geo,[]), 3*19+7).length` → 264 | `shared/src/geometry/walls.ts:40-97` (segmentEdges) | `docs/qa/room-reveal-leaks-tv.jpg` | fixed in a753382 — verified (W4: a Room tap in the lair's top room fills 36 of 266 squares, was 264) |
| 3 | major | tv | **The TV forgets its calibration on every start.** On boot TV mode reports its viewport (`table.viewport`, `TvApp.svelte:221`) before `games.boot()` has read the stored calibration (`:247`); `changed()` sees `savedTable` = NaN and stores the default 34.5 in, which `boot()` then reads | Measure the TV → 26 cm → Apply → Done; wait; reload the TV → `table.widthInches` 34.5 again. MwLog: "Calibration saved widthInches=34.5" 2 ms before every "Booted" | `app/src/lib/tv/games.ts:166,255` (+ the order in `TvApp.svelte`) | IndexedDB `settings/tv.table` = 34.5 after the reload | fixed in 850d632 — verified (W4: 26 in survives a reload) |
| 4 | major (fixed) | e2e | the e2e protocol client sent no heartbeat → the relay closed the bot as a zombie after 45 s; long flows failed with "table did not sync" / "not connected" | any flow > 45 s with an idle bot | `e2e/support/proto.ts` (now pings every 15 s) | MwLog "Closing a silent socket (zombie) client=bot-…" | fixed in 6970164 |
| 5 | minor | companion-game | side-panel rows are wider than the panel: the "On the table" badge in Game ▸ Maps and the DM-layer row's controls are cut off at the right edge | Game tab with two maps; View ▸ DM layers with a layer | `tabs/settings/SettingsPanel.svelte:117`, `tabs/layers/LayersSection.svelte` | `docs/qa/tab-maps-list-clipped.jpg` | fixed in 9ff8a0b (Game ▸ Maps), 5e4d956 asserts the layer row fits |
| 6 | minor | server / state | commands sent while the TV page reloads are lost silently: no `relay.undelivered`, no notice; the prediction is rolled back only by the next snapshot | `bun tools/bot.ts --commands 2000 --tv-reload-every 400` → 9 × "command lost: timeout" at i = 386, `undelivered` 0 | relay (`server/src/relay`) / `state/client.ts` | bot summary | fixed in f5589c9 (companion: ack timeout 5 s → roll back + one notice); the relay still sends no `relay.undelivered` for them |
| 7 | minor | companion-lib | the library's Continue card offers a game this TV doesn't hold (another TV's server backup) — a fresh emulator TV got "Session 1 · castle · Continue" from the Mac's TV | pair a new TV on a server that has other TVs' backups | `companion/library/library-logic.ts:64` (`continueGame` doesn't skip `where === 'server'`, the TV's own rule does) | tablet emulator library | fixed in 7258e98 |
| 8 | minor | companion-game | phone (390 × 844): the map is fitted to about a third of the width, between the TV-window band lines, with large empty space | open a game on a phone-size companion | `game/context.svelte.ts` `fit()` / `GameScreen.svelte:81` | `docs/qa/phone-map-small.jpg` | fixed in 6282ad9, a13af91 |
| 9 | minor | tv / storage | the library lists a game under the map it had *before* the last switch ("Tower ground" instead of "Tower upper") | game-night "the library lists the game under the map on the table" | game summary written by `tv/games.ts` | e2e run 3 | fixed in 120cd04 |
| 10 | minor | import | the 114 × 64 castle's table copy takes 17.9 s in `bun test` (`table-copy` 17 228 ms of 17 906) | `bun test` import timings line for `07-STRESS-castle` | `app/src/lib/import` | `bun test` output | fixed in 4fe5910 (castle table copy 0.9 s in bun test) |
| 11 | minor | tv | a TV reload brings the open game back after ~7 s (SwiftShader, loaded Mac; budget: first frame from cache ≤ 2 s) — measure on the box before acting | reload the TV page in a game | `tv/games.ts` boot + map load | DM pass | open — W4: Chromium 0.6–3.9 s, TV emulator median ~4.5 s (b79ea12's start-time work in); Results |
| 12 | minor | e2e | `smoke.e2e.ts` still clicks the skeleton's "Calibrate 40 in" / "Start a test game" buttons, which are gone (its missing `debug=1` was fixed here) | `bun run e2e smoke` | `e2e/smoke.e2e.ts:24-31` | e2e run 3 timeout | fixed in aaded63 |
| 13 | minor | tv / e2e | `tv-mode` "every TV screen works with the D-pad" expects "shared library" in the TV library, which shows Games \| Maps tabs instead — test or UI out of step | `bun run e2e tv-mode` | `e2e/tv-mode.e2e.ts:73`, `tv/TvLibrary.svelte` | e2e run 3 | fixed in aaded63 (test follows the Games \| Maps switch) |
| 14 | minor | e2e | the pixel probe `tvDrawsMap` says "the TV renderer draws no map" under SwiftShader, so 3 game-night flows stay fixme although the TV draws (DM pass screenshots) | `bun run e2e game-night` | `e2e/game-night.e2e.ts:75-92` | fixme annotations | fixed in 7b0c309 |
| 15 | minor | companion-lib / e2e | "the calibration dialog changes the TV table" times out at 90 s in every run (not analysed) | `bun run e2e companion-lib-flows` | `e2e/companion-lib-flows.e2e.ts:104` | e2e runs 1–3 | fixed in 04f2a21, d106131 |
| 16 | minor | tv / storage | after a box reset (empty storage) the TV page doesn't connect within 15 s (game-night scene 5; not analysed) | `bun run e2e game-night -g "box reset"` | `tv/games.ts` boot / backup restore | e2e run 3 | fixed in aaded63 (cause: the Vite dev server reloaded pages mid-flow) |
| 17 | minor (fixed) | tools | `bench-run.ts` couldn't parse `PROBE_RESULT` (WebView appends ` (probe.html:N)`), and the bench's results came back as `{}` (Svelte proxies over DevTools `returnByValue`) | `bun tools/bench-run.ts emulator-5560` | `tools/bench-run.ts:65`, `app/src/Bench.svelte:314` | first emulator run | fixed in 6970164 |
| 18 | polish | tv | the TV home shows the raw table id (`table-yf6kig4q`) next to the name, the tablet's picker shows the code "IG4Q" — the DM sees two different "codes" | TV home vs table picker | `tv/TvHome.svelte:108` | DM pass | fixed in ec86cce, 141f9d7 — verified (W4: TV home code = `tableCode`, raw id nowhere) |
| 19 | polish | shell / tv | a TV's name is its raw model: "Google sdk_google_atv64_amati_arm64" (the box will show its model string too) — on the TV home and in the picker | start on an emulator | device name from `shell` `Device.kt` / `config.ts` | emulator shot | fixed in 3d2696d |
| 20 | polish | renderer | the calibration pattern's measuring bar is white, while TV and tablet texts say "the gold bar" (only the ring is gold) | Measure the TV with the pattern on | `render/tools-layer.ts` (calibration) | DM pass | fixed in 72f4cdf |
| 21 | polish | renderer | PixiJS warning "[BindGroup] a 'textureSource' was destroyed while still bound to a shader" on the companion when a map closes or switches | switch maps on the tablet | `render/map-layer.ts` / `tiles.ts` dispose order | console | fixed in 32bcfaa, 84338ab |
| 22 | polish | companion | dialogs open with the × focused and its "Close" tooltip showing (squares dialog) | upload a map | `ui/Dialog.svelte` autofocus | DM pass | fixed in 3336268 |
| 23 | polish | companion-game | the "Loading "map"…" card (the TV's busy state) sits over the already drawn map for 2–3 s after a switch — recheck now that bug 1 is fixed | switch maps | `CompanionApp.svelte` busy card | DM pass | fixed in 6e60531 (busy pill instead of a card) |
| 24 | polish | tools | `tsc -p e2e` reports `tools/bench-run.ts(81,12): Property 'done' does not exist on type 'never'` | `bunx tsc --noEmit -p e2e/tsconfig.json` | `tools/bench-run.ts:78-81` | — | fixed in b167bf8 |
| 25 | polish | shell docs | the debug APK is 33 MB with the app and effects inside; `shell.md` says ~2 MB | `shell/build.sh debug` | `docs/shell.md` "Build" | build output | decided in 3d2696d (effects stay inside; shell.md says so) |
| 26 | major | companion-game | the companion page's main thread blocks (no answer to `evaluate` within 3–4 s) in multi-map flows: game-night "several maps" and "picture maps … refit" failed with companions `busy` on Bun and Rust; the reopen flow was `fixme` | `bun run e2e game-night -g "several maps"` (tree 2cc74dc, load ~30) | each game screen started a new WebGL context (8–11 s blocked under SwiftShader) | W4 e2e runs 1–2 (Bun + Rust), `harness-fixes` rv#4 once | mostly fixed in b2d0d2e (W4-C: one table view per page) — the three flows pass, reopen flow un-fixme'd (6722912); the *first* view still blocks 13–20 s under SwiftShader (final Bun run: game-night L7 `busy` at rev 0) |
| 27 | minor | tv / state | the soak on the **Bun** server lost 2 commands (`map.add` at i = 35 and the `history.undo` after it: "command lost: timeout", `undelivered` 0); the same seed on Rust lost none | `bun tools/bot.ts --server <bun> --commands 2000 --tv-reload-every 400 --seed 42` | not analysed — the TV's map load under load (headless TV page, load ~30) or Bun's file serving | W4 soak (Bun) | open |
| 28 | minor | import | the PDF import's long-task budget fails in every W4 run: 55, 69, 72–143 long tasks (budget 50) | `bun run e2e import-worker -g PDF` | `e2e/import-worker.e2e.ts:122`, `app/src/lib/import` (pdf.js on the main thread) | W4 runs (Bun + Rust, load 30–38) | open (load makes it worse; recheck on a quiet machine) |
| 29 | minor | tools | `tools/tv-ctl.ts resume` reopened `games[0]` of `lib.list`, which holds other TVs' server backups too — on a shared server it opened a parallel test's game | `bun run e2e tools` beside other flows (Rust run) | `tools/tv-ctl.ts:64` | W4 Rust run: expected `nixgh…`, got `8h0a…` | fixed in 95f6808 (the TV's own newest; a server backup only after a box reset) |
| 30 | polish | companion-lib | library cards show the browser's broken-image icon when a backup's thumbnail file isn't on the server (a LAN table server without its upstream) | TV hosting with no upstream; tablet library ▸ Backups on the server | library card thumbnail (`companion/library`) — wants the map mark as fallback (`onerror`) | `docs/qa/w4-lan-backup-thumbs.jpg` | open |
| 31 | minor | e2e (companion package) | `companion-game-flow` and `companion-effects-flow` run serial: one slow start (the game screen's 7 s wait, "no sync.snapshot") skips the file's other 5 flows | `bun run e2e companion-game companion-effects` under load | `e2e/companion-game-flow.e2e.ts:166`, `companion-effects-flow.e2e.ts:188` | W4 Bun run 1: 2 failed, 10 not run | open — recheck after b2d0d2e |
| 32 | polish | shell | the table server took 3.9 s to listen on the TV emulator ("table server listening on port 5930 (3939 ms …, rss 229664 kB)"); `shell.md` says 0.5 s | start `bm_tv` with `--es host on` | `shell/…/TableServer` start | logcat `battlemap` | open (emulator under load 30) |
| 33 | minor | e2e | `caps.ts` probed TV storage with `game.open` of `e2e-no-such-game`, which raised the TV's "neither on the TV nor on the server" badge for the rest of the flow (W4-C) | any flow with `needs(t, 'tvStorage')` | `e2e/support/caps.ts:55` | W4-C report | fixed in 6722912 (probes with `lib.list`) |
| 34 | minor | e2e (TV package) | tv-mode "a new game comes back after a reload" expects a `frame` mark in the start marks; on the loaded Rust run the marks ended at `map-shown 406` (the frame mark lands later) | `BATTLEMAP_E2E_SERVER=rust bun run e2e tv-mode` beside other runs | `e2e/tv-mode.e2e.ts:42` (reads the marks once) | W4 final Rust run | open (passes alone) |
| 35 | minor | tv / storage | the box-reset flow saw the TV `idle` instead of the backed-up game within 7 s (final Bun run, 2 workers) | `bun run e2e tv-mode -g "box reset"` under load | `e2e/tv-mode.e2e.ts:164`, `tv/games.ts` restore | W4 final Bun run | open (passes alone on Bun and Rust) |

### Missing (parity.md items with no implementation at all)

State after wave 3 (W4 QA, by commit; not each re-tested by hand):

| Item | Then | Now |
|---|---|---|
| §1 ST-01 / §23 LG-06 developer screen | missing | built (2e89ca3 log ring, ed9e447 from library menu / picker / Game tab) |
| §16 SS-01/02/06 session settings, §6 DP-04 tabs hidden | missing | built (2a3e0a6, ed9e447, d790ae4; drawTools/measureTools fc789ea) |
| §3 RD-120 torch glow | missing | built (cd7b9a4; bench scene "Map lights" 54.8 fps on the emulator) |
| §2 TV-05 start after a power cut | missing | built (3d2696d BootReceiver; checked on the emulator in W3-E) |
| §27 QA-03 / QA-04 tv_ctl, test-map fetcher | missing | built (d632efe; resume fixed 95f6808) |
| §14 SE-08 Flash / Shake / Fade buttons | unfinished | built (Effects tab ▸ weather section) |
| SE-07 walls debug view | unfinished | built (645ce71) |
| SS-02 fog fade toggle | unfinished | built (ed9e447) |
| TV-01 stay-awake settings | unfinished | built (3d2696d) |
| CN-07 slow-handler watchdog | unfinished | event-loop stall watchdog in `net/connection.ts` (warns on real stalls, b61f120); a per-message handler timing not seen |
| §11 combat / digital mode | dormant | dormant, as intended |
