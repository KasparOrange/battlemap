#!/usr/bin/env python3
"""Bench robot: preload the test maps and play the game night against the TV.

Joins the relay in the "bot" role, next to the tablet companion (it does not
kick it off), and drives the TV with the same JSON commands the companion
sends. Assertions read the TV's own broadcasts (`vtt.fullState`, `lib.listing`,
`diag.statusResponse`); every scene also saves a TV screenshot via adb.

Usage (bench running, TV in TV Mode, tablet connected as companion):
  tools/bench_bot.py seed        # upload the test maps into the TV library
  tools/bench_bot.py run         # play docs/test-session.md, write a report
  tools/bench_bot.py run --stress  # also load the 30 MB castle (may crash the TV)
  tools/bench_bot.py all         # seed + run

The report lands in build/bench-report/<time>/report.md (+ screenshots); `--open`
also shows it in flagship's ledger pane (never by default: a run mustn't take
Konrad's screen). Needs the `websockets` module — run it
with the bench venv (tools/android_bench.sh creates it).
"""

import argparse
import asyncio
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

import websockets

REPO = Path(__file__).resolve().parent.parent
MAPS = REPO / "test_assets" / "maps"
RELAY = "ws://localhost:9090"
HTTP = "http://localhost:4242"
ADB = str(Path.home() / "Library/Android/sdk/platform-tools/adb")
PKG = "com.example.battlemap"

STRESS = "07-STRESS-castle-114x64-30MB.dd2vtt"


# ─── adb ───────────────────────────────────────────────────────────

def tv_serial() -> str:
    """Returns the adb serial of the running `bm_tv` emulator."""
    out = subprocess.run([ADB, "devices"], capture_output=True, text=True).stdout
    for serial in re.findall(r"^(emulator-\d+)\s+device$", out, re.M):
        name = subprocess.run([ADB, "-s", serial, "emu", "avd", "name"],
                              capture_output=True, text=True).stdout.split()[:1]
        if name == ["bm_tv"]:
            return serial
    sys.exit("bm_tv emulator not running — start tools/android_bench.sh first")


def screenshot(serial: str, path: Path) -> None:
    """Saves the TV screen as PNG."""
    png = subprocess.run([ADB, "-s", serial, "exec-out", "screencap", "-p"], capture_output=True).stdout
    path.write_bytes(png)


def map_coverage(png: Path) -> float:
    """Share of the screen (0–1) that differs from the empty dark background.

    Shrinks the screenshot to 64 px wide BMP with macOS `sips` and counts
    pixels that are not the TV shell's flat background gray (~#121212; dark
    fogged maps are darker or tinted, so brightness alone does not work).
    An empty game view (map failed to render) scores ~0.02; a fitted map 0.3+.
    """
    bmp = png.with_suffix(".bmp")
    subprocess.run(["sips", "-s", "format", "bmp", "-Z", "64", str(png), "--out", str(bmp)],
                   capture_output=True)
    data = bmp.read_bytes()
    bmp.unlink()
    offset = int.from_bytes(data[10:14], "little")
    width = int.from_bytes(data[18:22], "little", signed=True)
    height = abs(int.from_bytes(data[22:26], "little", signed=True))
    bpp = int.from_bytes(data[28:30], "little") // 8
    row = (width * bpp + 3) & ~3
    lit = 0
    for y in range(height):
        for x in range(width):
            i = offset + y * row + x * bpp
            b, g, r = data[i], data[i + 1], data[i + 2]
            if not (12 <= r <= 24 and 12 <= g <= 24 and 12 <= b <= 24):
                lit += 1
    return lit / (width * height)


def tv_app_alive(serial: str) -> bool:
    """True when the battlemap process runs on the TV."""
    return bool(subprocess.run([ADB, "-s", serial, "shell", "pidof", PKG],
                               capture_output=True, text=True).stdout.strip())


def tv_memory_mb(serial: str) -> int | None:
    """Total PSS of the battlemap process in MB, or None."""
    out = subprocess.run([ADB, "-s", serial, "shell", "dumpsys", "meminfo", PKG],
                         capture_output=True, text=True).stdout
    m = re.search(r"TOTAL PSS:\s+(\d+)", out) or re.search(r"TOTAL\s+(\d+)", out)
    return int(m.group(1)) // 1024 if m else None


# ─── relay client ──────────────────────────────────────────────────

