#!/usr/bin/env python3
"""Send diagnostic commands to the TV through the relay.

Usage:
  python3 tools/diag.py status      — query TV state
  python3 tools/diag.py ping        — check if TV is connected

Connects to the relay as a temporary companion, sends the command,
waits for a response, and disconnects. Only works when no real
companion is connected (it would get kicked off).
"""

import asyncio
import json
import sys

import websockets

RELAY_URL = "ws://127.0.0.1:9090"
TIMEOUT = 5


async def send_diag(command: str):
    try:
        async with websockets.connect(RELAY_URL, close_timeout=2) as ws:
            # Register as companion
            await ws.send(json.dumps({"type": "register", "role": "companion"}))
            resp = json.loads(await asyncio.wait_for(ws.recv(), TIMEOUT))

            if not resp.get("paired"):
                print("TV is not connected to the relay")
                return

            print(f"Paired with TV, sending diag.{command}...")

            # Send diagnostic command
            await ws.send(json.dumps({"type": f"diag.{command}"}))

            # Wait for response
            try:
                while True:
                    raw = await asyncio.wait_for(ws.recv(), TIMEOUT)
                    msg = json.loads(raw)
                    if msg.get("type", "").startswith("diag."):
                        print(json.dumps(msg, indent=2))
                        return
                    # Skip other messages (fullState, listing, etc.)
            except asyncio.TimeoutError:
                print("No diagnostic response from TV (timeout)")

    except ConnectionRefusedError:
        print("Cannot connect to relay on port 9090")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    asyncio.run(send_diag(cmd))
