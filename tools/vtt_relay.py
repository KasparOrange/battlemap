#!/usr/bin/env python3
"""VTT WebSocket Relay — TV and phone both connect as clients.

Both the Xiaomi TV Box and the DM's iPhone connect to this relay.
Messages are forwarded between the paired table and companion.

Registration protocol:
  -> {"type": "register", "role": "table"|"companion"}
  <- {"type": "registered", "role": "...", "paired": true|false}
  <- {"type": "peer_connected"}  (when the other side connects)
  <- {"type": "peer_disconnected"}  (when the other side disconnects)

A third role, "bot", is for test automation (tools/bench_bot.py): it sits next
to the companion instead of replacing it. Bot messages go to the table; table
messages go to the companion AND the bot. Pairing is between table and
companion only — the bot never triggers peer_connected/peer_disconnected.

Diagnostics go to MwLog (tenant battlemap, src=relay) next to the TV's and the
companion's lines: connects, registers, drops with close code and lifetime,
messages that arrive in a burst right after a register (sent while offline,
delivered late), messages dropped for want of a peer, and a per-minute
traffic summary. Credentials: ~/.config/mwlog/battlemap.env. Forwards stay in
/tmp/battlemap.log (one line each, millisecond stamps).
"""

import asyncio
import base64
import json
import logging
import os
import queue
import signal
import threading
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone

import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("relay")

PORT = int(os.environ.get("VTT_RELAY_PORT", "9090"))  # override for tests
MAX_MSG_SIZE = 50 * 1024 * 1024  # 50 MB
UNIFIED_LOG_FILE = "/tmp/battlemap.log"
MAX_LOG_SIZE = 50 * 1024 * 1024  # 50 MB

PING_INTERVAL = 20  # seconds between pings
ZOMBIE_TIMEOUT = 45  # close if no message received for this long
REGISTER_TIMEOUT = 10  # seconds to wait for register message
RATE_WARN_THRESHOLD = 200  # messages/sec before warning

# Slots: at most one table, one companion and one bot at a time
slots = {}

# Who receives what a role sends (the bot listens to the table like a companion).
FORWARD_TO = {
    "table": ("companion", "bot"),
    "companion": ("table",),
    "bot": ("table",),
}

# Per-connection metadata: ws -> {last_message_time, msg_count, rate_window_start}
conn_meta = {}

# Messages arriving this soon after a register were sent before the client
# could know it was registered: they waited in its socket while offline.
# Only for clients that don't stamp `sent` (before 1.1.11): stamped ones
# drop commands while connecting (since 1.1.15), and their legitimate first
# requests (thumbnails after the listing) would look like a burst.
BURST_WINDOW = 0.5  # seconds
BURST_WARN = 3  # messages

# Messages dropped because the receiving side had no peer, per sender role.
dropped_no_peer = Counter()

# Forwarded traffic since the last summary: (from, type) -> [count, bytes].
traffic = {}
TRAFFIC_EVERY = 60  # seconds


def _load_mwlog_env():
    """Reads ~/.config/mwlog/battlemap.env; returns (insert URL, auth) or None."""
    path = os.path.expanduser("~/.config/mwlog/battlemap.env")
    env = {}
    try:
        with open(path) as f:
            for line in f:
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env[k] = v.strip().strip('"')
    except OSError:
        return None
    base, user, pw = env.get("MWLOG_URL"), env.get("MWLOG_USER"), env.get("MWLOG_PASS")
    if not (base and user and pw):
        return None
    url = (base.rstrip("/") + "/insert/jsonline"
           "?_stream_fields=app,src&_msg_field=msg&_time_field=ts")
    auth = "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()
    return url, auth


_mwlog = _load_mwlog_env()
_mwlog_queue = queue.Queue(maxsize=5000)


def mwlog(level, msg, **fields):
    """Queues one MwLog line (src=relay, tag=relay); a thread ships them."""
    if not _mwlog:
        return
    entry = {
        "app": "battlemap",
        "src": "relay",
        "level": level,
        "tag": "relay",
        "msg": msg,
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
    }
    entry.update({k: v for k, v in fields.items() if v is not None})
    try:
        _mwlog_queue.put_nowait(entry)
    except queue.Full:
        pass


