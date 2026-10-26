#!/usr/bin/env python3
"""The riverbend slice's assets: ground, water masks, roofs, the vegetation atlas and where every
plant stands (scene.json, read by riverbend.html).

    python3 prepare.py [run folder]   # default: the picked riverbend ground run

Inputs: a tools/mapgen/outdoor.py run (out_1.jpg, water*.png, roof_*.png, roofs.json), the layout
it was painted from, and veg/veg.json (the summer vegetation stills + clump label maps).
Plants are placed from the layout, never from the painting: trees in the forest zones (alders
near the water), ferns under them, bushes along the forest edge, reeds and cattails on the calm
muddy banks, lilies on calm water. Painted light comes from the upper left, so a plant is only
turned a little and never mirrored. Clumpy crowns are cut into their clumps here (grown 3 px into
their neighbours, feathered), plus a darkened copy that shows through the gaps and a blurred
silhouette for the shadow — all packed into one atlas, so the table draws every plant in one call.
"""
import json
import math
import random
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "tools" / "mapgen"))
import mapgen  # noqa: E402
import outdoor  # noqa: E402

RUN = REPO / "tools/mapgen/out/riverbend/261026-001219-ground"
ATLAS_W = 2048
GROW = 3
MESH = {"bush": 5, "reed": 8, "lily": 3, "fern": 5, "willow": 8, "spruce": 6, "tree": 6}

rng = random.Random(7)


# ---------------------------------------------------------------- atlas pieces


def clump_pieces(still, labels):
    """Each clump its own picture, grown GROW px into its neighbours with the same pixels and
    feathered there (at rest the tree is exactly the still); sorted outer first."""
    A = np.asarray(still)
    lab = np.asarray(labels)
    H, W = lab.shape
    alpha = A[..., 3].astype(float)
    cy, cx = ndi.center_of_mass(alpha)
    R = max(W, H) / 2
    out = []
    for k in [i for i in np.unique(lab) if i]:
        region = lab == k
        ys, xs = np.nonzero(region)
        x0, y0 = max(0, xs.min() - GROW), max(0, ys.min() - GROW)
        x1, y1 = min(W - 1, xs.max() + GROW), min(H - 1, ys.max() + GROW)
        sub = region[y0:y1 + 1, x0:x1 + 1]
        best = np.clip(1 - ndi.distance_transform_edt(~sub) / (GROW + 1), 0, 1)
        piece = A[y0:y1 + 1, x0:x1 + 1].copy()
        piece[..., 3] = (piece[..., 3] * np.minimum(1, best * 1.6)).astype(np.uint8)
        py, px = ndi.center_of_mass(region)
        rx, ry = (px - cx) / R, (py - cy) / R
        out.append({"img": Image.fromarray(piece, "RGBA"), "x0": int(x0), "y0": int(y0),
                    "pivot": [round(px - rx * R * 0.18, 1), round(py - ry * R * 0.18, 1)],
                    "r": round(min(1, math.hypot(rx, ry)), 3), "seed": round(rng.random(), 3)})
    out.sort(key=lambda p: -p["r"])
    return out


def under_copy(still):
    """The darkened, slightly blurred crown that shows through the gaps as shade."""
    rgb = ImageEnhance.Color(ImageEnhance.Brightness(still.convert("RGB")).enhance(0.5)).enhance(0.8)
    img = rgb.convert("RGBA")
    img.putalpha(still.getchannel("A"))
    return img.filter(ImageFilter.GaussianBlur(2))


def shadow_of(still):
    """A soft black silhouette (alpha blurred by ~2.5 % of the size)."""
    a = still.getchannel("A").filter(ImageFilter.GaussianBlur(max(still.size) * 0.025))
    img = Image.new("RGBA", still.size, (0, 0, 0, 0))
    img.putalpha(a)
    return img


class Atlas:
    """A shelf packer: pictures in rows of a 2048-wide sheet, 2 px apart."""

    def __init__(self):
        self.items, self.x, self.y, self.row = [], 2, 2, 0

    def add(self, img):
        if self.x + img.width + 2 > ATLAS_W:
            self.x, self.y, self.row = 2, self.y + self.row + 2, 0
        rect = [self.x, self.y, img.width, img.height]
        self.items.append((img, rect))
        self.x += img.width + 2
        self.row = max(self.row, img.height)
        return rect

    def save(self, path):
        h = 1 << math.ceil(math.log2(self.y + self.row + 2))
        sheet = Image.new("RGBA", (ATLAS_W, h), (0, 0, 0, 0))
        for img, (x, y, _, _) in self.items:
            sheet.paste(img, (x, y))
        sheet.save(path, quality=90, alpha_quality=100, method=6)
        return ATLAS_W, h


