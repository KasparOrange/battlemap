#!/usr/bin/env python3
"""Packages a summervale run into the viewer's per-cell assets (next to this file).

The map is cut into 512 px cells at 56 px/square — the v2 TV's tile grid (15 × 9 = 135 cells for
136 × 76 squares). Per cell: the ground (WebP), the canopy (WebP, from canopy_cut) + its 8-bit clump
id map (PNG), the water masks (flow + shallow/bank/foam, PNG at 1/4 size with a 1 px gutter) and
the lists the renderer needs (clumps touching it, plants standing in it, roofs over it). Shared:
the plant atlas, the roofs (WebP), a 1/4-size composite (ground + canopy + roofs) that is both
the whole-map view and the blurry preview under cells not loaded yet, and manifest.json.

    python3 docs/mockups/outdoor/summervale/prepare.py [tools/mapgen/out/summervale/<run>]

Reads the run's ground.png, water.png, water2.png, canopy/ (trees.json, cells/), roofs/
(roofs.json, roof_*.png), plants/ (plants.json, atlas.webp). Writes cells/, roofs/, atlas.webp,
preview.webp, manifest.json here. ~1 min on the Mac.
"""
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
RUN = REPO / "tools/mapgen/out/summervale/261028-191924-master"
CELL = 512
WQ = 4            # water masks at 1/4 of the ground (14 px/square; the run's are 16)
GROUND_Q = 86     # WebP quality of the ground cells
PREVIEW = 4       # preview at 1/4 (14 px/square)


def fit_water(ground_small: np.ndarray, flow: np.ndarray, flow2: np.ndarray, sq: float) -> tuple:
    """Moves the layout's water masks onto the painted river. The model paints the river close to the
    layout but not on it (summervale's rapids lie up to 2 squares south of the layout's), so water
    the painting has outside the mask would stand still and the mask would wobble the bank. New mask
    = painted water (teal/blue, or bluish white foam) within 3 squares of the layout's mask, holes
    under 1 sq² closed; flow, speed, shallow and boulder wake taken from the nearest layout-water
    pixel; the bank distance recomputed from the new edge (the run's own scale: 1.0 at 1.5 squares).
    Arrays at the water scale (`sq` px per square), RGBA uint8. Returns (flow, flow2, changed px)."""
    from scipy import ndimage as nd
    g = ground_small.astype(np.int16)
    r, gg, b = g[..., 0], g[..., 1], g[..., 2]
    teal = (b > r + 18) & (gg > r + 8)
    foam = (np.minimum(np.minimum(r, gg), b) > 170) & (b >= r)
    old = flow[..., 3] > 128
    near = nd.distance_transform_edt(~old) <= 3 * sq
    water = (teal | (foam & nd.binary_dilation(teal, iterations=int(sq)))) & near
    water = nd.binary_opening(water, iterations=1)
    holes = nd.binary_fill_holes(water) & ~water
    lab, n = nd.label(holes)
    sizes = nd.sum(holes, lab, range(1, n + 1)) / (sq * sq) if n else np.zeros(0)
    water |= np.isin(lab, 1 + np.flatnonzero(sizes < 0.15))        # specks: water
    new = water | (old & ~near)     # never far from the layout: keep the layout's mask there
    _, (iy, ix) = nd.distance_transform_edt(~old, return_indices=True)
    f, f2 = flow[iy, ix].copy(), flow2[iy, ix].copy()
    soft = nd.gaussian_filter(new.astype(np.float32), 0.7)
    f[..., 3] = np.clip(soft * 255, 0, 255).astype(np.uint8)
    bank = np.minimum(1.0, 0.12 + 0.6 * nd.distance_transform_edt(new) / sq)
    f2[..., 1] = np.where(new, bank * 255, 0).astype(np.uint8)
    # boulder foam from the PAINTED boulders (holes of 0.15–4 sq² in the water), as outdoor.py's
    # masks(): a collar of 0.3 sq and a wake trailing 1.5 sq down the local flow
    rocks = np.isin(lab, 1 + np.flatnonzero((sizes >= 0.15) & (sizes < 4)))
    foam = np.clip(1 - nd.distance_transform_edt(~rocks) / sq / 0.3, 0, 1)
    rl, rn = nd.label(rocks)
    for i, sl in enumerate(nd.find_objects(rl), 1):
        cy, cx = (sl[0].start + sl[0].stop) // 2, (sl[1].start + sl[1].stop) // 2
        dx, dy = f[cy, cx, 0] / 127.5 - 1, f[cy, cx, 1] / 127.5 - 1
        pad = int(2 * sq)
        y0, y1, x0, x1 = max(0, sl[0].start - pad), sl[0].stop + pad, max(0, sl[1].start - pad), sl[1].stop + pad
        rm = (rl[y0:y1, x0:x1] == i).astype(np.float32)
        for k in range(1, 15):
            d = 1.5 * k / 14 * sq
            moved = nd.shift(rm, (dy * d, dx * d), order=1)
            foam[y0:y1, x0:x1] = np.maximum(foam[y0:y1, x0:x1], moved * (1 - k / 15) ** 1.3)
    foam = nd.gaussian_filter(foam, sq * 0.12) * new
    f2[..., 2] = (np.clip(foam, 0, 1) * 255).astype(np.uint8)
    print(f"  painted boulders: {rn}")
    return f, f2, int((new != old).sum())