class Bot:
    """A relay client in the `bot` role that remembers the TV's latest broadcasts."""

    def __init__(self):
        self.ws = None
        self.state: dict = {}
        self.listing: dict = {"maps": [], "sessions": []}
        self.diag: dict = {}
        self.errors: list[str] = []
        self.logs: list[str] = []
        self._reader = None

    async def connect(self) -> None:
        self.ws = await websockets.connect(RELAY, max_size=60 * 1024 * 1024)
        await self.ws.send(json.dumps({"type": "register", "role": "bot"}))
        reg = json.loads(await self.ws.recv())
        if not reg.get("paired"):
            sys.exit("TV is not on the relay — put the TV emulator into TV Mode")
        self._reader = asyncio.create_task(self._read())

    async def _read(self) -> None:
        async for raw in self.ws:
            msg = json.loads(raw)
            t = msg.get("type")
            if t == "vtt.fullState":
                self.state = msg.get("state", msg)
            elif t == "lib.listing":
                self.listing = msg
            elif t == "diag.statusResponse":
                self.diag = msg
            elif t == "tv.error":
                self.errors.append(msg.get("msg", ""))
            elif t == "tv.log":
                self.logs.append(msg.get("msg", ""))
            elif t == "ping":
                await self.ws.send(json.dumps({"type": "pong"}))

    async def send(self, msg_type: str, **fields) -> None:
        await self.ws.send(json.dumps({"type": msg_type, **fields}))

    async def status(self) -> dict:
        """Asks the TV for `diag.status` and returns the answer."""
        self.diag = {}
        await self.send("diag.status")
        await self.until(lambda: self.diag, 5)
        return self.diag

    async def until(self, cond, timeout: float = 10.0) -> bool:
        """Waits until [cond]() is truthy; False on timeout."""
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                if cond():
                    return True
            except (KeyError, TypeError, IndexError):
                pass
            await asyncio.sleep(0.1)
        return False

    async def close(self) -> None:
        if self._reader:
            self._reader.cancel()
        await self.ws.close()


def upload(path: Path) -> str:
    """PUTs [path] to the dev server and returns its download URL."""
    req = urllib.request.Request(f"{HTTP}/upload/{path.name}", data=path.read_bytes(), method="PUT")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return HTTP + json.loads(resp.read())["url"]


def grid_from_name(name: str) -> tuple[int, int] | None:
    """Reads `COLSxROWS` from a test-map file name."""
    m = re.search(r"(\d+)x(\d+)", name)
    return (int(m.group(1)), int(m.group(2))) if m else None


# ─── seed ──────────────────────────────────────────────────────────

async def add_map(bot: Bot, path: Path, timeout: float = 60) -> bool:
    """Uploads one map and waits until the TV lists it."""
    before = len(bot.listing.get("maps", []))
    url = upload(path)
    if path.suffix in (".dd2vtt", ".uvtt"):
        await bot.send("vtt.mapUploaded", url=url, displayName=path.stem)
    else:
        cols, rows = grid_from_name(path.name) or (20, 15)
        await bot.send("vtt.imageUploaded", url=url, displayName=path.stem, gridCols=cols, gridRows=rows)
    return await bot.until(lambda: len(bot.listing.get("maps", [])) > before, timeout)


async def seed(bot: Bot) -> None:
    """Uploads every test map (except the stress map) the TV does not have yet."""
    if not MAPS.exists():
        subprocess.run([sys.executable, str(REPO / "tools" / "fetch_test_maps.py")], check=True)
    await bot.send("lib.requestList")
    await bot.until(lambda: "type" in bot.listing, 5)
    have = {m["displayName"] for m in bot.listing.get("maps", [])}
    files = sorted(p for p in MAPS.iterdir() if p.name != STRESS and p.stem not in have)
    for path in files:
        ok = await add_map(bot, path)
        print(f"{'ok  ' if ok else 'FAIL'} {path.name}")
    # Every upload auto-starts "Session 1" on the TV; drop those so the library starts clean.
    for s in list(bot.listing.get("sessions", [])):
        await bot.send("lib.deleteSession", sessionId=s["id"])
    await bot.send("nav.goToLibrary")
    await asyncio.sleep(1)
    print(f"library: {len(bot.listing.get('maps', []))} maps")


# ─── game night ────────────────────────────────────────────────────

