# setup

## prerequisites

- VPS with Ubuntu (the dev machine — runs Flutter SDK, relay, servers)
- iPhone with SSH client (Prompt 3) for development
- Xiaomi TV Box S 3rd Gen (or any Android TV box) for the table display
- Flutter SDK **≥ 3.47** installed on VPS (pdfrx 2.x floor since 2026-09-05; upgraded to 3.47.2 on 2026-09-06)
- optional: the living-room Apple TV as a dev target via flutter-tvos — `docs/apple-tv-dev.md`

## development environments (decided 2026-09-05)

Two places, one repo on GitHub (`main`), **the VPS is primary**:

| where | when | what |
|---|---|---|
| **VPS** (`ssh kaspar@72.62.88.197`, mosh from the phone) | outside, on the phone with Claude Code | phone companion (web build, served by dev_server, visible on the phone right away), APK builds, Shorebird, relay/servers |
| **Mac** (`~/code/battlemap`) | at home | **Android bench** (Google TV + tablet emulators, below — the main local setup since 2026-10-10, the targets are Android TV/Google TV + Android phone/tablet); Apple TV dev target via flutter-tvos (`docs/apple-tv-dev.md`) as a secondary |

Rules: commit + push from wherever you worked, `git pull --ff-only` on the other side before
starting; never leave uncommitted work behind on the VPS (it was invisible from the Mac for
months in 2026). Builds that need macOS live on the Mac; release APKs for the Xiaomi box are built on
the VPS (the Mac builds debug APKs for the emulators too).

## VPS services

two Python servers run on the VPS (the log server is retired — logs go to MwLog, see "logs" below):

| service | port | purpose |
|---------|------|---------|
| `tools/vtt_relay.py` | 9090 | WebSocket relay between TV and phone |
| `tools/dev_server.py` | 4242 | HTTP server: web build, APK download, map uploads (7-day cleanup; DM layer pictures in `uploads/dm/` are kept) |

### starting services

```bash
# start both (from project root) — NOTE: nothing restarts them after a reboot
# (up again since 2026-10-10, started by hand). TODO: systemd units.
python3 tools/vtt_relay.py >> /tmp/vtt_relay.log 2>&1 &
python3 tools/dev_server.py > /dev/null 2>&1 &
```

### checking services

```bash
ss -tln | grep -E '4242|9090'
curl -s -m 5 -o /dev/null -w '%{http_code}\n' localhost:4242/version.json   # 200, not 000
```

A listening port isn't enough: until 2026-10-10 the dev server was a single-threaded
`HTTPServer`, and one stalled client (a browser keep-alive) hung it for everyone — every map
download sat at 0 %, even `curl localhost:4242` timed out. It is a `ThreadingHTTPServer` since
`e446b37`; a VPS still on the older file needs a pull + restart.

## building

### web build (for phone testing in Safari)

```bash
flutter build web --release
```

served automatically by dev_server on port 4242.

### APK build (for TV)

```bash
flutter build apk --release
```

### full deploy sequence

```bash
# 1. bump version in pubspec.yaml (increment +N)
# 2. build
flutter build web --release
flutter build apk --release

# 3. deploy
cp build/app/outputs/flutter-apk/app-release.apk build/web/battlemap.apk
echo '{"version":"X.Y.Z+N","versionCode":N}' > build/web/version.json

# 4. restart dev server to serve new files
pkill -f dev_server.py; sleep 1
python3 tools/dev_server.py > /dev/null 2>&1 &
```

Over ssh the shell is non-login, so `flutter` and the Android SDK are not on PATH — prefix the
build with `export ANDROID_HOME=$HOME/android-sdk JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
PATH=$HOME/flutter/bin:$PATH` (otherwise `flutter build apk` prints "No Android SDK found" and
exits 0 without an APK — check the file's timestamp). Full remote deploy from the Mac, 2026-09-06:
push → `ssh … git pull --ff-only` → APK build as above → `cp` + `version.json` → rsync web +
`doc/api` from the Mac → restart dev_server.

Over ssh, start services detached — `(setsid nohup python3 tools/dev_server.py > /tmp/dev_server.log 2>&1 < /dev/null &)` —
plain `nohup … &` dies with the ssh session, and `pkill -f dev_server.py` inside an
`ssh host 'pkill -f dev_server.py; …'` command kills that command's own shell (its command
line contains the pattern): run the pkill in a separate ssh call. The relay the same way
(`tools/vtt_relay.py`, log `/tmp/vtt_relay.out`) — and check `pgrep -af vtt_relay` afterwards:
on 2026-10-10 the September relay survived SIGTERM, closed its listening socket but kept the
TV's and tablet's live connections, so both stayed on the old code until `kill -9`.

