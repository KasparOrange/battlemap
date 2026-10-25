#!/usr/bin/env bash
# battlemap v2 — put the current app on a device and start it.
#
#   v2/tools/deploy-devices.sh <target> [options]
#
# Targets:
#   emu-tv | emu-tablet   the Android bench's emulators (AVDs bm_tv, bm_tablet); --boot starts them
#   box | tablet          the real Xiaomi TV Box S / Tab A11+ — at Juri's place through his PC
#                         (Tailscale subnet router), on the home Wi-Fi the same; reached over
#                         latrine's adb server (port 5059), which holds the Local Network grant
#   <serial>              any adb serial on the default adb server (e.g. emulator-5556)
#
# Options:
#   --mode tv|companion|auto   start mode (default: tv for emu-tv/box, companion for emu-tablet/tablet)
#   --url <url>|local|off      load the app from a dev URL instead of the bundled one; `local` =
#                              this Mac's Vite (adb reverse of the app + server ports, so it works
#                              on emulators and on network adb alike); `off` = the bundle again
#   --server <url>|local|off   the server the app talks to; `local` = this Mac's server (reversed)
#   --app-port <n>             Vite port for `local` (default $BATTLEMAP_APP_PORT or 5884)
#   --server-port <n>          server port for `local` (default $BATTLEMAP_SERVER_PORT or 5929)
#   --page probe|bench|keys    open the shell's probe, the app's bench page or the key log once
#   --type debug|release       APK type (default debug: WebView remote debugging on)
#   --no-build                 install the last built APK as it is
#   --boot                     boot the emulator first if it isn't running (headless)
#   --dry-run                  print the adb commands instead of running them
#
# Steps: build the app (bun run build) → build the shell APK with it (shell/build.sh) → install
# keeping the app's data (adb install -r) → start (am start -S … --es mode/url/server/page).
# Exit codes: 0 done, 2 usage, 3 device not reachable, 4 build failed, 5 install/start failed.
#
# One command per device later (see docs/qa.md "real devices"):
#   v2/tools/deploy-devices.sh box --server https://<vps>/      then  … tablet --server https://<vps>/
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
V2="$(cd "$HERE/.." && pwd)"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB_BIN="$SDK/platform-tools/adb"
PKG="app.battlemap.table"
BOX_ADDR="${BATTLEMAP_BOX_ADDR:-192.168.178.149:5555}"
TABLET_ADDR="${BATTLEMAP_TABLET_ADDR:-192.168.178.199:5555}"

usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
say() { printf 'deploy: %s\n' "$*"; }

[ $# -ge 1 ] || usage
TARGET="$1"; shift
MODE=""; URL=""; SERVER=""; PAGE=""; TYPE="debug"; BUILD=1; BOOT=0; DRY=0
APP_PORT="${BATTLEMAP_APP_PORT:-5884}"; SERVER_PORT="${BATTLEMAP_SERVER_PORT:-5929}"
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    --server-port) SERVER_PORT="$2"; shift 2 ;;
    --page) PAGE="$2"; shift 2 ;;
    --type) TYPE="$2"; shift 2 ;;
    --no-build) BUILD=0; shift ;;
    --boot) BOOT=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage ;;
    *) say "unknown option $1"; usage ;;
  esac
done
case "$TYPE" in debug|release) ;; *) say "--type must be debug or release"; exit 2 ;; esac

# ── which device, over which adb server ────────────────────────────────────────────────────
ADB_PORT=""      # empty = the default adb server (emulators); 5059 = latrine's
SERIAL=""
AVD=""
case "$TARGET" in
  emu-tv) AVD=bm_tv; DEFAULT_MODE=tv ;;
  emu-tablet) AVD=bm_tablet; DEFAULT_MODE=companion ;;
  box) ADB_PORT=5059; SERIAL="$BOX_ADDR"; DEFAULT_MODE=tv ;;
  tablet) ADB_PORT=5059; SERIAL="$TABLET_ADDR"; DEFAULT_MODE=companion ;;
  *) SERIAL="$TARGET"; DEFAULT_MODE=auto ;;
esac
MODE="${MODE:-$DEFAULT_MODE}"

adb() {
  if [ "$DRY" = 1 ]; then echo "  adb -s ${SERIAL:-<serial>} $*"; return 0; fi
  if [ -n "$ADB_PORT" ]; then ANDROID_ADB_SERVER_PORT="$ADB_PORT" "$ADB_BIN" -s "$SERIAL" "$@"
  else "$ADB_BIN" -s "$SERIAL" "$@"; fi
}

# The emulator serial of a running AVD, or nothing.
serial_of_avd() {
  for s in $("$ADB_BIN" devices | awk '/^emulator-.*device$/{print $1}'); do
    [ "$("$ADB_BIN" -s "$s" emu avd name 2>/dev/null | head -1 | tr -d '\r')" = "$1" ] && { echo "$s"; return; }
  done
}

