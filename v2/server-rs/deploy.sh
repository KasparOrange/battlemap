#!/usr/bin/env bash
# Deploys the Rust server to the VPS next to the Bun one (docs/server-rs.md "deploy"):
#   1. cross-builds the static x86_64 Linux binary here (cargo zigbuild, musl),
#   2. copies it to ~/battlemap-v2-rs/bin/ on the VPS,
#   3. on the first deploy (or with --snapshot) copies a snapshot of the Bun server's data
#      (~/battlemap-v2/data → ~/battlemap-v2-rs/data), so the library is the same,
#   4. writes the systemd unit battlemap-v2-rs (port 5930, the Bun server's built app) and
#      restarts it,
#   5. checks /health and prints the memory (RSS) of both servers.
# The Bun server (battlemap-v2, 5929) and the Caddy routing of the live site are not touched.
#
# Usage: server-rs/deploy.sh [--no-build] [--snapshot]
# SSH reuses the session's open connection (v2/CLAUDE.md "git"); override with VPS_SSH.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
V2="$(cd "$HERE/.." && pwd)"
HOST="${VPS_HOST:-kaspar@72.62.88.197}"
SSH="${VPS_SSH:-ssh -o ControlPath=$HOME/.ssh/cm-claude-%r@%h-%p -o ControlMaster=no -o IdentityAgent=none -o ConnectTimeout=15}"
REMOTE=battlemap-v2-rs
BUN_REMOTE=battlemap-v2
PORT=5930
TARGET=x86_64-unknown-linux-musl
BIN="$HERE/target/$TARGET/release/battlemap-server"
BUILD="rs-$(git -C "$V2" rev-parse --short HEAD)$(git -C "$V2" diff --quiet -- server-rs || echo -dirty)"
BUILD_IT=1
SNAPSHOT=0
APP=0
for a in "$@"; do
  case "$a" in
    --no-build) BUILD_IT=0 ;;
    --snapshot) SNAPSHOT=1 ;;
    --app) APP=1 ;;
    *) echo "unknown option $a" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1m== %s\033[0m\n' "$*"; }
vps() { $SSH "$HOST" "$@"; }

if [[ $BUILD_IT == 1 ]]; then
  say "build $TARGET ($BUILD)"
  export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"
  (cd "$HERE" && cargo zigbuild --release --target "$TARGET" 2>&1 | tail -3)
fi
if [[ $APP == 1 ]]; then
  # The built app both servers serve (APP_DIR = ~/battlemap-v2/app); old assets stay, so open
  # tabs keep loading; the server sees the new build.json within 10 s and tells every page.
  say "build + copy the app to ~/$BUN_REMOTE/app"
  (cd "$V2" && bun run --cwd app build >/dev/null)
  test -f "$V2/app/dist/index.html"
  vps "mkdir -p ~/$BUN_REMOTE/app"
  rsync -az -e "$SSH" "$V2/app/dist/" "$HOST:$BUN_REMOTE/app/"
fi
test -x "$BIN"

say "copy to ~/$REMOTE"
vps "mkdir -p ~/$REMOTE/bin"
rsync -az -e "$SSH" "$BIN" "$HOST:$REMOTE/bin/battlemap-server.new"
vps "mv ~/$REMOTE/bin/battlemap-server.new ~/$REMOTE/bin/battlemap-server"

if [[ $SNAPSHOT == 1 ]] || ! vps "test -d ~/$REMOTE/data"; then
  say "data: snapshot of ~/$BUN_REMOTE/data"
  vps "test -d ~/$REMOTE/data && mv ~/$REMOTE/data ~/$REMOTE/data.before-\$(date +%Y%m%d%H%M) || true; cp -a ~/$BUN_REMOTE/data ~/$REMOTE/data && du -sh ~/$REMOTE/data"
fi

say "systemd unit $REMOTE"
vps "sudo -n tee /etc/systemd/system/$REMOTE.service >/dev/null" <<UNIT
[Unit]
Description=battlemap v2 server in Rust (side by side with battlemap-v2) — ~/battlemap-v2-rs, docs/server-rs.md
After=network-online.target
Wants=network-online.target

[Service]
User=kaspar
WorkingDirectory=/home/kaspar/$REMOTE
Environment=HOME=/home/kaspar
Environment=PORT=$PORT
Environment=HOST=0.0.0.0
Environment=APP_DIR=/home/kaspar/$BUN_REMOTE/app
Environment=DATA_DIR=/home/kaspar/$REMOTE/data
Environment=BATTLEMAP_SERVER_BUILD=$BUILD
Environment=BATTLEMAP_LOG_STDERR=1
ExecStart=/home/kaspar/$REMOTE/bin/battlemap-server
Restart=always
RestartSec=2
TimeoutStopSec=15
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
UNIT
vps "sudo -n systemctl daemon-reload && sudo -n systemctl enable $REMOTE >/dev/null 2>&1 && sudo -n systemctl restart $REMOTE"

say "checks"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  vps "curl -sf -m3 http://127.0.0.1:$PORT/health >/dev/null" && break
  sleep 1
done
vps "curl -s -m5 http://127.0.0.1:$PORT/health; echo"
vps "curl -s -m5 -o /dev/null -w 'bun 5929 /health: %{http_code}\n' http://127.0.0.1:5929/health"
vps "for u in $REMOTE $BUN_REMOTE; do pid=\$(systemctl show -p MainPID --value \$u); echo \"\$u pid \$pid rss \$(ps -o rss= -p \$pid | tr -d ' ') kB\"; done"
say "done — http://72.62.88.197:$PORT/health"
