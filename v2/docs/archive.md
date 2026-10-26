# battlemap v2 — archive

Done waves and decisions, newest on top. Append-only; live work is in `action.md`.

## 2026-10-26 — wave 5 finished (and how)

Wave 5 was cut off by the usage limit at 21:45 on 10-25. The big orchestrating session was not
resumed (its helpers held 100–200k tokens each, caches cold). A lean session wrote short briefs instead, and five fresh helpers
read the old helpers' transcripts through a condensed reader, judged the plan and continued. API
timeouts at 02:00 stopped those too. Four small finishers with exact file lists closed the work:
test, fix, commit, docs. They took turns on e2e through a lock, because five suites at once had
overloaded the Mac and caused false failures.

Results: secret doors + traps (bbc51e8), table moments (777cfc1, 7138033, 4f31546), sound tab
(c43a695, 9558071), speed — glyphs on demand, map view made ahead, PDF off-thread (0982e2c, ffeca55,
8518a56), v1 import tool (c6cfd34), PDF page picker (df1d16b), players' view + installable
companion (d93319c, 7a94757, f073b55, ac2ddc9), fog-honest thumbnails + reveal animation + reveal
areas (6e050db, 298b8fd, 9b3d79f). Bugs found on the way: every PDF import failed (pdf.js `ready`
taken for the result), a companion e2e wait checked nothing, a double tap on Play hit the new Stop
all, an unfound secret door that is one of the map's doors showed on the players' page. Tests: app
532, shared 169, contract Rust 81 / Bun 71, every W5 flow green. Leftovers: `action.md`.

## Waves 1–5 (2026-10-25 → 26)

| Wave | What | State |
|---|---|---|
| 1 | architecture + shared + scaffold, parity inventory + roadmap, fluent kit, effects library (150), Android shell + WebGL probe | done |
| 2 | server (live: `https://battlemap.srv1189697.hstgr.cloud/app/`), storage + API, map import, TV mode | done |
| 2 | renderer, companion game/tools (4a), companion library/tabs (4b), effects runtime, QA harness | ~80–90 %, cut off by the session limit; work committed (`33b2d8a`) |
| 2.5 | integration pass (test hook; e2e 44 pass / 8 fail; soak 2,900 commands converge; 25 bugs in `qa.md`) + code review (0 blockers, 8 major in `review.md`) + Rust server (contract 72/72, VPS port 5930 side by side) | done |
| 3 | W3-A core/TV/harness · W3-B1 companion game + map tabs · W3-B2 companion frame, library, dialogs, settings, developer screen · W3-C renderer, effects runtime, import, torch glow · W3-D Effects tab · W3-E shell, embedded Rust server, LAN play, VPS switch to Rust | done (545 unit tests; LAN play on the emulators; production on the Rust server) |
| 4 | W4-Q regression (unit 584/0, e2e Rust 77/79, soak 0 lost on Rust, LAN ok) · W4-C companion fixes, "Tables nearby" picker, import after confirm, looping previews, visual pass · W4-T TV LAN join code + QR, label turning, grid contrast · W4-F curtain + scene presets | done |
| 5 | W5-P start-up + import speed, e2e on Rust by default, flaky flows · W5-1 fog-honest thumbnails, reveal animations, prepared reveal areas, secret doors + traps · W5-2 spotlight, TV timer, handouts, DM notes · W5-3 sound library + soundscapes · W5-4 v1 import, PDF page picker, players' view, installable companion | done 2026-10-26 (cut off 21:45 by the usage limit, restarted, then API timeouts at 02:00; closed by four finishers): app 532 / shared 169 unit tests, contract Rust 81 · Bun 71, every W5 feature flow green |

## Wave 3 leftovers — all closed in waves 4–5

Import after confirm, looping effect previews, emulator bench, fog-honest thumbnails, reveal
animations, the phone's first fit, the LAN table picker, e2e on Rust by default: done (see the wave
rows). Still open from it: the e2e harness port check (moved to `action.md`).

<details><summary>The list as written</summary>

- import: upload only after the squares dialog is confirmed (W3-B2 request; W3-C done).
- Effects browser: small looping previews instead of stills.
- Bench run on the emulator and, when reachable, the box.
- **Spoiler:** game thumbnails on the TV home and library show the whole unfogged map to the players — fog-honest thumbnails (roadmap S24) or none on the TV.
- Reveal animations (roadmap S4) — not started (W4-T stopped near its budget).
- renderer: the first fit on a phone uses a too-small host size (the companion refits after the first draw as a workaround).
- companion table picker: list `discoverLanTables()` when `canDiscoverLan()`, else a code field (`decodeLanCode` → `joinTable`); run `checkServerChoice()` once after the companion boots (W3-E's LAN API in `config.ts`).
- e2e: the full run against the Rust server: 23 of 25 failures pass with emulators off and one worker; two app-timing failures left.
- e2e: a game-night run wrote under another helper's ports (6411/6412) — check the harness respects `BATTLEMAP_*_PORT`.

</details>