def _mwlog_shipper():
    """Posts queued lines in batches; keeps a failed batch and retries."""
    url, auth = _mwlog
    pending = []
    while True:
        if not pending:
            pending.append(_mwlog_queue.get())
        while len(pending) < 500:
            try:
                pending.append(_mwlog_queue.get_nowait())
            except queue.Empty:
                break
        body = "\n".join(json.dumps(e, separators=(",", ":")) for e in pending).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json", "Authorization": auth})
        try:
            urllib.request.urlopen(req, timeout=10).read()
            pending = []
        except Exception as e:
            log.warning("mwlog ship failed (%d lines kept): %s", len(pending), e)
            pending = pending[-2000:]
            time.sleep(5)


def rotate_log_file():
    """Rotate the log file if it exceeds MAX_LOG_SIZE."""
    try:
        if os.path.exists(UNIFIED_LOG_FILE) and os.path.getsize(UNIFIED_LOG_FILE) > MAX_LOG_SIZE:
            rotated = UNIFIED_LOG_FILE + ".1"
            if os.path.exists(rotated):
                os.remove(rotated)
            os.rename(UNIFIED_LOG_FILE, rotated)
            log.info("rotated log file (exceeded %d MB)", MAX_LOG_SIZE // (1024 * 1024))
    except Exception as e:
        log.warning("log rotation failed: %s", e)


def relay_log(event, **fields):
    """Write a JSONL entry to the relay log file."""
    rotate_log_file()
    entry = {
        "ts": datetime.now().strftime("%H:%M:%S.%f")[:-3],
        "src": "relay",
        "event": event,
    }
    entry.update(fields)
    try:
        with open(UNIFIED_LOG_FILE, "a") as f:
            f.write(json.dumps(entry, separators=(",", ":")) + "\n")
    except Exception:
        pass


async def notify_peer(role, msg):
    """Send a message to the peer of the given role."""
    peer_role = "companion" if role == "table" else "table"
    peer = slots.get(peer_role)
    if peer:
        try:
            await peer.send(json.dumps(msg))
        except Exception as e:
            log.warning("notify_peer failed: %s", e)


def check_rate(ws):
    """Check message rate for a connection. Warn if exceeding threshold."""
    meta = conn_meta.get(id(ws))
    if not meta:
        return
    now = time.monotonic()
    elapsed = now - meta["rate_window_start"]
    if elapsed >= 1.0:
        rate = meta["msg_count"] / elapsed
        if rate > RATE_WARN_THRESHOLD:
            log.warning("rate limit: %s sending %.0f msg/sec (threshold %d)",
                        meta.get("role", "?"), rate, RATE_WARN_THRESHOLD)
            relay_log("rate_warning", role=meta.get("role", "?"), rate=round(rate))
            mwlog("warn", "High message rate", role=meta.get("role", "?"), rate=round(rate))
        # Reset window
        meta["msg_count"] = 0
        meta["rate_window_start"] = now


async def ping_loop(ws):
    """Send periodic pings. Close connection if no messages received within ZOMBIE_TIMEOUT."""
    try:
        while True:
            await asyncio.sleep(PING_INTERVAL)
            meta = conn_meta.get(id(ws))
            if not meta:
                return
            # Check for zombie
            elapsed = time.monotonic() - meta["last_message_time"]
            if elapsed > ZOMBIE_TIMEOUT:
                role = meta.get("role", "?")
                log.info("zombie    %s (no message for %.0fs), closing", role, elapsed)
                relay_log("zombie_close", role=role, silent_seconds=round(elapsed))
                mwlog("warn", "Closing silent connection (zombie)", role=role,
                      silentS=round(elapsed))
                await ws.close(1000, "zombie timeout")
                return
            # Send ping
            try:
                await ws.send(json.dumps({"type": "ping"}))
            except Exception:
                return
    except asyncio.CancelledError:
        return


async def handler(ws, path=None):
    role = None
    remote = ws.remote_address
    log.info("connect  %s:%s", remote[0], remote[1])
    relay_log("connect", ip=remote[0], port=remote[1])
    mwlog("debug", "Socket connected", ip=remote[0], port=remote[1])

    now = time.monotonic()
    conn_meta[id(ws)] = {
        "last_message_time": now,
        "msg_count": 0,
        "rate_window_start": now,
        "role": None,
    }
    opened = now
    registered_at = None
    burst = Counter()  # types forwarded within BURST_WINDOW of the register
    burst_logged = False
    register_sent = None  # the client's `sent` stamp on its register
    forwarded = 0
    close_code = close_reason = None

    # Start ping/pong keepalive loop
    ping_task = asyncio.create_task(ping_loop(ws))

    try:
        # Wait for registration with timeout
        registered = False
        deadline = time.monotonic() + REGISTER_TIMEOUT

        async for raw in ws:
            meta = conn_meta.get(id(ws))
            if meta:
                meta["last_message_time"] = time.monotonic()
                meta["msg_count"] += 1
                check_rate(ws)

            size = len(raw)
            size_kb = size / 1024
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                log.warning("bad JSON from %s (%.1f KB)", role or "?", size_kb)
                continue

            msg_type = msg.get("type")

            # Pongs answer the relay's own pings; a stamped one ("t") answers
            # the peer's ping and goes back to it (round-trip time).
            if msg_type == "pong" and "t" not in msg:
                continue

            # Registration
            if msg_type == "register":
                role = msg.get("role")
                if role not in FORWARD_TO:
                    await ws.send(json.dumps({"type": "error", "msg": "invalid role"}))
                    continue

                # Replace existing connection for same role
                old = slots.get(role)
                if old and old != ws:
                    log.info("replace  %s (old connection)", role)
                    try:
                        # Tell the old client why, so it stops auto-reconnecting
                        # (two devices in one role would otherwise swap the slot
                        # every second).
                        await old.send(json.dumps({"type": "replaced", "role": role}))
                    except Exception:
                        pass
                    try:
                        await old.close()
                    except Exception:
                        pass

                slots[role] = ws
                if meta:
                    meta["role"] = role
                registered = True
                peer_role = "table" if role == "bot" else "companion" if role == "table" else "table"
                paired = peer_role in slots
                await ws.send(json.dumps({
                    "type": "registered",
                    "role": role,
                    "paired": paired,
                }))
                log.info("register %s from %s:%s (paired=%s)", role, remote[0], remote[1], paired)
                relay_log("register", role=role, ip=remote[0], paired=paired)
                registered_at = time.monotonic()
                register_sent = msg.get("sent")
                burst_logged = isinstance(register_sent, int)  # new client: no check
                mwlog("info", "Registered", role=role, ip=remote[0], paired=paired,
                      registerMs=round((registered_at - opened) * 1000))
                peer_dropped = dropped_no_peer.pop(peer_role, 0)
                if peer_dropped:
                    mwlog("warn", "Dropped while this side was away", role=role,
                          fromRole=peer_role, count=peer_dropped)

                # Notify peer (the bot is invisible to pairing)
                if paired and role != "bot":
                    await notify_peer(role, {"type": "peer_connected"})
                continue

            # Check registration timeout for unregistered connections
            if not registered and time.monotonic() > deadline:
                log.info("timeout  %s:%s (no register within %ds)", remote[0], remote[1], REGISTER_TIMEOUT)
                relay_log("register_timeout", ip=remote[0])
                await ws.close(1000, "registration timeout")
                return

            # A burst right after register was queued on the client while it
            # was offline; report it once the window has passed.
            if registered_at is not None and not burst_logged:
                if time.monotonic() - registered_at <= BURST_WINDOW:
                    if msg_type != "ping":
                        burst[msg_type or "?"] += 1
                else:
                    burst_logged = True
                    n = sum(burst.values())
                    if n >= BURST_WARN:
                        log.warning("burst    %s sent %d messages right after register "
                                    "(queued while offline): %s", role, n, dict(burst))
                        relay_log("register_burst", role=role, count=n, types=dict(burst))
                        mwlog("warn", "Burst right after register (sent while offline)",
                              role=role, count=n, types=json.dumps(dict(burst)))

            # Forward everything else to the peer
            if role:
                forwarded += 1
                t = traffic.setdefault((role, msg_type or "?"), [0, 0])
                t[0] += 1
                t[1] += size
                if msg_type != "vtt.fullState":  # 20/s while paired — too noisy
                    log.info("forward  %s -> peer  %s (%.1f KB)", role, msg_type, size_kb)
                targets = FORWARD_TO[role]
                log_entry = {"from": role, "to": ",".join(targets), "type": msg_type or "?", "size": size}
                # Log tv.log message content directly
                if msg_type == "tv.log":
                    log_entry["tvMsg"] = msg.get("msg", "")
                    log.info("  TV LOG: %s", msg.get("msg", ""))
                relay_log("forward", **log_entry)
                delivered = False
                for peer_role in targets:
                    peer = slots.get(peer_role)
                    if not peer:
                        continue
                    delivered = True
                    try:
                        await peer.send(raw)
                    except Exception as e:
                        log.warning("forward failed %s -> %s: %s", role, peer_role, e)
                if not delivered:
                    log.info("no peer for %s, dropping message", role)
                    if msg_type != "ping":
                        dropped_no_peer[role] += 1

    except websockets.ConnectionClosed as e:
        close_code, close_reason = e.code, e.reason
        log.info("closed   %s code=%s reason=%s", role or "?", e.code, e.reason)
    except Exception as e:
        log.error("error    %s: %s", role or "?", e)
        mwlog("error", "Connection handler failed", role=role, error=str(e))
    finally:
        ping_task.cancel()
        meta = conn_meta.pop(id(ws), None)
        silent = round(time.monotonic() - meta["last_message_time"], 1) if meta else None
        lived = round(time.monotonic() - opened)
        if close_code is None:
            close_code = getattr(ws, "close_code", None)
        if role and slots.get(role) == ws:
            del slots[role]
            log.info("disconn  %s from %s:%s", role, remote[0], remote[1])
            relay_log("disconnect", role=role, ip=remote[0], code=close_code,
                      upS=lived, silentS=silent)
            # 1000/1001 = a clean close; 1006 = the socket died without a
            # close frame (network gone, app killed or paused).
            mwlog("info" if close_code in (1000, 1001) else "warn", "Disconnected",
                  role=role, ip=remote[0], closeCode=close_code,
                  closeReason=close_reason or None, upS=lived, silentS=silent,
                  forwarded=forwarded)
            if role != "bot":
                await notify_peer(role, {"type": "peer_disconnected"})
        else:
            log.info("disconn  %s:%s (unregistered)", remote[0], remote[1])
            relay_log("disconnect", ip=remote[0], role=role or "unregistered",
                      code=close_code)
            mwlog("debug", "Disconnected (replaced or never registered)",
                  role=role, ip=remote[0], closeCode=close_code, upS=lived)


async def traffic_loop():
    """Every TRAFFIC_EVERY seconds: one line of forwarded traffic by type."""
    while True:
        await asyncio.sleep(TRAFFIC_EVERY)
        if not traffic:
            continue
        snap = dict(traffic)
        traffic.clear()
        total = sum(c for c, _ in snap.values())
        top = sorted(snap.items(), key=lambda kv: -kv[1][0])[:12]
        mwlog("debug", "Traffic last minute", messages=total,
              kb=round(sum(b for _, b in snap.values()) / 1024),
              slots=",".join(sorted(slots)),
              types=json.dumps({f"{r}:{t}": c for (r, t), (c, _) in top}))


async def main():
    log.info("VTT relay starting on port %d (max_size=%d MB)", PORT, MAX_MSG_SIZE // (1024*1024))
    relay_log("start", port=PORT)
    if _mwlog:
        threading.Thread(target=_mwlog_shipper, daemon=True).start()
    else:
        log.warning("no ~/.config/mwlog/battlemap.env: relay diagnostics stay local")
    mwlog("info", "Relay starting", port=PORT)
    asyncio.create_task(traffic_loop())
    async with websockets.serve(
        handler,
        "0.0.0.0",
        PORT,
        max_size=MAX_MSG_SIZE,
    ):
        stop = asyncio.get_event_loop().create_future()
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, stop.set_result, None)
        log.info("VTT relay ready — waiting for connections")
        await stop
    log.info("VTT relay stopped")
    relay_log("stop")
    mwlog("info", "Relay stopped")
    time.sleep(1)  # let the shipper post the last lines


if __name__ == "__main__":
    asyncio.run(main())