class Report:
    """Collects checks and screenshots, writes report.md."""

    def __init__(self, serial: str):
        self.serial = serial
        self.dir = REPO / "build" / "bench-report" / datetime.now().strftime("%Y-%m-%d_%H%M%S")
        self.dir.mkdir(parents=True)
        self.lines: list[str] = []
        self.passed = self.failed = 0

    def scene(self, title: str) -> None:
        self.lines += ["", f"## {title}", ""]
        print(f"\n== {title}")

    def check(self, ok: bool, what: str, detail: str = "") -> bool:
        mark = "✅" if ok else "❌"
        self.passed += ok
        self.failed += not ok
        self.lines.append(f"- {mark} {what}" + (f" — {detail}" if detail else ""))
        print(f"  {'ok  ' if ok else 'FAIL'} {what} {detail}")
        return ok

    def shot(self, name: str, expect_map: bool = True) -> None:
        """Saves a TV screenshot; with [expect_map], also checks a map is visible."""
        path = self.dir / f"{name}.png"
        screenshot(self.serial, path)
        if expect_map:
            cover = map_coverage(path)
            self.check(cover > 0.15, f"map visible on screen ({name})", f"{cover:.0%} of the screen")
        self.lines.append(f"\n![{name}]({name}.png)\n")

    def write(self) -> Path:
        head = [f"# bench report {self.dir.name}", "",
                f"**{self.passed} passed, {self.failed} failed** — TV emulator `bm_tv`, "
                "driven over the relay by `tools/bench_bot.py` (script: `docs/test-session.md`)."]
        out = self.dir / "report.md"
        out.write_text("\n".join(head + self.lines) + "\n")
        return out


def map_id(bot: Bot, prefix: str) -> str | None:
    """Library id of the map whose display name starts with [prefix]."""
    for m in bot.listing.get("maps", []):
        if m["displayName"].startswith(prefix):
            return m["id"]
    return None


def rect(cols: int, x0: int, y0: int, w: int, h: int) -> list[int]:
    """Fog cell indices (row * cols + col) of a rectangle."""
    return [y * cols + x for y in range(y0, y0 + h) for x in range(x0, x0 + w)]


async def start(bot: Bot, rep: Report, prefix: str, name: str) -> bool:
    """Starts a new session on the map [prefix]; waits until the TV shows it."""
    mid = map_id(bot, prefix)
    if not rep.check(mid is not None, f"map {prefix} is in the library"):
        return False
    await bot.send("nav.newSession", mapId=mid, name=name)
    ok = await bot.until(lambda: bot.state.get("activeMapId") == mid and bot.state.get("hasMap"), 30)
    rep.check(ok, f"TV opens {prefix} in game view", f"view={bot.state.get('tvView')}")
    await asyncio.sleep(1.5)  # let it render before the screenshot
    return ok


