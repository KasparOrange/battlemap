# Battlemap — archive (history, newest on top)

Rule: **one entry per prompt that changed something** — in `docs/`, or in the code it
governs. Never per session. Heading = `### YY-MM-DD HH:MM - <session id>`; body = nested
bullets. What was learned goes into the docs it belongs to (`architecture.md`, `setup.md`,
`packages.md`, …); *that* it was learned, when, and why goes here. Newest entry goes
**above** the first heading.

### 26-09-05 23:35 - 389d2c14-05de-4f55-9d3c-6695b9d6b48e
- Konrad: "check the plans … for the new plan to make a development build for TVOS and then start executing that" → `docs/apple-tv-dev.md` setup executed on the Mac
	- `fluttertv/flutter-tvos` 1.10.0 cloned to `~/code/flutter-tvos` (Flutter 3.47.2), CocoaPods via brew, `tvos/` host project generated and committed (bundle `com.example.battlemap`, team from the dev cert)
	- **Runs on the tvOS simulator** (mode selector → TV mode via select key, logs "Device info … platform tvos" into MwLog). **Physical Apple TV**: `--release` runs and logs into MwLog (osVersion 26.6); debug's wireless lldb attach times out three times running → simulator for hot reload, release on the TV. Hive moved to the cache dir on tvOS (Documents is read-only on the real device — `openBox` threw)
	- Dependency fallout (all platforms, VPS needs Flutter ≥ 3.47 now): `pdfrx` → 2.6.1 (+ `pdfrxFlutterInitialize()`), `package_info_plus` → 10, `file_picker` → 12 (API migrated in the two pickers), `wakelock_plus` pinned <1.8 (its own tvOS pod breaks `pod install`), four `*_tvos` ports added; `flutter analyze` clean, 346 tests green
	- Not done: the relay is still stopped on the VPS, so TV mode on the Apple TV only shows "Connecting to relay…"; #36 (PDF on the phone) still needed for PDF maps on tvOS

### 26-09-05 23:10 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad: "explain how did it happen that it's not the primary" → the Mac/VPS drift reconstructed and written down
	- 2026-04-08: VPS pushed `e6b869e` (quality pass) + `87871c9` (PDF resume fix, version 1.1.2+12); 11 min later a Mac session committed `e4e22d1` "Bump version to 1.1.1+11" on the OLD base, never pushed — obsolete, kept as tag `backup/stale-version-bump-2026-09-05`
	- No content was lost; the lesson is the pull-before/push-after rule in `docs/setup.md`
- `docs/archive.md` created (this file) per the ~/code documentation doctrine

### 26-09-05 23:00 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad confirmed the workflow: **VPS = primary dev machine** (phone + mosh + Claude Code when outside, sees the companion output directly), **Mac = home + Apple TV target**
	- Written into `CLAUDE.md` "Development environments", `docs/setup.md` "development environments", `docs/apple-tv-dev.md` "where this runs"
	- Committed as `9d40331` from the Mac, pushed; VPS working copy (identical patch) discarded and fast-forwarded — both checkouts clean at the same commit

### 26-09-05 22:40 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad: "do we have a local project? put all of this in its documentation" (from the my-tube session that built MwLog)
	- Local `~/code/battlemap` found stale (ahead 1 obsolete commit, behind 2) → reset to origin/main, MwLog patch applied
	- New `docs/apple-tv-dev.md`: flutter-tvos fork as a Mac-only dev target, dependency audit (only `pdfrx` blocks — native PDFium, no tvOS build), plan to rasterize PDFs on the phone, tvOS caveats (purgeable storage, pixel ratio, dart:io bypasses ATS)
	- `architecture.md` diagram + data flow → MwLog; `packages.md` "adopted: MwLog" + tvOS ports; `feature-ideas.md` + `CLAUDE.md` roadmap #35 (logs → MwLog, needs APK rebuild), #36 (PDF on phone), #37 (Apple TV dev target)

### 26-09-05 22:20 - 48b4e98a-9b23-47cd-a6dc-d0f31542c131
- Konrad: "set that up" → logs moved off the hand-started `tools/log_server.py` (down since the 2026-07-07 VPS reboot, log file in /tmp gone) to **MwLog**: VictoriaLogs + Caddy on the same VPS, tenant `battlemap` (AccountID 2) next to MyTube's
	- `lib/network/remote_log.dart`: JSON lines, basic auth, `app`/`ts` stamped on every entry, credential via `--dart-define=MWLOG_AUTH` (repo is public → never in source), silent when absent; `dart analyze` clean on the VPS
	- `docs/setup.md` "logs": build define + `logq.sh` queries; `log_server.py` retired
	- Measured on the way: VictoriaLogs silently drops form-encoded bodies (answers 200) — always send `Content-Type: application/json`; the Caddyfile is bind-mounted by inode, so a replaced file needs `docker compose restart caddy`, not `caddy reload`
	- Not done: APK rebuild with the define; relay/dev server still stopped (no systemd units)
