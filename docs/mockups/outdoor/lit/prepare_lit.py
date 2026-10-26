#!/usr/bin/env python3
"""The light lab's assets: an UNLIT riverbend — albedo pictures plus heights — so the table lights
it itself (sun direction, time of day, shadows, crevices). Writes this folder's scene.json.

    python3 prepare_lit.py            # after depth.py has run (see below)

Inputs (run `261026-001219-ground/lit/`):
- `delit_1.jpg` — the slice's ground painting repainted under flat overcast light (an edit pass,
  `delight-prompt.txt`); `out_1.jpg` (the lit original) stays as the painted fallback.
- unlit crowns from the ige project `unlit-vegetation` (painted on magenta, no light direction).
- `depth/*_depth.png` — Depth Anything V2 Small over each of them (`depth.py`).

Heights, three ways per crown so the lab can compare them (height atlas channels):
  R  dome — computed: the crown a dome over its outline, each leaf clump its own bump on it
  G  depth model — the model's guess, kept inside the crown
  B  the clump label (which leaf clump a pixel belongs to — the wind moves clumps one by one)
  A  luminance — the old trick: brighter = higher
The ground's height (ground_h.png): R from our layout (water sinks, walls, boulders, the bridge
stand up), G the depth model's local relief of the delit painting, B of the painting made unlit
from the start (`outdoor.py paint --albedo`, run UNLIT) — encoded -1…3 squares.
Unlit means a crown may be turned any way and mirrored: the light is the table's, not the painting's.
"""
import json
import math
import random
import shutil
import sys
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO / "tools" / "mapgen"))
import outdoor  # noqa: E402

_spec = importlib.util.spec_from_file_location("tree_prepare", HERE.parents[1] / "effects" / "trees" / "prepare.py")
_trees = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_trees)

RUN = REPO / "tools/mapgen/out/riverbend/261026-001219-ground"
LIT = RUN / "lit"
IGE = Path.home() / "Pictures/ige/unlit-vegetation/images"
LAYOUT = REPO / "tools/mapgen/layouts/riverbend.json"
UNLIT = REPO / "tools/mapgen/out/riverbend/261026-122342-albedo"   # the ground painted unlit from the start (outdoor.py paint --albedo)
PPS = 64          # ground albedo pixels per square (the TV draws ~56)
HPPS = 32         # ground height pixels per square
SIDE = 384        # a crown sprite's longer side in the atlas
RIM = 2           # px of painted ink rim taken off every crown
GS = 8.0          # slope scale in the crowns' normal pictures (a slope of 1/16 per px fills the byte)
SCALE = 16.0      # heights are stored as 0..1 = 0..SCALE squares (ground: offset, see ground_height)

# unlit crowns: ige node → species (two draws each)
SPRITES = {"linden": [2, 3], "hazel": [4, 5], "beech": [6, 7], "alder": [8, 9], "oak": [10, 11]}
SPECIES_FALLBACK = {"elder": "hazel", "bramble": "hazel", "lime": "linden", "willow": "alder",
                    "birch": "alder", "spruce": "alder"}
# where a crown's top sits, by tier (squares above the ground): bigger trees stand taller
TIER_BASE = {"top": 7.5, "mid": 6.0, "fill": 4.5, "bank": 5.0, "lone": 7.0, "shrub": 0.4}


def norm(a, mask=None):
    v = a[mask] if mask is not None else a
    lo, hi = np.percentile(v, 1), np.percentile(v, 99)
    return np.clip((a - lo) / max(1e-6, hi - lo), 0, 1)


