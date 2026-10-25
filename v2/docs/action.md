# battlemap v2 — live work

The orchestrating session's plan. Done waves move to `archive.md` when it exists; this file
holds only what is open.

## Where we are (2026-10-25 evening)

| Wave | What | State |
|---|---|---|
| 1 | architecture + shared + scaffold, parity inventory + roadmap, fluent kit, effects library (150), Android shell + WebGL probe | done |
| 2 | server (live: `https://battlemap.srv1189697.hstgr.cloud/app/`), storage + API, map import, TV mode | done |
| 2 | renderer, companion game/tools (4a), companion library/tabs (4b), effects runtime, QA harness | ~80–90 %, cut off by the session limit; work committed (`33b2d8a`) |
| 2.5 | integration pass (test hook, whole suite, game night, emulators → bug list in `qa.md`) + read-only code review (`review.md`) | running |

## Next

1. **Wave 3 — finish and fix** (about five helpers at a time, fresh, from `qa.md` + `review.md`):
   renderer finish + bench on the emulators; companion 4a/4b gaps; effects in the companion
   (cast an effect at a spot or area, weather, map loops); bug fixes by area; a second review.
2. **Wave 4 — polish:** a UI pass against `design.md` with screenshots on tablet, phone and TV.
3. **Wave 5 — roadmap** (`roadmap.md` tiers): curtain + scene presets, lighting from walls,
   ambient sound, LAN play through the shell, v1 games import.

## Waiting on the real devices

The Xiaomi box and the Tab A11+ stand at Juri's (Tailscale `battlemap-table`, offline on
2026-10-25). The WebGL gate (probe ≥ 50 fps avg, 1 % low ≥ 30) and the bench can only be decided
there — `shell.md` has the one-line command.

## Open for Konrad

- Old v1 services on the VPS (dev_server 4242, relay 9090) don't start by themselves after a
  reboot (they were down since 2026-10-16 until the server helper restarted them).
- About half the effects (JB2A free set) are CC BY-NC-SA: fine for the table, not for a sale.
- Remove `~/.config/battlemap/gemini.key` when the v2 work ends (or rotate the key).
