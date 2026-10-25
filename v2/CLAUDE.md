# battlemap v2 — how to work here

The web rewrite of battlemap (decided 2026-10-24: Svelte + WebGL, thin Android shell). The
Flutter app at the repo root stays untouched and keeps working until v2 has replaced it.
The root CLAUDE.md's *product* rules hold here too (TV remote fallback, IO feedback, doc
comments, one map square = one inch on the 34 × 19 table); its Flutter build/deploy steps and
progress tracker do not — v2's own are below and in `docs/`.

## Never touch the old app

`lib/`, `android/`, `ios/`, `tvos/`, `web/`, `test/`, `tools/`, `pubspec.*`, the root docs:
read them freely (they are the specification), never edit them. The old relay (port 9090) and
dev server (4242) keep running on the VPS; v2 uses its own ports and its own Android
application id, so both apps install side by side.

## Layout and ownership

| Folder | What | Notes |
|---|---|---|
| `shared/` | the protocol (every message type), the game model, pure logic (grid maths, fog, walls) | TypeScript, no DOM, no Node — imported by app and server |
| `app/` | the one web app: TV mode and companion mode in the same bundle | Svelte 5 (runes) + TS strict + Vite; PixiJS for the table |
| `app/src/lib/ui/` | the fluent component kit | tokens + components, no game logic |
| `server/` | relay (WebSocket) + files (maps, uploads, shared library, link fetch, log forward) | Bun + TS |
| `shell/` | the Android shell: Google TV, Fire TV, tablets, phones | Kotlin WebView, loads the built app |
| `assets/` | effects library and other shipped art, each with a manifest entry and licence | see `docs/effects.md` |
| `e2e/` | Playwright flows across a TV page and a companion page | `bun run e2e` |
| `tools/` | device deploy, bench runs, soak bot | |
| `docs/` | `architecture.md`, `protocol.md`, `design.md`, `effects.md`, `parity.md`, `action.md`, `archive.md`, … | |

A helper owns the folders its brief names and edits nothing else. A change another owner's
folder needs goes into your report, not into their files.

## Code rules

- **Readable first.** Small modules with one job, plain names, no clever indirection. A human
  must be able to open any file and follow it. Prefer boring code.
- **Every exported function, type, class, field and component has a TSDoc comment** (purpose,
  params, returns, throws, `@see`). Svelte components get a top comment: what it is, props.
- **Log generously** through the one logger (`app/src/lib/log.ts`, `server/src/log.ts`): every
  IO, every state change that matters, every error with context, connection lifecycle,
  timings of slow steps. Lines go to MwLog tenant `battlemap` (`docs/architecture.md` "logs").
  Never `console.log` directly.
- **No IO without visible feedback** (notice, progress bar or spinner); debounce action buttons.
- **TV remote fallback:** every TV-side control is reachable and activatable with D-pad + OK.
- **Performance budget (the TV box is the floor):** Xiaomi TV Box S 3rd gen — Mali-G310,
  2 GB RAM, 4K output. Steady 60 fps on the table at 1080p render size, never below 30;
  render on demand (no frame when nothing changed, except while something animates); no
  per-frame allocations; textures ≤ 4096 px per side (tile larger maps); dispose what is off.
- New features default OFF unless they are core table behaviour.
- Tests: `bun test` for shared logic, app logic and server, Playwright for flows. Every module
  with logic has tests. Don't mark something done that you didn't run.
- Parallel helpers each run their own ports: `BATTLEMAP_APP_PORT` / `BATTLEMAP_SERVER_PORT`
  for `bun run e2e`, `PORT` + a temp `DATA_DIR` for the server. Never the defaults 5884/5929.
- Stop only processes you started, by PID — never `pkill`/`killall`/`kill $(pgrep …)` by name:
  other helpers run the same commands at the same time.

## Secrets (never commit)

- Gemini API key: `~/.config/battlemap/gemini.key` (`GEMINI_API_KEY=$(cat …)`).
- MwLog credentials: `~/.config/mwlog/battlemap.env` (`MWLOG_USER`, `MWLOG_PASS`).

## Git

- Commit your own files only, by explicit path: `git commit -o <paths> -m …` (never
  `git add -A`, `git add .`, `commit -a`). On `index.lock` wait a second and retry.
- Helpers commit, they don't push — the orchestrating session pushes. SSH (git, the VPS
  `kaspar@72.62.88.197`) must reuse the session's open connection, since 1Password can't be
  asked while Konrad is away:
  `ssh -o ControlPath=$HOME/.ssh/cm-claude-%r@%h-%p -o ControlMaster=no -o IdentityAgent=none …`
  (for git: the same as `GIT_SSH_COMMAND`).
- Commit message: what changed and why, one subject line, prefixed `v2:`.

## Orchestration (Konrad, 2026-10-25)

- The orchestrating session runs at **xhigh** effort, worker helpers at **high** (`effort` on
  the Agent call).
- Keep a helper under about 500k tokens of context: start a fresh one with a tight brief rather
  than continuing a long one. A judgment call, not dogma.
- When the orchestrator itself passes about 500k, it writes an extensive handover
  (`docs/handover.md`: state, running work, decisions, next waves) and a new session continues.

## Helpers

- Scratch dirs: `mktemp -d -t claude-v2-<your topic>`; remove them by exact path.
- Long jobs: `run_in_background` and wait for the one end notice — no progress Monitors.
- Report back in ≤ 200 words: what works (and how you checked it), what doesn't, what's left,
  files touched. No essays.
