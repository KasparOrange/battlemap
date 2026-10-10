#!/usr/bin/env python3
"""Download the realistic test-map set into test_assets/maps/ (gitignored).

The maps are other people's work (public GitHub repos without a license, Dyson
Logos' commercial-license blog maps), so they are fetched for local testing and
never committed. Two image maps are cut out of .dd2vtt files so the image
upload path gets full-colour maps with a known grid.

Usage:
  tools/fetch_test_maps.py                 # download into test_assets/maps/
  tools/fetch_test_maps.py --push SERIAL   # also adb push them to the device's Download/

See docs/test-session.md for what each map tests.
"""

import argparse
import base64
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "test_assets" / "maps"

RAW = "https://raw.githubusercontent.com"
LFS = "https://media.githubusercontent.com/media"

# (file name, url) — names carry grid size so the tester knows what to expect.
MAPS = [
    ("01-eldrica-house-10x8.dd2vtt", f"{RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/dom_eldrica.dd2vtt"),
    ("02-small-home-16x18.uvtt", f"{RAW}/mixtli/dungeon-lab/main/data/maps/Small-Home-16x18-L01-nogrid-lights.uvtt"),
    ("03-przerzut-16x16.dd2vtt", f"{RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/przerzut.dd2vtt"),
    ("04-vampire-lair-19x14.dd2vtt", f"{RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/vampiry.dd2vtt"),
    ("05-tower-ground-11x11.dd2vtt", f"{RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/tower_floor_0.dd2vtt"),
    ("06-tower-upper-11x11.dd2vtt", f"{RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/tower_floor_1.dd2vtt"),
    ("07-STRESS-castle-114x64-30MB.dd2vtt", f"{LFS}/guebertn/DNDMaps/main/champ/map.dd2vtt"),
    ("09-dyson-twelve-goats-tavern-6000px.png", "https://dysonlogos.blog/wp-content/uploads/2019/05/twelve-goats-tavern-grid.png"),
]

# Image maps cut out of a downloaded .dd2vtt: (source name, target name).
EXTRACT = [
    ("04-vampire-lair-19x14.dd2vtt", "08a-vampire-lair-image-19x14"),
    ("02-small-home-16x18.uvtt", "08b-small-home-image-16x18"),
]


def download(name: str, url: str) -> None:
    """Fetches [url] into OUT/[name] unless it is already there."""
    target = OUT / name
    if target.exists() and target.stat().st_size > 1024:
        print(f"have  {name}")
        return
    print(f"get   {name}")
    req = urllib.request.Request(url, headers={"User-Agent": "battlemap-test-maps"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        target.write_bytes(resp.read())


def extract_image(source: str, stem: str) -> None:
    """Writes the embedded image of a .dd2vtt as a plain image file (jpg/png/webp)."""
    data = json.loads((OUT / source).read_text())
    raw = base64.b64decode(data["image"])
    ext = "png" if raw[:4] == b"\x89PNG" else "webp" if raw[8:12] == b"WEBP" else "jpg"
    (OUT / f"{stem}.{ext}").write_bytes(raw)
    print(f"cut   {stem}.{ext}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--push", metavar="SERIAL", help="adb serial to push the maps (+ test_map.pdf) to")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    for name, url in MAPS:
        download(name, url)
    for source, stem in EXTRACT:
        extract_image(source, stem)

    if args.push:
        adb = Path.home() / "Library/Android/sdk/platform-tools/adb"
        files = sorted(OUT.iterdir()) + [REPO / "test_assets" / "test_map.pdf"]
        for f in files:
            subprocess.run([str(adb), "-s", args.push, "push", str(f), "/sdcard/Download/"],
                           check=True, capture_output=True)
        print(f"pushed {len(files)} files to {args.push}:/sdcard/Download/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
