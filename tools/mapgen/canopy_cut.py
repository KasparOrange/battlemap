#!/usr/bin/env python3
"""The big map's painted canopy cut back into trees and leaf clumps, stored per 512 px map cell.

    python3 tools/mapgen/canopy_cut.py <run>        # reads <run>/canopy/canopy.png + canopy.json

The riverbend slice does this in docs/mockups/outdoor/prepare.py (`canopy_trees`) over one screen:
a disc per crown over the whole picture and a pure-Python watershed — hours on a 4 × 4 map. Here
the same cut runs on the whole map in under a minute: every crown's disc tests only its own box,
the crevice cost is blurred on a shrunken copy, the watershed is scipy's `watershed_ift` with a
distance tie-break (plateaus split halfway between seeds, as the slice's Meyer flood does), and
each tree's clump cutter (prepare.py `branch_pieces`) uses the same fast flood.

**Map-space, not a packed atlas.** The slice packs every clump's bounding box (+ an under-copy and
a shadow) into an atlas; on summervale that measured 3.9× the canopy's own pixels in clump boxes
alone (141 MB GPU for two forest screens, 123 MB for the worst TV window). Here the canopy picture
itself is the texture: each clump is a quad over its box that samples the canopy at its own map
pixels (shifted by its sway) and keeps only the pixels whose clump id matches. The under-copy and
the shadow come from the same texture (a blurred mip, darkened / offset), so a window costs the
canopy's cells (RGBA) + their id maps (8 bit) — 1.25× the canopy's cells.

Output in <run>/canopy/:
- cells/<cx>_<cy>.webp — the canopy (RGBA, q 90, alpha lossless) of 512 px map cell (cx, cy), the
  TV's ground tile grid; cells/<cx>_<cy>.ids.png — 8-bit grey: index + 1 into that cell's
  `clumps` list (0 = no canopy; lossless, sample it nearest). Only cells with canopy are written.
- trees.json — trees (id, species, tier, trunk x/y and crown d in squares, box in map px, poly =
  crown outline in squares, clumps = [first, last] id), clumps (id, tree, box in map px, pivot in
  map px — its branch end, r = 0 centre … 1 rim, seed = sway phase), cells (files, bytes,
  clumps = the global ids whose box touches the cell, in id-map order), window_mb (GPU MB of a window + half a screen round it).
- trees-labels.jpg (each tree one colour, ¼ size), trees-crop.jpg (full size, tree seams magenta,
  clump seams yellow) — to check the cut by eye.
"""
import importlib.util
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import mapgen  # noqa: E402
import outdoor  # noqa: E402

REPO = HERE.parents[1]
_spec = importlib.util.spec_from_file_location("outdoor_prepare", REPO / "docs/mockups/outdoor/prepare.py")
prep = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prep)

CELL = 512          # the TV's ground tile: the canopy cells follow the same grid


def fast_flood(cost, markers, mask):
    """Marker watershed like prepare.py's `flood` (Meyer), in C: scipy's watershed_ift on a
    16-bit cost = cost × 256 + distance from the nearest seed, so a flat plateau is split halfway
    between its seeds instead of going whole to the first one; outside `mask` is flooded last
    and cleared."""
    m = np.asarray(markers).astype(np.int32)
    dist = ndi.distance_transform_edt(m == 0)
    tie = np.clip(dist / max(1.0, dist[mask].max() if mask.any() else 1) * 255, 0, 255)
    c16 = (np.asarray(cost).astype(np.uint16) * 256 + tie.astype(np.uint16))
    c16[~mask] = 65535
    lab = ndi.watershed_ift(c16, m)
    lab[~mask] = 0
    return lab


prep.flood = fast_flood   # branch_pieces' clump cut, per tree


def _blur2(a, sigma):
    """2-D gaussian blur; wide ones on a shrunken copy (outdoor._blur)."""
    return outdoor._blur(a[..., None].astype(np.float32), sigma)[..., 0]