def crown(node):
    """One unlit crown → (albedo RGBA, height RGBA, clump list)."""
    src = IGE / f"{node}.jpg"
    rgba = _trees.keyed_still(src)                       # keyed, cropped, scaled to 512 on its long side
    s = SIDE / max(rgba.size)
    rgba = rgba.resize((round(rgba.width * s), round(rgba.height * s)), Image.LANCZOS)
    A = np.asarray(rgba).astype(float)
    # the painted crowns carry a dark ink rim; pull the outline in by RIM px and give the new
    # edge the colour of the leaves just inside it, so crowns meet without a drawn border
    core = ndi.binary_erosion(A[..., 3] > 128, iterations=RIM + 2)
    idx = ndi.distance_transform_edt(~core, return_distances=False, return_indices=True)
    rim = ~core
    A[..., :3][rim] = A[..., :3][idx[0][rim], idx[1][rim]]
    A[..., 3] = np.asarray(Image.fromarray(A[..., 3].astype(np.uint8)).filter(ImageFilter.MinFilter(2 * RIM + 1)), float)
    rgba = Image.fromarray(A.astype(np.uint8), "RGBA")
    alpha = A[..., 3] / 255
    inside = alpha > 0.5
    # the depth picture, cropped the same way: keyed_still crops to the alpha box (+6 px) of the 1024 source
    full = Image.open(src).convert("RGB")
    key, _ = _trees.sprite.key_frame(full, _trees.sprite.border_colour(full))
    ka = np.asarray(key)[..., 3]
    ys, xs = np.nonzero(ka > 8)
    box = (max(0, xs.min() - 6), max(0, ys.min() - 6), min(full.width, xs.max() + 7), min(full.height, ys.max() + 7))
    dep = Image.open(LIT / "depth" / f"{node}_depth.png").crop(box).resize(rgba.size, Image.BICUBIC)
    dep = norm(np.asarray(dep, float), inside)
    # computed: a dome over the outline, a bump per leaf clump
    lab, parts = _trees.clumps(rgba.resize((512, round(512 * rgba.height / rgba.width)) if rgba.width >= rgba.height
                                           else (round(512 * rgba.width / rgba.height), 512), Image.LANCZOS))
    lab = np.array(Image.fromarray(lab.astype(np.int32)).resize(rgba.size, Image.NEAREST))
    lab[~inside] = 0
    e = ndi.distance_transform_edt(inside)
    d = np.clip(e / max(1, e.max()), 0, 1)
    dome = np.sqrt(d * (2 - d))
    bump = np.zeros_like(d)
    for k in np.unique(lab):
        if not k:
            continue
        r = lab == k
        ek = ndi.distance_transform_edt(r)
        bump[r] = np.sqrt(np.clip(ek[r] / max(1, ek.max()), 0, 1))
    synth = ndi.gaussian_filter(0.62 * dome + 0.38 * bump, 1.0)
    lum = A[..., :3] @ [0.3, 0.59, 0.11]
    lumh = norm(ndi.gaussian_filter(lum, 1.2), inside) * 0.6 + dome * 0.4
    H = np.dstack([synth, dep, np.zeros_like(d), lumh])
    H = (np.clip(H, 0, 1) * 255).astype(np.uint8)
    H[..., 2] = np.clip(lab, 0, 255)
    H[~inside] = 0
    # clumps: their box and the point they swing from (a little in from the clump toward the crown's middle)
    cy, cx = ndi.center_of_mass(alpha)
    R = max(rgba.size) / 2
    clumps = []
    rng = random.Random(node)
    for k in np.unique(lab):
        if not k:
            continue
        ys, xs = np.nonzero(lab == k)
        if len(xs) < 30:
            continue
        py, px = ys.mean(), xs.mean()
        rx, ry = (px - cx) / R, (py - cy) / R
        clumps.append({"id": int(k), "box": [int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3],
                       "hull": hull(xs, ys),
                       "pivot": [round(px - rx * R * 0.18, 1), round(py - ry * R * 0.18, 1)],
                       "r": round(min(1, math.hypot(rx, ry)), 3), "seed": round(rng.random(), 3)})
    return rgba, Image.fromarray(H, "RGBA"), clumps, [round(cx, 1), round(cy, 1)]


def hull(xs, ys, n=8, pad=2.5):
    """A clump's outline as a convex polygon of at most `n` corners, grown `pad` px: the clump is
    drawn as this polygon instead of its bounding box (about a third fewer pixels to shade)."""
    from scipy.spatial import ConvexHull
    pts = np.c_[np.r_[xs, xs + 1, xs, xs + 1], np.r_[ys, ys, ys + 1, ys + 1]].astype(float)
    h = pts[ConvexHull(pts).vertices]
    while len(h) > n:                                    # drop the corner whose removal adds least area
        cross = lambda u, w: u[0] * w[1] - u[1] * w[0]
        area = [abs(cross(h[i] - h[i - 1], h[(i + 1) % len(h)] - h[i - 1])) for i in range(len(h))]
        h = np.delete(h, int(np.argmin(area)), 0)
    c = h.mean(0)
    # dropping corners cuts into the clump: push every edge out until all pixels are inside again
    out = []
    for i in range(len(h)):
        a, b = h[i], h[(i + 1) % len(h)]
        nrm = np.array([b[1] - a[1], a[0] - b[0]]); nrm /= np.linalg.norm(nrm) + 1e-9
        if np.dot(nrm, a - c) < 0:
            nrm = -nrm
        reach = (pts - a) @ nrm
        out.append((a, b, nrm, max(0.0, reach.max()) + pad))
    corners = []
    for i in range(len(out)):                            # new corner = where two pushed edges meet
        a0, b0, n0, d0 = out[i - 1]
        a1, b1, n1, d1 = out[i]
        p0, p1 = a0 + n0 * d0, a1 + n1 * d1
        u0, u1 = b0 - a0, b1 - a1
        m = np.array([u0, -u1]).T
        try:
            t = np.linalg.solve(m, p1 - p0)[0]
            corners.append((p0 + u0 * t).round(1).tolist())
        except np.linalg.LinAlgError:
            corners.append(p1.round(1).tolist())
    return corners