if [ -n "$AVD" ]; then
  SERIAL="$(serial_of_avd "$AVD")"
  if [ -z "$SERIAL" ] && [ "$BOOT" = 1 ]; then
    say "booting $AVD headless (log: \$TMPDIR/claude-v2-emu-$AVD.log)"
    nohup "$SDK/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot-save \
      >"${TMPDIR:-/tmp}/claude-v2-emu-$AVD.log" 2>&1 &
    for i in $(seq 1 90); do
      SERIAL="$(serial_of_avd "$AVD")"
      if [ -n "$SERIAL" ] && [ "$("$ADB_BIN" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then break; fi
      SERIAL=""; [ $((i % 6)) = 0 ] && say "waiting for $AVD to boot [$((i * 2))s]"; sleep 2
    done
  fi
  [ -n "$SERIAL" ] || { say "$AVD is not running (add --boot, or tools/android_bench.sh)"; exit 3; }
elif [ -n "$ADB_PORT" ]; then
  # Real devices: latrine's adb server holds the grant for the Wi-Fi / Juri's subnet.
  command -v latrine >/dev/null || { say "latrine not found — needed to reach $TARGET"; exit 3; }
  if [ "$DRY" = 0 ]; then
    latrine android connect "$SERIAL" >/dev/null 2>&1 || true
    state="$(ANDROID_ADB_SERVER_PORT=$ADB_PORT "$ADB_BIN" -s "$SERIAL" get-state 2>/dev/null || true)"
    if [ "$state" != device ]; then
      say "$TARGET ($SERIAL) is not reachable over adb."
      say "  At Juri's: Tailscale on (tailscale status shows juri-pc), box/tablet switched on with"
      say "  network adb on :5555 — then: latrine android connect $SERIAL"
      say "  At home: latrine android devices (finds them on the Wi-Fi)."
      exit 3
    fi
  fi
fi
say "target $TARGET → $SERIAL (mode $MODE)"

# ── build ──────────────────────────────────────────────────────────────────────────────────
APK="$V2/shell/build/battlemap-$(sed -n 's/^shellVersionName=//p' "$V2/shell/gradle.properties")-$TYPE.apk"
if [ "$BUILD" = 1 ] && [ "$DRY" = 0 ]; then
  say "building the app (bun run build)"
  (cd "$V2" && bun run --cwd app build >"${TMPDIR:-/tmp}/claude-v2-deploy-build.log" 2>&1) || { say "app build failed — see \$TMPDIR/claude-v2-deploy-build.log"; exit 4; }
  say "building the shell APK ($TYPE) with the app inside"
  "$V2/shell/build.sh" "$TYPE" >>"${TMPDIR:-/tmp}/claude-v2-deploy-build.log" 2>&1 || { say "shell build failed — see \$TMPDIR/claude-v2-deploy-build.log"; exit 4; }
fi
[ "$DRY" = 1 ] || [ -f "$APK" ] || { say "no APK at $APK (drop --no-build)"; exit 4; }

# ── local dev URL / server through adb reverse ─────────────────────────────────────────────
if [ "$URL" = local ]; then
  adb reverse "tcp:$APP_PORT" "tcp:$APP_PORT" >/dev/null
  adb reverse "tcp:$SERVER_PORT" "tcp:$SERVER_PORT" >/dev/null
  URL="http://localhost:$APP_PORT/app/"
fi
if [ "$SERVER" = local ]; then
  adb reverse "tcp:$SERVER_PORT" "tcp:$SERVER_PORT" >/dev/null
  SERVER="http://localhost:$SERVER_PORT"
fi

# ── install, keeping data; start ───────────────────────────────────────────────────────────
say "installing $(basename "$APK") (keeps the app's data)"
adb install -r "$APK" >/dev/null || { say "install failed"; exit 5; }

# The bench is an app page: load it as the (kept) dev URL; `--url off` later returns to the app.
if [ "$PAGE" = bench ]; then
  [ -n "$URL" ] && [ "$URL" != off ] || { say "--page bench needs --url local|<url> (the bench is <url>/bench.html)"; exit 2; }
  URL="${URL%/}/bench.html"
fi
EXTRAS=(--es mode "$MODE")
[ -n "$URL" ] && EXTRAS+=(--es url "$URL")
[ -n "$SERVER" ] && EXTRAS+=(--es server "$SERVER")
case "$PAGE" in
  ""|bench) ;;
  probe|keys) EXTRAS+=(--es page "$PAGE") ;;
  *) say "--page must be probe, bench or keys"; exit 2 ;;
esac
say "starting ${EXTRAS[*]}"
adb shell am start -S -n "$PKG/.MainActivity" "${EXTRAS[@]}" >/dev/null || { say "start failed"; exit 5; }
say "done — logs: adb -s $SERIAL logcat -s battlemap  (MwLog: logq battlemap)"
