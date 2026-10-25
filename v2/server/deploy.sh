#!/usr/bin/env bash
# Deploys battlemap v2's server and app to the VPS (docs/server.md "deploy"):
#   1. builds the app (app/dist) and the server bundle (server/dist) here,
#   2. copies them to ~/battlemap-v2/ on the VPS (old app assets stay, so open tabs keep loading),
#   3. installs bun (pinned) and sharp there if missing,
#   4. writes the systemd unit battlemap-v2 (port 5929) and restarts it,
#   5. adds the Caddy site battlemap.srv1189697.hstgr.cloud (HTTPS, WebSocket) if missing,
#   6. checks /health locally and over HTTPS, and that the old 4242 / 9090 still answer.
#
# Usage: server/deploy.sh [--no-build]
# SSH reuses the session's open connection (v2/CLAUDE.md "git"); override with VPS_SSH.
set -euo pipefail

V2="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-kaspar@72.62.88.197}"
SSH="${VPS_SSH:-ssh -o ControlPath=$HOME/.ssh/cm-claude-%r@%h-%p -o ControlMaster=no -o IdentityAgent=none -o ConnectTimeout=15}"
REMOTE=battlemap-v2
PORT=5929
SITE=battlemap.srv1189697.hstgr.cloud
BUN_VERSION=1.4.0
BUILD="$(git -C "$V2" rev-parse --short HEAD)$(git -C "$V2" diff --quiet -- server || echo -dirty)"

say() { printf '\033[1m== %s\033[0m\n' "$*"; }
vps() { $SSH "$HOST" "$@"; }

if [[ "${1:-}" != "--no-build" ]]; then
  say "build app + server ($BUILD)"
  (cd "$V2" && bun run --cwd app build >/dev/null && bun run --cwd server build >/dev/null)
fi
test -f "$V2/app/dist/index.html" && test -f "$V2/server/dist/server.js"

say "old services before"
vps "curl -s -m5 -o /dev/null -w '4242: %{http_code}\n' http://127.0.0.1:4242/library; curl -s -m5 -o /dev/null -w '9090: %{http_code}\n' http://127.0.0.1:9090/" || true

say "copy to ~/$REMOTE"
vps "mkdir -p ~/$REMOTE/server ~/$REMOTE/app ~/$REMOTE/data"
rsync -az -e "$SSH" "$V2/server/dist/server.js" "$V2/server/dist/import-v1-library.js" "$HOST:$REMOTE/server/"
rsync -az -e "$SSH" "$V2/app/dist/" "$HOST:$REMOTE/app/"
vps "cat > ~/$REMOTE/server/package.json" <<JSON
{ "name": "battlemap-v2-server-deploy", "private": true, "type": "module", "dependencies": { "sharp": "$(cd "$V2/server" && bun -e 'console.log(require("sharp/package.json").version)')" } }
JSON

say "bun $BUN_VERSION + sharp"
vps "test -x ~/.bun/bin/bun && ~/.bun/bin/bun --version | grep -qx '$BUN_VERSION' || (curl -fsSL https://bun.sh/install | bash -s 'bun-v$BUN_VERSION' >/dev/null)"
vps "cd ~/$REMOTE/server && ~/.bun/bin/bun install --production --silent && ~/.bun/bin/bun -e 'await import(\"sharp\").then(s => s.default.versions.vips && console.log(\"sharp ok\"))'"

say "systemd unit battlemap-v2"
vps "sudo -n tee /etc/systemd/system/battlemap-v2.service >/dev/null" <<UNIT
[Unit]
Description=battlemap v2 server (relay, files, library, backups) — ~/battlemap-v2, docs/server.md
After=network-online.target
Wants=network-online.target

[Service]
User=kaspar
WorkingDirectory=/home/kaspar/$REMOTE/server
Environment=HOME=/home/kaspar
Environment=PORT=$PORT
Environment=HOST=0.0.0.0
Environment=APP_DIR=/home/kaspar/$REMOTE/app
Environment=DATA_DIR=/home/kaspar/$REMOTE/data
Environment=BATTLEMAP_SERVER_BUILD=$BUILD
ExecStart=/home/kaspar/.bun/bin/bun /home/kaspar/$REMOTE/server/server.js
Restart=always
RestartSec=2
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
UNIT
vps "sudo -n systemctl daemon-reload && sudo -n systemctl enable battlemap-v2 >/dev/null 2>&1 && sudo -n systemctl restart battlemap-v2"

say "caddy site $SITE"
vps "bash -s" <<CADDY
set -e
F=/opt/victorialogs/Caddyfile
if ! grep -q '^$SITE ' \$F; then
  sudo -n cp -p \$F \$F.bak-\$(date +%Y%m%d%H%M)
  cat >> \$F <<'BLOCK'

# battlemap v2 (~/code/battlemap/v2, docs/server.md): app, relay /ws, files, library, backups.
# The server runs on the host (systemd battlemap-v2, port $PORT); 172.19.0.1 is the host on
# the victorialogs_default Docker network. Caddy upgrades /ws and adds X-Forwarded-For.
$SITE {
	encode zstd gzip
	reverse_proxy 172.19.0.1:$PORT
}
BLOCK
  sudo -n docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  sudo -n docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "site added"
else
  echo "site already there"
fi
CADDY

say "checks"
for i in 1 2 3 4 5 6 7 8 9 10; do
  vps "curl -sf -m3 http://127.0.0.1:$PORT/health >/dev/null" && break
  sleep 1
done
vps "curl -s -m5 http://127.0.0.1:$PORT/health; echo"
for i in 1 2 3 4 5 6 7 8 9 10; do  # a new site waits a few seconds for its certificate
  curl -sf -m20 "https://$SITE/health" >/dev/null && break
  sleep 3
done
curl -s -m20 "https://$SITE/health" | head -c 300 || true; echo
curl -s -m20 -o /dev/null -w "https app: %{http_code}\n" "https://$SITE/app/"
vps "curl -s -m5 -o /dev/null -w '4242: %{http_code}\n' http://127.0.0.1:4242/library; curl -s -m5 -o /dev/null -w '9090: %{http_code}\n' http://127.0.0.1:9090/" || true
say "done — https://$SITE/app/"