S_PERIOD = 32.0   # along-river coordinate stored modulo this (squares); the shader's noise periods divide it
N_RANGE = 16.0    # across-river coordinate stored over ±8 squares


def river_coords(layout: dict, w: int, h: int, sq: float) -> tuple:
    """The river's own coordinates per water texel: s = squares along the centre line (downstream
    grows), n = signed squares across it. The water shader moves its noise along s instead of
    rotating it by the flow direction about the map's origin — on a 136-square map that rotation
    shifts the noise by |position| × the turn between neighbouring pixels, which greys the noise out
    (a coarse mip) and makes moiré: the rapids stood still. Returns (s, n) float arrays (h, w)."""
    sys.path.insert(0, str(REPO / "tools/mapgen"))
    from outdoor import catmull
    from scipy.spatial import cKDTree
    c = catmull(layout["river"]["points"], 0.04)[:, :2]
    seg = np.hypot(*np.diff(c, axis=0).T)
    arc = np.concatenate([[0], np.cumsum(seg)])
    tang = np.gradient(c, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
    ys, xs = np.mgrid[0:h, 0:w]
    p = np.stack([(xs.ravel() + 0.5) / sq, (ys.ravel() + 0.5) / sq], -1)
    _, i = cKDTree(c).query(p)
    d = p - c[i]
    along = (d * tang[i]).sum(1)                       # sub-sample projection
    n = d[:, 0] * -tang[i, 1] + d[:, 1] * tang[i, 0]   # left of the flow = negative (y down)
    return (arc[i] + along).reshape(h, w), n.reshape(h, w)


def main(run: Path) -> None:
    t0 = time.time()
    trees = json.loads((run / "canopy/trees.json").read_text())
    plants = json.loads((run / "plants/plants.json").read_text())
    roofs = json.loads((run / "roofs/roofs.json").read_text())
    pps, (cols, rows) = trees["pps"], trees["grid"]
    ground = Image.open(run / "ground.png").convert("RGB")
    W, H = ground.size
    nx, ny = -(-W // CELL), -(-H // CELL)
    for d in ("cells", "roofs"):
        shutil.rmtree(HERE / d, ignore_errors=True)
        (HERE / d).mkdir()

    # water: both masks scaled to 1/4 of the ground, padded by edge copies, cut with a 1 px gutter
    ww, wh = W // WQ, H // WQ
    w1, w2 = [np.asarray(Image.open(run / f).convert("RGBA").resize((ww, wh), Image.BILINEAR)) for f in ("water.png", "water2.png")]
    w1, w2, moved = fit_water(np.asarray(ground.resize((ww, wh), Image.BOX)), w1, w2, pps / WQ)
    Image.fromarray(w1[..., 3]).save(HERE / "water-mask.png")   # the fitted mask, to check by eye (not loaded)
    print(f"water mask fitted to the painting: {moved} px changed ({moved * WQ * WQ / pps / pps:.0f} sq)")
    # flow R, G = the along coordinate mod 32 twice, half a period apart (the shader reads the one
    # away from its wrap, so bilinear never blends across it); water2 A = the across coordinate
    s, n = river_coords(json.loads((REPO / "tools/mapgen/layouts/summervale.json").read_text()), ww, wh, pps / WQ)
    q = lambda v: np.clip(np.round(v * 255), 0, 255).astype(np.uint8)
    w1[..., 0], w1[..., 1] = q((s % S_PERIOD) / S_PERIOD), q(((s + S_PERIOD / 2) % S_PERIOD) / S_PERIOD)
    w2[..., 3] = q(n / N_RANGE + 0.5)
    water = [np.pad(m, ((1, 1), (1, 1), (0, 0)), mode="edge") for m in (w1, w2)]

    cells = {}
    gbytes = cbytes = wbytes = 0
    for cy in range(ny):
        for cx in range(nx):
            key = f"{cx}_{cy}"
            x0, y0 = cx * CELL, cy * CELL
            w, h = min(CELL, W - x0), min(CELL, H - y0)
            c = {"x": x0, "y": y0, "w": w, "h": h}
            f = HERE / "cells" / f"{key}.g.webp"
            ground.crop((x0, y0, x0 + w, y0 + h)).save(f, quality=GROUND_Q, method=6)
            gbytes += f.stat().st_size
            cc = trees["cells"].get(key)
            if cc:
                for src, ext in ((cc["canopy"], "c.webp"), (cc["ids"], "ids.png")):
                    dst = HERE / "cells" / f"{key}.{ext}"
                    shutil.copyfile(run / "canopy" / src, dst)
                    cbytes += dst.stat().st_size
                c["canopy"] = 1
                c["clumps"] = cc["clumps"]      # global clump ids in id-map order (id k → clumps[k-1])
            qx, qy, qw, qh = x0 // WQ, y0 // WQ, -(-w // WQ), -(-h // WQ)
            crops = [m[qy:qy + qh + 2, qx:qx + qw + 2] for m in water]
            if crops[0][..., 3].max() >= 2:
                for i, m in enumerate(crops):
                    dst = HERE / "cells" / f"{key}.w{i + 1}.png"
                    Image.fromarray(m, "RGBA").save(dst, optimize=True)
                    wbytes += dst.stat().st_size
                c["water"] = [qw, qh]           # texels of the cell inside the gutter
            pl = plants["cells"].get(key)
            if pl:
                c["plants"] = pl
            cells[key] = c

    # roofs as WebP, placed by their sprite box in map px
    rlist, rbytes = [], 0
    for r in roofs["roofs"]:
        dst = HERE / "roofs" / (Path(r["file"]).stem + ".webp")
        Image.open(run / "roofs" / r["file"]).save(dst, quality=88, method=6, exact=False)
        rbytes += dst.stat().st_size
        rlist.append({"id": r["id"], "file": f"roofs/{dst.name}", "x": r["x"], "y": r["y"], "w": r["w"], "h": r["h"],
                      "footprint": r["footprint"], "cells": r["cells"]})
        for k in r["cells"]:
            cells[k].setdefault("roofs", []).append(len(rlist) - 1)
    shutil.copyfile(run / "plants/atlas.webp", HERE / "atlas.webp")

    # the preview / whole-map view: ground + canopy + roofs at 1/4
    comp = ground.convert("RGBA")
    comp.alpha_composite(Image.open(run / "canopy/canopy.png").convert("RGBA"))
    for r in roofs["roofs"]:
        comp.alpha_composite(Image.open(run / "roofs" / r["file"]).convert("RGBA"), (r["x"], r["y"]))
    comp.convert("RGB").resize((W // PREVIEW, H // PREVIEW), Image.LANCZOS).save(HERE / "preview.webp", quality=82, method=6)

    manifest = {
        "name": "summervale", "run": str(run.relative_to(REPO)), "cols": cols, "rows": rows, "pps": pps,
        "cell": CELL, "size": [W, H], "grid": [nx, ny], "waterScale": WQ,
        "preview": {"file": "preview.webp", "w": W // PREVIEW, "h": H // PREVIEW},
        "cells": cells,
        # trees: trunk x, y (squares), crown radius (squares) — what a clump sways round
        "trees": [[t["x"], t["y"], round(t["d"] / 2, 3)] for t in trees["trees"]],
        "polys": [t["poly"] for t in trees["trees"]],
        # clumps: box x0 y0 x1 y1 (map px), pivot x y (map px), tree, seed
        "clumps": [[*q["box"], round(q["pivot"][0], 1), round(q["pivot"][1], 1), q["tree"], q["seed"]] for q in trees["clumps"]],
        "roofs": rlist,
        "plants": {"atlas": {**plants["atlas"], "file": "atlas.webp"}, "types": plants["types"], "mesh": plants["mesh"],
                   "list": [[p["type"], p["layer"], p["x"], p["y"], p["rot"], p["scale"], p["tint"]] for p in plants["plants"]]},
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    mb = lambda b: round(b / 2**20, 2)
    pbytes = (HERE / "preview.webp").stat().st_size
    print(f"{nx * ny} cells ({sum('canopy' in c for c in cells.values())} canopy, {sum('water' in c for c in cells.values())} water) — "
          f"ground {mb(gbytes)} MB, canopy {mb(cbytes)} MB, water {mb(wbytes)} MB, roofs {mb(rbytes)} MB, preview {mb(pbytes)} MB, "
          f"manifest {mb((HERE / 'manifest.json').stat().st_size)} MB — {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else RUN)
