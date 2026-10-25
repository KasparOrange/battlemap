#!/usr/bin/env bash
# battlemap v2 shell — build the APKs.
#
#   ./build.sh            debug + release APKs
#   ./build.sh debug      debug only  (WebView remote debugging on)
#   ./build.sh release    release only
#
# Output: v2/shell/build/battlemap-<version>-<type>.apk
# The web app's dist (v2/app/dist) is bundled into the APK when it exists (Gradle task
# `shellAssets`, which also bundles pages/ and probe/). Build the app first for a full APK.
#
# Signing: both types use the local key ~/.config/battlemap/shell.jks (created here on first
# run; password "battlemap"). Copy that file to every machine that builds APKs for the same
# devices — a different key means Android refuses the update. See v2/docs/shell.md.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WHAT="${1:-all}"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ -z "${JAVA_HOME:-}" ]; then
  for jdk in /opt/homebrew/opt/openjdk@17 "$HOME/Library/Android/jdk"; do
    [ -x "$jdk/bin/java" ] && { export JAVA_HOME="$jdk"; break; }
  done
fi
[ -x "${JAVA_HOME:-}/bin/java" ] || { echo "no JDK 17 found — set JAVA_HOME"; exit 1; }

KEYSTORE="${BATTLEMAP_SHELL_KEYSTORE:-$HOME/.config/battlemap/shell.jks}"
if [ ! -f "$KEYSTORE" ]; then
  echo "creating the local signing key $KEYSTORE"
  mkdir -p "$(dirname "$KEYSTORE")"
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KEYSTORE" -storepass battlemap -keypass battlemap \
    -alias battlemap -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=battlemap, O=battlemap" >/dev/null
fi

case "$WHAT" in
  debug) TYPES=(debug) TASKS=(assembleDebug) ;;
  release) TYPES=(release) TASKS=(assembleRelease) ;;
  all) TYPES=(debug release) TASKS=(assembleDebug assembleRelease) ;;
  *) echo "usage: $0 [debug|release|all]"; exit 2 ;;
esac

if [ -f "$HERE/../app/dist/index.html" ]; then
  echo "bundling the web app from v2/app/dist"
else
  echo "no v2/app/dist — the APK starts on the shell's own page (key log, probe)"
fi

(cd "$HERE" && ./gradlew --quiet "${TASKS[@]}")

VERSION="$(sed -n 's/^shellVersionName=//p' "$HERE/gradle.properties")"
mkdir -p "$HERE/build"
for type in "${TYPES[@]}"; do
  apk="$HERE/app/build/outputs/apk/$type/app-$type.apk"
  [ -f "$apk" ] || continue
  out="$HERE/build/battlemap-$VERSION-$type.apk"
  cp "$apk" "$out"
  echo "built $out ($(du -h "$out" | cut -f1))"
done