def ground_height(spec):
    """Layout heights (squares) at HPPS: water sinks with its depth, banks slope down to it,
    the cottage walls stand two squares, boulders and the bridge half a square. Returns R (layout)
    and G (depth model relief), each 0..1 for -1..+(SCALE/4-1) squares — see the shader's decode."""
    cols, rows = spec["grid"]
    W, Hh = cols * HPPS, rows * HPPS
    guide = np.asarray(Image.open(RUN / "guide.png").convert("RGB").resize((W, Hh), Image.NEAREST)).astype(int)
    near = lambda c, tol=14: (np.abs(guide - np.array(c)).sum(-1) < tol)
    water = np.asarray(Image.open(RUN / "water.png").resize((W, Hh), Image.BILINEAR), float)[..., 3] / 255
    h = np.zeros((Hh, W))
    h -= 0.55 * ndi.gaussian_filter(water, HPPS * 0.5)                  # a riverbed, banks slope into it
    h += 0.10 * ndi.gaussian_filter(near((204, 190, 150)).astype(float) + near((104, 86, 56)).astype(float), 3)
    for c in ((176, 136, 82), (204, 170, 112)):                          # roads and paths sit a little low
        h -= 0.06 * ndi.gaussian_filter(near(c).astype(float), 4)
    rock = near((96, 96, 96))
    e = ndi.distance_transform_edt(rock)
    h += 0.55 * np.sqrt(np.clip(e / (HPPS * 0.35), 0, 1))
    h = np.maximum(h, 0.45 * ndi.gaussian_filter(near((140, 92, 48)).astype(float), 1.5))     # bridge deck
    walls = near((32, 32, 32))
    h = np.maximum(h, 2.0 * ndi.gaussian_filter(walls.astype(float), 0.8))
    props = near((255, 0, 255))
    h = np.maximum(h, 0.5 * ndi.gaussian_filter(props.astype(float), 2))
    # the depth model: local relief only (pebbles, roots, furniture), about an eighth of a square;
    # one channel per ground picture (G: the delit painting, B: the one painted unlit)
    def relief(f):
        dep = np.asarray(Image.open(f).resize((W, Hh), Image.BICUBIC), float) / 65535
        rel = dep - ndi.gaussian_filter(dep, HPPS * 0.6)
        return rel / (np.percentile(np.abs(rel), 99) + 1e-6) * 0.12
    enc = lambda v: np.clip((v + 1.0) / 4.0, 0, 1)                      # -1..3 squares → 0..1
    img = np.dstack([enc(h), enc(relief(LIT / "depth" / "delit_1_depth.png")),
                     enc(relief(UNLIT / "depth" / "out_1_depth.png")), np.ones_like(h)])
    return Image.fromarray((img * 255).astype(np.uint8), "RGBA")