### deploying a web build from the Mac

When the VPS cannot build (e.g. Flutter too old), build on the Mac and copy only the web files —
keep the VPS's APK, API docs, uploads and `version.json` (a newer `version.json` without a new
APK makes the TV offer a phantom update):

```bash
rsync -az --exclude uploads/ --exclude battlemap.apk --exclude api/ --exclude version.json \
  build/web/ kaspar@72.62.88.197:~/battlemap/build/web/
# then restart dev_server (above)
```

### TV update

from the companion app: tap the update icon in the library header → check for update → download & install.

or manually: open `http://<VPS_IP>:4242/battlemap.apk` in the TV browser.

or from the Mac: `tools/deploy.sh tv` (rolling deploy, below). What it rests on, learned
2026-10-10 putting 1.1.5 on the box by hand:

- **reach**: a session's own adb can't reach devices on the Wi-Fi (macOS Local Network privacy:
  its server sees nothing on mDNS, connects fail); latrine's `android` adapter runs an adb server
  that can (`latrine android devices`, then `ANDROID_ADB_SERVER_PORT=5059 adb …` for plain adb).
- **data kept**: the box's app is signed with the Mac's `~/.android/debug.keystore` (same SHA-256
  as the installed 1.1.1), so `install -r` keeps its library and sessions. A build signed with
  another key would need an uninstall, which wipes them.
- **Wi-Fi changes drop wireless debugging**: Android switches it off whenever the Wi-Fi changes
  access point or band (both devices at once on 2026-10-10 18:18). latrine therefore keeps every
  device on classic adb at a fixed address as well — box `192.168.178.149:5555`, tablet
  `192.168.178.199:5555` — which lasts until the device reboots; use those serials. After a
  reboot switch Wireless debugging on once (the pairing stays) and latrine moves it back.
  Never `adb kill-server`/`usb`/`disconnect` on port 5059: every session shares those devices.
- **one companion**: a browser tab with the old web companion (built before the `replaced`
  message) keeps re-registering and fights the native app for the companion slot — close it or
  point it at `about:blank` before opening Companion Mode in the app.
- **tablet asleep**: when the tablet dozes, Android cuts the companion's relay socket
  (logcat: `Software caused connection abort`); on wake it reconnects and the TV resends its game.
  Behind the PIN lock `latrine android shot` shows only black or the lock screen and adb can't
  unlock it — someone has to. `tools/tv_ctl.py status` says `"relayState": "paired"` once the
  companion is back (2026-10-10: the tablet slept right after `deploy.sh tablet`).

### rolling deploy (mid-game patch, since 2026-10-10)

Live development against the real box and tablet with a ~15 s break, modelled on mytube's
"deploy restore" (`~/code/my-tube`, `MyTube/Player/DeployRestore.swift`):

```bash
tools/deploy.sh            # tv + tablet + web
tools/deploy.sh tv         # APK onto the box, the running game comes back by itself
tools/deploy.sh tablet     # same APK onto the tablet, relaunched straight into Companion Mode
tools/deploy.sh web        # web companion onto the VPS (browser fallback)
tools/deploy.sh tv --here  # build the working tree instead of a clean worktree of HEAD
```

1. **build** first (clean worktree of HEAD by default — other sessions' unfinished edits never
   ship); the old app keeps running meanwhile
2. `tools/tv_ctl.py status` (relay, `bot` role) asks the TV where it is: view, map, session
3. `deploy.prepare`: the TV saves the session *now*, writes its restore snapshot, shows
   "Updating battlemap — back in a few seconds" and answers `deploy.ready` (the tablet shows a
   snackbar). A TV build without it gets 3 s for its 2 s auto-save instead
4. `latrine android install` (`install -r`, data kept) — this kills the old app
5. relaunch with the initial route `/restore?session=…&map=…` (`am start --es route …`;
   FlutterActivity hands the `route` extra to Flutter) → `main.dart` opens `TvShell(restore:)`
   on top of the mode selector → `_restoreAfterDeploy` resumes the session (fog, doors, camera
   from the saved session) behind an "Updated — reopening the game…" overlay
6. `tv_ctl.py wait-session` until the TV shows that game again; prints the break in seconds