async def run(bot: Bot, rep: Report, stress: bool) -> None:
    serial = rep.serial
    await bot.send("lib.requestList")
    await bot.until(lambda: bot.listing.get("maps"), 5)

    rep.scene("0. prep")
    n = len(bot.listing.get("maps", []))
    rep.check(n >= 9, "library holds the test maps", f"{n} maps")
    rep.shot("0-library", expect_map=False)

    rep.scene("1. the tavern (03)")
    if await start(bot, rep, "03-", "Tavern"):
        cols = bot.state["gridCols"]
        rep.check(not bot.state.get("revealedCells"), "starts fully fogged")
        for x, y in [(6, 9), (7, 9), (8, 9), (9, 9), (10, 3), (12, 3)]:
            await bot.send("vtt.addToken", gridX=x, gridY=y)
        rep.check(await bot.until(lambda: len(bot.state["tokens"]) == 6), "6 tokens placed",
                  f"{len(bot.state.get('tokens', []))} on the TV")
        tok = bot.state["tokens"][0]
        await bot.send("vtt.moveToken", id=tok["id"], gridX=6, gridY=7)
        rep.check(await bot.until(lambda: bot.state["tokens"][0]["gridY"] == 7), "token moved by id")
        main_room = rect(cols, 1, 1, 14, 6)
        await bot.send("vtt.brushReveal", indices=main_room)
        rep.check(await bot.until(lambda: len(bot.state["revealedCells"]) >= len(main_room)),
                  "main room revealed", f"{len(bot.state.get('revealedCells', []))} cells")
        await bot.send("vtt.zoomToFit")
        await asyncio.sleep(1)
        rep.shot("1-tavern")

    rep.scene("2. the house (02) — doors")
    if await start(bot, rep, "02-", "House"):
        portals = bot.state.get("portalCount", 0)
        rep.check(portals >= 20, "door-heavy map loaded", f"{portals} doors/windows")
        initial = set(bot.state.get("openPortals", []))  # the file decides which start open
        flipped = set(range(0, 10, 2))
        for i in sorted(flipped):
            await bot.send("vtt.togglePortal", index=i)
        rep.check(await bot.until(lambda: set(bot.state["openPortals"]) == initial ^ flipped),
                  "5 doors toggled", f"{len(initial)} open at start → {len(bot.state.get('openPortals', []))}")
        await bot.send("vtt.togglePortal", index=0)
        rep.check(await bot.until(lambda: (0 in bot.state["openPortals"]) == (0 in initial)),
                  "door 0 toggled back")
        cols = bot.state["gridCols"]
        await bot.send("vtt.brushReveal", indices=rect(cols, 4, 6, 6, 5))
        ppg = 100  # 02 is 100 px per square
        await bot.send("vtt.setMeasure", x1=4.5 * ppg, y1=8.5 * ppg, x2=11.5 * ppg, y2=12.5 * ppg)
        rep.check(await bot.until(lambda: bot.state.get("measure")), "measure line on the TV")
        await asyncio.sleep(1)
        rep.shot("2-house")
        await bot.send("vtt.setMeasure")

    rep.scene("3. the fight (04)")
    if await start(bot, rep, "04-", "Fight"):
        cols = bot.state["gridCols"]
        for x, y in [(3, 6), (4, 6), (5, 7), (14, 5), (15, 8)]:
            await bot.send("vtt.addToken", gridX=x, gridY=y)
        await bot.send("vtt.revealAll")
        await bot.until(lambda: len(bot.state["revealedCells"]) >= cols * bot.state["gridRows"])
        await bot.send("vtt.setAoe", shape="circle", originX=14.5, originY=6.5, radius=4.0, angle=0.0)
        await asyncio.sleep(0.8)
        rep.shot("3a-fireball")
        await bot.send("vtt.setAoe", shape="cone", originX=5.0, originY=6.5, radius=3.0, angle=0.0)
        await asyncio.sleep(0.8)
        rep.shot("3b-cone")
        await bot.send("vtt.clearAoe")
        await bot.send("vtt.hideAll")
        await bot.until(lambda: not bot.state["revealedCells"])
        await bot.send("vtt.brushReveal", indices=rect(cols, 2, 4, 5, 5))
        rep.check(await bot.until(lambda: bot.state.get("canUndo")), "undo available after a fog stroke")
        await bot.send("vtt.undo")
        rep.check(await bot.until(lambda: bot.state.get("canRedo")), "redo available after undo")
        await bot.send("vtt.redo")
        rep.check(await bot.until(lambda: len(bot.state["revealedCells"]) == 25), "redo restores the 25 cells",
                  f"{len(bot.state.get('revealedCells', []))} cells")
        stroke = {"points": [[300, 500], [600, 520], [900, 480]], "color": "ffe53935", "width": 6.0}
        await bot.send("vtt.addStroke", stroke=stroke)
        rep.check(await bot.until(lambda: bot.state.get("strokes")), "drawing arrives on the TV")
        await bot.send("vtt.toggleRuler")
        rep.check(await bot.until(lambda: bot.state.get("rulerVisible")), "ruler shown")
        await asyncio.sleep(1)
        rep.shot("3c-fight")

    rep.scene("4. up the tower (05 → 06 → 05)")
    if await start(bot, rep, "05-", "Tower"):
        cols = bot.state["gridCols"]
        tower_session = bot.state.get("activeSessionId")
        await bot.send("vtt.brushReveal", indices=rect(cols, 0, 0, 6, 11))
        await bot.send("vtt.addToken", gridX=3, gridY=5)
        await bot.send("vtt.addToken", gridX=4, gridY=5)
        await bot.until(lambda: len(bot.state["tokens"]) == 2 and len(bot.state["revealedCells"]) == 66)
        if await start(bot, rep, "06-", "Tower upper"):
            await bot.send("vtt.brushReveal", indices=rect(bot.state["gridCols"], 4, 4, 3, 3))
            await asyncio.sleep(1.5)  # auto-save
        await bot.send("nav.goToGame", mapId=map_id(bot, "05-"), sessionId=tower_session)
        back = await bot.until(lambda: bot.state.get("activeSessionId") == tower_session and bot.state.get("hasMap"), 30)
        saved = [x["id"] for x in bot.listing.get("sessions", [])]
        rep.check(back, "back on the ground floor session",
                  "" if back else f"wanted {tower_session}, TV on {bot.state.get('activeSessionId')}; saved: {tower_session in saved}")
        rep.check(await bot.until(lambda: len(bot.state["revealedCells"]) == 66), "fog of 05 kept",
                  f"{len(bot.state.get('revealedCells', []))}/66 cells")
        rep.check(len(bot.state.get("tokens", [])) == 2, "tokens of 05 kept", f"{len(bot.state.get('tokens', []))}/2")
        await asyncio.sleep(1)
        rep.shot("4-tower")

    rep.scene("5. something goes wrong — TV app killed")
    session = bot.state.get("activeSessionId")
    session_map = bot.state.get("activeMapId")
    revealed = len(bot.state.get("revealedCells", []))
    await asyncio.sleep(2)  # let auto-save run
    subprocess.run([ADB, "-s", serial, "shell", "am", "force-stop", PKG])
    bot.state = {}  # everything from here must come from the restarted app
    subprocess.run([ADB, "-s", serial, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1"],
                   capture_output=True)
    await asyncio.sleep(6)
    subprocess.run([ADB, "-s", serial, "shell", "input", "keyevent", "KEYCODE_DPAD_CENTER"])  # TV Mode
    diag = {}
    for _ in range(10):
        await asyncio.sleep(2)
        diag = await bot.status()
        if diag.get("relayState") == "paired":
            break
    rep.check(diag.get("relayState") == "paired", "TV back on the relay, companion paired", f"{diag.get('relayState')}")
    if session:
        await bot.send("lib.requestList")
        await asyncio.sleep(1)
        await bot.send("nav.goToGame", mapId=session_map, sessionId=session)
        ok = await bot.until(lambda: bot.state.get("activeSessionId") == session and bot.state.get("hasMap"), 30)
        rep.check(ok, "session resumes after the crash")
        rep.check(await bot.until(lambda: len(bot.state["revealedCells"]) == revealed), "fog survives the crash",
                  f"{len(bot.state.get('revealedCells', []))}/{revealed}")
        await asyncio.sleep(1)
        rep.shot("5-resumed")

    rep.scene("6. image maps")
    for prefix in ("08a-", "08b-", "09-"):
        if await start(bot, rep, prefix, f"Image {prefix}"):
            cols, rows = bot.state.get("gridCols"), bot.state.get("gridRows")
            expect = grid_from_name(next(m["displayName"] for m in bot.listing["maps"] if m["displayName"].startswith(prefix)))
            if prefix != "09-":
                rep.check((cols, rows) == expect, f"grid of {prefix} is {expect}", f"TV has {cols}x{rows}")
            await bot.send("vtt.revealAll")
            await asyncio.sleep(1.5)
            rep.shot(f"6-{prefix.strip('-')}")
    rep.lines.append("- 👀 check by eye: do the grid lines sit on the drawn squares in the 6-* screenshots?")

    if stress:
        rep.scene("7. stress — 30 MB castle")
        mem0 = tv_memory_mb(serial)
        t0 = time.monotonic()
        if map_id(bot, "07-"):  # uploaded by an earlier run: open it from the library
            await bot.send("nav.newSession", mapId=map_id(bot, "07-"), name="Castle")
        else:
            ok = await add_map(bot, MAPS / STRESS, timeout=180)
            rep.check(ok, "castle uploaded and listed", f"{time.monotonic() - t0:.0f} s")
        loaded = await bot.until(lambda: bot.state.get("portalCount") == 57 and bot.state.get("hasMap"), 120)
        rep.check(loaded, "castle state on the TV", f"{time.monotonic() - t0:.0f} s"
                  + (f", errors: {bot.errors[-2:]}" if bot.errors else ""))
        await asyncio.sleep(4)  # 17100×9600 px decode
        alive = tv_app_alive(serial)
        rep.check(alive, "TV app survives", f"memory {mem0} → {tv_memory_mb(serial)} MB")
        rep.shot("7-castle")

    await bot.send("nav.goToLibrary")
    if bot.errors:
        rep.scene("TV errors during the run")
        rep.lines += [f"- `{e}`" for e in bot.errors]


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["seed", "run", "all"])
    parser.add_argument("--stress", action="store_true", help="also load the 30 MB castle in `run`")
    parser.add_argument("--open", action="store_true", help="show the report in ledger when done")
    args = parser.parse_args()

    serial = tv_serial()
    bot = Bot()
    await bot.connect()
    try:
        if args.command in ("seed", "all"):
            await seed(bot)
        if args.command in ("run", "all"):
            rep = Report(serial)
            try:
                await run(bot, rep, args.stress)
            finally:
                out = rep.write()
                print(f"\n{rep.passed} passed, {rep.failed} failed — {out}")
                if args.open and shutil.which("ledger"):
                    subprocess.run(["ledger", "open", str(out)], capture_output=True)
            return 1 if rep.failed else 0
    finally:
        await bot.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