def main():
    spec = json.loads(LAYOUT.read_text())
    cols, rows = spec["grid"]
    # ground pictures at PPS
    gw, gh = cols * PPS, rows * PPS
    Image.open(LIT / "delit_1.jpg").convert("RGB").resize((gw, gh), Image.LANCZOS).save(HERE / "albedo.webp", quality=90)
    Image.open(RUN / "out_1.jpg").convert("RGB").resize((gw, gh), Image.LANCZOS).save(HERE / "painted.webp", quality=90)
    Image.open(UNLIT / "out_1.jpg").convert("RGB").resize((gw, gh), Image.LANCZOS).save(HERE / "albedo_unlit.webp", quality=90)
    ground_height(spec).save(HERE / "ground_h.png")
    for f in ("water.png", "water2.png"):
        shutil.copy(RUN / f, HERE / f)
    shutil.copy(HERE.parent / "roof_cottage.webp", HERE / "roof_cottage.webp")
    # painted canopy of the current slice (the fallback look): the picked draw, cut out
    pick = (RUN / "canopy.pick").read_text().split()[0] if (RUN / "canopy.pick").exists() else None
    if pick:                                             # "canopy_v2.json#2" → canopy_v2_2.png
        f, n = pick.split("#")
        Image.open(RUN / f"{f.removesuffix('.json')}_{n}.png").resize((gw, gh), Image.LANCZOS).save(HERE / "canopy_painted.webp", quality=88)

    # the crowns → one albedo atlas + one height atlas, 5 per row
    sprites, alb, hts = {}, [], []
    for sp, nodes in SPRITES.items():
        for n in nodes:
            a, h, cl, c = crown(n)
            sprites[f"{sp}{n}"] = {"species": sp, "w": a.width, "h": a.height, "centre": c, "clumps": cl}
            alb.append(a); hts.append(h)
    per = 5
    AW, AH = 2048, 1024
    atlas, hatlas = Image.new("RGBA", (AW, AH)), Image.new("RGBA", (AW, AH))
    for i, (k, s) in enumerate(sprites.items()):
        x, y = (i % per) * (SIDE + 8) + 4, (i // per) * (SIDE + 8) + 4
        atlas.paste(alb[i], (x, y)); hatlas.paste(hts[i], (x, y))
        s["at"] = [x, y]
    atlas.save(HERE / "crowns.webp", lossless=True)
    hatlas.save(HERE / "crowns_h.png")
    # the fast path reads ONE texel per crown pixel for its shape: the height's slope (R, G, per
    # sprite px, ×GS around 0.5) and the clump label (B) — one picture per height source
    H = np.asarray(hatlas).astype(float) / 255
    inside = np.asarray(atlas)[..., 3] > 127
    for name, ch in (("dome", 0), ("model", 1), ("luma", 3)):
        gy, gx = np.gradient(ndi.gaussian_filter(H[..., ch], 0.8))
        n = np.zeros(H.shape[:2] + (4,), np.uint8)
        n[..., 0] = np.clip(gx * GS * 255 + 127.5, 0, 255)
        n[..., 1] = np.clip(gy * GS * 255 + 127.5, 0, 255)
        n[..., 2] = np.asarray(hatlas)[..., 2]
        n[..., 3] = np.where(inside, 255, 0)
        Image.fromarray(n, "RGBA").save(HERE / f"crowns_n_{name}.png")

    # where the crowns stand: the canopy plan from the layout (same as the painted canopy)
    rng = random.Random(7)
    by = {}
    for k, s in sprites.items():
        by.setdefault(s["species"], []).append(k)
    crowns = []
    for c in outdoor.canopy_plan(spec):
        sp = c["species"]
        sp = sp if sp in by else SPECIES_FALLBACK.get(sp, "beech")
        crowns.append({"x": c["x"], "y": c["y"], "d": c["d"], "tier": c["tier"], "sprite": rng.choice(by[sp]),
                       "rot": round(rng.uniform(0, 360), 1), "flip": rng.random() < 0.5,
                       "top": round(TIER_BASE.get(c["tier"], 5.0) * rng.uniform(0.9, 1.1), 2),
                       "tint": round(rng.uniform(0.9, 1.08), 3)})
    b = spec["buildings"][0]
    scene = {
        "cols": cols, "rows": rows, "pps": PPS, "hscale": SCALE,
        "albedo": "albedo.webp", "albedoUnlit": "albedo_unlit.webp", "painted": "painted.webp", "groundH": "ground_h.png",
        "canopyPainted": "canopy_painted.webp" if pick else None,
        "water": "water.png", "water2": "water2.png",
        "atlas": {"file": "crowns.webp", "height": "crowns_h.png", "w": AW, "h": AH, "gs": GS,
                  "slopes": {k: f"crowns_n_{k}.png" for k in ("dome", "model", "luma")}},
        "sprites": sprites, "crowns": crowns,
        # the roof: its picture's box in squares (from the slice's scene) and a gable over the footprint
        "roof": {"file": "roof_cottage.webp", "box": [25 / 2752 * cols, 849 / 1536 * rows, 808 / 2752 * cols, 647 / 1536 * rows],
                 "footprint": b["rect"], "eave": 2.0, "ridge": 3.6},
        # lights for the evening: the hearth (west wall) and a lantern by the door
        "lights": [{"x": b["rect"][0] + 0.9, "y": b["rect"][1] + 2.2, "r": 4.5, "color": [1.0, 0.55, 0.22]},
                   {"x": b["rect"][0] + b["rect"][2] + 0.5, "y": b["rect"][1] + 2.5, "r": 5.5, "color": [1.0, 0.72, 0.38]}],
    }
    (HERE / "scene.json").write_text(json.dumps(scene, indent=1))
    n_cl = sum(len(s["clumps"]) for s in sprites.values())
    print(f"{len(crowns)} crowns from {len(sprites)} sprites ({n_cl} clumps); atlas {AW}×{AH}; ground {gw}×{gh}")


if __name__ == "__main__":
    main()
