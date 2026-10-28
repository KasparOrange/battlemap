#!/usr/bin/env python3
"""The small plants of a big outdoor map (summervale): where every bush, fern, reed, cattail and
water lily stands, plus a trunk base under every canopy tree — placed from OUR layout, never from
the painting — and the one shared sprite atlas they are drawn from (docs/ai-art.md "Outdoor maps").

    python3 tools/mapgen/plants.py tools/mapgen/out/summervale/<run>   # → <run>/plants/

Inputs: the run's layout (meta.json), its canopy (`canopy/canopy.png` alpha + `canopy/trees.json`)
and the summer vegetation stills of the riverbend slice (docs/mockups/outdoor/veg, `ige` project
`summer-vegetation`); the atlas is cut by the slice's own code (prepare.py `build_types`: clumps,
under-copy, shadow) — shared sprites, not unique pixels, so one atlas serves the whole map.

Where (squares; never on roads/paths, buildings, props, bridges, the ford's crossing, in fields):
- bushes (hazel, elder, bramble): in the light at the wood's edge (outside the forest zone,
  0.15–1.1 sq past the canopy's rim), by the village houses, as hedges along the garden fences,
  a few at field edges;
- ferns: the forest floor's edge (inside the forest ≤ 3 sq from its edge, half under the canopy
  — seen when it lifts) and the rims of clearings;
- reeds + cattails on the calm, deep river's banks (long side along the bank), more round the mill;
- lilies on calm deep water 0.6–1.6 sq in from the bank, away from the ford, rocks and bridges.
Light is painted in from the upper left: ±15° turn, never mirrored, size ±15 %, brightness tint.

Output: plants/plants.json — `types` (atlas rects, the slice's fields), `plants` [type, layer, x,
y (squares), rot (°), scale, tint, cell "cx_cy" (512 px cells at 56 px/sq, = the ground/canopy
cells)], `cells` {cell: plant indices}; plants/atlas.webp; plants/plants-sheet.jpg (positions).
"""
import json
import math
import random
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import mapgen  # noqa: E402
import outdoor  # noqa: E402
import importlib.util  # noqa: E402

_p = importlib.util.spec_from_file_location("slice_prepare", HERE.parents[1] / "docs/mockups/outdoor/prepare.py")
prep = importlib.util.module_from_spec(_p)
_p.loader.exec_module(prep)

SMALL = ["hazel", "elder", "bramble", "fern", "reed", "cattail", "lily", "trunk1", "trunk2"]
CELL, PPS = 512, 56          # the ground's TV cells
rng = random.Random(13)


