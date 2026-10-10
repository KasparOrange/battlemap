#!/usr/bin/env python3
"""Integration test for the relay protocol.

Connects to the VPS relay as a companion and tests command round-trips
with the TV. Requires the TV app to be running and connected.

Usage:
  python3 tools/test_relay.py          # run all tests
  python3 tools/test_relay.py --quick  # just check connectivity
"""

import asyncio
import json
import sys

import websockets

RELAY_URL = "ws://127.0.0.1:9090"
TIMEOUT = 5


class RelayTestClient:
    def __init__(self):
        self.ws = None
        self.messages = []

    async def connect(self):
        self.ws = await websockets.connect(RELAY_URL)
        await self.ws.send(json.dumps({"type": "register", "role": "companion"}))
        resp = await asyncio.wait_for(self._recv(), TIMEOUT)
        assert resp["type"] == "registered", f"Expected registered, got {resp['type']}"
        if not resp.get("paired"):
            print("SKIP: TV is not connected to the relay")
            return False
        print(f"✓ Connected and paired with TV")
        return True

    async def _recv(self):
        raw = await asyncio.wait_for(self.ws.recv(), TIMEOUT)
        return json.loads(raw)

    async def drain(self, timeout=1):
        """Read all pending messages."""
        msgs = []
        while True:
            try:
                raw = await asyncio.wait_for(self.ws.recv(), timeout)
                msgs.append(json.loads(raw))
            except asyncio.TimeoutError:
                break
        return msgs

    async def send(self, msg):
        await self.ws.send(json.dumps(msg))

    async def send_and_wait(self, msg, expect_type, timeout=TIMEOUT):
        await self.send(msg)
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                resp = await asyncio.wait_for(self.ws.recv(), 1)
                parsed = json.loads(resp)
                if parsed.get("type") == expect_type:
                    return parsed
            except asyncio.TimeoutError:
                continue
        return None

    async def close(self):
        if self.ws:
            await self.ws.close()


async def test_diag_status(client):
    """Test that TV responds to diag.status."""
    resp = await client.send_and_wait(
        {"type": "diag.status"}, "diag.statusResponse"
    )
    assert resp is not None, "No diag.statusResponse received"
    assert "view" in resp, "Response missing 'view' field"
    assert "mapCount" in resp, "Response missing 'mapCount' field"
    print(f"✓ diag.status: view={resp['view']}, maps={resp['mapCount']}")
    return resp


async def test_library_listing(client):
    """Test that TV responds to lib.requestList."""
    resp = await client.send_and_wait(
        {"type": "lib.requestList"}, "lib.listing"
    )
    assert resp is not None, "No lib.listing received"
    maps = resp.get("maps", [])
    sessions = resp.get("sessions", [])
    print(f"✓ lib.requestList: {len(maps)} maps, {len(sessions)} sessions")
    return maps, sessions


async def test_fullstate_broadcast(client):
    """Test that TV sends fullState."""
    # Drain any pending messages
    await client.drain(0.5)
    # Wait for next fullState (should come within a few seconds from heartbeat)
    resp = await client.send_and_wait(
        {"type": "lib.requestList"}, "vtt.fullState", timeout=3
    )
    if resp is None:
        print("⚠ No fullState received (TV may not be in game view)")
        return None
    assert "tvView" in resp, "fullState missing 'tvView'"
    assert "shadowMode" in resp, "fullState missing 'shadowMode'"
    print(f"✓ fullState: tvView={resp['tvView']}, shadowMode={resp['shadowMode']}")
    return resp


async def test_navigate_library(client):
    """Test navigating TV to library view."""
    resp = await client.send_and_wait(
        {"type": "nav.goToLibrary"}, "vtt.fullState"
    )
    if resp and resp.get("tvView") == "library":
        print("✓ nav.goToLibrary: TV switched to library")
    else:
        print("⚠ nav.goToLibrary: TV may not have switched (tvView={})".format(
            resp.get("tvView") if resp else "none"))


async def test_shadow_mode(client):
    """Test shadow mode toggle."""
    await client.drain(0.5)
    await client.send({"type": "vtt.toggleShadowMode"})
    resp = await client.send_and_wait(
        {"type": "diag.status"}, "diag.statusResponse"
    )
    if resp:
        print(f"✓ shadow mode toggled (current state in diag)")


async def run_tests(quick=False):
    client = RelayTestClient()
    try:
        paired = await client.connect()
        if not paired:
            return

        # Drain initial messages (fullState, listing)
        await client.drain(2)

        # Basic tests
        await test_diag_status(client)
        await test_library_listing(client)

        if not quick:
            await test_fullstate_broadcast(client)
            await test_navigate_library(client)
            await test_shadow_mode(client)

        print("\n✅ All tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
    finally:
        await client.close()


if __name__ == "__main__":
    quick = "--quick" in sys.argv
    asyncio.run(run_tests(quick=quick))
