# setup

## prerequisites

- VPS with Ubuntu (the dev machine — runs Flutter SDK, relay, servers)
- iPhone with SSH client (Prompt 3) for development
- Xiaomi TV Box S 3rd Gen (or any Android TV box) for the table display
- Flutter SDK installed on VPS

## VPS services

three Python servers run on the VPS:

| service | port | purpose |
|---------|------|---------|
| `tools/vtt_relay.py` | 9090 | WebSocket relay between TV and phone |
| `tools/dev_server.py` | 4242 | HTTP server: web build, APK download, map uploads |
| `tools/log_server.py` | 4243 | structured log receiver (JSONL) |

### starting services

```bash
# start all three (from project root)
python3 tools/vtt_relay.py >> /tmp/vtt_relay.log 2>&1 &
python3 tools/dev_server.py > /dev/null 2>&1 &
python3 tools/log_server.py > /dev/null 2>&1 &
```

### checking services

```bash
ss -tlnp | grep -E '4242|4243|9090'
curl -s http://127.0.0.1:4243/health
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

### TV update

from the companion app: tap the update icon in the library header → check for update → download & install.

or manually: open `http://<VPS_IP>:4242/battlemap.apk` in the TV browser.

## testing

```bash
flutter test                    # run all unit tests
flutter analyze                 # check for errors
```

## logs

```bash
tail -f /tmp/battlemap.log                          # all logs (TV + companion + relay)
grep '"src":"tv"' /tmp/battlemap.log                # TV only
grep '"src":"relay"' /tmp/battlemap.log              # relay events
grep '"event":"error"' /tmp/battlemap.log            # errors
python3 tools/diag.py status                         # query TV state
```

## relay config

the VPS IP is hardcoded in `lib/network/relay_config.dart`:

```dart
static const String host = '72.62.88.197';
static const int port = 9090;
```

change this if you move to a different VPS.
