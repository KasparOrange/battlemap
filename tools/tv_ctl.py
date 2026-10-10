#!/usr/bin/env python3
"""Talk to the running TV app through the relay, as the "bot" role.

The bot sits next to the companion (it never kicks the tablet off) and sends
the same JSON commands the companion sends; the TV's answers reach it too.
Used by tools/deploy.sh (rolling deploy) and by hand.

Usage:
  tools/tv_ctl.py status            # the TV's view, map, session (diag.status) as JSON
  tools/tv_ctl.py prepare           # TV saves now + shows "updating" (deploy.prepare)
  tools/tv_ctl.py resume MAP SESSION  # open a saved session (nav.goToGame)
  tools/tv_ctl.py wait-session SESSION [SECONDS]  # until the TV shows that session's game

Relay: $BATTLEMAP_RELAY or ws://72.62.88.197:9090 (the VPS). Needs the
`websockets` module — run it with the bench venv
(~/.local/share/battlemap/venv, created by tools/android_bench.sh).
"""

import asyncio
import json
import os
import sys
import time

import websockets

RELAY = os.environ.get("BATTLEMAP_RELAY", "ws://72.62.88.197:9090")


async def _connect():
    """Opens a bot connection; returns the websocket once registered."""
    ws = await websockets.connect(RELAY, max_size=None, open_timeout=10)
    await ws.send(json.dumps({"type": "register", "role": "bot"}))
    return ws


async def _ask(ws, msg: dict, answer_type: str, timeout: float) -> dict | None:
    """Sends [msg] and returns the first message of [answer_type], or None."""
    await ws.send(json.dumps(msg))
    deadline = time.monotonic() + timeout
    while (left := deadline - time.monotonic()) > 0:
        try:
            raw = await asyncio.wait_for(ws.recv(), left)
        except asyncio.TimeoutError:
            break
        if isinstance(raw, bytes):
            continue
        got = json.loads(raw)
        if got.get("type") == answer_type:
            return got
    return None


async def status(timeout: float = 5) -> dict | None:
    """The TV's diag.statusResponse, or None if the TV does not answer."""
    async with await _connect() as ws:
        return await _ask(ws, {"type": "diag.status"}, "diag.statusResponse", timeout)


async def prepare(timeout: float = 5) -> dict | None:
    """Asks the TV to save and show the update notice; its deploy.ready or None.

    TV builds without rolling deploy ignore the command (None after [timeout]).
    """
    async with await _connect() as ws:
        return await _ask(ws, {"type": "deploy.prepare"}, "deploy.ready", timeout)


async def resume(map_id: str, session_id: str) -> None:
    """Opens [session_id] of [map_id] on the TV (as the companion's library would)."""
    async with await _connect() as ws:
        await ws.send(json.dumps({"type": "nav.goToGame", "mapId": map_id, "sessionId": session_id}))
        await asyncio.sleep(0.5)


async def wait_session(session_id: str, seconds: float) -> dict | None:
    """Polls diag.status until the TV is in the game view of [session_id]."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            st = await status(timeout=3)
        except (OSError, websockets.WebSocketException):
            st = None
        if st and st.get("view") == "game" and st.get("activeSessionId") == session_id \
                and st.get("hasLoadedMap"):
            return st
        await asyncio.sleep(1)
    return None


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    cmd = args[0]
    if cmd == "status":
        st = asyncio.run(status())
    elif cmd == "prepare":
        st = asyncio.run(prepare())
    elif cmd == "resume" and len(args) == 3:
        asyncio.run(resume(args[1], args[2]))
        return 0
    elif cmd == "wait-session" and len(args) in (2, 3):
        st = asyncio.run(wait_session(args[1], float(args[2]) if len(args) == 3 else 60))
    else:
        print(__doc__)
        return 2
    if st is None:
        print("no answer from the TV", file=sys.stderr)
        return 1
    print(json.dumps(st))
    return 0


if __name__ == "__main__":
    sys.exit(main())
