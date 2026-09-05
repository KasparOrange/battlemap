# packages

## current dependencies

| package | version | purpose | notes |
|---------|---------|---------|-------|
| `flame` | ^1.22.0 | game engine — component model, sprites, canvas rendering | core rendering |
| `pdfrx` | ^2.6.1 | PDF loading and rendering | used for PDF map backgrounds. Needs Flutter ≥ 3.47 and `pdfrxFlutterInitialize()`. **No tvOS PDFium binary** — plan: rasterize on the phone, drop from the TV side (`docs/apple-tv-dev.md`) |
| `file_picker` | ^12.2.0 | file selection dialog | map upload from phone (`FilePicker.pickFile` + `readAsBytes()`) |
| `web_socket_channel` | ^3.0.0 | WebSocket client for relay | works on both web (Safari) and native (APK) |
| `path_provider` | ^2.1.0 | app documents directory | map/session storage on TV. tvOS: `path_provider_tvos` |
| `package_info_plus` | ^10.0.0 | read current app version | for update version comparison + log device info. tvOS: `package_info_plus_tvos` |
| `wakelock_plus` | >=1.3.3 <1.8.0 | keep the TV screen awake | pinned <1.8 (its tvOS support breaks `pod install`); tvOS: `wakelock_plus_tvos` |
| `uuid` | ^4.0.0 | generate unique IDs | map entries, sessions, tokens |

## adopted: MwLog (VictoriaLogs) for remote logs — 2026-09-05

**what:** [VictoriaLogs](https://docs.victoriametrics.com/victorialogs/) (single Go binary,
Apache-2) behind Caddy on the VPS, one tenant per private project (`/opt/victorialogs/projects.md`
on the VPS). The battlemap is tenant `battlemap`; MyTube (the tvOS app) is tenant `mytube`.

**why:** the old `tools/log_server.py` wrote to `/tmp` (lost at every reboot), only lived while
someone started it by hand, and answering "what broke an hour ago" meant grepping a file over
SSH. VictoriaLogs keeps 180 days, has a query language with regex + counts, a UI, and a
token-cheap query script (`logq.sh` in the my-tube repo, `MWLOG_ENV=~/.config/mwlog/battlemap.env`).

**how:** `lib/network/remote_log.dart` posts JSON lines with basic auth; the credential comes from
`--dart-define=MWLOG_AUTH=user:pass` (never in source — the repo is public). No new package.

## dev target: Apple TV — see `docs/apple-tv-dev.md`

The `fluttertv/flutter-tvos` fork runs the app on the living-room Apple TV for development
only. Set up 2026-09-05: `flutter_tvos`, `path_provider_tvos`, `package_info_plus_tvos`,
`wakelock_plus_tvos` are in the pubspec (no-ops elsewhere); the dependency bumps it forced are
listed in `docs/apple-tv-dev.md` "what the tvOS build forced on the dependencies".

## adopted: hive

**package:** `hive` + `hive_flutter`
**purpose:** cross-platform local storage (key-value NoSQL)
**why:** works on both web (IndexedDB) and Android (file-based) with the same API. replaces our raw JSON file storage with a proper database that handles binary data, concurrent access, and corruption recovery.

**what it replaces:**
- `lib/storage/map_library.dart` — raw dart:io file operations
- manual JSON index management with atomic writes
- separate code paths for web vs native

**storage plan:**
- `mapsBox` — map library metadata
- `sessionsBox` — session JSON objects
- `filesBox` — binary .dd2vtt / PDF files (5-22MB each, IndexedDB handles up to 500MB)
- `settingsBox` — app preferences

**status:** to be integrated

## adopted: shorebird

**package:** shorebird CLI + runtime
**purpose:** over-the-air (OTA) code push — update the TV app without APK reinstall
**why:** eliminates the "download APK → open installer → confirm → restart" flow. dart code patches are applied on next app launch, silently.

**what it replaces:**
- `lib/update/update_service.dart` — APK download + install intent
- manual version.json management
- FileProvider + Kotlin platform channel for install

**how it works:**
1. `shorebird release android` creates a release
2. `shorebird patch android` pushes a code update
3. TV app checks for patches on launch and applies them
4. next launch has the new code — no user interaction needed

**status:** to be set up

## considered: maybe later

### dio
**what:** HTTP client with interceptors, retries, progress, cancellation
**why maybe:** we have 3 HTTP calls total (upload, download, version check). our raw dart:io/XHR approach works. dio would be cleaner but adds a dependency for minimal benefit.
**when:** if we add more HTTP endpoints or need retry logic

### riverpod / provider
**what:** state management framework
**why maybe:** we use raw ChangeNotifier + setState. it works for our single-screen-at-a-time model. provider/riverpod would add structure but also boilerplate.
**when:** if the state model gets complex enough that manual listeners become error-prone

### freezed + json_serializable
**what:** code-generated immutable data classes with JSON serialization
**why maybe:** we have 5 model classes with hand-written toJson/fromJson. code gen would be type-safer but adds build_runner to our SSH-only workflow.
**when:** if we add more model classes or the serialization logic grows

### go_router
**what:** declarative navigation with deep linking
**why skip:** the TV has no URL bar, no browser history, no back stack. navigation is "phone tells TV which view to show." a router adds complexity for zero benefit.

### drift (sqlite)
**what:** type-safe SQLite wrapper with code generation
**why skip:** overkill for our flat data (map list, session list). hive's key-value model is simpler and matches our data shape. drift would make sense if we needed relational queries.

## rejected

### objectbox
**reason:** no web support. the companion runs as a web build in Safari. objectbox only works on native platforms.

### isar
**reason:** web support is broken/stalled. the original isar 4.x project is abandoned. the isar-plus fork exists but adds maintenance risk.