def build(run):
    t0 = time.time()
    spec = mapgen.load_spec(json.loads((run / "meta.json").read_text())["layout"])
    cols, rows = spec["grid"]
    out = run / "plants"
    out.mkdir(exist_ok=True)
    veg = [v for v in json.loads((prep.HERE / "veg" / "veg.json").read_text()) if v["name"] in SMALL]
    atlas = prep.Atlas()
    types = prep.build_types(veg, atlas)
    aw, ah = atlas.save(out / "atlas.webp")

    g = outdoor.Ground(spec)
    k = g.pps
    M = g.M
    kinds = np.array([""] + [z["kind"] for z in spec["zones"]])
    zk = kinds[g.zid]                                   # zone kind per raster px (with margin M)
    forest = zk == "forest"
    to_forest = ndi.distance_transform_edt(~forest) / k
    in_forest = ndi.distance_transform_edt(forest) / k
    field = zk == "field"
    to_field = ndi.distance_transform_edt(~field) / k
    to_garden = ndi.distance_transform_edt(zk != "garden") / k   # bushes keep a square off the beds
    canopy_a = Image.open(run / "canopy" / "canopy.png").getchannel("A").resize((cols * k, rows * k), Image.BILINEAR)
    can = np.asarray(canopy_a, float) / 255
    to_can = ndi.distance_transform_edt(can < 0.5) / k     # squares outside the canopy (0 under it)
    # a bush or fern never stands on painted grain or dirt (golden: R > G + 12, not dark), 0.3 sq clear of it
    gr = np.asarray(Image.open(run / "ground.png").convert("RGB").resize((cols * k, rows * k), Image.BOX), float)
    golden = (gr[..., 0] > gr[..., 1] + 12) & (gr[..., 1] > 80)          # grain, dirt (forest floor is dark: kept)
    green = ~ndi.maximum_filter(golden, size=5)
    trees = json.loads((run / "canopy" / "trees.json").read_text())["trees"]
    rocks = np.array([r[:2] for r in spec.get("rocks", [])], float).reshape(-1, 2)
    flow, water2 = g.flow, None
    w2 = Image.open(run / "water2.png").convert("RGBA")
    shallow = np.asarray(w2.getchannel("R").resize((cols * k, rows * k), Image.BILINEAR), float) / 255

    m = lambda a, x, y: g._m(a, x, y)                   # rasters with the margin
    at = lambda a, x, y: g.at(a, x, y)                   # map-sized rasters
    plants = []
    grid = {}                                            # spacing hash per layer: (layer, ix, iy) → [(x, y)]

    def free(layer, x, y, d):
        ix, iy = int(x // 4), int(y // 4)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for px, py in grid.get((layer, ix + dx, iy + dy), ()):
                    if math.hypot(x - px, y - py) < d:
                        return False
        return True

    def add(name, layer, x, y, d, **kw):
        if name not in types or not free(layer, x, y, d):
            return False
        grid.setdefault((layer, int(x // 4), int(y // 4)), []).append((x, y))
        plants.append({"type": name, "layer": layer, "x": round(x, 2), "y": round(y, 2), **kw})
        return True

    segs = np.array([a + b for f in spec.get("fences", []) for a, b in zip(f["points"], f["points"][1:])], float).reshape(-1, 4)
    ruins = [b["rect"] for b in spec["buildings"] if b.get("roof") == "none"]

    def fence_d(x, y):
        """Squares to the nearest fence or wall line (hedges and bushes keep off them)."""
        if not len(segs):
            return 99
        a, b = segs[:, :2], segs[:, 2:]
        ab = b - a
        t = np.clip(((np.array([x, y]) - a) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-9), 0, 1)
        return float(np.hypot(*(a + ab * t[:, None] - [x, y]).T).min())

    def land_ok(x, y, road=0.6, water=1.0, block=0.6):
        return (at(green, x, y) and 0.3 < x < cols - 0.3 and 0.3 < y < rows - 0.3 and g.road(x, y) > road
                and at(g.to_water, x, y) > water and not g.blocked(x, y, block) and fence_d(x, y) > 0.7
                and not any(rx - 1.2 < x < rx + rw + 1.2 and ry - 1.2 < y < ry + rh + 1.2 for rx, ry, rw, rh in ruins))

    bush = lambda: rng.choice(["hazel", "hazel", "hazel", "elder", "elder", "bramble"])
    darts = int(1500 * cols * rows / (34 * 19))

    # bushes in the light at the wood's edge: outside the forest zone, just past the canopy's rim
    # (the crowns hang over the zone's edge), not in a field
    for _ in range(darts):
        x, y = rng.uniform(0, cols), rng.uniform(0, rows)
        if m(forest, x, y) or m(field, x, y) or m(zk, x, y) in ("garden", "path"):
            continue
        if m(to_forest, x, y) > 4.0 or not 0.15 < at(to_can, x, y) < 1.1 or m(to_garden, x, y) < 1.0 or not land_ok(x, y):
            continue
        add(bush(), "bush", x, y, 2.2)
    # village: a few bushes by the houses' backs and corners (not in the square, gardens or paths)
    vill = [b["rect"] for b in spec["buildings"] if b.get("roof") != "none" and 30 < b["rect"][0] < 70 and b["rect"][1] < 40]
    for _ in range(darts // 4):
        x, y = rng.uniform(30, 70), rng.uniform(0, 40)
        if m(zk, x, y) not in ("meadow", "") or m(field, x, y):
            continue
        dist = min(max(bx - x, x - bx - bw, by - y, y - by - bh) for bx, by, bw, bh in vill)
        if 0.9 < dist < 2.2 and m(to_garden, x, y) > 1.0 and land_ok(x, y, road=0.7, block=0.7) and rng.random() < 0.5:
            add(bush(), "bush", x, y, 3.0)
    # a few at field edges (outside the field, along it)
    for _ in range(darts // 3):
        x, y = rng.uniform(0, cols), rng.uniform(0, rows)
        if m(field, x, y) or m(forest, x, y) or m(zk, x, y) in ("garden", "path") or not 0.5 < m(to_field, x, y) < 1.4:
            continue
        if at(can, x, y) > 0.2 or not land_ok(x, y, road=0.8):
            continue
        if rng.random() < 0.25:
            add(rng.choice(["hazel", "elder", "elder"]), "bush", x, y, 6.0)
    # hedges along the garden fences, just outside them
    for f in spec.get("fences", []):
        if not any(w in f["id"] for w in ("garden", "farm")):
            continue
        pts = f["points"]
        cx, cy = np.mean(pts, 0)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            L = math.hypot(x1 - x0, y1 - y0)
            for s in np.arange(0.8, L - 0.5, 1.9):
                x, y = x0 + (x1 - x0) * s / L, y0 + (y1 - y0) * s / L
                nx, ny = (y1 - y0) / L, -(x1 - x0) / L
                if (x + nx - cx) ** 2 + (y + ny - cy) ** 2 < (x - cx) ** 2 + (y - cy) ** 2:
                    nx, ny = -nx, -ny                      # outward
                x, y = x + nx * 0.9 + rng.uniform(-0.2, 0.2), y + ny * 0.9 + rng.uniform(-0.2, 0.2)
                if rng.random() < 0.6 and land_ok(x, y, road=0.5, block=0.5):
                    add(rng.choice(["hazel", "elder", "bramble", "hazel"]), "bush", x, y, 1.8)

    # ferns: the forest floor's edge (half under the canopy) and the rims of clearings
    for _ in range(darts):
        x, y = rng.uniform(0, cols), rng.uniform(0, rows)
        inner = m(in_forest, x, y)
        rim = m(zk, x, y) == "meadow" and m(to_forest, x, y) < 1.2 and m(in_forest, x, y) == 0
        if not ((m(forest, x, y) and inner < 3.0) or rim):
            continue
        if not land_ok(x, y, road=0.6, water=0.8, block=0.5):
            continue
        if rim and at(can, x, y) > 0.5 and rng.random() < 0.5:
            continue
        add("fern", "low", x, y, 2.0)

    # reeds and cattails on the calm, deep water's edge, long side along the bank
    r = outdoor.river_samples(spec)
    mill = next((b["rect"] for b in spec["buildings"] if b["id"] == "watermill"), None)
    for side in (1, -1):
        for i in range(0, len(r), 2):
            x, y, w, speed, sh, tx, ty = r[i]
            if speed > 0.2 or sh > 0.35 or not (0.5 < x < cols - 0.5):
                continue
            off = w / 2 - 0.25 + rng.uniform(-0.2, 0.15)
            bx, by = x - ty * side * off, y + tx * side * off
            if not (0 < by < rows) or g.road(bx, by) < 1.2 or g.blocked(bx, by, 1.2) or at(can, bx, by) > 0.6:
                continue
            near_mill = mill and math.hypot(bx - mill[0] - mill[2] / 2, by - mill[1] - mill[3] / 2) < 9
            if rng.random() < (0.85 if near_mill else 0.6):
                name = "reed" if rng.random() < 0.65 else "cattail"
                add(name, "reed", bx, by, 2.4 if near_mill else 2.8,
                    rot=round(math.degrees(math.atan2(ty, tx)) + rng.uniform(-12, 12), 1))

    # lilies on calm deep water, 0.6–1.6 squares in from the bank
    for _ in range(darts // 2):
        x, y = rng.uniform(0, cols), rng.uniform(0, rows)
        d = at(g.in_water, x, y)
        if not 0.6 < d < 1.6 or at(flow[..., 2], x, y) > 0.12 or at(shallow, x, y) > 0.2:
            continue
        if g.road(x, y) < 1.5 or g.blocked(x, y, 1.5) or (len(rocks) and np.hypot(*(rocks - [x, y]).T).min() < 2.0):
            continue
        if rng.random() < 0.5:
            add("lily", "lily", x, y, 3.2)

    # a trunk with its roots under every canopy tree (seen when the crown lifts)
    for t in trees:
        if t.get("species") in ("hazel", "elder"):
            continue
        add(rng.choice(["trunk1", "trunk2"]), "trunk", t["x"], t["y"], 0,
            size=round(0.55 * t["d"] / 2.2 * rng.uniform(0.9, 1.1), 2), rot=round(rng.uniform(0, 360), 1), tree=t["id"])

    for p in plants:
        p.setdefault("rot", round(rng.uniform(-15, 15), 1))
        p["scale"] = p.pop("size", None) or round(rng.uniform(0.85, 1.15), 2)
        p["tint"] = round(rng.uniform(0.96, 1.04), 3)    # brightness only
        p["cell"] = f"{int(p['x'] * PPS // CELL)}_{int(p['y'] * PPS // CELL)}"
    order = {"lily": 0, "reed": 1, "trunk": 2, "low": 3, "bush": 4}
    plants.sort(key=lambda p: (order[p["layer"]], p["y"]))
    cells = {}
    for i, p in enumerate(plants):
        cells.setdefault(p["cell"], []).append(i)
    counts = {}
    for p in plants:
        counts[p["type"]] = counts.get(p["type"], 0) + 1
    reach = max(types[p["type"]]["squares"] * p["scale"] for p in plants) / 2
    rec = {"cols": cols, "rows": rows, "pps": PPS, "cell": CELL, "atlas": {"file": "atlas.webp", "w": aw, "h": ah,
           "pps": prep.PPS, "gpu_mb": round(aw * ah * 4 / 2 ** 20, 1), "bytes": (out / "atlas.webp").stat().st_size},
           "mesh": prep.MESH, "types": types, "counts": counts, "reach_sq": round(reach, 2),
           "plants": plants, "cells": cells}
    (out / "plants.json").write_text(json.dumps(rec))
    print(f"{len(plants)} plants {counts}  atlas {aw}×{ah} ({rec['atlas']['gpu_mb']} MB GPU, "
          f"{rec['atlas']['bytes'] / 1e6:.2f} MB webp)  {time.time() - t0:.0f}s")
    return spec, rec


def draw(run, rec, roofs=None, scale=15, canopy=True, box=None, name="plants-sheet.jpg"):
    """Ground + roofs + plants (+ canopy) composited at `scale` px per square (or a full-res `box`
    of squares [x0, y0, x1, y1] at 56 px/sq) — a still of what the table draws at rest."""
    pps = PPS if box else scale
    x0, y0, x1, y1 = box or (0, 0, rec["cols"], rec["rows"])
    W, H = round((x1 - x0) * pps), round((y1 - y0) * pps)
    src = (round(x0 * PPS), round(y0 * PPS), round(x1 * PPS), round(y1 * PPS))
    img = Image.open(run / "ground.png").convert("RGBA").crop(src).resize((W, H), Image.LANCZOS)
    atlas = Image.open(run / "plants" / "atlas.webp").convert("RGBA")
    types = rec["types"]
    cache = {}

    def piece(t, rect):
        key = tuple(rect)
        if key not in cache:
            x, y, w, h = rect
            cache[key] = atlas.crop((x, y, x + w, y + h))
        return cache[key]

    def stamp(im, cx, cy, size_sq, rot, tint=1.0):
        k = size_sq * pps / max(im.size)
        if k * max(im.size) < 2:
            return
        s = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        if tint != 1.0:
            a = s.getchannel("A")
            s = Image.eval(s.convert("RGB"), lambda v: min(255, round(v * tint))).convert("RGBA")
            s.putalpha(a)
        s = s.rotate(-rot, Image.BICUBIC, expand=True)
        img.alpha_composite(s, (round((cx - x0) * pps - s.width / 2), round((cy - y0) * pps - s.height / 2)))

    for p in rec["plants"]:
        if not (x0 - 4 < p["x"] < x1 + 4 and y0 - 4 < p["y"] < y1 + 4):
            continue
        t = types[p["type"]]
        size = t["squares"] * p["scale"]
        if "shadow" in t and p["layer"] != "trunk":   # shadow away from the sun (upper left)
            sh = piece(t, t["shadow"])
            sh = sh.copy()
            sh.putalpha(sh.getchannel("A").point(lambda v: v * 0.45))
            stamp(sh, p["x"] + 0.18 * size, p["y"] + 0.18 * size, size, p["rot"])
        if "still" in t:
            stamp(piece(t, t["still"]), p["x"], p["y"], size, p["rot"], p["tint"])
        else:   # clumped bush: its clumps at rest = the still
            full = Image.new("RGBA", (t["w"], t["h"]), (0, 0, 0, 0))
            for c in t["clumps"]:
                full.alpha_composite(piece(t, c["rect"]), (int(c["x0"]), int(c["y0"])))
            stamp(full, p["x"], p["y"], size, p["rot"], p["tint"])
    if roofs:
        for r in roofs["roofs"]:
            sp = Image.open(run / "roofs" / r["file"]).convert("RGBA")
            sx, sy = r["x"] / PPS, r["y"] / PPS
            if sx > x1 or sy > y1 or sx + r["w"] / PPS < x0 or sy + r["h"] / PPS < y0:
                continue
            s = sp.resize((max(1, round(sp.width * pps / PPS)), max(1, round(sp.height * pps / PPS))), Image.LANCZOS)
            img.alpha_composite(s, (round((sx - x0) * pps), round((sy - y0) * pps)))
    if canopy:
        c = Image.open(run / "canopy" / "canopy.png").convert("RGBA").crop(src).resize((W, H), Image.LANCZOS)
        img.alpha_composite(c)
    return img.convert("RGB")


if __name__ == "__main__":
    run = Path(sys.argv[1]).resolve()
    spec, rec = build(run)
    rp = run / "roofs" / "roofs.json"
    roofs = json.loads(rp.read_text()) if rp.exists() else None
    t0 = time.time()
    sheet = draw(run, rec, roofs)
    d = ImageDraw.Draw(sheet)
    for i in range(1, 4):
        d.line([(i * 34 * 15, 0), (i * 34 * 15, sheet.height)], fill=(255, 255, 255), width=1)
        d.line([(0, i * 19 * 15), (sheet.width, i * 19 * 15)], fill=(255, 255, 255), width=1)
    sheet.save(run / "plants" / "sheet.jpg", quality=86)
    crops = {"village": (34, 12, 68, 31), "mill bank": (8, 20, 34, 34), "forest edge": (76, 56, 104, 72)}
    for name, b in crops.items():
        draw(run, rec, roofs, box=b).save(run / "plants" / f"crop-{name.replace(' ', '-')}.jpg", quality=88)
    print(run / "plants" / "sheet.jpg", f"{time.time() - t0:.0f}s")
