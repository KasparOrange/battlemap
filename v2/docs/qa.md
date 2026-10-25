# battlemap v2 — QA

How v2 is checked, what passes today, what fails (with where), and how to run everything on
the emulators and the real devices. Work package 8 (`architecture.md` "work packages").
Status as of **2026-10-25** (wave 2 in flight — numbers below are from that day's tree).

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
bun tools/bot.ts --server http://localhost:6182 --app http://localhost:6181/app/ --commands 500
```

Results: `test-results/e2e-report-<app port>.json`; traces of failures in
`test-results/e2e-<app port>/<test>/trace.zip` (`bunx playwright show-trace …`). The config
writes per app port, so parallel runs of other helpers don't clean each other's results.
Workers default to 2 (`BATTLEMAP_E2E_WORKERS`); protocol waits are 15 s, because the Mac ran at
load 50 while eight helpers built in parallel.

## The test hook (asked of the orchestrator)

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

RESULTS

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

DEVICES

## Bugs found

BUGS
