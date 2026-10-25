# battlemap v2

battlemap turns a TV lying flat into a D&D battlemap under real miniatures — one map square is
one inch on the table — and the DM drives it from a tablet: fog, doors, tokens, drawings, the
ruler, the template disc, DM-only layers. **v2 is the web rewrite** of the Flutter app at the
repo root (decided 2026-10-24): one Svelte 5 + TypeScript bundle with a PixiJS (WebGL2) table
renderer, run by a thin Android shell on the TV box (Google TV, Fire TV) and on tablets and
phones, and by any browser. Updates are a new web bundle, not a new APK.

The Flutter app keeps running until v2 has replaced it; both install side by side.

## Status (2026-10-25)

Foundation laid: the architecture and the protocol are written, `shared/` holds the whole
protocol, game model, reducer and geometry (tested), the app and the server are scaffolded and
talk to each other end to end (a TV page and a companion page exchange commands through the
relay; logs reach MwLog). The real screens, the renderer's scene, storage, map import and
effects are the next wave — see `docs/architecture.md` "Work packages".

## How it fits together

- **The TV is the authority.** It applies every command with one pure reducer
  (`shared/src/reducer/`), numbers it and broadcasts it; companions run the same reducer as a
  prediction, so a tap answers at once.
- **The server is dumb on purpose**: relay rooms (one TV + its companions), files by hash, the
  shared map library, game backups, the log forward to MwLog.
- **Nothing renders unless something changed** — the Xiaomi box (Mali-G310, 2 GB) is the floor.

Read [`docs/architecture.md`](docs/architecture.md), then [`docs/protocol.md`](docs/protocol.md).
How to work here: [`CLAUDE.md`](CLAUDE.md).

## Run it

Needs [Bun](https://bun.sh) ≥ 1.4 and the stack's logging client checked out next to this repo
(`~/code/mwlog-ts`, a path dependency).

```bash
cd v2
bun install            # all workspaces: shared, app, server
bun run dev            # server on :5929 + the app's dev server on :5884
```

Open the TV at <http://localhost:5884/app/?mode=tv> and a companion at
<http://localhost:5884/app/?mode=companion> (it lists the tables with a TV online). Add
`&debug=1` to the TV for a status line. The launcher knows it as `battlemap-v2`.

| Command (in `v2/`) | What |
|---|---|
| `bun run build` | the app into `app/dist/` (+ `build.json`), the server bundle into `server/dist/server.js` |
| `bun run start` | the server alone, serving the built app at `/app/` |
| `bun test` | every unit test: shared, server, app cores |
| `bun run check` | type checks: `tsc` for shared and server, `svelte-check` + `tsc` for the app |
| `bun run e2e` | Playwright flows (starts server and app unless they run) |

Server settings: `PORT` (5929), `HOST`, `APP_DIR` (`../app/dist`), `DATA_DIR` (`./data`). Logs:
MwLog tenant `battlemap` — `app=battlemap-v2` (server) and `app=battlemap-v2-ui` (every
device, through the server's `/log`); credentials in `~/.config/mwlog/battlemap.env`, never in
the bundle.

## Layout

| Folder | What |
|---|---|
| `shared/` | protocol, game model, reducer, geometry — imported by app and server |
| `app/` | the web app: TV mode and companion mode (`index.html`), the kit gallery (`kit.html`), the renderer bench (`bench.html`) |
| `server/` | relay rooms, the built app, files, library, backups, `/log` |
| `shell/` | the Android shell (`docs/shell.md`) |
| `assets/` | effects library and other shipped art |
| `e2e/` | Playwright flows |
| `docs/` | architecture, protocol, design, effects, shell, parity |
