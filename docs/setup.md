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
| **Mac** (`~/code/battlemap`) | at home | Apple TV dev target via flutter-tvos (needs macOS + Xcode — `docs/apple-tv-dev.md`), everything else too |

Rules: commit + push from wherever you worked, `git pull --ff-only` on the other side before
starting; never leave uncommitted work behind on the VPS (it was invisible from the Mac for
months in 2026). Builds that need macOS live on the Mac; builds for the Xiaomi box live on the VPS.

## VPS services

two Python servers run on the VPS (the log server is retired — logs go to MwLog, see "logs" below):

| service | port | purpose |
|---------|------|---------|
| `tools/vtt_relay.py` | 9090 | WebSocket relay between TV and phone |
| `tools/dev_server.py` | 4242 | HTTP server: web build, APK download, map uploads |

### starting services

```bash
# start both (from project root) — NOTE: nothing restarts them after a reboot;
# they have been down since the 2026-07-07 reboot. TODO: systemd units.
python3 tools/vtt_relay.py >> /tmp/vtt_relay.log 2>&1 &
python3 tools/dev_server.py > /dev/null 2>&1 &
```

### checking services

```bash
ss -tln | grep -E '4242|9090'
```

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
line contains the pattern): run the pkill in a separate ssh call.

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

## testing

```bash
flutter test                    # run all unit tests
flutter analyze                 # check for errors
```

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
python3 -m venv /tmp/bm-venv && /tmp/bm-venv/bin/pip install websockets
/tmp/bm-venv/bin/python tools/vtt_relay.py &        # :9090, logs to /tmp/battlemap.log

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

Caveats: the relay has **one table slot** — stop the simulator app before testing with the
real Apple TV on the VPS relay. Browser automation cannot see Flutter's canvas; drive it by
screenshots + coordinates (Playwright), or enable Flutter semantics for labels
(`docs/action.md` "planned workflow"). Test map: `test_assets/test_map.dd2vtt` (3.6 MB).
