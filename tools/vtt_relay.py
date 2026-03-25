#!/usr/bin/env python3
"""VTT WebSocket Relay — TV and phone both connect as clients.

Both the Xiaomi TV Box and the DM's iPhone connect to this relay.
Messages are forwarded between the paired table and companion.

Registration protocol:
  -> {"type": "register", "role": "table"|"companion"}
  <- {"type": "registered", "role": "...", "paired": true|false}
  <- {"type": "peer_connected"}  (when the other side connects)
  <- {"type": "peer_disconnected"}  (when the other side disconnects)
"""

import asyncio
import json
import logging
import os
import signal
import time
from datetime import datetime

import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("relay")

PORT = 9090
MAX_MSG_SIZE = 50 * 1024 * 1024  # 50 MB
UNIFIED_LOG_FILE = "/tmp/battlemap.log"
MAX_LOG_SIZE = 50 * 1024 * 1024  # 50 MB

PING_INTERVAL = 20  # seconds between pings
ZOMBIE_TIMEOUT = 45  # close if no message received for this long
REGISTER_TIMEOUT = 10  # seconds to wait for register message
RATE_WARN_THRESHOLD = 200  # messages/sec before warning

# Slots: at most one table and one companion at a time
slots = {}

# Per-connection metadata: ws -> {last_message_time, msg_count, rate_window_start}
conn_meta = {}


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
        "ts": datetime.now().strftime("%H:%M:%S"),
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

    now = time.monotonic()
    conn_meta[id(ws)] = {
        "last_message_time": now,
        "msg_count": 0,
        "rate_window_start": now,
        "role": None,
    }

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

            # Ignore pong responses
            if msg_type == "pong":
                continue

            # Registration
            if msg_type == "register":
                role = msg.get("role")
                if role not in ("table", "companion"):
                    await ws.send(json.dumps({"type": "error", "msg": "invalid role"}))
                    continue

                # Replace existing connection for same role
                old = slots.get(role)
                if old and old != ws:
                    log.info("replace  %s (old connection)", role)
                    try:
                        await old.close()
                    except Exception:
                        pass

                slots[role] = ws
                if meta:
                    meta["role"] = role
                registered = True
                peer_role = "companion" if role == "table" else "table"
                paired = peer_role in slots
                await ws.send(json.dumps({
                    "type": "registered",
                    "role": role,
                    "paired": paired,
                }))
                log.info("register %s from %s:%s (paired=%s)", role, remote[0], remote[1], paired)
                relay_log("register", role=role, ip=remote[0], paired=paired)

                # Notify peer
                if paired:
                    await notify_peer(role, {"type": "peer_connected"})
                continue

            # Check registration timeout for unregistered connections
            if not registered and time.monotonic() > deadline:
                log.info("timeout  %s:%s (no register within %ds)", remote[0], remote[1], REGISTER_TIMEOUT)
                relay_log("register_timeout", ip=remote[0])
                await ws.close(1000, "registration timeout")
                return

            # Forward everything else to the peer
            if role:
                log.info("forward  %s -> peer  %s (%.1f KB)", role, msg_type, size_kb)
                peer_role = "companion" if role == "table" else "table"
                log_entry = {"from": role, "to": peer_role, "type": msg_type or "?", "size": size}
                # Log tv.log message content directly
                if msg_type == "tv.log":
                    log_entry["tvMsg"] = msg.get("msg", "")
                    log.info("  TV LOG: %s", msg.get("msg", ""))
                relay_log("forward", **log_entry)
                peer = slots.get(peer_role)
                if peer:
                    try:
                        await peer.send(raw)
                    except Exception as e:
                        log.warning("forward failed %s -> %s: %s", role, peer_role, e)
                else:
                    log.info("no peer for %s, dropping message", role)

    except websockets.ConnectionClosed as e:
        log.info("closed   %s code=%s reason=%s", role or "?", e.code, e.reason)
    except Exception as e:
        log.error("error    %s: %s", role or "?", e)
    finally:
        ping_task.cancel()
        conn_meta.pop(id(ws), None)
        if role and slots.get(role) == ws:
            del slots[role]
            log.info("disconn  %s from %s:%s", role, remote[0], remote[1])
            relay_log("disconnect", role=role, ip=remote[0])
            await notify_peer(role, {"type": "peer_disconnected"})
        else:
            log.info("disconn  %s:%s (unregistered)", remote[0], remote[1])
            relay_log("disconnect", ip=remote[0], role=role or "unregistered")


async def main():
    log.info("VTT relay starting on port %d (max_size=%d MB)", PORT, MAX_MSG_SIZE // (1024*1024))
    relay_log("start", port=PORT)
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


if __name__ == "__main__":
    asyncio.run(main())