def build_types(veg, atlas):
    """Per vegetation type: kind, size, centre, atlas rects for still / under / shadow / clumps."""
    types = {}
    for v in veg:
        still = Image.open(HERE / "veg" / v["still"]).convert("RGBA")
        kind = {"willow": "willow", "spruce": "spruce", "fern": "fern"}.get(v["name"], v["kind"])
        t = {"kind": kind, "squares": v["squares"], "w": still.width, "h": still.height,
             "centre": v["centre"], "shadow": atlas.add(shadow_of(still))}
        if v.get("parts"):
            labels = Image.open(HERE / "veg" / v["parts"]["file"])
            t["under"] = atlas.add(under_copy(still))
            t["clumps"] = []
            for p in clump_pieces(still, labels):
                rect = atlas.add(p.pop("img"))
                t["clumps"].append({"rect": rect, **p})
        else:
            t["still"] = atlas.add(still)
        types[v["name"]] = t
    return types


# ---------------------------------------------------------------- placement


def inside(poly, x, y):
    """Ray-casting point-in-polygon."""
    c = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            c = not c
    return c


class Ground:
    """What the layout says about a point: in which zone, how far from water, roads, buildings."""

    def __init__(self, spec, pps=8):
        self.spec, self.pps = spec, pps
        cols, rows = spec["grid"]
        water, water2, _ = outdoor.masks(spec, pps)
        self.water = np.asarray(water)[..., 3] > 127
        self.flow = np.asarray(water).astype(float) / 255
        self.to_water = ndi.distance_transform_edt(~self.water) / pps   # 0 in water
        self.in_water = ndi.distance_transform_edt(self.water) / pps    # 0 on land
        self.paths = [(outdoor.catmull(p["points"], 0.2)[:, :2], p["width"] / 2) for p in spec.get("paths", [])]
        self.blocks = [b["rect"] for b in spec.get("buildings", []) + spec.get("props", []) + spec.get("bridges", [])]
        self.cols, self.rows = cols, rows

    def at(self, a, x, y):
        X = int(np.clip(x * self.pps, 0, a.shape[1] - 1))
        Y = int(np.clip(y * self.pps, 0, a.shape[0] - 1))
        return a[Y, X]

    def road(self, x, y):
        """Distance from the nearest road or path's edge (negative on it)."""
        return min([np.hypot(*(pts - [x, y]).T).min() - hw for pts, hw in self.paths] or [99])

    def blocked(self, x, y, margin):
        return any(bx - margin < x < bx + bw + margin and by - margin < y < by + bh + margin
                   for bx, by, bw, bh in self.blocks)

    def zone(self, x, y):
        for z in reversed(self.spec.get("zones", [])):
            if inside([tuple(p) for p in z["poly"]], x, y):
                return z
        return None


def poisson(n_try, ok, min_d, placed, bounds):
    """Dart throwing: up to n_try random points that pass `ok` and keep min_d(kind) apart."""
    x0, y0, x1, y1 = bounds
    out = []
    for _ in range(n_try):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        kind = ok(x, y)
        if not kind:
            continue
        d = min_d(kind)
        if all(math.hypot(x - p["x"], y - p["y"]) > (d + min_d(p["type"])) / 2
               for p in placed + out if p.get("layer") == "tree"):
            out.append({"type": kind, "x": round(x, 2), "y": round(y, 2), "layer": "tree"})
    return out


