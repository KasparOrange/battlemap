#!/usr/bin/env bash
# Rolling deploy: put a new build on the real devices mid-game, with only a
# short break — battlemap's version of mytube's "deploy restore".
#
#   tools/deploy.sh            # tv + tablet + web
#   tools/deploy.sh tv         # APK onto the Xiaomi box, reopen the running game
#   tools/deploy.sh tablet     # same APK onto the tablet, reopen Companion Mode
#                              # (tablet without the app: reopen its Chrome tab)
#   tools/deploy.sh web        # web companion onto the VPS (browser fallback)
#   tools/deploy.sh tv --here  # build this checkout's working tree
#
# Default build source is a clean worktree of HEAD, so other sessions'
# unfinished edits in this checkout never ship; commit first, or pass --here.
#
# tv: build while the old app keeps running → ask the TV where it is
# (diag.status) → deploy.prepare (TV saves now, shows "Updating…", the tablet
# gets a heads-up) → install -r over the Wi-Fi (data kept) → relaunch with the
# route /restore?session=… → wait until the TV shows that game again.
# Also keeps the box awake for good (inattentive sleep, screen timeout,
# screensaver off; no CEC standby to the TV) — docs/setup.md "box asleep mid-game".
# tablet: install -r → relaunch with the route /companion (connects without
# the mode selector; the TV resends its game). web: build → rsync to the VPS;
# a tablet that uses the browser gets its Chrome tab reopened at …/#/companion.
#
# Devices go through latrine's `android` adapter (a session's own adb can't
# reach the Wi-Fi). See docs/setup.md "rolling deploy".
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
F="${FLUTTER:-$HOME/code/flutter-tvos/flutter/bin/flutter}"
VENV="$HOME/.local/share/battlemap/venv"
TV_DEVICE="${BATTLEMAP_TV_DEVICE:-xiaomi}"
TABLET_DEVICE="${BATTLEMAP_TABLET_DEVICE:-tab}"
VPS="kaspar@72.62.88.197"
WEB_URL="http://72.62.88.197:4242"
PKG="com.example.battlemap"

targets=() here=0
for a in "$@"; do
  case "$a" in
    tv|tablet|web) targets+=("$a") ;;
    --here) here=1 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
[ ${#targets[@]} -eq 0 ] && targets=(tv tablet web)
has() { [[ " ${targets[*]} " == *" $1 "* ]]; }

[ -x "$VENV/bin/python" ] || { python3 -m venv "$VENV" && "$VENV/bin/pip" -q install websockets; }
ctl() { "$VENV/bin/python" "$REPO/tools/tv_ctl.py" "$@"; }
field() { python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('$1') or '')" "$2"; }

# ─── build (old app keeps running) ─────────────────────────────────
SRC="$REPO"
if [ "$here" = 0 ]; then
  SRC="$(mktemp -d)/battlemap"
  git -C "$REPO" worktree add -q --detach "$SRC" HEAD
  trap 'git -C "$REPO" worktree remove --force "$SRC" >/dev/null 2>&1 || true' EXIT
  echo "building $(git -C "$REPO" log --oneline -1) in a clean worktree"
else
  echo "building the working tree of $REPO"
fi
cd "$SRC"
if has tv || has tablet; then
  # shellcheck disable=SC1090
  . "$HOME/.config/mwlog/battlemap.env"
  "$F" build apk --release --dart-define=MWLOG_AUTH="$MWLOG_USER:$MWLOG_PASS" | tail -1
  APK="$SRC/build/app/outputs/flutter-apk/app-release.apk"
fi
if has web; then
  WEB_OUT="$(mktemp -d)/web"
  "$F" build web --release -o "$WEB_OUT" | tail -1
fi

# ─── web companion ─────────────────────────────────────────────────
if has web; then
  rsync -az --exclude uploads/ --exclude battlemap.apk --exclude api/ --exclude version.json \
    "$WEB_OUT/" "$VPS:~/battlemap/build/web/"
  echo "web build on the VPS"
fi

# ─── TV ────────────────────────────────────────────────────────────
if has tv; then
  status="$(ctl status 2>/dev/null || true)"
  view="" session="" map=""
  if [ -n "$status" ]; then
    view="$(field view "$status")"; session="$(field activeSessionId "$status")"; map="$(field activeMapId "$status")"
    echo "TV: view=$view session=${session:0:8}"
  else
    echo "TV did not answer over the relay — restoring from its own snapshot"
  fi
  route="/restore"
  [ "$view" = game ] && [ -n "$session" ] && route="/restore?session=$session&map=$map"

  if [ -n "$status" ]; then
    if ctl prepare >/dev/null 2>&1; then
      echo "TV saved its game (deploy.ready)"
    else
      echo "TV build without rolling deploy — waiting out its 2 s auto-save"
      sleep 3
    fi
  fi

  t0=$(date +%s)
  # The app's wake lock keeps the screen on, but Google TV's energy saver
  # ("inattentive sleep", 4 h without a remote key) ignores wake locks and
  # puts the box to sleep — HDMI-CEC then turns the TV off. Off for good,
  # together with every other way the box dozes off: screen timeout (stay on
  # while powered), screensaver, and the CEC standby it sends the TV on sleep.
  latrine android shell "settings put secure attentive_timeout -1; \
settings put global stay_on_while_plugged_in 7; \
settings put system screen_off_timeout 2147483647; \
settings put secure sleep_timeout -1; \
settings put secure screensaver_enabled 0; \
settings put secure screensaver_activate_on_sleep 0; \
cmd hdmi_control cec_setting set tv_send_standby_on_sleep 0" "$TV_DEVICE" >/dev/null || true
  latrine android install "$APK" "$TV_DEVICE"
  latrine android shell "am start -S -n $PKG/.MainActivity --es route '$route'" "$TV_DEVICE" >/dev/null
  if [ "$view" = game ] && [ -n "$session" ]; then
    if ctl wait-session "$session" 90 >/dev/null; then
      echo "TV back in the game after $(( $(date +%s) - t0 )) s"
    else
      echo "TV did not reopen session ${session:0:8} within 90 s — check it" >&2
      exit 1
    fi
  else
    echo "TV relaunched (was not in a game) after $(( $(date +%s) - t0 )) s"
  fi
fi

# ─── tablet (companion) ────────────────────────────────────────────
if has tablet; then
  if ! latrine android info "$TABLET_DEVICE" >/dev/null 2>&1; then
    echo "tablet not attached (wireless debugging off?) — skipped" >&2
  elif apps="$(latrine android apps battlemap "$TABLET_DEVICE" 2>/dev/null || true)"; grep -q "$PKG" <<<"$apps"; then
    latrine android install "$APK" "$TABLET_DEVICE"
    latrine android shell "am start -S -n $PKG/.MainActivity --es route /companion" "$TABLET_DEVICE" >/dev/null
    echo "tablet: companion relaunched"
  else
    # Browser companion: same application_id → Chrome reuses the tab; the
    # query forces the reload, #/companion connects without the selector.
    latrine android shell "am start -a android.intent.action.VIEW -d '$WEB_URL/?v=$(date +%s)#/companion' -p com.android.chrome --es com.android.browser.application_id battlemap" "$TABLET_DEVICE" >/dev/null
    echo "tablet: browser companion reopened"
  fi
fi
