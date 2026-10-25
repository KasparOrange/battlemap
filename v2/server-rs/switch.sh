#!/usr/bin/env bash
# Switches production (https://battlemap.srv1189697.hstgr.cloud) between the Rust server
# (battlemap-v2-rs, port 5930) and the Bun server (battlemap-v2, port 5929) — docs/server-rs.md
# "Production switch".
#
#   server-rs/switch.sh to-rust   stop Bun, copy its data to the Rust server (the old Rust data
#                                 is kept as data.before-<time>), restart Rust, point Caddy at
#                                 5930, leave Bun stopped + disabled (installed, the fallback)
#   server-rs/switch.sh to-bun    the way back: copy the Rust data to Bun (Bun's old data kept as
#                                 data.before-<time>), start + enable Bun, point Caddy at 5929,
#                                 stop + disable Rust
#   server-rs/switch.sh status    which port Caddy uses, both units, /health over HTTPS
#
# The data copy keeps every backup, library entry and file the active server took since the
# last switch. The old v1 services (4242, 9090) are only checked, never touched.
# SSH reuses the session's open connection (v2/CLAUDE.md "git"); override with VPS_SSH.
set -euo pipefail

HOST="${VPS_HOST:-kaspar@72.62.88.197}"
SSH="${VPS_SSH:-ssh -o ControlPath=$HOME/.ssh/cm-claude-%r@%h-%p -o ControlMaster=no -o IdentityAgent=none -o ConnectTimeout=15}"
SITE=battlemap.srv1189697.hstgr.cloud
CADDYFILE=/opt/victorialogs/Caddyfile

say() { printf '\033[1m== %s\033[0m\n' "$*"; }
vps() { $SSH "$HOST" "$@"; }

caddy_to() { # $1 = port
  vps "bash -s" <<CADDY
set -e
sudo -n cp $CADDYFILE $CADDYFILE.bak-\$(date +%Y%m%d%H%M%S)
sudo -n sed -i '/^$SITE {/,/^}/ s#reverse_proxy 172.19.0.1:[0-9]*#reverse_proxy 172.19.0.1:$1#' $CADDYFILE
grep -A3 '^$SITE {' $CADDYFILE
sudo -n docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
sudo -n docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
CADDY
}

checks() {
  vps "grep -A3 '^$SITE {' $CADDYFILE | grep reverse_proxy; for u in battlemap-v2 battlemap-v2-rs; do echo \"\$u: \$(systemctl is-active \$u) / \$(systemctl is-enabled \$u)\"; done"
  for _ in 1 2 3 4 5 6 7 8; do curl -sf -m10 "https://$SITE/health" >/dev/null && break; sleep 2; done
  curl -s -m10 "https://$SITE/health" | head -c 260; echo
  vps "curl -s -m5 -o /dev/null -w 'v1 4242: %{http_code}\n' http://127.0.0.1:4242/library; nc -z 127.0.0.1 9090 && echo 'v1 9090: open'" || true
}

case "${1:-}" in
  to-rust)
    say "stop Bun, copy its data to the Rust server"
    vps "set -e; sudo -n systemctl stop battlemap-v2; sudo -n systemctl stop battlemap-v2-rs
      test -d ~/battlemap-v2-rs/data && mv ~/battlemap-v2-rs/data ~/battlemap-v2-rs/data.before-\$(date +%Y%m%d%H%M)
      cp -a ~/battlemap-v2/data ~/battlemap-v2-rs/data && du -sh ~/battlemap-v2-rs/data
      sudo -n systemctl enable battlemap-v2-rs >/dev/null 2>&1; sudo -n systemctl start battlemap-v2-rs
      for i in 1 2 3 4 5 6 7 8 9 10; do curl -sf -m3 http://127.0.0.1:5930/health >/dev/null && break; sleep 1; done
      curl -sf -m3 http://127.0.0.1:5930/health >/dev/null"
    say "Caddy → 5930"
    caddy_to 5930
    vps "sudo -n systemctl disable battlemap-v2 >/dev/null 2>&1 || true"
    checks
    ;;
  to-bun)
    say "stop Rust, copy its data back to Bun"
    vps "set -e; sudo -n systemctl stop battlemap-v2-rs
      mv ~/battlemap-v2/data ~/battlemap-v2/data.before-\$(date +%Y%m%d%H%M)
      cp -a ~/battlemap-v2-rs/data ~/battlemap-v2/data && du -sh ~/battlemap-v2/data
      sudo -n systemctl enable battlemap-v2 >/dev/null 2>&1; sudo -n systemctl start battlemap-v2
      for i in 1 2 3 4 5 6 7 8 9 10; do curl -sf -m3 http://127.0.0.1:5929/health >/dev/null && break; sleep 1; done
      curl -sf -m3 http://127.0.0.1:5929/health >/dev/null"
    say "Caddy → 5929"
    caddy_to 5929
    vps "sudo -n systemctl disable battlemap-v2-rs >/dev/null 2>&1 || true"
    checks
    ;;
  status) checks ;;
  *) echo "usage: $0 to-rust | to-bun | status" >&2; exit 2 ;;
esac