def scatter(spec, types):
    g = Ground(spec)
    cols, rows = spec["grid"]
    have = lambda *names: [n for n in names if n in types]
    plants = []

    # trees: trunks off the roads (crowns may hang over them), out of the water, 0.6 sq from it
    def tree_ok(x, y):
        z = g.zone(x, y)
        if not z or z["kind"] != "forest" or g.road(x, y) < 0.9 or g.at(g.to_water, x, y) < 0.6:
            return None
        if g.blocked(x, y, 1.0):
            return None
        near_water = g.at(g.to_water, x, y) < 3.0
        pool = have("alder", "alder", "willow", "beech") if near_water else have("oak", "beech", "linden", "birch", "oak", "beech", "spruce")
        return rng.choice(pool) if pool else None

    size = lambda name: types[name]["squares"] * 0.62 if name in types else 3
    plants += poisson(4000, tree_ok, size, plants, (-1.5, -1.5, cols + 1.5, rows + 1.5))
    # one old lime on the meadow and a willow on the calm south bank
    for name, x, y in (("linden", 27.5, 17.0), ("willow", 1.2, 10.4)):
        if name in types:
            plants.append({"type": name, "x": x, "y": y, "layer": "tree"})

    # ferns under the forest canopy (seen when it lifts)
    for _ in range(260):
        x, y = rng.uniform(-0.5, cols + 0.5), rng.uniform(-0.5, rows + 0.5)
        z = g.zone(x, y)
        if "fern" in types and z and z["kind"] == "forest" and g.road(x, y) > 0.6 and g.at(g.to_water, x, y) > 0.8:
            if all(math.hypot(x - p["x"], y - p["y"]) > 1.3 for p in plants if p["type"] == "fern"):
                plants.append({"type": "fern", "x": round(x, 2), "y": round(y, 2), "layer": "low"})

    # bushes along the forest edge and around the cottage garden
    bushes = have("hazel", "elder", "bramble")
    for _ in range(1500):
        x, y = rng.uniform(0, cols), rng.uniform(0, rows)
        z = g.zone(x, y)
        edge = (not z or z["kind"] != "forest") and any(
            g.zone(x + dx, y + dy) and g.zone(x + dx, y + dy)["kind"] == "forest" for dx, dy in ((0, -1.4), (0, 1.4), (1.4, 0), (-1.4, 0)))
        garden = 0.5 < x < 1.6 and 12 < y < 18.5
        if bushes and (edge or garden) and g.road(x, y) > 0.5 and g.at(g.to_water, x, y) > 1.0 and not g.blocked(x, y, 0.6):
            if all(math.hypot(x - p["x"], y - p["y"]) > 2.2 for p in plants if p["layer"] == "bush"):
                plants.append({"type": rng.choice(bushes), "x": round(x, 2), "y": round(y, 2), "layer": "bush"})

    # reeds and cattails on the calm, muddy water's edge, long side along the bank
    for side in (1, -1):
        r = outdoor.river_samples(spec)
        for i in range(0, len(r), 3):
            x, y, w, speed, shallow, tx, ty = r[i]
            if speed > 0.2 or shallow > 0.45 or not (0 < x < cols):
                continue
            bx, by = x - ty * side * (w / 2 - 0.25), y + tx * side * (w / 2 - 0.25)
            if g.road(bx, by) < 1.2 or g.blocked(bx, by, 1.2):
                continue
            if rng.random() < 0.55 and all(math.hypot(bx - p["x"], by - p["y"]) > 2.6 for p in plants if p["layer"] == "reed"):
                name = "reed" if rng.random() < 0.7 or "cattail" not in types else "cattail"
                if name in types:
                    plants.append({"type": name, "x": round(bx, 2), "y": round(by, 2), "layer": "reed",
                                   "rot": round(math.degrees(math.atan2(ty, tx)) + rng.uniform(-12, 12), 1)})

    # lilies on calm deep water, 0.6–1.6 squares in from the bank
    for _ in range(600):
        x, y = rng.uniform(0, cols), rng.uniform(0, rows)
        d = g.at(g.in_water, x, y)
        if "lily" in types and 0.6 < d < 1.6 and g.at(g.flow[..., 2], x, y) < 0.15 and g.road(x, y) > 1.5:
            if all(math.hypot(x - p["x"], y - p["y"]) > 3.0 for p in plants if p["layer"] == "lily"):
                plants.append({"type": "lily", "x": round(x, 2), "y": round(y, 2), "layer": "lily"})

    for p in plants:
        p.setdefault("rot", round(rng.uniform(-15, 15), 1))
        p["scale"] = round(rng.uniform(0.85, 1.15), 2)
        p["tint"] = [round(rng.uniform(0.94, 1.06), 3), round(rng.uniform(0.95, 1.05), 3), round(rng.uniform(0.94, 1.04), 3)]
    order = {"lily": 0, "reed": 1, "low": 2, "bush": 3, "tree": 4}
    plants.sort(key=lambda p: (order[p["layer"]], types[p["type"]]["squares"] * p["scale"] if p["layer"] == "tree" else p["y"]))
    return plants


# ---------------------------------------------------------------- main


def main(run):
    meta = json.loads((run / "meta.json").read_text())
    spec = mapgen.load_spec(meta["layout"])
    roofs = json.loads((run / "roofs.json").read_text()) if (run / "roofs.json").exists() else {"image": "out_1.jpg", "roofs": []}
    ground = Image.open(run / roofs["image"]).convert("RGB")
    ground.save(HERE / "ground.webp", quality=88, method=6)
    for f in ("water.png", "water2.png"):
        shutil.copy(run / f, HERE / f)
    for r in roofs["roofs"]:
        Image.open(run / r["file"]).save(HERE / r["file"].replace(".png", ".webp"), quality=90, alpha_quality=100, method=6)
        r["file"] = r["file"].replace(".png", ".webp")
    veg_index = HERE / "veg" / "veg.json"
    veg = json.loads(veg_index.read_text()) if veg_index.exists() else []
    atlas = Atlas()
    types = build_types(veg, atlas)
    aw, ah = atlas.save(HERE / "atlas.webp") if veg else (0, 0)
    plants = scatter(spec, types) if veg else []
    cols, rows = spec["grid"]
    scene = {"cols": cols, "rows": rows, "ground": "ground.webp", "groundPx": list(ground.size),
             "water": "water.png", "water2": "water2.png",
             "roofs": [{**r, "px": list(ground.size)} for r in roofs["roofs"]],
             "buildings": [{"id": b["id"], "rect": b["rect"]} for b in spec.get("buildings", [])],
             "atlas": {"file": "atlas.webp", "w": aw, "h": ah}, "mesh": MESH, "types": types, "plants": plants}
    (HERE / "scene.json").write_text(json.dumps(scene))
    counts = {}
    for p in plants:
        counts[p["type"]] = counts.get(p["type"], 0) + 1
    print(f"ground {ground.size}, atlas {aw}×{ah} ({aw * ah * 4 / 1048576:.1f} MB GPU), {len(plants)} plants: {counts}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else RUN)
