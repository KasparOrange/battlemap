#!/usr/bin/env bash
# Android bench on the Mac: Google TV + tablet emulators against a local relay.
#
# Boots the AVDs `bm_tv` (Google TV, API 34, 2 GB like the Xiaomi box) and
# `bm_tablet` (Pixel Tablet, API 36) if they are not running, starts the relay
# (:9090) and dev server (:4242) if nothing listens there, and `adb reverse`s
# both ports into each emulator so a `RELAY_HOST=localhost` build reaches them.
#
# Then run the app per emulator (hot reload):
#   F=~/code/flutter-tvos/flutter/bin/flutter
#   $F run -d emulator-5556 --dart-define=RELAY_HOST=localhost   # TV → select TV Mode
#   $F run -d emulator-5554 --dart-define=RELAY_HOST=localhost   # tablet → Companion → Connect
#
# See docs/setup.md "android bench".
set -euo pipefail

SDK="$HOME/Library/Android/sdk"
ADB="$SDK/platform-tools/adb"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$HOME/.local/share/battlemap/venv"

running_avds() {
  for s in $("$ADB" devices | awk '/^emulator-/{print $1}'); do
    "$ADB" -s "$s" emu avd name 2>/dev/null | head -1 | tr -d '\r'
  done
}

running="$(running_avds)"   # captured: grep -q in a pipe would SIGPIPE it under pipefail
for avd in bm_tv bm_tablet; do
  if ! grep -qx "$avd" <<<"$running"; then
    echo "booting $avd"
    nohup "$SDK/emulator/emulator" -avd "$avd" -no-snapshot-save >"/tmp/${avd}_emu.log" 2>&1 &
  fi
done

echo "waiting for both emulators to finish booting"
for _ in $(seq 1 60); do
  booted=0
  for s in $("$ADB" devices | awk '/^emulator-.*device$/{print $1}'); do
    [ "$("$ADB" -s "$s" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && booted=$((booted + 1))
  done
  [ "$booted" -ge 2 ] && break
  sleep 5
done

if ! nc -z localhost 9090 2>/dev/null; then
  [ -x "$VENV/bin/python" ] || { python3 -m venv "$VENV" && "$VENV/bin/pip" -q install websockets; }
  nohup "$VENV/bin/python" "$REPO/tools/vtt_relay.py" >/tmp/bm_relay.out 2>&1 &
  echo "relay started (log: /tmp/bm_relay.out)"
fi
if ! nc -z localhost 4242 2>/dev/null; then
  mkdir -p "$REPO/build/web"
  BATTLEMAP_WEB_DIR="$REPO/build/web" nohup python3 "$REPO/tools/dev_server.py" >/tmp/bm_dev_server.out 2>&1 &
  echo "dev server started (log: /tmp/bm_dev_server.out)"
fi

for s in $("$ADB" devices | awk '/^emulator-.*device$/{print $1}'); do
  "$ADB" -s "$s" reverse tcp:9090 tcp:9090 >/dev/null
  "$ADB" -s "$s" reverse tcp:4242 tcp:4242 >/dev/null
  echo "$s $("$ADB" -s "$s" emu avd name | head -1 | tr -d '\r'): ports 9090 + 4242 reversed"
done
