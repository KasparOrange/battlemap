#!/usr/bin/env python3
"""The riverbend slice's assets: ground, water masks, roofs, the vegetation atlas and where every
plant stands (scene.json, read by riverbend.html).

    python3 prepare.py [run folder] [canopy_<tag>.json[#n]]   # default: the riverbend run, its canopy.json

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
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("tree_prepare", HERE.parent / "effects" / "trees" / "prepare.py")
_trees = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_trees)
flood = _trees.flood  # the marker watershed of the tree demos

RUN = REPO / "tools/mapgen/out/riverbend/261026-001219-ground"
ATLAS_W = 2048
GROW = 3
PPS = 64            # atlas pixels per square: the TV draws ~56 at 1080p, so more is wasted memory
SHADOW_SCALE = 0.5  # shadows are blurred anyway
MESH = {"bush": 5, "reed": 8, "lily": 3, "fern": 5, "willow": 8, "spruce": 6, "tree": 6}

rng = random.Random(7)          # placement
seeds = random.Random(11)      # clump phases: separate, so recutting a tree never moves the forest


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
                    "r": round(min(1, math.hypot(rx, ry)), 3), "seed": round(seeds.random(), 3)})
    out.sort(key=lambda p: -p["r"])
    return out


def branch_pieces(still, arms=10):
    """Label map for crowns without round clumps (willow fronds, spruce tiers): seeds on two rings
    of `arms` spokes (outer ring turned half a spoke), a watershed along the painting's dark gaps
    between needles and fronds, a core disc. Same output as the clump cutter: one grey per piece."""
    A = np.asarray(still, float) / 255
    alpha, lum = A[..., 3], A[..., :3] @ [0.3, 0.59, 0.11]
    H, W = alpha.shape
    cy, cx = ndi.center_of_mass(alpha)
    R = max(W, H) / 2
    markers = np.zeros((H, W), int)
    k = 1
    yy, xx = np.mgrid[0:H, 0:W]
    markers[np.hypot(xx - cx, yy - cy) < R * 0.14] = k
    for ring, (rad, turn) in enumerate(((0.42, 0.0), (0.74, 0.5))):
        for i in range(arms):
            a = 2 * math.pi * (i + turn) / arms
            x, y = int(cx + math.cos(a) * rad * R), int(cy + math.sin(a) * rad * R)
            if 0 <= x < W and 0 <= y < H and alpha[y, x] > 0.5:
                k += 1
                markers[max(0, y - 2):y + 3, max(0, x - 2):x + 3] = k
    fill = np.where(alpha > 0.5, lum, lum[alpha > 0.5].mean())
    fine = ndi.gaussian_filter(fill, 1.5) - ndi.gaussian_filter(fill, max(W, H) / 13)
    crevice = np.clip(0.5 - fine * 2.4, 0, 1)
    near = np.minimum(ndi.distance_transform_edt(markers == 0) / (R * 0.45), 1)
    cost = np.clip(255 * (0.45 * crevice + 0.55 * near), 0, 255).astype(np.uint8)
    lab = flood(cost, markers, alpha > 0.05)
    lab[alpha < 0.05] = 0
    return Image.fromarray(lab.astype(np.uint8), "L")


BRANCHY = {"willow", "spruce"}   # trees cut into radial branch pieces instead of leaf clumps


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
        h = -(-(self.y + self.row + 2) // 64) * 64   # WebGL2 mips any size; no power-of-two padding
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
        k = min(1.0, max(96, v["squares"] * PPS) / max(still.size))   # shrink to ~PPS per square
        size = (round(still.width * k), round(still.height * k))
        still = still.resize(size, Image.LANCZOS)
        kind = {"willow": "willow", "spruce": "spruce", "fern": "fern"}.get(v["name"], v["kind"])
        t = {"kind": kind, "squares": v["squares"], "w": still.width, "h": still.height,
             "centre": [v["centre"][0] * k, v["centre"][1] * k]}
        if kind != "trunk":
            sh = shadow_of(still)
            t["shadow"] = atlas.add(sh.resize((round(sh.width * SHADOW_SCALE), round(sh.height * SHADOW_SCALE)), Image.LANCZOS))
        if v.get("parts") or v["name"] in BRANCHY:
            labels = (Image.open(HERE / "veg" / v["parts"]["file"]).resize(size, Image.NEAREST)
                      if v.get("parts") else branch_pieces(still))
            t["under"] = atlas.add(under_copy(still))
            t["clumps"] = []
            for p in clump_pieces(still, labels):
                rect = atlas.add(p.pop("img"))
                t["clumps"].append({"rect": rect, **p})
        else:
            t["still"] = atlas.add(still)
        types[v["name"]] = t
    return types


# ---------------------------------------------------------------- the painted canopy


CANOPY_SPRITES = {"oak", "beech", "alder", "willow", "birch", "spruce", "linden"}   # painted with the canopy instead


def canopy_trees(run, spec, atlas, which=None, debug=None):
    """The forest canopy painted as one layer (outdoor.py canopy) cut back into trees: every
    canopy pixel goes to the crown on top of it (the biggest disc that covers it), the seams
    then follow the painting's dark crevices (watershed from each crown's core); each tree is
    cut into leaf clumps the same way (seeds on two rings, the watershed along the crevices),
    so the canopy sways in the same wind as every other crown. Returns (types, plants): one
    type per tree, placed once at its trunk. `debug` (a dict) gets the tree label map and each
    tree's clump labels, for pictures of the steps."""
    which, _, pick = (which or "canopy.json").partition("#")   # canopy_<tag>.json#2 = its second draw
    meta = json.loads((run / which).read_text())
    crowns = meta["crowns"]
    img = Image.open(run / meta["results"][int(pick or 1) - 1]["file"]).convert("RGBA")
    cols, rows = spec["grid"]
    img = img.resize((cols * PPS, rows * PPS), Image.LANCZOS)
    # the canopy runs on past the map's edge (edge pixels repeated half a square), so a crown
    # swaying in from the edge never shows a cut
    E = PPS // 2
    A = np.pad(np.asarray(img), ((E, E), (E, E), (0, 0)), mode="edge")
    alpha = A[..., 3].astype(float) / 255
    lum = A[..., :3].astype(float) @ [0.3, 0.59, 0.11] / 255
    H, W = alpha.shape
    yy, xx = np.mgrid[0:H, 0:W]
    on = alpha > 0.04
    # who is on top where: biggest disc covering the pixel (they were laid small to big)
    top = np.zeros((H, W), int)
    near = np.full((H, W), np.inf)
    for i, c in enumerate(crowns):
        d = np.hypot(xx - c["x"] * PPS - E, yy - c["y"] * PPS - E) / (c["d"] / 2 * PPS)
        top[d < 1] = i + 1
        better = d < near
        near[better] = d[better]
        if i == 0:
            nearest = np.ones((H, W), int)
        nearest[better] = i + 1
    markers = np.zeros((H, W), int)
    for i, c in enumerate(crowns):
        d = np.hypot(xx - c["x"] * PPS - E, yy - c["y"] * PPS - E) / (c["d"] / 2 * PPS)
        markers[(top == i + 1) & (d < 0.5)] = i + 1
    fill = np.where(on, lum, lum[on].mean())
    crev = np.clip(0.55 - (ndi.gaussian_filter(fill, 2) - ndi.gaussian_filter(fill, PPS * 0.8)) * 3, 0, 1)
    cost = (255 * crev).astype(np.uint8)
    lab = flood(cost, markers, on)
    lab[(lab == 0) & on] = nearest[(lab == 0) & on]   # islands the flood could not reach
    lab[~on] = 0
    if debug is not None:
        debug.update(lab=lab, canopy=A, pad=E, crowns=crowns, clumps=[])
    types, plants = {}, []
    for i, c in enumerate(crowns):
        region = lab == i + 1
        if region.sum() < PPS * PPS * 0.3:
            continue
        grown = ndi.binary_dilation(region, iterations=GROW)
        ys, xs = np.nonzero(grown)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        piece = A[y0:y1, x0:x1].copy()
        solid = piece.copy()   # for the shade under the clumps: no feather, so seams between trees stay closed
        solid[..., 3] = (solid[..., 3] * grown[y0:y1, x0:x1]).astype(np.uint8)
        feather = np.clip(1 - ndi.distance_transform_edt(~region[y0:y1, x0:x1]) / (GROW + 1), 0, 1)
        piece[..., 3] = (piece[..., 3] * np.minimum(1, feather * 1.6)).astype(np.uint8)
        still = Image.fromarray(piece, "RGBA")
        sub = Image.fromarray(np.where(region[y0:y1, x0:x1], 255, 0).astype(np.uint8))
        masked = still.copy()
        masked.putalpha(sub)
        arms = int(np.clip(round(c["d"] * 1.7), 6, 13))
        labels = np.asarray(branch_pieces(masked, arms)).copy()
        labels[~region[y0:y1, x0:x1]] = 0
        if debug is not None:
            debug["clumps"].append((x0, y0, labels.copy()))
        name = f"canopy{i}"
        t = {"kind": "tree", "squares": max(still.size) / PPS, "w": still.width, "h": still.height,
             "centre": [c["x"] * PPS + E - x0, c["y"] * PPS + E - y0], "crown": c["d"], "species": c["species"]}
        sh = shadow_of(still)
        t["shadow"] = atlas.add(sh.resize((max(1, round(sh.width * SHADOW_SCALE)), max(1, round(sh.height * SHADOW_SCALE))), Image.LANCZOS))
        u = under_copy(Image.fromarray(solid, "RGBA"))   # blurred anyway: half the pixels
        t["under"] = atlas.add(u.resize((max(1, u.width // 2), max(1, u.height // 2)), Image.LANCZOS))
        t["clumps"] = []
        for p in clump_pieces(still, Image.fromarray(labels.astype(np.uint8), "L")):
            rect = atlas.add(p.pop("img"))
            t["clumps"].append({"rect": rect, **p})
        types[name] = t
        plants.append({"type": name, "x": c["x"], "y": c["y"], "layer": "tree", "rot": 0, "scale": 1,
                       "tint": [1, 1, 1], "crown": c["d"]})
    return types, plants


# ---------------------------------------------------------------- placement


inside, Ground = outdoor.inside, outdoor.Ground   # where things may stand: shared with the canopy plan


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


def scatter(spec, types, canopy=None):
    """Every plant of the slice; `canopy` = the trees cut from the painted canopy (then no
    crown sprites are scattered in the forest zones)."""
    g = Ground(spec)
    cols, rows = spec["grid"]
    have = lambda *names: [n for n in names if n in types]
    plants = list(canopy or [])

    # trees: trunks off the roads (crowns may hang over them), out of the water, 0.6 sq from it
    def tree_ok(x, y):
        z = g.zone(x, y)
        if not z or z["kind"] != "forest" or g.road(x, y) < 0.9 or g.at(g.to_water, x, y) < 0.6:
            return None
        if g.blocked(x, y, 1.0):
            return None
        # a real wood is a stand of one or two species; alders line the water
        stand = spec["river"].get("bank_trees") if g.at(g.to_water, x, y) < 2.5 else z.get("stand")
        stand = {k: v for k, v in (stand or {"oak": 1}).items() if k in types}
        return rng.choices(list(stand), weights=list(stand.values()))[0] if stand else None

    size = lambda name: types[name]["squares"] * 0.62 if name in types else 3
    if not canopy:
        plants += poisson(4000, tree_ok, size, plants, (-1.5, -1.5, cols + 1.5, rows + 1.5))
    # the layout's single trees (an old lime on the meadow); painted with the canopy when there is one
    for t in [] if canopy else spec.get("trees", []):
        if t["species"] in types:
            plants.append({"type": t["species"], "x": t["x"], "y": t["y"], "layer": "tree"})

    # a trunk with its roots under every tree (seen when the crown lifts)
    trunks = have("trunk1", "trunk2")
    for p in [p for p in plants if p["layer"] == "tree"]:
        if trunks:
            plants.append({"type": rng.choice(trunks), "x": p["x"], "y": p["y"], "layer": "trunk",
                           "size": round(0.55 * p.get("crown", types[p["type"]]["squares"]) / 2.2 * rng.uniform(0.9, 1.1), 2),
                           "rot": round(rng.uniform(0, 360), 1)})

    # ferns under the forest canopy (seen when it lifts)
    for _ in range(120):
        x, y = rng.uniform(-0.5, cols + 0.5), rng.uniform(-0.5, rows + 0.5)
        z = g.zone(x, y)
        if "fern" in types and z and z["kind"] == "forest" and g.road(x, y) > 0.6 and g.at(g.to_water, x, y) > 0.8:
            if all(math.hypot(x - p["x"], y - p["y"]) > 2.2 for p in plants if p["type"] == "fern"):
                plants.append({"type": "fern", "x": round(x, 2), "y": round(y, 2), "layer": "low"})

    # bushes along the forest edge and around the cottage garden
    bushes = have("hazel", "hazel", "hazel", "elder", "elder", "bramble")
    for _ in range(1500):
        x, y = rng.uniform(0, cols), rng.uniform(0, rows)
        z = g.zone(x, y)
        edge = (not z or z["kind"] != "forest") and any(
            g.zone(x + dx, y + dy) and g.zone(x + dx, y + dy)["kind"] == "forest" for dx, dy in ((0, -1.4), (0, 1.4), (1.4, 0), (-1.4, 0)))
        garden = 0.5 < x < 1.6 and 12 < y < 18.5
        edge = edge and not canopy   # the painted canopy brings its own shrubs at the wood's edge
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
        p["scale"] = p.pop("size", None) or round(rng.uniform(0.85, 1.15), 2)
        v = rng.uniform(0.96, 1.04)   # brightness only: hue shifts made the wood look patchy
        p["tint"] = [round(v, 3)] * 3
    order = {"lily": 0, "reed": 1, "trunk": 2, "low": 3, "bush": 4, "tree": 5}
    plants.sort(key=lambda p: (order[p["layer"]], p.get("crown", types[p["type"]]["squares"] * p["scale"]) if p["layer"] == "tree" else p["y"]))
    return plants


# ---------------------------------------------------------------- main


def main(run, canopy_file=None):
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
    canopy_file = canopy_file or ((run / "canopy.pick").read_text().strip() if (run / "canopy.pick").exists() else None)
    if canopy_file:
        veg = [v for v in veg if v["name"] not in CANOPY_SPRITES]
    atlas = Atlas()
    types = build_types(veg, atlas)
    canopy = None
    if canopy_file:
        ctypes, canopy = canopy_trees(run, spec, atlas, canopy_file)
        types.update(ctypes)
    aw, ah = atlas.save(HERE / "atlas.webp") if veg else (0, 0)
    plants = scatter(spec, types, canopy) if veg else []
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
    main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else RUN, sys.argv[2] if len(sys.argv) > 2 else None)