Without the relay the route is plain `/restore` and the TV uses its own snapshot
(`DeployRestore`, Hive box `deployRestore`: view + map + session, written on every view change
and session save — the install SIGKILLs the app, nothing can be saved on the way out). A normal
launch never restores. **tablet**: `install -r` + `am start -S … --es route /companion` — the
native companion opens connected, without the mode selector. A tablet without the app (browser
companion) gets its Chrome tab reopened at `…/?v=<time>#/companion` instead (same
`application_id` → same tab; the query forces the reload). **web**: rsync like "deploying a web
build from the Mac".
The TV resends its game to a companion that takes over the slot (`onPeerReconnected`).
First real run: `deploy.sh tablet` on 2026-10-10 18:53 (native companion 1.1.6+16 → 1.1.8+18,
data kept, relaunched into Companion Mode); the `tv` target has not run yet.

Needs: box + tablet paired with this Mac (`latrine android devices`), the bench venv
(`~/.local/share/battlemap/venv`, created on first run), `~/.config/mwlog/battlemap.env`.
Rule of thumb: batch changes — every TV deploy interrupts the table.

Gotcha (2026-10-10): the clean worktree builds **HEAD**, so committing a whole file that another
session is still editing in this checkout ships their half-done code — the build fails on
symbols that exist only in their uncommitted files. Before committing a shared file, check
`git diff --cached`; to keep only your hunks without touching their copy, stage a blob
(`git hash-object -w <file>` + `git update-index --cacheinfo 100644,<hash>,<path>`).
Whether the tablet's bars are hidden: `ANDROID_ADB_SERVER_PORT=5059 adb -s <tablet> shell dumpsys
window | grep navigationBars` → `visible=false`.

## testing

```bash
flutter test                    # run all unit tests
flutter analyze                 # check for errors
```

Widget tests draw every glyph as a box of the Ahem test font (each letter a full square), so text
is much wider than on a device: an overflow there may be a false alarm, and screenshots are
unreadable. To *look* at a layout without the bench, load the SDK's real fonts in the test
(`FontLoader('Roboto')` / `FontLoader('MaterialIcons')` from
`$F/../bin/cache/artifacts/material_fonts/`, under `tester.runAsync`), wrap the widget in a
`RepaintBoundary` and save `toImage()` as PNG — the 2026-10-10 side-panel check, cheaper than
emulator screenshots. Roboto has no `✓`: it renders as a box, so the UI writes such hints in words.

## logs

Logs go to **MwLog** — VictoriaLogs on this VPS, tenant `battlemap`
(`https://srv1189697.hstgr.cloud/p/battlemap/…`, registry in `/opt/victorialogs/projects.md`).
`tools/log_server.py` and `/tmp/battlemap.log` are retired.

The APK needs the credential baked in at build time (web builds use the stub and never log):

```bash
. ~/.config/mwlog/battlemap.env
flutter build apk --release --dart-define=MWLOG_AUTH=$MWLOG_USER:$MWLOG_PASS
# shorebird release / patch take the same --dart-define
```

Query (from the Mac, my-tube repo — counts and capped samples, never dumps):

```bash
MWLOG_ENV=~/.config/mwlog/battlemap.env scripts/logq.sh count --since 2h
MWLOG_ENV=~/.config/mwlog/battlemap.env scripts/logq.sh raw '_time:1d src:tv level:error'
MWLOG_ENV=~/.config/mwlog/battlemap.env scripts/logq.sh grep 'paired|resume' --since 1d
python3 tools/diag.py status                         # query TV state (unchanged)
```

Fields per entry: `app` (stream), `src` tv|companion (stream), `level`, `tag`, `msg`, `ts`, plus
whatever `extra` the call site adds. UI: `https://srv1189697.hstgr.cloud/select/vmui/` (admin,
AccountID 2).

## relay config

the VPS IP is the default in `lib/network/relay_config.dart` and can be overridden per build:

```dart
static const String host = String.fromEnvironment('RELAY_HOST', defaultValue: '72.62.88.197');
static const int port = 9090;       // relay
static const int httpPort = 4242;   // dev server; RelayConfig.httpBase = http://host:4242
```

`--dart-define=RELAY_HOST=localhost` points a build at a local relay + dev server (see
"local bench"). Change the default if you move to a different VPS.

## local bench (Mac, decided 2026-09-06)

Everything on one machine so the companion can be tested without the VPS or a phone:

```bash
# Flutter on the Mac is the checkout inside the tvOS fork:
F=~/code/flutter-tvos/flutter/bin/flutter          # 3.47.2

# 1. relay (needs the websockets module — use a venv, not system python)
V=~/.local/share/battlemap/venv                     # same venv as tools/android_bench.sh
python3 -m venv $V && $V/bin/pip install websockets
$V/bin/python tools/vtt_relay.py &                  # :9090, logs to /tmp/battlemap.log

# 2. dev server serving this checkout's web build (uploads land in build/web/uploads)
BATTLEMAP_WEB_DIR=$PWD/build/web python3 tools/dev_server.py &   # :4242

# 3. phone build against localhost
$F build web --release --dart-define=RELAY_HOST=localhost

# 4. TV on the Apple TV simulator (shares the Mac's localhost), then press Select
#    on "TV Mode" (osascript key code 36 to the Simulator app works)
xcrun simctl list devices | grep "Apple TV"
~/code/flutter-tvos/bin/flutter-tvos run -d <sim id> --dart-define=RELAY_HOST=localhost
xcrun simctl io <sim id> screenshot tv.png            # TV screenshot

# 5. phone: any browser at http://localhost:4242 → Companion Mode → Connect
```

Caveats: the relay has **one table slot** — a second TV takes it over and the first one stops
with "Another TV took over" (`relay-protocol.md`); stop the simulator app before testing with the
real Apple TV on the VPS relay. Browser automation cannot see Flutter's canvas; drive it by
screenshots + coordinates (Playwright), or enable Flutter semantics for labels
(`docs/action.md` "planned workflow"). Test map: `test_assets/test_map.dd2vtt` (3.6 MB).

## android bench (Mac, set up 2026-10-10) — the main local setup

The real targets are **Android TV / Google TV** (the Xiaomi box runs Google TV, Android 14) and an
**Android phone/tablet** running the same APK in companion mode — so the Mac emulates exactly that.
iPhone/Apple TV simulators (above, `apple-tv-dev.md`) remain a secondary option.

| AVD | image | why |
|---|---|---|
| `bm_tv` | `system-images;android-34;google-tv;arm64-v8a`, `tv_1080p`, 2 GB RAM | same OS + memory as the Xiaomi box; D-pad = arrow keys + Return in the emulator window |
| `bm_tablet` | `system-images;android-36;google_apis;arm64-v8a`, `pixel_tablet` | companion as native APK (touch, pinch: hold ⌥ + drag) |

Both have `hw.keyboard=yes` and `hw.gpu.mode=host` in `~/.android/avd/<name>.avd/config.ini`.
Flutter uses Homebrew's JDK 17 (`flutter config --jdk-dir /opt/homebrew/opt/openjdk@17`).

```bash
tools/android_bench.sh        # boots both AVDs, starts relay :9090 + dev server :4242,
                              # adb reverse both ports into each emulator (idempotent)
F=~/code/flutter-tvos/flutter/bin/flutter
$F run -d emulator-5556 --dart-define=RELAY_HOST=localhost   # TV: select "TV Mode"
$F run -d emulator-5554 --dart-define=RELAY_HOST=localhost   # tablet: Companion → Connect
```

`adb reverse` is what lets `RELAY_HOST=localhost` work inside an emulator (its own localhost is
not the Mac's; the alternative is `10.0.2.2`). Serial numbers follow boot order — check
`adb devices` / `adb -s <serial> emu avd name`. Test map for the tablet's file picker:
`adb -s <tablet> push test_assets/test_map.dd2vtt /sdcard/Download/`.

Without `flutter run` (no process to keep alive; skips the mode selector, reopens the TV's game):

```bash
$F build apk --debug --dart-define=RELAY_HOST=localhost
APK=build/app/outputs/flutter-apk/app-debug.apk
adb -s emulator-5556 install -r $APK && adb -s emulator-5556 shell "am start -S -n com.example.battlemap/.MainActivity --es route /restore"
adb -s emulator-5554 install -r $APK && adb -s emulator-5554 shell "am start -S -n com.example.battlemap/.MainActivity --es route /companion"
```

Before 2026-10-10 a debug build launched with a route showed a red screen (`MaterialApp` had
`home` *and* `onGenerateInitialRoutes` — an assert release builds skip); fixed in `main.dart`.

**Reading the TV from a script:** a relay client that just joined (`bench_bot.Bot`) receives no
`vtt.fullState` until something changes on the TV — ask `diag.status` (`Bot.status()`): view,
session, `tvWidthInches`, `tvCameraMode`, `table` (`34x19`), `tableWindow`. The TV only broadcasts
on change; since 1.1.9 a camera move alone counts as a change.

Verified 2026-10-10: debug APK on both, TV registers as table, tablet connects as companion,
both show the (empty) map library and "Companion connected". Limits: an emulator says nothing
about the Mali-G310 / 2 GB performance — check that on the real box before a release.