def cut(run):
    folder = run / "canopy"
    rec = json.loads((folder / "canopy.json").read_text())
    meta = json.loads((run / "meta.json").read_text())
    spec = mapgen.load_spec(meta["layout"])
    pps, crowns = rec["pps"], rec["crowns"]
    cols, rows = spec["grid"]
    t0 = time.time()
    A = np.asarray(Image.open(folder / "canopy.png").convert("RGBA"))
    H, W = A.shape[:2]
    assert (W, H) == (cols * pps, rows * pps), (W, H)
    on = A[..., 3] > 10
    lum = A[..., :3].astype(np.float32) @ np.float32([0.3, 0.59, 0.11]) / 255

    def disc(c, extra=1.0):
        """The crown's box (its disc + `extra` squares) and the distance in radii inside it."""
        r = c["d"] / 2 * pps
        cx, cy = c["x"] * pps, c["y"] * pps
        x0, y0 = max(0, int(cx - r - extra * pps)), max(0, int(cy - r - extra * pps))
        x1, y1 = min(W, int(cx + r + extra * pps) + 1), min(H, int(cy + r + extra * pps) + 1)
        if x1 <= x0 or y1 <= y0:
            return None
        yy, xx = np.mgrid[y0:y1, x0:x1]
        return x0, y0, x1, y1, (np.hypot(xx - cx, yy - cy) / r).astype(np.float32)

    # who is on top where (the biggest disc covering the pixel: crowns are listed small → big),
    # the nearest crown for islands, and the seeds (on painted canopy only)
    top = np.zeros((H, W), np.int32)
    nearest = np.zeros((H, W), np.int32)
    near = np.full((H, W), np.inf, np.float32)
    for i, c in enumerate(crowns):
        b = disc(c)
        if not b:
            continue
        x0, y0, x1, y1, d = b
        top[y0:y1, x0:x1][d < 1] = i + 1
        sub = near[y0:y1, x0:x1]
        better = d < sub
        sub[better] = d[better]
        nearest[y0:y1, x0:x1][better] = i + 1
    del near
    markers = np.zeros((H, W), np.int32)
    for i, c in enumerate(crowns):
        b = disc(c, 0)
        if b:
            x0, y0, x1, y1, d = b
            markers[y0:y1, x0:x1][(top[y0:y1, x0:x1] == i + 1) & (d < 0.5) & on[y0:y1, x0:x1]] = i + 1
    del top
    print(f"discs {time.time() - t0:.0f}s", flush=True)
    fill = np.where(on, lum, lum[on].mean()).astype(np.float32)
    crev = np.clip(0.55 - (ndi.gaussian_filter(fill, 2) - _blur2(fill, pps * 0.8)) * 3, 0, 1)
    cost = (255 * crev).astype(np.uint8)
    del fill, crev, lum
    lab = fast_flood(cost, markers, on)
    del cost, markers
    # a tree keeps only what lies within its crown + 0.6 squares (the flood may jump gaps to a far
    # patch); the rest and the islands go to the nearest crown
    valid = np.zeros((H, W), bool)
    for i, c in enumerate(crowns):
        b = disc(c)
        if b:
            x0, y0, x1, y1, d = b
            valid[y0:y1, x0:x1] |= (lab[y0:y1, x0:x1] == i + 1) & (d < 1 + 0.6 / (c["d"] / 2))
    fix = on & ~valid
    lab[fix] = nearest[fix]
    lab[~on] = 0
    del valid, nearest, fix
    print(f"trees watershed {time.time() - t0:.0f}s", flush=True)

    # per tree: its clumps (seeds on two rings, the watershed along the crevices), ids map-wide
    ids = np.zeros((H, W), np.int32)
    trees, clumps = [], []
    for i, c in enumerate(crowns):
        b = disc(c)
        if not b:
            continue
        x0, y0, x1, y1, _ = b
        region = lab[y0:y1, x0:x1] == i + 1
        if region.sum() < pps * pps * 0.3:   # a sliver: to the neighbour that owns most around it
            continue
        ys, xs = np.nonzero(region)
        x0, y0, x1, y1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
        region = lab[y0:y1, x0:x1] == i + 1
        still = Image.fromarray(A[y0:y1, x0:x1].copy(), "RGBA")
        still.putalpha(Image.fromarray(np.where(region, A[y0:y1, x0:x1, 3], 0).astype(np.uint8)))
        arms = int(np.clip(round(c["d"] * 1.7), 6, 13))
        labels = np.asarray(prep.branch_pieces(still, arms)).astype(np.int32)
        labels[~region] = 0
        alpha = np.where(region, A[y0:y1, x0:x1, 3], 0).astype(float)
        cy, cx = ndi.center_of_mass(alpha)
        R = max(x1 - x0, y1 - y0) / 2
        first = len(clumps)
        for k in [k for k in np.unique(labels) if k]:
            m = labels == k
            if m.sum() < pps * pps * 0.12:   # a seed walled in by its neighbours: merged into them below
                labels[m] = 0
                continue
            py, px = ndi.center_of_mass(m)
            rx, ry = (px - cx) / R, (py - cy) / R
            yy, xx = np.nonzero(m)
            cid = len(clumps)
            clumps.append({"id": cid, "tree": len(trees),
                           "box": [int(x0 + xx.min()), int(y0 + yy.min()), int(x0 + xx.max() + 1), int(y0 + yy.max() + 1)],
                           "pivot": [round(x0 + px - rx * R * 0.18, 1), round(y0 + py - ry * R * 0.18, 1)],
                           "r": round(min(1, math.hypot(rx, ry)), 3), "seed": round(prep.seeds.random(), 3)})
            ids[y0:y1, x0:x1][m] = cid + 1
        # pixels the clump cut left out (merged tiny pieces) go to the tree's nearest clump
        left = region & (ids[y0:y1, x0:x1] == 0)
        if left.any() and len(clumps) > first:
            sub = ids[y0:y1, x0:x1]
            loc = np.where(region, sub, 0)   # only this tree's clumps
            _, (iy, ix) = ndi.distance_transform_edt(loc == 0, return_indices=True)
            sub[left] = loc[iy[left], ix[left]]
        trees.append({"id": len(trees), "species": c["species"], "tier": c["tier"], "x": c["x"], "y": c["y"], "d": c["d"],
                      "box": [int(x0), int(y0), int(x1), int(y1)],
                      "poly": [[round(x / pps, 2), round(y / pps, 2)] for x, y in outdoor.crown_outline(c, pps, 16)],
                      "clumps": [first, len(clumps) - 1]})
        if len(trees) % 300 == 0:
            print(f"{len(trees)} trees {time.time() - t0:.0f}s", flush=True)
    # canopy left without a clump (a sliver tree's pixels): the nearest clump
    orphan = on & (ids == 0)
    if orphan.any():
        _, (iy, ix) = ndi.distance_transform_edt(ids == 0, return_indices=True)
        ids[orphan] = ids[iy[orphan], ix[orphan]]
        del iy, ix
    print(f"{len(trees)} trees, {len(clumps)} clumps {time.time() - t0:.0f}s", flush=True)

    # cells: the canopy and its id map per 512 px of the map
    (folder / "cells").mkdir(exist_ok=True)
    for f in (folder / "cells").glob("*"):
        f.unlink()
    cells = {}
    boxes = np.array([cl["box"] for cl in clumps]).reshape(-1, 4)
    for cy0 in range(0, H, CELL):
        for cx0 in range(0, W, CELL):
            a = A[cy0:cy0 + CELL, cx0:cx0 + CELL]
            if not (a[..., 3] > 10).any():
                continue
            key = f"{cx0 // CELL}_{cy0 // CELL}"
            Image.fromarray(a, "RGBA").save(folder / "cells" / f"{key}.webp", quality=90, alpha_quality=100, method=4)
            iv = ids[cy0:cy0 + CELL, cx0:cx0 + CELL]
            touch = (boxes[:, 0] < cx0 + CELL) & (boxes[:, 2] > cx0) & (boxes[:, 1] < cy0 + CELL) & (boxes[:, 3] > cy0)
            # 8-bit ids: index + 1 into this cell's clump list (summervale: at most 183 per cell)
            local = np.zeros(len(clumps) + 1, np.int32)
            local[np.nonzero(touch)[0] + 1] = np.arange(1, touch.sum() + 1)
            assert touch.sum() < 256, (key, touch.sum())
            Image.fromarray(local[iv].astype(np.uint8), "L").save(folder / "cells" / f"{key}.ids.png", optimize=True)
            cells[key] = {"canopy": f"cells/{key}.webp", "ids": f"cells/{key}.ids.png", "w": a.shape[1], "h": a.shape[0],
                          "bytes": (folder / "cells" / f"{key}.webp").stat().st_size + (folder / "cells" / f"{key}.ids.png").stat().st_size,
                          "clumps": np.nonzero(touch)[0].tolist()}
    out = {"pps": pps, "cell": CELL, "grid": [cols, rows], "size": [W, H], "canopy": "canopy.png",
           "cells": cells, "trees": trees, "clumps": clumps}
    windows(out)
    (folder / "trees.json").write_text(json.dumps(out))
    print(f"{len(cells)} cells, {sum(v['bytes'] for v in cells.values()) / 2**20:.1f} MB on disk; "
          f"window + ring: {out['window_mb']}  {time.time() - t0:.0f}s", flush=True)

    # pictures for a look
    rng = np.random.default_rng(1)
    pal = rng.integers(40, 255, (lab.max() + 1, 3)).astype(np.uint8)
    pal[0] = 0
    Image.fromarray(pal[lab[::4, ::4]]).save(folder / "trees-labels.jpg", quality=85)
    return out, lab, ids, A


def windows(out):
    """GPU MB a TV window loads for the canopy: the window (one screen) + half a screen round it,
    every cell that touches it, the canopy as RGBA (4 B/px) + the ids as R8 (1 B/px) — the
    heaviest window, where it is, and the mean over all window positions (whole squares)."""
    pps, (cols, rows) = out["pps"], out["grid"]
    sw, sh = outdoor.SCREEN
    res = []
    for wy in range(0, rows - sh + 1):
        for wx in range(0, cols - sw + 1):
            x0, y0 = (wx - sw / 2) * pps, (wy - sh / 2) * pps
            x1, y1 = (wx + sw * 1.5) * pps, (wy + sh * 1.5) * pps
            px = sum(v["w"] * v["h"] for k, v in out["cells"].items()
                     if x0 < (int(k.split("_")[0]) + 1) * CELL and int(k.split("_")[0]) * CELL < x1
                     and y0 < (int(k.split("_")[1]) + 1) * CELL and int(k.split("_")[1]) * CELL < y1)
            res.append((px * 5 / 2**20, wx, wy))
    res.sort()
    out["window_mb"] = {"max": round(res[-1][0], 1), "at": list(res[-1][1:]), "mean": round(sum(r[0] for r in res) / len(res), 1)}


if __name__ == "__main__":
    run = Path(sys.argv[1]).resolve()
    out, lab, ids, A = cut(run)
    # a full-size crop: tree seams magenta, clump seams yellow (the great forest, 14 × 9 squares)
    pps = out["pps"]
    x0, y0, x1, y1 = 88 * pps, 5 * pps, 102 * pps, 14 * pps
    L, I = lab[y0:y1, x0:x1], ids[y0:y1, x0:x1]
    a = A[y0:y1, x0:x1, :3].copy()
    a[I != ndi.grey_erosion(I, 3)] = (255, 220, 0)
    a[L != ndi.grey_erosion(L, 3)] = (255, 40, 200)
    Image.fromarray(a).save(run / "canopy" / "trees-crop.jpg", quality=88)
