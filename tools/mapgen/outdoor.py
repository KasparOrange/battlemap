#!/usr/bin/env python3
"""Outdoor maps: layout → guide → Nano Banana → the ground layer + the masks battlemap animates.

The outdoor counterpart of mapgen.py (design: docs/ai-art.md "outdoor maps"). The painting is the
GROUND only: no tree crowns, bushes, reeds or roofs — those are laid on top from our layout and
animated on the table (wind), and roofs/crowns can lift when the party walks under them. Roofs and
the forest canopy are edit passes on the finished ground, cut out by our own shapes (`roof`,
`canopy`); the other plants are sprites. The
river is painted as a still; its motion comes from the masks written here (where the water is,
which way and how fast it flows, where it is shallow, where it breaks on rocks).

Usage:
  tools/mapgen/outdoor.py guide layouts/riverbend.json             # guide + masks, free
  tools/mapgen/outdoor.py guide layouts/summervale.json            # big map: + crops/ per screen + guide-sheet.jpg
  tools/mapgen/outdoor.py crops layouts/summervale.json [--margin 2]   # only re-cut the per-screen crops
  tools/mapgen/outdoor.py paint layouts/riverbend.json --size 2K --n 2 --why "…"
  tools/mapgen/outdoor.py paint layouts/riverbend.json --albedo …  # unlit, for the table's light (docs/ai-art.md "Light lab")
  tools/mapgen/outdoor.py roof  out/riverbend/<run> [out_1.jpg]    # roof sprites from the painting
  tools/mapgen/outdoor.py roof  out/summervale/<run> ground.png --out roofs [--only inn,barn] [--n 0 --pick "barn=raw/roof_barn_2.jpg"]
  tools/mapgen/outdoor.py canopy out/riverbend/<run> [--size 1K] [--plan]   # the forest canopy as one layer
  tools/mapgen/outdoor.py paint layouts/summervale.json --size 4K --tag master   # big map: the master (short prompt)
  tools/mapgen/outdoor.py tiles out/summervale/<run> [--only r1c2,…]   # 2K per screen from guide crop + master crop
  tools/mapgen/outdoor.py assemble out/summervale/<run> [--pps 56] [--pick r1c2=tiles/r1c2_2.jpg]   # ground.png

Layout (squares, origin top-left): `zones` (forest · meadow · … polygons), `river` (centre-line
points [x, y, width, speed 0 calm…1 rapids, shallow 0 deep…1 ford]), `rocks` ([x, y, r] boulders
in the water), `paths` (polylines with width), `fences` (polylines, thin), `bridges` and `props`
(rects), `buildings` (rect + doors on a side — also a ruin's breaches —, walls drawn like mapgen's,
roof style; "none" = a ruin, no roof, no footprint), single `trees`, `river.bank_trees`,
`edge_shrubs`. Zone kinds: meadow, forest (with a `stand` mix), garden, field, road, path. Run
folders: tools/mapgen/out/<name>/. A map bigger than one TV screen (34 × 19) is painted in tiles:
`guide` then also writes one guide crop + prompt per screen (`crop_boxes`, docs/ai-art.md); `paint` makes
the master, `tiles` paints each crop from it, `assemble` joins them into ground.png.
"""

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mapgen  # noqa: E402  (shares the engine import, prices, aspects, run folders)

HERE = mapgen.HERE
OUT = mapgen.OUT
GUIDE_PPS = 40      # guide pixels per square
MASK_PPS = 16       # mask / flow pixels per square
SS = 4              # supersampling for smooth guide edges
WALL = 0.3          # wall thickness in squares (a cottage wall is thicker than a dungeon's line)

COLORS = {
    "meadow": (112, 164, 66), "forest": (52, 82, 38), "garden": (122, 94, 56),
    "road": (176, 136, 82), "path": (204, 170, 112),
    "gravel": (204, 190, 150), "mud": (104, 86, 56),
    "deep": (30, 74, 168), "rapids": (70, 150, 230), "ford": (128, 196, 228),
    "rock": (96, 96, 96), "bridge": (140, 92, 48), "field": (222, 196, 92), "fence": (150, 58, 22),
    "wall": (32, 32, 32), "floor": (128, 128, 128), "prop": (255, 0, 255),
}

LEGEND = {
    "meadow": "light green = sunny summer meadow grass",
    "forest": "dark green = forest floor under a canopy (see the ground-layer rule)",
    "garden": "brown = tilled garden soil",
    "field": "golden yellow = a ripe grain field, the rows of the crop running along the field's long side",
    "fence": "thin rust-brown lines = low fences (post-and-rail, wattle or dry-stone, see below), knee high",
    "road": "tan = dirt road",
    "path": "light tan = trodden footpath",
    "gravel": "sandy band along the water = gravel and pebble bank",
    "mud": "dark brown band along the water = muddy bank with a few low water plants",
    "deep": "deep blue = deep calm river water",
    "rapids": "bright blue = fast, churning water in the rapids",
    "ford": "pale blue = shallow ford: clear water over a bed of pebbles that shows through",
    "rock": "grey dots in the water = boulders standing out of the water",
    "bridge": "brown band across the river = the bridge",
    "wall": "near-black bands = building walls",
    "floor": "mid grey inside walls = the building's floor; a gap in a wall = an open doorway, nothing in the gap",
    "prop": "magenta blocks = props described below",
}


# ---------------------------------------------------------------- geometry


def catmull(points, step=0.1):
    """Samples a Catmull-Rom spline through `points` (rows of [x, y, …extra]) every ~`step`
    squares; the extra columns are interpolated linearly. Returns an (n, k) array."""
    P = np.asarray(points, float)
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        n = max(2, int(np.hypot(*(p2[:2] - p1[:2])) / step))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            xy = 0.5 * (2 * p1[:2] + (-p0[:2] + p2[:2]) * t + (2 * p0[:2] - 5 * p1[:2] + 4 * p2[:2] - p3[:2]) * t2
                        + (-p0[:2] + 3 * p1[:2] - 3 * p2[:2] + p3[:2]) * t3)
            out.append(np.concatenate([xy, p1[2:] * (1 - t) + p2[2:] * t]))
    out.append(P[-1])
    return np.array(out)


def river_samples(spec):
    """The river centre line sampled densely: columns x, y, width, speed, shallow, tx, ty."""
    s = catmull(spec["river"]["points"])
    d = np.gradient(s[:, :2], axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    return np.hstack([s, d])


def strip(samples, half):
    """Polygon of a band around a centre line; `half` = half-width per sample (array)."""
    n = np.stack([-samples[:, 6], samples[:, 5]], 1) if samples.shape[1] > 6 else None
    if n is None:
        d = np.gradient(samples[:, :2], axis=0)
        d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
        n = np.stack([-d[:, 1], d[:, 0]], 1)
    left = samples[:, :2] + n * half[:, None]
    right = samples[:, :2] - n * half[:, None]
    return [tuple(p) for p in np.vstack([left, right[::-1]])]


def walls(b):
    """A building's wall rectangles (squares) with gaps for its doors."""
    x, y, w, h = b["rect"]
    t = WALL / 2
    sides = {"N": ((x, y), (x + w, y)), "S": ((x, y + h), (x + w, y + h)),
             "W": ((x, y), (x, y + h)), "E": ((x + w, y), (x + w, y + h))}
    out = []
    for side, ((x0, y0), (x1, y1)) in sides.items():
        horiz = y0 == y1
        a, z = (x0, x1) if horiz else (y0, y1)
        cuts = sorted((a + d["at"], a + d["at"] + d.get("width", 1)) for d in b.get("doors", []) if d["side"] == side)
        pos = a - t
        for c0, c1 in cuts + [(z + t, z + t)]:
            if c0 > pos:
                out.append((pos, y0 - t, c0, y0 + t) if horiz else (x0 - t, pos, x0 + t, c0))
            pos = c1
    return out


# ---------------------------------------------------------------- guide


GUIDE_CHUNK = 1024   # big maps render in chunks of this many guide px (+ a margin), supersampled


def draw_layout(d, spec, k, ox=0, oy=0):
    """Draws the layout's guide colours with ImageDraw `d` at `k` px per square, the picture's
    top-left at map px (`ox`, `oy`) — one chunk of a big guide or the whole of a small one."""
    S = lambda pts: [(px * k - ox, py * k - oy) for px, py in pts]
    for z in spec.get("zones", []):
        d.polygon(S(z["poly"]), COLORS[z["kind"]])
    r = river_samples(spec)
    # banks: gravel where the water runs fast, mud where it is calm
    for i in range(len(r) - 1):
        seg = r[i:i + 2]
        bank = COLORS["gravel"] if max(seg[:, 3]) > 0.35 or max(seg[:, 4]) > 0.5 else COLORS["mud"]
        d.polygon(S(strip(seg, seg[:, 2] / 2 + 0.45)), bank)
    for p in spec.get("paths", []):
        ps = catmull(p["points"], 0.1)
        d.polygon(S(strip(ps, np.full(len(ps), p["width"] / 2))), COLORS[p["kind"]])
    for f in spec.get("fences", []):
        ps = np.asarray(f["points"], float)
        for a, b in zip(ps[:-1], ps[1:]):
            d.polygon(S(strip(np.array([a, b]), np.full(2, f.get("width", 0.16) / 2))), COLORS["fence"])
    for i in range(len(r) - 1):
        seg = r[i:i + 2]
        sp, sh = seg[:, 3].mean(), seg[:, 4].mean()
        c = np.array(COLORS["deep"]) * (1 - sh) + np.array(COLORS["ford"]) * sh
        c = c * (1 - sp) + np.array(COLORS["rapids"]) * sp
        d.polygon(S(strip(seg, seg[:, 2] / 2)), tuple(int(v) for v in c))
    for x, y, rr in spec.get("rocks", []):
        d.ellipse([(x - rr) * k - ox, (y - rr) * k - oy, (x + rr) * k - ox, (y + rr) * k - oy], COLORS["rock"])
    for b in spec.get("bridges", []):
        x, y, w, h = b["rect"]
        d.rectangle([x * k - ox, y * k - oy, (x + w) * k - ox, (y + h) * k - oy], COLORS["bridge"])
    for b in spec.get("buildings", []):
        x, y, w, h = b["rect"]
        d.rectangle([x * k - ox, y * k - oy, (x + w) * k - ox, (y + h) * k - oy], COLORS["floor"])
        for x0, y0, x1, y1 in walls(b):
            d.rectangle([x0 * k - ox, y0 * k - oy, x1 * k - ox, y1 * k - oy], COLORS["wall"])
    for p in spec.get("props", []):
        x, y, w, h = p["rect"]
        d.rectangle([(x + 0.1) * k - ox, (y + 0.1) * k - oy, (x + w - 0.1) * k - ox, (y + h - 0.1) * k - oy],
                    COLORS["prop"])


def render_guide(spec, pps=GUIDE_PPS):
    """The colour-coded guide the model repaints (smooth edges by supersampling). A small map
    (one screen) is drawn in one piece; a big one in GUIDE_CHUNK-px chunks, each drawn with a
    margin past the LANCZOS filter's reach and cropped, so it matches a one-piece render (a
    136 × 76 map supersampled whole would be 21,760 × 12,160 px, ~800 MB)."""
    cols, rows = spec["grid"]
    k = pps * SS
    W, H = cols * pps, rows * pps
    bg = COLORS[spec.get("ground", "meadow")]
    if W * H * SS * SS <= 64e6:
        img = Image.new("RGB", (W * SS, H * SS), bg)
        draw_layout(ImageDraw.Draw(img), spec, k)
        return img.resize((W, H), Image.LANCZOS)
    out = Image.new("RGB", (W, H), bg)
    m = 4   # guide px of margin (LANCZOS reaches 3 px when shrinking)
    for y0 in range(0, H, GUIDE_CHUNK):
        for x0 in range(0, W, GUIDE_CHUNK):
            cw, ch = min(GUIDE_CHUNK, W - x0), min(GUIDE_CHUNK, H - y0)
            img = Image.new("RGB", ((cw + 2 * m) * SS, (ch + 2 * m) * SS), bg)
            draw_layout(ImageDraw.Draw(img), spec, k, (x0 - m) * SS, (y0 - m) * SS)
            small = img.resize((cw + 2 * m, ch + 2 * m), Image.LANCZOS)
            out.paste(small.crop((m, m, m + cw, m + ch)), (x0, y0))
    return out


def squares(x0, y0, x1, y1):
    return f"columns {int(x0) + 1}–{int(np.ceil(x1))}, rows {int(y0) + 1}–{int(np.ceil(y1))}"


def bbox(pts, cols, rows):
    a = np.clip(np.asarray(pts, float), 0, [cols, rows])
    return (*a.min(0), *a.max(0))


def build_prompt(spec, box=None, compact=False):
    """Fills prompts/outdoor.txt: the legend for the colours this layout uses + one line per area.

    `box` (x0, y0, x1, y1 in squares) = the prompt for one crop of a big map (tiled painting):
    only what reaches into the box is listed, its squares counted from the box's top-left, and
    the size is the box's (whole squares, rounded).
    `compact` = the master's prompt for a big map (the 136 × 76 one ran to 86 lines, 13 KB):
    buildings and props with the same description share one line (the seven standing stones;
    areas such as the forests keep a line each — merged, the master lost the southern woods),
    building and prop descriptions keep only their first clause (the tiles paint the detail)."""
    cols, rows = spec["grid"]
    bx0, by0, bx1, by1 = box or (0, 0, cols, rows)
    W, H = bx1 - bx0, by1 - by0

    def where(x0, y0, x1, y1):
        """None when (x0, y0, x1, y1) misses the box, else its squares within the box."""
        if x1 <= bx0 or x0 >= bx1 or y1 <= by0 or y0 >= by1:
            return None
        return squares(max(x0, bx0) - bx0, max(y0, by0) - by0, min(x1, bx1) - bx0, min(y1, by1) - by0)

    used = {spec.get("ground", "meadow")} | {z["kind"] for z in spec.get("zones", [])}
    used |= {p["kind"] for p in spec.get("paths", [])}
    if spec.get("river"):
        used |= {"deep", "rapids", "ford", "gravel", "mud"}
    for key, flag in (("rock", "rocks"), ("bridge", "bridges"), ("prop", "props"), ("fence", "fences")):
        if spec.get(flag):
            used.add(key)
    if spec.get("buildings"):
        used |= {"wall", "floor"}
    legend = "; ".join(v for k, v in LEGEND.items() if k in used) + "."
    lines = []
    for z in spec.get("zones", []):
        if z.get("desc") and (w := where(*bbox(z["poly"], cols, rows))):
            lines.append(f"- {z['id']} ({w}): {z['desc']}")
    n_zones = len(lines)   # areas keep a line each: merged, the 1K master dropped 3 of 4 forests
    if spec.get("river"):
        rs = river_samples(spec)
        if any(where(x - w / 2 - 0.5, y - w / 2 - 0.5, x + w / 2 + 0.5, y + w / 2 + 0.5) for x, y, w in rs[:, :3]):
            lines.append(f"- river: {spec['river']['desc']}")
    for p in spec.get("paths", []) + spec.get("fences", []):
        if p.get("desc") and (w := where(*bbox(p["points"], cols, rows))):
            lines.append(f"- {p['id']} ({w}): {p['desc']}")
    for b in spec.get("bridges", []) + spec.get("buildings", []) + spec.get("props", []):
        x, y, w, h = b["rect"]
        if wh := where(x, y, x + w, y + h):
            desc = b["desc"]
            if compact and b not in spec.get("bridges", []):
                desc = desc.split(":")[0].split(", ")[0]
            lines.append(f"- {b.get('id', 'prop')} ({wh}): {desc}")
    if compact:   # one line per description: "- a, b (where; where): desc"
        merged = {}
        for i, ln in enumerate(lines):
            if ln.startswith("- river:") or i < n_zones:
                merged[ln] = None
                continue
            head, desc = ln[2:].split("): ", 1)
            name, wh = head.rsplit(" (", 1)
            merged.setdefault(desc, []).append((name, wh))
        lines = [k if v is None else
                 f"- {', '.join(n for n, _ in v)} ({'; '.join(w for _, w in v)}): {k}" for k, v in merged.items()]
    return (HERE / "prompts" / "outdoor.txt").read_text().format(
        cols=round(W), rows=round(H), setting=spec["setting"], legend=legend,
        style=spec.get("style", "hand-painted fantasy battle map, rich natural textures, lush summer greens, "
                                "warm sunlight, crisp readable edges, the look of a premium printed battle map"),
        areas="\n".join(lines))


# ---------------------------------------------------------------- masks


def masks(spec, pps=MASK_PPS):
    """What the table animates, at `pps` px per square:

    - water.png  RGBA: R,G = flow direction (×0.5+0.5), B = speed (0 calm … 1 rapids),
      A = water (soft 1-px edge; bridges and boulders cut out)
    - water2.png RGBA: R = shallow (0 deep … 1 ford), G = distance to the bank (0 at the bank,
      1 ≥ 1.5 squares in), B = foam near boulders (1 at a rock, 0 a square away), A = 255
    - footprints.png L: one grey value per building (index + 1), for roof cut-outs
    Returns the meta dict (sizes, buildings)."""
    cols, rows = spec["grid"]
    W, H = cols * pps, rows * pps
    k = pps * SS
    r = river_samples(spec)
    water = Image.new("L", (cols * k, rows * k), 0)
    d = ImageDraw.Draw(water)
    S = lambda pts: [(px * k, py * k) for px, py in pts]
    for i in range(len(r) - 1):
        d.polygon(S(strip(r[i:i + 2], r[i:i + 2, 2] / 2)), 255)
    rock = Image.new("L", water.size, 0)
    dr = ImageDraw.Draw(rock)
    for x, y, rr in spec.get("rocks", []):
        dr.ellipse([(x - rr) * k, (y - rr) * k, (x + rr) * k, (y + rr) * k], 255)
    for b in spec.get("bridges", []):
        x, y, w, h = b["rect"]
        d.rectangle([x * k, y * k, (x + w) * k, (y + h) * k], 0)
    water = np.asarray(water.resize((W, H), Image.BOX), float) / 255
    rockm = np.asarray(rock.resize((W, H), Image.BOX), float) / 255
    alpha = np.clip(water - rockm, 0, 1)

    # per pixel: the nearest centre-line sample gives direction, speed and depth
    from scipy.spatial import cKDTree
    tree = cKDTree(r[:, :2])
    gy, gx = np.mgrid[0:H, 0:W]
    q = np.stack([(gx + 0.5) / pps, (gy + 0.5) / pps], -1).reshape(-1, 2)
    _, idx = tree.query(q)
    near = r[idx].reshape(H, W, -1)
    speed = ndi.gaussian_filter(near[..., 3], pps * 0.6)
    shallow = ndi.gaussian_filter(near[..., 4], pps * 0.6)
    tx, ty = near[..., 5], near[..., 6]
    # water slows and turns along the banks; rocks push it aside
    inside = water > 0.5
    bank = np.clip(ndi.distance_transform_edt(inside) / (1.5 * pps), 0, 1)
    rock_d = ndi.distance_transform_edt(rockm < 0.5) / pps
    # foam: a short collar around each boulder and a wake trailing ~1.5 squares downstream
    foam = np.clip(1 - rock_d / 0.3, 0, 1)
    if spec.get("rocks"):
        # each group of boulders (closer than 3 squares) trails its wake along its own stretch's
        # mean flow — a big map has boulders in the rapids and stepping stones in a ford
        for group in rock_groups(spec["rocks"]):
            rx, ry = np.mean([r[np.argmin(np.hypot(r[:, 0] - x, r[:, 1] - y)), 5:7] for x, y, _ in group], axis=0)
            rm = rockm
            if len(group) < len(spec["rocks"]):
                win = np.zeros_like(rockm)
                gx0, gy0 = (min(x - rr for x, y, rr in group) - 1) * pps, (min(y - rr for x, y, rr in group) - 1) * pps
                gx1, gy1 = (max(x + rr for x, y, rr in group) + 1) * pps, (max(y + rr for x, y, rr in group) + 1) * pps
                win[max(0, int(gy0)):int(gy1) + 1, max(0, int(gx0)):int(gx1) + 1] = 1
                rm = rockm * win
            steps = 14
            for i in range(1, steps + 1):
                d = 1.5 * i / steps
                moved = ndi.shift(rm, (ry * d * pps, rx * d * pps), order=1)
                foam = np.maximum(foam, moved * (1 - i / (steps + 1)) ** 1.3)
        foam = ndi.gaussian_filter(foam, pps * 0.12)
    foam = foam * (rockm < 0.5)
    speed = speed * (0.35 + 0.65 * np.sqrt(bank))
    flow = np.stack([tx, ty], -1)
    if spec.get("rocks"):
        gyr, gxr = np.gradient(ndi.gaussian_filter(rock_d, pps * 0.3))
        push = np.stack([gxr, gyr], -1) * pps * np.clip(1.2 - rock_d, 0, 1)[..., None] * 0.9
        flow = flow + push
        flow /= np.linalg.norm(flow, axis=-1, keepdims=True) + 1e-9
    a = np.stack([flow[..., 0] * 0.5 + 0.5, flow[..., 1] * 0.5 + 0.5, np.clip(speed, 0, 1), alpha], -1)
    b = np.stack([np.clip(shallow, 0, 1), bank, foam, np.ones_like(bank)], -1)
    return (Image.fromarray((a * 255).round().astype(np.uint8), "RGBA"),
            Image.fromarray((b * 255).round().astype(np.uint8), "RGBA"), footprints(spec, pps))


def rock_groups(rocks, gap=3.0):
    """The boulders split into groups: single linkage, centres closer than `gap` squares."""
    groups = []
    for rk in rocks:
        near = [g for g in groups if any(math.hypot(rk[0] - o[0], rk[1] - o[1]) < gap for o in g)]
        merged = [rk] + [o for g in near for o in g]
        groups = [g for g in groups if g not in near] + [merged]
    return groups


def footprints(spec, pps):
    """One grey value per building (index + 1) over its outer wall rectangle; buildings with
    `"roof": "none"` (ruins) get none, their value stays unused."""
    cols, rows = spec["grid"]
    img = Image.new("L", (cols * pps, rows * pps), 0)
    d = ImageDraw.Draw(img)
    for i, b in enumerate(spec.get("buildings", [])):
        if b.get("roof") == "none":
            continue
        x, y, w, h = b["rect"]
        t = WALL / 2
        d.rectangle([(x - t) * pps, (y - t) * pps, (x + w + t) * pps - 1, (y + h + t) * pps - 1], i + 1)
    return img


def write_layers(spec, folder):
    """Guide + masks into `folder`; returns the guide."""
    guide = render_guide(spec)
    guide.save(folder / "guide.png")
    water, water2, foot = masks(spec)
    water.save(folder / "water.png")
    water2.save(folder / "water2.png")
    foot.save(folder / "footprints.png")
    return guide


# ---------------------------------------------------------------- big maps: screens and crops

SCREEN = (34, 19)     # one TV screen in squares (the table's window, CLAUDE.md "The table")
CROP_MARGIN = 2       # squares of overlap a tile's crop reaches past its screen (at least)
CROP_KEEP = 1.7       # squares a crop keeps past each inner screen border (the seam blend's ±1.5)
OBJ_PAD = 0.25        # the guide draws walls ±0.15 squares round a building's rect


def screens(spec):
    """The map's TV screens, row by row: [(r, c, (x0, y0, x1, y1) in squares)]."""
    cols, rows = spec["grid"]
    sw, sh = SCREEN
    return [(r, c, (c * sw, r * sh, min(cols, (c + 1) * sw), min(rows, (r + 1) * sh)))
            for r in range(math.ceil(rows / sh)) for c in range(math.ceil(cols / sw))]


def _cut_objects(spec, box):
    """The buildings, bridges and props (x0, y0, x1, y1 in squares) a crop box (squares) cuts:
    they reach into it but don't fit in it."""
    x0, y0, x1, y1 = box
    out = []
    for o in spec.get("bridges", []) + spec.get("buildings", []) + spec.get("props", []):
        ox, oy, ow, oh = o["rect"]
        a = (ox - OBJ_PAD, oy - OBJ_PAD, ox + ow + OBJ_PAD, oy + oh + OBJ_PAD)
        if a[0] < x1 and a[2] > x0 and a[1] < y1 and a[3] > y0 and not (
                a[0] >= x0 and a[2] <= x1 and a[1] >= y0 and a[3] <= y1):
            out.append(a)
    return out


def _whole_box(spec, scr, keep=None, step=0.25, grow=1.6):
    """The smallest box (squares, x0, y0, x1, y1) in one of the model's aspects that holds the screen
    `scr` + `keep` squares on every inner side and cuts no building, bridge or prop (prop-cuts
    allowed as a fallback); None when nothing fits within `grow` × the screen's width."""
    keep = CROP_KEEP if keep is None else keep
    cols, rows = spec["grid"]
    sx0, sy0, sx1, sy1 = scr
    objs = [o["rect"] for o in spec.get("bridges", []) + spec.get("buildings", [])]
    props = [o["rect"] for o in spec.get("props", [])]
    need = (sx0 - keep if sx0 > 0 else 0, sy0 - keep if sy0 > 0 else 0,
            sx1 + keep if sx1 < cols else cols, sy1 + keep if sy1 < rows else rows)

    def search(rects):
        R = np.array([(x - OBJ_PAD, y - OBJ_PAD, x + w + OBJ_PAD, y + h + OBJ_PAD) for x, y, w, h in rects], float).reshape(-1, 4)
        best = None
        for asp in mapgen.ASPECTS:
            ra = int(asp.split(":")[0]) / int(asp.split(":")[1])
            for w in np.arange(max(need[2] - need[0], (need[3] - need[1]) * ra), grow * (sx1 - sx0), step):
                h = w / ra
                if w > cols or h > rows:
                    break
                xs = np.arange(max(0, need[2] - w), min(need[0], cols - w) + 1e-6, step)
                ys = np.arange(max(0, need[3] - h), min(need[1], rows - h) + 1e-6, step)
                if not len(xs) or not len(ys):
                    continue
                X0, Y0 = np.meshgrid(xs, ys, indexing="ij")
                X0, Y0 = X0[..., None], Y0[..., None]
                X1, Y1 = X0 + w, Y0 + h
                inter = (R[:, 0] < X1) & (R[:, 2] > X0) & (R[:, 1] < Y1) & (R[:, 3] > Y0)
                fits = (R[:, 0] >= X0) & (R[:, 2] <= X1) & (R[:, 1] >= Y0) & (R[:, 3] <= Y1)
                ok = ~np.any(inter & ~fits, axis=-1)
                if ok.any():
                    # most centred of the fitting positions
                    off = np.abs((X0[..., 0] + w / 2) - (sx0 + sx1) / 2) + np.abs((Y0[..., 0] + h / 2) - (sy0 + sy1) / 2)
                    i = np.unravel_index(np.argmin(np.where(ok, off, np.inf)), ok.shape)
                    cand = (w * h, asp, (float(xs[i[0]]), float(ys[i[1]]), float(xs[i[0]] + w), float(ys[i[1]] + h)))
                    if best is None or cand[0] < best[0]:
                        best = cand
                    break
        return best

    best = search(objs + props) or search(objs)
    return best and (best[2], best[1])


def crop_boxes(spec, margin=CROP_MARGIN, pps=GUIDE_PPS, whole=True):
    """One crop per screen for tiled painting: the screen + `margin` squares round it, grown to
    the nearest aspect the model offers (34 × 19 + 2 → 38 × 23 → 16:9 = 40.9 × 23 squares, so
    ~3.4 squares of overlap left and right, 2 above and below) and shifted back onto the map at
    its edges (the overlap then all lies on the inner side). Boxes in guide px (ints) + squares.

    `whole`: no building, bridge or prop is cut by a crop's edge — the model paints a cut object
    whole and pushes it inside the frame (summervale's first tiles doubled the fisher's hut, the
    barn and the keep's walls 2–3 squares in from the screen border). Then the box is the
    smallest one in any of the model's aspects that keeps CROP_KEEP squares past each inner screen
    border (the seam blend's room) and cuts nothing (`_whole_box`); the plain box when none fits."""
    cols, rows = spec["grid"]
    out = []
    for r, c, (x0, y0, x1, y1) in screens(spec):
        want = ((x0 - margin) * pps, (y0 - margin) * pps, (x1 + margin) * pps, (y1 + margin) * pps)
        *box, aspect = aspect_box((cols * pps, rows * pps), want)
        if whole and _cut_objects(spec, [v / pps for v in box]) and (wb := _whole_box(spec, (x0, y0, x1, y1))):
            box, aspect = [round(v * pps) for v in wb[0]], wb[1]
        out.append({"screen": [r, c], "screen_sq": [x0, y0, x1, y1], "box_px": box,
                    "box_sq": [round(v / pps, 3) for v in box], "aspect": aspect,
                    "screen_in_crop_px": [x0 * pps - box[0], y0 * pps - box[1], x1 * pps - box[0], y1 * pps - box[1]]})
    return out


def write_crops(spec, folder, guide=None, margin=CROP_MARGIN):
    """The guide cut into one crop per screen (crops/guide_r<r>c<c>.png, cut from guide.png at
    GUIDE_PPS), each with its own prompt (crops/prompt_r<r>c<c>.txt: only what reaches into the
    crop, squares counted from its corner) and crops/crops.json (every box)."""
    guide = guide or Image.open(folder / "guide.png")
    (folder / "crops").mkdir(exist_ok=True)
    boxes = crop_boxes(spec, margin)
    for b in boxes:
        tag = "r{}c{}".format(*b["screen"])
        guide.crop(b["box_px"]).save(folder / "crops" / f"guide_{tag}.png")
        (folder / "crops" / f"prompt_{tag}.txt").write_text(build_prompt(spec, b["box_sq"]))
    (folder / "crops" / "crops.json").write_text(json.dumps({
        "guide": "guide.png", "guide_pps": GUIDE_PPS, "grid": spec["grid"], "screen": SCREEN,
        "margin": margin, "crops": boxes}, indent=1))
    return boxes


def write_sheet(spec, folder, guide=None, pps=15):
    """A downscaled contact sheet of the guide (`pps` px per square) with the screens' borders
    and names (r<row>c<col>) drawn on → guide-sheet.jpg."""
    guide = guide or Image.open(folder / "guide.png")
    cols, rows = spec["grid"]
    img = guide.resize((cols * pps, rows * pps), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    for t in spec.get("trees", []):   # the layout's single trees (not in the guide): outlines
        rr = t["d"] / 2 * pps
        d.ellipse([t["x"] * pps - rr, t["y"] * pps - rr, t["x"] * pps + rr, t["y"] * pps + rr], outline=(20, 60, 20), width=2)
    for r, c, (x0, y0, x1, y1) in screens(spec):
        d.rectangle([x0 * pps, y0 * pps, x1 * pps - 1, y1 * pps - 1], outline=(255, 255, 255), width=3)
        d.rectangle([x0 * pps + 3, y0 * pps + 3, x1 * pps - 4, y1 * pps - 4], outline=(0, 0, 0), width=1)
        d.text((x0 * pps + 8, y0 * pps + 6), f"r{r}c{c}", fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0),
               font_size=max(12, pps * 1.4))
    img.save(folder / "guide-sheet.jpg", quality=88)
    return img


# ---------------------------------------------------------------- roofs


def _slug(name):
    return "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")


def roof_cut(b, crop, edit, box, ppsx, ppsy):
    """The roof sprite: what the edit changed, kept inside the outer walls + 0.45 squares (eaves,
    chimney), and always the whole footprint; the biggest piece only, feathered. RGBA, crop size."""
    x, y, w, h = b["rect"]
    e = WALL / 2 + 0.45
    near = Image.new("L", crop.size, 0)
    ImageDraw.Draw(near).rectangle([(x - e) * ppsx - box[0], (y - e) * ppsy - box[1],
                                    (x + w + e) * ppsx - box[0], (y + h + e) * ppsy - box[1]], 255)
    core = Image.new("L", crop.size, 0)
    ImageDraw.Draw(core).rectangle([(x - WALL / 2) * ppsx - box[0], (y - WALL / 2) * ppsy - box[1],
                                    (x + w + WALL / 2) * ppsx - box[0], (y + h + WALL / 2) * ppsy - box[1]], 255)
    diff = np.abs(np.asarray(edit, float) - np.asarray(crop, float)).mean(-1)
    changed = ndi.binary_fill_holes(ndi.binary_opening(ndi.gaussian_filter(diff, 2) > 22, iterations=2))
    m = (changed & (np.asarray(near) > 0)) | (np.asarray(core) > 0)
    lab, k = ndi.label(m)
    if k > 1:  # the roof is one piece; specks the edit changed in the grass around it drop out
        m = lab == 1 + np.argmax(ndi.sum(m, lab, range(1, k + 1)))
    mask = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    sprite = edit.convert("RGBA")
    sprite.putalpha(mask)
    return sprite


def roof(spec, run, file=None, n=1, folder=None, only=None, pick=None, size="1K"):
    """Roof sprites from the painting: per roofed building (not `roof: "none"`), an edit pass on a
    crop around it (±1.5 squares, grown to an offered aspect: `aspect_box`) puts a roof on exactly
    its walls; the result is cut by our footprint (+ a small eave: `roof_cut`) → roof_<id>.png with
    alpha, in map pixels at the crop's offset (roofs.json).

    `folder` (default: the run) gets the raw edits (`raw/`), the sprites, roofs.json (every draw,
    the pick per building — the newest, or `pick` {id: raw file}) and roofs-sheet.jpg (crop |
    roof on it, per building). `n` = new draws per building, `only` = building ids; n=0 only
    re-cuts the picks. Draws run 4 at a time."""
    meta = json.loads((run / "meta.json").read_text())
    file = file or meta["results"][0]["file"]
    folder = folder or run
    (folder / "raw").mkdir(parents=True, exist_ok=True)
    rec_path = folder / "roofs.json"
    old = json.loads(rec_path.read_text()) if rec_path.exists() else {}
    draws, picks = old.get("draws", []), old.get("pick", {})
    img = Image.open(run / file).convert("RGB")
    cols, rows = spec["grid"]
    ppsx, ppsy = img.width / cols, img.height / rows
    template = (HERE / "prompts" / "edit-roof.txt").read_text()
    blds = [b for b in spec.get("buildings", []) if b.get("roof") != "none" and (not only or b["id"] in only)]
    boxes = {}
    for b in blds:
        x, y, w, h = b["rect"]
        boxes[b["id"]] = aspect_box(img.size, ((x - 1.5) * ppsx, (y - 1.5) * ppsy, (x + w + 1.5) * ppsx, (y + h + 1.5) * ppsy))
    jobs = [(b, i) for b in blds for i in range(n)]
    from concurrent.futures import ThreadPoolExecutor

    def one(job):
        b, i = job
        box = boxes[b["id"]]
        crop = img.crop(box[:4])
        t0 = time.time()
        chimney = "Add a chimney above the hearth." if b.get("chimney", True) else "No chimney: this building has no hearth."
        data, mime, usage = mapgen.generate(template.format(roof=b.get("roof", "thatched"), desc=b["desc"], chimney=chimney),
                                            [crop], box[4], size, None)
        k = sum(1 for d in draws if d["id"] == b["id"]) + i + 1
        raw = folder / "raw" / f"roof_{_slug(b['id'])}_{k}{'.png' if 'png' in mime else '.jpg'}"
        raw.write_bytes(data)
        print(f"{raw.name}  {time.time() - t0:.0f}s", flush=True)
        return {"id": b["id"], "file": f"raw/{raw.name}", "size": size, "box": box[:4], "aspect": box[4],
                "seconds": round(time.time() - t0, 1)}

    with ThreadPoolExecutor(4) as ex:
        done = list(ex.map(one, jobs))
    draws += done
    for d in done:
        picks[d["id"]] = d["file"]
    picks.update(pick or {})
    out = [r for r in old.get("roofs", []) if r["id"] not in boxes]
    sheet = []
    for b in blds:
        if b["id"] not in picks:
            continue
        box = boxes[b["id"]][:4]
        crop = img.crop(box)
        edit = Image.open(folder / picks[b["id"]]).convert("RGB").resize(crop.size, Image.LANCZOS)
        sprite = roof_cut(b, crop, edit, box, ppsx, ppsy)
        name = f"roof_{_slug(b['id'])}.png"
        sprite.save(folder / name)
        a = np.asarray(sprite.getchannel("A"))
        ys, xs = np.nonzero(a > 8)
        out.append({"id": b["id"], "file": name, "x": box[0], "y": box[1], "w": crop.width, "h": crop.height,
                    "footprint": b["rect"], "roof": b.get("roof", "thatched"), "draw": picks[b["id"]],
                    "alpha_box": [int(box[0] + xs.min()), int(box[1] + ys.min()), int(box[0] + xs.max() + 1), int(box[1] + ys.max() + 1)]})
        ab = out[-1]["alpha_box"]   # the 512 px map cells (the ground's TV tiles) the roof's pixels touch
        out[-1]["cells"] = [f"{cx}_{cy}" for cy in range(ab[1] // 512, (ab[3] - 1) // 512 + 1)
                            for cx in range(ab[0] // 512, (ab[2] - 1) // 512 + 1)]
        on = crop.copy()
        on.paste(sprite, (0, 0), sprite)
        sheet.append((b["id"], crop, on))
    cost = round(sum(mapgen.PRICE[d.get("size", "1K")] for d in draws), 3)
    rec_path.write_text(json.dumps({"image": file, "pps": [ppsx, ppsy], "roofs": out, "draws": draws,
                                    "pick": picks, "cost_usd": cost}, indent=1))
    if sheet:   # contact sheet: crop | roof on it, two buildings a row, 300 px high each
        H = 300
        cells = []
        for bid, crop, on in sheet:
            k = H / crop.height
            a_, b_ = (im.resize((round(im.width * k), H), Image.LANCZOS) for im in (crop, on))
            c = Image.new("RGB", (a_.width + b_.width + 6, H + 22), (24, 24, 24))
            c.paste(a_, (0, 22)); c.paste(b_, (a_.width + 6, 22))
            ImageDraw.Draw(c).text((4, 4), bid, fill=(255, 255, 255))
            cells.append(c)
        W = max(c.width for c in cells)
        per = 2
        rows_ = -(-len(cells) // per)
        sh = Image.new("RGB", (W * per + 8 * (per - 1), rows_ * (H + 30)), (12, 12, 12))
        for i, c in enumerate(cells):
            sh.paste(c, ((i % per) * (W + 8), (i // per) * (H + 30)))
        sh.save(folder / "roofs-sheet.jpg", quality=86)
    print(rec_path, f"{len(out)} roofs, ${cost} for {len(draws)} roof draws")


def aspect_box(size, want):
    """Grows the box `want` (x0, y0, x1, y1, float px) to the nearest aspect the model offers, so its
    edit comes back without a stretch; shifted to stay on the picture. Returns ints + the aspect."""
    W, H = size
    x0, y0, x1, y1 = want
    w, h = x1 - x0, y1 - y0
    best = min(mapgen.ASPECTS, key=lambda a: abs(np.log(w / h * int(a.split(":")[1]) / int(a.split(":")[0]))))
    ra = int(best.split(":")[0]) / int(best.split(":")[1])
    if w / h < ra:
        x0, x1 = x0 - (h * ra - w) / 2, x1 + (h * ra - w) / 2
    else:
        y0, y1 = y0 - (w / ra - h) / 2, y1 + (w / ra - h) / 2
    dx = max(0, -x0) - max(0, x1 - W)
    dy = max(0, -y0) - max(0, y1 - H)
    return [round(x0 + dx), round(y0 + dy), round(x1 + dx), round(y1 + dy), best]


# ---------------------------------------------------------------- canopy


def inside(poly, x, y):
    """Ray-casting point-in-polygon."""
    c = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            c = not c
    return c


class Ground:
    """What the layout says about a point: in which zone, how far from water, roads, buildings.

    Zones and road distances are rasters (`pps` px per square, `M` squares past the map's edge),
    so a lookup costs the same on a 4 × 4 map as on one screen: summervale's plan throws ~400,000
    darts (the polygon and per-path tests took minutes there)."""

    M = 2   # squares the zone and road rasters reach past the map's edge (crowns are placed from −1.5)

    def __init__(self, spec, pps=8):
        from scipy.spatial import cKDTree
        self.spec, self.pps = spec, pps
        cols, rows = spec["grid"]
        water, _, _ = masks(spec, pps)
        self.water = np.asarray(water)[..., 3] > 127
        self.flow = np.asarray(water).astype(float) / 255
        self.to_water = ndi.distance_transform_edt(~self.water) / pps   # 0 in water
        self.in_water = ndi.distance_transform_edt(self.water) / pps    # 0 on land
        self.paths = [(catmull(p["points"], 0.2)[:, :2], p["width"] / 2) for p in spec.get("paths", [])]
        self.blocks = [b["rect"] for b in spec.get("buildings", []) + spec.get("props", []) + spec.get("bridges", [])]
        self._blocks = np.array(self.blocks, float).reshape(-1, 4)
        self.cols, self.rows = cols, rows
        M = self.M
        W, H = (cols + 2 * M) * pps, (rows + 2 * M) * pps
        # zone raster: index + 1 of the topmost zone (later zones lie over earlier ones), 0 = none
        zid = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(zid)
        for i, z in enumerate(spec.get("zones", [])):
            d.polygon([((x + M) * pps, (y + M) * pps) for x, y in z["poly"]], i + 1)
        self.zid = np.asarray(zid)
        # road raster: distance from the nearest road or path's edge (negative on it), pixel centres
        yy, xx = np.mgrid[0:H, 0:W]
        pts = np.c_[(xx.ravel() + 0.5) / pps - M, (yy.ravel() + 0.5) / pps - M]
        road = np.full(W * H, 99.0)
        for p, hw in self.paths:
            road = np.minimum(road, cKDTree(p).query(pts, distance_upper_bound=99)[0] - hw)
        self.road_d = road.reshape(H, W)

    def at(self, a, x, y):
        X = int(np.clip(x * self.pps, 0, a.shape[1] - 1))
        Y = int(np.clip(y * self.pps, 0, a.shape[0] - 1))
        return a[Y, X]

    def _m(self, a, x, y):
        """A raster with the M-square margin, read at (x, y) squares."""
        return self.at(a, x + self.M, y + self.M)

    def road(self, x, y):
        """Distance from the nearest road or path's edge (negative on it), to 1/pps square."""
        return float(self._m(self.road_d, x, y))

    def blocked(self, x, y, margin):
        b = self._blocks
        return bool(np.any((b[:, 0] - margin < x) & (x < b[:, 0] + b[:, 2] + margin)
                           & (b[:, 1] - margin < y) & (y < b[:, 1] + b[:, 3] + margin)))

    def zone(self, x, y):
        i = int(self._m(self.zid, x, y))
        return self.spec["zones"][i - 1] if i else None


# Crown diameters in squares per tier: a real canopy has a few big old crowns on top, younger
# ones under and between them, and small ones filling the last gaps — never one size.
TIERS = [("top", 5.2, 7.0, 0.72), ("mid", 3.4, 4.8, 0.55), ("fill", 2.2, 3.2, 0.42)]
BANK_TIER = ("bank", 2.8, 4.0, 0.5)   # alders along the water: smaller, a closed band


BANK_OPEN = 1.5    # out in the open the alders stand in a loose row: crowns this × their reach apart


def canopy_plan(spec, seed=5):
    """Where every tree of the forest zones stands and how big its crown is (squares):
    [{x, y, d, tier, species}], the trees first placed (biggest) on top. Trunks keep off roads,
    water and buildings; a crown may hang over the water by most of a square and a path's edge a little, as real
    trees do (less over a path: it must stay readable). Placed by dart throwing per tier — top crowns apart, lower ones overlapping them —
    then small crowns fill what is still open, so the canopy closes. Alders (`river.bank_trees`)
    line the whole river: a closed band in the forest, a loose row with gaps in the open.

    The darts scale with the map's area (one screen = 2,500 top / 5,000 per lower tier / 4,000
    shrub tries, the riverbend slice's density), and the spacing tests look only at the crowns in
    the neighbouring cells of a grid hash: summervale (16 screens, ~6,000 crowns) plans in seconds."""
    import random
    rng = random.Random(seed)
    g = Ground(spec)
    cols, rows = spec["grid"]
    scale = max(1.0, cols * rows / (SCREEN[0] * SCREEN[1]))
    bank_trees = (spec.get("river") or {}).get("bank_trees") or {}
    pick = lambda stand: rng.choices(list(stand), weights=list(stand.values()))[0] if stand else "oak"

    def site(x, y, d, bank):
        z = g.zone(x, y)
        forest = bool(z) and z["kind"] == "forest"
        if not forest and not (bank and (not z or z["kind"] in ("meadow", "field"))):
            return None
        r = d / 2
        if g.road(x, y) < 0.9 or g.road(x, y) - r < -0.4:
            return None
        tw = g.at(g.to_water, x, y)
        if tw < 0.6 or tw - r < -0.9 or g.blocked(x, y, 1.0):
            return None
        return z or {"kind": "open"}

    crowns = []
    C = 4.0                      # grid-hash cell, squares
    cells = {}                   # (i, j) → [crown index] (trees and shrubs)
    dmax = max(TIERS[0][2], BANK_TIER[2], max([t["d"] for t in spec.get("trees", [])] or [0]))

    def add(c):
        cells.setdefault((int(c["x"] // C), int(c["y"] // C)), []).append(len(crowns))
        crowns.append(c)

    def near(x, y, reach):
        n = int(math.ceil(reach / C))
        i0, j0 = int(x // C), int(y // C)
        for i in range(i0 - n, i0 + n + 1):
            for j in range(j0 - n, j0 + n + 1):
                for k in cells.get((i, j), ()):
                    yield crowns[k]

    def fits(x, y, d, k):
        return all(math.hypot(x - c["x"], y - c["y"]) > k * (d + c["d"]) / 2 for c in near(x, y, k * (d + dmax) / 2))

    for name, d0, d1, k in TIERS:
        for _ in range(round((5000 if name != "top" else 2500) * scale)):
            x, y = rng.uniform(-1.5, cols + 1.5), rng.uniform(-1.5, rows + 1.5)
            near_water = g.at(g.to_water, x, y) < 2.6 and bank_trees
            if near_water and name == "top":
                continue
            lo, hi, kk = (BANK_TIER[1], BANK_TIER[2], BANK_TIER[3]) if near_water else (d0, d1, k)
            d = rng.uniform(lo, hi)
            z = site(x, y, d, near_water)
            if z and z["kind"] != "forest":
                kk = BANK_OPEN   # alders out in the open: a loose row, the river stays in view
            if z and fits(x, y, d, kk):
                add({"x": round(x, 2), "y": round(y, 2), "d": round(d, 2),
                     "tier": "bank" if near_water else name,
                     "species": pick(bank_trees if near_water else z.get("stand"))})
    # shrubs step the wood down to the open ground: hazel and elder in the gaps the crowns
    # leave at the wood's edge, along paths and banks
    shrubs = spec.get("edge_shrubs") or {}
    for _ in range(round(4000 * scale) if shrubs else 0):
        x, y = rng.uniform(-0.5, cols + 0.5), rng.uniform(-0.5, rows + 0.5)
        if not any((g.zone(x + dx, y + dy) or {}).get("kind") == "forest" for dx, dy in ((0, 0), (0, -1.3), (0, 1.3), (1.3, 0), (-1.3, 0))):
            continue
        d = rng.uniform(1.4, 2.2)
        if g.road(x, y) < d / 2 - 0.2 or g.at(g.to_water, x, y) < 0.5 or g.blocked(x, y, 0.8):
            continue
        around = list(near(x, y, (d + dmax) / 2))
        if any(math.hypot(x - c["x"], y - c["y"]) < c["d"] / 2 + 0.15 for c in around if c["tier"] != "shrub"):
            continue   # under a crown: no light for a shrub
        if all(math.hypot(x - c["x"], y - c["y"]) > 0.8 * (d + c["d"]) / 2 for c in around if c["tier"] == "shrub"):
            add({"x": round(x, 2), "y": round(y, 2), "d": round(d, 2), "tier": "shrub", "species": pick(shrubs)})
    # single trees the layout names (an old lime on the meadow)
    for t in spec.get("trees", []):
        crowns.append({"x": t["x"], "y": t["y"], "d": t["d"], "tier": "lone", "species": t["species"]})
    crowns.sort(key=lambda c: c["d"])   # small first: the biggest are drawn last, on top
    return crowns


def crown_outline(c, k, n=48):
    """A crown's outline in picture px (k px per square): a disc with a few slow lobes, so
    no two crowns are the same circle; the lobes are fixed by where the tree stands."""
    import random
    rng = random.Random(int(c["x"] * 1000 + c["y"] * 7))
    waves = [(f, rng.uniform(0, 6.283), rng.uniform(0.02, 0.045)) for f in (3, 5, 7)]
    r0 = c["d"] / 2 * k
    return [(c["x"] * k + math.cos(t) * r0 * (1 + sum(a * math.sin(f * t + ph) for f, ph, a in waves)),
             c["y"] * k + math.sin(t) * r0 * (1 + sum(a * math.sin(f * t + ph) for f, ph, a in waves)))
            for t in (2 * math.pi * i / n for i in range(n))]


def canopy_mask(crowns, size, cols, rows, grow=0.0):
    """Soft union of the crown discs (radius + `grow` squares) at the size of a picture: L image."""
    W, H = size
    k = W / cols
    img = Image.new("L", (W * 2, H * 2), 0)
    d = ImageDraw.Draw(img)
    for c in crowns:
        d.polygon(crown_outline({**c, "d": c["d"] + 2 * grow}, k * 2), 255)
    return img.resize(size, Image.BOX)


CANOPY_GREEN = (58, 104, 44)
SHRUB_GREEN = (88, 128, 52)   # shrubs a lighter green: the model paints them as their own low layer


def canopy_guide(ground, crowns, cols, rows):
    """The ground painting with every crown laid on as a flat green shape (a lobed disc; bigger
    crowns over smaller, each throwing a soft shadow down-right onto what lies under it; shrubs
    lighter): the edit pass paints each shape as that tree's crown.

    Each crown is drawn in its own small box (its disc + shadow + blur room), so the cost grows
    with the crowns, not crowns × picture: summervale's ~1,200 crowns on the 7616 × 4256 ground
    in ~10 s (one full-picture blur and composite per crown would take hours)."""
    img = ground.convert("RGB").copy()
    W, H = img.size
    k = W / cols
    import random
    rng = random.Random(3)
    dark = (14, 26, 12)
    for c in crowns:
        poly = crown_outline(c, k)
        pad = int(c["d"] * k * 0.6 + 0.25 * k * 3 + 4)
        bx0, by0 = max(0, int(c["x"] * k) - pad), max(0, int(c["y"] * k) - pad)
        bx1, by1 = min(W, int(c["x"] * k) + pad), min(H, int(c["y"] * k) + pad)
        if bx1 <= bx0 or by1 <= by0:
            continue
        box = img.crop((bx0, by0, bx1, by1))
        sh = Image.new("L", box.size, 0)
        ImageDraw.Draw(sh).polygon([(x + 0.18 * k - bx0, y + 0.25 * k - by0) for x, y in poly], 120)
        sh = sh.filter(ImageFilter.GaussianBlur(0.25 * k))
        box = Image.composite(Image.new("RGB", box.size, dark), box, sh)
        v = rng.uniform(0.9, 1.1)
        base = SHRUB_GREEN if c["tier"] == "shrub" else CANOPY_GREEN
        ImageDraw.Draw(box).polygon([(x - bx0, y - by0) for x, y in poly], tuple(int(min(255, ch * v)) for ch in base))
        img.paste(box, (bx0, by0))
    return img


def canopy(spec, run, file=None, n=1, size="1K", tag=""):
    """The forest canopy as one painting: an edit pass on the ground painting turns the flat
    crown discs of `canopy_plan` into a closed summer canopy (same style and sun as the map);
    cut out by our crown mask (+ a leafy fringe, only where the edit changed something) →
    canopy[_tag]_<i>.png with alpha at the ground's size, and canopy.json (the trees)."""
    meta = json.loads((run / "meta.json").read_text())
    file = file or meta["results"][0]["file"]
    ground = Image.open(run / file).convert("RGB")
    cols, rows = spec["grid"]
    crowns = canopy_plan(spec)
    guide = canopy_guide(ground, crowns, cols, rows)
    guide.save(run / "canopy_guide.jpg", quality=92)
    stands = {}
    for c in crowns:
        stands.setdefault(c["species"], 0)
        stands[c["species"]] += 1
    trees = sorted(k for k in stands if k not in (spec.get("edge_shrubs") or {}))
    shrubs = sorted(k for k in stands if k in (spec.get("edge_shrubs") or {}))
    prompt = (HERE / "prompts" / "edit-canopy.txt").read_text().format(
        setting=spec["setting"], species=", ".join(trees), shrubs=" and ".join(shrubs) or "hazel")
    (run / "canopy_prompt.txt").write_text(prompt)
    keep = canopy_mask(crowns, ground.size, cols, rows, grow=0.45)
    core = canopy_mask(crowns, ground.size, cols, rows, grow=-0.1)
    from concurrent.futures import ThreadPoolExecutor

    def one(i):
        t0 = time.time()
        data, mime, usage = mapgen.generate(prompt, [guide], mapgen.pick_aspect(spec), size, None)
        raw = run / f"canopy{'_' + tag if tag else ''}_{i + 1}_raw{'.png' if 'png' in mime else '.jpg'}"
        raw.write_bytes(data)
        edit = Image.open(raw).convert("RGB").resize(ground.size, Image.LANCZOS)
        # keep what the edit made of the discs, plus a leafy fringe where it changed the ground
        diff = np.abs(np.asarray(edit, float) - np.asarray(ground, float)).mean(-1)
        changed = ndi.gaussian_filter((diff > 26).astype(float), 1.5)
        a = np.maximum(np.asarray(core, float) / 255, np.clip(changed * 1.6, 0, 1) * np.asarray(keep, float) / 255)
        a = ndi.gaussian_filter(a, 0.8)
        sprite = edit.convert("RGBA")
        sprite.putalpha(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)))
        out = raw.name.replace("_raw", "").rsplit(".", 1)[0] + ".png"
        sprite.save(run / out)
        print(f"{run / out}  {time.time() - t0:.0f}s")
        return {"file": out, "raw": raw.name, "seconds": round(time.time() - t0, 1), "usage": usage}

    with ThreadPoolExecutor(min(n, 4)) as ex:
        results = list(ex.map(one, range(n)))
    (run / f"canopy{'_' + tag if tag else ''}.json").write_text(json.dumps({
        "ground": file, "size": size, "model": mapgen.MODEL, "cost_usd": round(mapgen.PRICE[size] * n, 3),
        "crowns": crowns, "results": results}, indent=1))
    print(run / f"canopy{'_' + tag if tag else ''}.json", len(crowns), "crowns", stands)


# ---------------------------------------------------------------- big maps: the canopy per screen


CANOPY_TILE = """
This is one part of a bigger map, painted in parts. The frame cuts through the forest: a crown
that crosses a frame edge is cut off by that edge and continues beyond it. Paint only the part
inside the frame, exactly where its shape lies; never move a crown inward or complete it inside
the frame."""


def crown_box_mask(crowns, box_sq, pps, grow=0.0, ss=2):
    """Union of the crown outlines (radius + `grow` squares) inside a box (squares) at `pps`:
    float array 0–1, drawn at `ss`× and box-filtered (the big-map version of canopy_mask)."""
    x0, y0, x1, y1 = box_sq
    W, H = round((x1 - x0) * pps), round((y1 - y0) * pps)
    img = Image.new("L", (W * ss, H * ss), 0)
    d = ImageDraw.Draw(img)
    k = pps * ss
    for c in crowns:
        r = c["d"] / 2 + grow + 0.2
        if c["x"] + r < x0 or c["x"] - r > x1 or c["y"] + r < y0 or c["y"] - r > y1:
            continue
        d.polygon([(x - x0 * k, y - y0 * k) for x, y in crown_outline({**c, "d": c["d"] + 2 * grow}, k)], 255)
    return np.asarray(img.resize((W, H), Image.BOX), np.float32) / 255


def _reaches(crowns, rect, pad=0.0):
    """The crowns whose disc (+ `pad`) reaches into a rect (squares)."""
    x0, y0, x1, y1 = rect
    return [c for c in crowns if c["x"] + c["d"] / 2 + pad > x0 and c["x"] - c["d"] / 2 - pad < x1
            and c["y"] + c["d"] / 2 + pad > y0 and c["y"] - c["d"] / 2 - pad < y1]


def canopy_tiles(spec, run, ground="ground.png", size="2K", n=1, only=None, tag="", pps=56):
    """The forest canopy of a big map, one edit per TV screen: the plan's crowns laid on the
    assembled ground (`canopy_guide`, at `pps`), cut by the ground's crop boxes (`crop_boxes`:
    screen + ≥ 1.7 squares, no building cut), each crop painted as a closed canopy → canopy/tiles/
    <r..c..>[_tag]_<i>.jpg. Screens no crown reaches are skipped. canopy/canopy.json keeps the
    plan, every draw with its box, and the pick per tile (the newest; `canopy-assemble --pick`
    overrides)."""
    folder = run / "canopy"
    (folder / "tiles").mkdir(parents=True, exist_ok=True)
    rec_path = folder / "canopy.json"
    rec = json.loads(rec_path.read_text()) if rec_path.exists() else {"ground": ground, "pps": pps, "draws": [], "pick": {}}
    cols, rows = spec["grid"]
    t0 = time.time()
    crowns = rec.get("crowns") or canopy_plan(spec)
    rec["crowns"] = crowns
    gimg = Image.open(run / ground).convert("RGB")
    if gimg.width != cols * pps:
        gimg = gimg.resize((cols * pps, rows * pps), Image.LANCZOS)
    guide_path = folder / "canopy_guide.png"
    if guide_path.exists():
        guide = Image.open(guide_path).convert("RGB")
    else:
        guide = canopy_guide(gimg, crowns, cols, rows)
        guide.save(guide_path)
        guide.resize((cols * 15, rows * 15), Image.LANCZOS).save(folder / "canopy_guide-sheet.jpg", quality=88)
    print(f"plan {len(crowns)} crowns + guide {time.time() - t0:.0f}s", flush=True)
    shrub_names = spec.get("edge_shrubs") or {}
    jobs = []
    for b in crop_boxes(spec):
        t = "r{}c{}".format(*b["screen"])
        if only and t not in only:
            continue
        mine = _reaches(crowns, b["screen_sq"], 0.5)
        if not mine:
            continue
        x0, y0, x1, y1 = b["box_sq"]
        g = guide.crop((round(x0 * pps), round(y0 * pps), round(x1 * pps), round(y1 * pps)))
        inbox = _reaches(crowns, b["box_sq"])
        trees = sorted({c["species"] for c in inbox if c["species"] not in shrub_names})
        shrubs = sorted({c["species"] for c in inbox if c["species"] in shrub_names})
        prompt = (HERE / "prompts" / "edit-canopy.txt").read_text().format(
            setting=spec["setting"], species=", ".join(trees) or "beech", shrubs=" and ".join(shrubs) or "hazel") + CANOPY_TILE
        jobs += [(t, b, g, prompt, i) for i in range(n)]
    print(len(jobs), "draws:", " ".join(sorted({j[0] for j in jobs})), flush=True)
    from concurrent.futures import ThreadPoolExecutor

    def one(job):
        t, b, g, prompt, i = job
        t1 = time.time()
        data, mime, usage = mapgen.generate(prompt, [g], b["aspect"], size, None)
        k = sum(1 for d in rec["draws"] if d["tile"] == t) + i + 1
        path = folder / "tiles" / f"{t}{'_' + tag if tag else ''}_{k}{'.png' if 'png' in mime else '.jpg'}"
        path.write_bytes(data)
        print(f"{path.name}  {time.time() - t1:.0f}s", flush=True)
        return {"tile": t, "file": f"tiles/{path.name}", "size": size, "box_sq": b["box_sq"],
                "screen_sq": b["screen_sq"], "seconds": round(time.time() - t1, 1), "usage": usage}

    with ThreadPoolExecutor(4) as ex:
        done = list(ex.map(one, jobs))
    rec["draws"] += done
    for d in done:
        rec["pick"][d["tile"]] = d["file"]
    rec["cost_usd"] = round(sum(mapgen.PRICE[d["size"]] for d in rec["draws"]), 3)
    rec_path.write_text(json.dumps(rec, indent=1))
    print(rec_path, f"${rec['cost_usd']} for {len(rec['draws'])} canopy draws")


def canopy_assemble(spec, run, pick=None, soft=1.5, sharp=0.4, only=None):
    """The picked canopy tiles joined into one layer over the whole map at the ground's px per
    square → canopy/canopy.png (RGBA) + canopy.webp + canopy-sheet.jpg (over the ground).

    Per tile: the edit resized onto its box; alpha = our crown shapes (shrunk 0.1 square) plus
    a leafy fringe up to 0.45 squares out, only where the edit changed the ground (as `canopy`).
    Joined like the ground (`assemble`): premultiplied colour + alpha split into a blurred and a
    detail band, crossfaded over ±`soft` / ±`sharp` squares round each screen border; divided by
    the weights present, so a skipped screen (no crowns) takes its neighbours' overhang whole.
    `only` = a list of tiles: assemble just those (drafts)."""
    folder = run / "canopy"
    rec = json.loads((folder / "canopy.json").read_text())
    picks = dict(rec["pick"], **(pick or {}))
    pps, crowns = rec["pps"], rec["crowns"]
    cols, rows = spec["grid"]
    W, H = cols * pps, rows * pps
    ground = Image.open(run / rec["ground"]).convert("RGB")
    if ground.width != W:
        ground = ground.resize((W, H), Image.LANCZOS)
    G = np.asarray(ground)
    nr, nc = math.ceil(rows / SCREEN[1]), math.ceil(cols / SCREEN[0])
    acc = np.zeros((H, W, 4), np.float32)
    wsum = np.zeros((H, W), np.float32)
    sig = 0.75 * pps
    boxes = {d["file"]: d for d in rec["draws"]}
    painted = {t for t in picks if not only or t in only}
    t0 = time.time()
    for b in crop_boxes(spec):
        r, c = b["screen"]
        t = f"r{r}c{c}"
        if t not in picks or (only and t not in only):
            continue
        d = boxes[picks[t]]
        x0, y0, x1, y1 = d["box_sq"]
        X0, Y0 = round(x0 * pps), round(y0 * pps)
        tw, th = round(x1 * pps) - X0, round(y1 * pps) - Y0
        edit = np.asarray(Image.open(folder / picks[t]).convert("RGB").resize((tw, th), Image.LANCZOS), np.float32)
        diff = np.abs(edit - G[Y0:Y0 + th, X0:X0 + tw]).mean(-1)
        changed = ndi.gaussian_filter((diff > 26).astype(np.float32), 1.5)
        keep = crown_box_mask(crowns, (x0, y0, x1, y1), pps, 0.45)[:th, :tw]
        core = crown_box_mask(crowns, (x0, y0, x1, y1), pps, -0.1)[:th, :tw]
        a = ndi.gaussian_filter(np.maximum(core, np.clip(changed * 1.6, 0, 1) * keep), 0.8)
        tile = np.concatenate([edit * a[..., None], a[..., None] * 255], -1)   # premultiplied
        low = _blur(tile, sig)
        xs = (X0 + np.arange(tw) + 0.5) / pps
        ys = (Y0 + np.arange(th) + 0.5) / pps
        sx0, sy0, sx1, sy1 = b["screen_sq"]
        for h, part in ((soft, low), (sharp, tile - low)):
            wx = np.ones(tw, np.float32)
            wy = np.ones(th, np.float32)
            if c > 0 and f"r{r}c{c - 1}" in painted:   # a skipped neighbour: this tile reaches on whole
                wx *= _ramp(xs, sx0 - h, sx0 + h)
            if c < nc - 1 and f"r{r}c{c + 1}" in painted:
                wx *= 1 - _ramp(xs, sx1 - h, sx1 + h)
            if r > 0 and f"r{r - 1}c{c}" in painted:
                wy *= _ramp(ys, sy0 - h, sy0 + h)
            if r < nr - 1 and f"r{r + 1}c{c}" in painted:
                wy *= 1 - _ramp(ys, sy1 - h, sy1 + h)
            w = wy[:, None] * wx[None, :]
            acc[Y0:Y0 + th, X0:X0 + tw] += part * w[..., None]
            if h == soft:
                wsum[Y0:Y0 + th, X0:X0 + tw] += w
        print(t, picks[t], f"{time.time() - t0:.0f}s", flush=True)
    del G
    # the weights add up to 1 wherever a tile lies (a skipped neighbour's border isn't ramped);
    # dividing by them only guards the corners where a diagonal neighbour is missing
    acc /= np.maximum(wsum, 1e-3)[..., None]
    alpha = np.clip(acc[..., 3], 0, 255)
    rgb = np.clip(acc[..., :3] / np.maximum(alpha, 1)[..., None] * 255, 0, 255)
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    del acc, rgb
    layer = Image.fromarray(out, "RGBA")
    layer.save(folder / "canopy.png")
    layer.save(folder / "canopy.webp", quality=90, alpha_quality=100, method=4)
    sp = 15
    sheet = ground.resize((cols * sp, rows * sp), Image.LANCZOS).convert("RGBA")
    sheet.alpha_composite(layer.resize(sheet.size, Image.LANCZOS))
    sheet = sheet.convert("RGB")
    dr = ImageDraw.Draw(sheet)
    for r, c, (a0, b0, a1, b1) in screens(spec):
        dr.rectangle([a0 * sp, b0 * sp, a1 * sp - 1, b1 * sp - 1], outline=(255, 255, 255), width=1)
        dr.text((a0 * sp + 6, b0 * sp + 4), f"r{r}c{c}", fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0), font_size=20)
    sheet.save(folder / "canopy-sheet.jpg", quality=88)
    rec["assembled"] = {"picks": picks, "soft": soft, "sharp": sharp, "size": [W, H]}
    (folder / "canopy.json").write_text(json.dumps(rec, indent=1))
    print(folder / "canopy.png", layer.size, folder / "canopy-sheet.jpg", f"{time.time() - t0:.0f}s")


# ---------------------------------------------------------------- big maps: tiled painting


TILE_PROMPT = """
This is one part of a bigger map, painted in tiles. The SECOND image is this same part already
painted, at low detail, as a crop of the whole map's painting. Keep its colours, light, textures,
style and the look of every area exactly, so this part joins its neighbours without a seam
(especially along all four edges of the frame), and paint it at full detail. Where the second
image and the guide disagree, the guide's positions and shapes win.
The frame cuts through the map: a building, wall, field, jetty or anything else that crosses a
frame edge is cut off by that edge. Paint only the part inside the frame, exactly where the guide
has it; never move it inward, shrink it or complete it inside the frame."""


def master_crop(master, spec, box_sq):
    """The master painting's crop for a tile box (squares); the master is mapped onto the whole grid."""
    cols, rows = spec["grid"]
    sx, sy = master.width / cols, master.height / rows
    x0, y0, x1, y1 = box_sq
    return master.crop((round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy)))


def tiles(spec, run, master=None, size="2K", n=1, only=None, tag=""):
    """The tile pass of a big map: per TV screen one edit call (guide crop + the master's crop) that
    paints the screen's crop at full detail in the master's look → tiles/<r..c..>[_tag]_<i>.<ext>.
    tiles.json keeps every draw and the pick per tile (the newest draw; `assemble --pick` overrides)."""
    meta = json.loads((run / "meta.json").read_text())
    master = master or meta["results"][0]["file"]
    mname, master = master, Image.open(run / master).convert("RGB")
    folder = OUT / spec["name"]
    guide = Image.open(folder / "guide.png")
    (run / "tiles").mkdir(exist_ok=True)
    rec_path = run / "tiles.json"
    rec = json.loads(rec_path.read_text()) if rec_path.exists() else {"master": mname, "draws": [], "pick": {}}
    jobs = []
    for b in crop_boxes(spec):
        t = "r{}c{}".format(*b["screen"])
        if only and t not in only:
            continue
        g = guide.crop(b["box_px"])
        m = master_crop(master, spec, b["box_sq"])
        prompt = build_prompt(spec, b["box_sq"]) + "\n" + TILE_PROMPT
        jobs += [(t, b, g, m, prompt, i) for i in range(n)]
    from concurrent.futures import ThreadPoolExecutor

    def one(job):
        t, b, g, m, prompt, i = job
        t0 = time.time()
        data, mime, usage = mapgen.generate(prompt, [g, m], b["aspect"], size, None)
        k = sum(1 for d in rec["draws"] if d["tile"] == t) + i + 1
        path = run / "tiles" / f"{t}{'_' + tag if tag else ''}_{k}{'.png' if 'png' in mime else '.jpg'}"
        path.write_bytes(data)
        im = Image.open(path)
        print(f"{path.name}  {im.width}×{im.height}  {time.time() - t0:.0f}s", flush=True)
        return {"tile": t, "file": f"tiles/{path.name}", "size": size, "box_sq": b["box_sq"],
                "seconds": round(time.time() - t0, 1), "usage": usage}

    with ThreadPoolExecutor(4) as ex:
        done = list(ex.map(one, jobs))
    rec["draws"] += done
    for d in done:
        rec["pick"][d["tile"]] = d["file"]
    rec["cost_usd"] = round(sum(mapgen.PRICE[d["size"]] for d in rec["draws"]), 3)
    rec_path.write_text(json.dumps(rec, indent=1))
    print(rec_path, f"${rec['cost_usd']} for {len(rec['draws'])} tile draws")


def _ramp(x, a, b):
    """0 below a, 1 above b, linear between (a < b)."""
    return np.clip((x - a) / (b - a), 0, 1).astype(np.float32)


def _blur(a, sigma):
    """Gaussian blur of an H × W × 3 float32 array, σ = `sigma` px. Wide blurs run on a copy shrunk
    by f = σ / 8 and are scaled back up (bicubic): at full size σ = 224 px (match 4 × 56 px/sq)
    took over 6 minutes on the whole ground, this way ~1 s; the error is far below one level."""
    f = int(sigma // 8)
    if f < 2:
        return ndi.gaussian_filter(a, (sigma, sigma, 0))
    h, w = a.shape[:2]
    sw, sh = max(1, round(w / f)), max(1, round(h / f))
    out = np.empty_like(a)
    for ch in range(a.shape[2]):
        small = np.asarray(Image.fromarray(a[..., ch], "F").resize((sw, sh), Image.BOX), np.float32)
        small = ndi.gaussian_filter(small, sigma * sw / w, mode="nearest")
        out[..., ch] = np.asarray(Image.fromarray(small, "F").resize((w, h), Image.BICUBIC), np.float32)
    return out


def assemble(spec, run, pps=56, pick=None, match=4.0, soft=1.5, sharp=0.4):
    """The tiles joined into one ground at `pps` px per square (ground.png + .webp, ground-sheet.jpg
    with the screens drawn on, seams.jpg = every seam's middle at full size).

    Each tile is resized onto its box; `match` (squares, 0 = off) pulls its low frequencies onto the
    master's (blur(master) − blur(tile)), so every tile shares the master's colour and brightness.
    Seams are two-band: the blurred part crossfades over ±`soft` squares round the screen border, the
    detail over ±`sharp` (no ghosting of shifted detail); the weights are complementary ramps, so they
    add up to 1 everywhere (corners too)."""
    rec = json.loads((run / "tiles.json").read_text())
    picks = dict(rec["pick"], **(pick or {}))
    master = Image.open(run / rec["master"]).convert("RGB")
    cols, rows = spec["grid"]
    W, H = cols * pps, rows * pps
    nr, nc = math.ceil(rows / SCREEN[1]), math.ceil(cols / SCREEN[0])
    acc = np.zeros((H, W, 3), np.float32)
    mup = None
    if match:
        mup = np.asarray(master.resize((W, H), Image.BICUBIC), np.float32)
        mup = _blur(mup, match * pps)
    sig = 0.75 * pps   # the band split
    drawn = {d["file"]: d["box_sq"] for d in rec["draws"]}   # each draw's own box (crop_boxes changed once)
    for b in crop_boxes(spec):
        r, c = b["screen"]
        t = f"r{r}c{c}"
        x0, y0, x1, y1 = drawn.get(picks[t], b["box_sq"])
        X0, Y0 = round(x0 * pps), round(y0 * pps)
        tw, th = round(x1 * pps) - X0, round(y1 * pps) - Y0
        tile = np.asarray(Image.open(run / picks[t]).convert("RGB").resize((tw, th), Image.LANCZOS), np.float32)
        if match:
            tile = tile + mup[Y0:Y0 + th, X0:X0 + tw] - _blur(tile, match * pps)
        low = _blur(tile, sig)
        xs = (X0 + np.arange(tw) + 0.5) / pps
        ys = (Y0 + np.arange(th) + 0.5) / pps
        sx0, sy0, sx1, sy1 = b["screen_sq"]
        out = 0
        for h, part in ((soft, low), (sharp, tile - low)):
            wx = np.ones(tw, np.float32)
            wy = np.ones(th, np.float32)
            if c > 0:
                wx *= _ramp(xs, sx0 - h, sx0 + h)
            if c < nc - 1:
                wx *= 1 - _ramp(xs, sx1 - h, sx1 + h)
            if r > 0:
                wy *= _ramp(ys, sy0 - h, sy0 + h)
            if r < nr - 1:
                wy *= 1 - _ramp(ys, sy1 - h, sy1 + h)
            out = out + part * (wy[:, None] * wx[None, :])[..., None]
        acc[Y0:Y0 + th, X0:X0 + tw] += out
        print(t, picks[t], flush=True)
    ground = Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8))
    del acc, mup
    ground.save(run / "ground.png")
    ground.save(run / "ground.webp", quality=90, method=4)
    # sheet: 15 px per square, the screens drawn on
    sp = 15
    sheet = ground.resize((cols * sp, rows * sp), Image.LANCZOS)
    d = ImageDraw.Draw(sheet)
    for r, c, (a0, b0, a1, b1) in screens(spec):
        d.rectangle([a0 * sp, b0 * sp, a1 * sp - 1, b1 * sp - 1], outline=(255, 255, 255), width=1)
        d.text((a0 * sp + 6, b0 * sp + 4), f"r{r}c{c}", fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0), font_size=20)
    sheet.save(run / "ground-sheet.jpg", quality=88)
    # seams: the middle of every border between two screens, 6 × 6 squares at full size
    seams, half = [], 3 * pps
    for r, c, (a0, b0, a1, b1) in screens(spec):
        if c < nc - 1:
            seams.append((a1 * pps, (b0 + b1) / 2 * pps, f"r{r}c{c}|c{c + 1}"))
        if r < nr - 1:
            seams.append(((a0 + a1) / 2 * pps, b1 * pps, f"r{r}c{c}/r{r + 1}"))
    per = 6
    sz = 2 * half
    grid = Image.new("RGB", (per * sz, math.ceil(len(seams) / per) * sz))
    gd = ImageDraw.Draw(grid)
    for i, (cx, cy, name) in enumerate(seams):
        cx, cy = round(cx), round(cy)
        grid.paste(ground.crop((cx - half, cy - half, cx + half, cy + half)), ((i % per) * sz, (i // per) * sz))
        gd.text(((i % per) * sz + 4, (i // per) * sz + 2), name, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0), font_size=16)
    grid = grid.resize((grid.width // 2, grid.height // 2), Image.LANCZOS)   # half size: a look at all 24 at once
    grid.save(run / "seams.jpg", quality=90)
    (run / "ground.json").write_text(json.dumps({"pps": pps, "size": [W, H], "picks": picks, "match": match,
                                                 "soft": soft, "sharp": sharp}, indent=1))
    print(run / "ground.png", ground.size, run / "ground-sheet.jpg", run / "seams.jpg")


# ---------------------------------------------------------------- CLI


# --albedo: paint the ground UNLIT, for a table that adds its own sun (docs/ai-art.md "Light lab")
ALBEDO_LIGHT = """Lighting: this painting is an ALBEDO texture for a game engine that adds its own sunlight,
shadows and time of day later. Paint everything under flat, even, shadowless overcast light from
directly above: no light direction, no cast shadows (not beside walls, rocks, the bridge, furniture
or anything else), no bright side and no shadow side on anything; only small crevices a little
darker, equally all round. Keep the colours rich and the textures crisp, contrast high enough to
read on a TV. Keep open ground calm and readable: miniatures stand on this map."""


def albedo_prompt(prompt):
    """The paint prompt with its lighting paragraph swapped for ALBEDO_LIGHT (and no "warm sunlight" style)."""
    i = prompt.index("Lighting:")
    j = prompt.index("\n\n", i)
    return (prompt[:i] + ALBEDO_LIGHT + prompt[j:]).replace("warm sunlight, ", "")


def paint(spec, size, n, tag, why, thinking, albedo=False):
    name = spec["name"]
    run = OUT / name / (time.strftime("%y%m%d-%H%M%S") + (f"-{tag}" if tag else ""))
    run.mkdir(parents=True)
    guide = write_layers(spec, run)
    prompt = build_prompt(spec, compact=len(screens(spec)) > 1)   # a big map's master: the short prompt
    if albedo:
        prompt = albedo_prompt(prompt)
    (run / "prompt.txt").write_text(prompt)
    aspect = mapgen.pick_aspect(spec)
    results = []
    from concurrent.futures import ThreadPoolExecutor

    def one(i):
        t0 = time.time()
        data, mime, usage = mapgen.generate(prompt, [guide], aspect, size, thinking)
        path = run / f"out_{i + 1}{'.png' if 'png' in mime else '.jpg'}"
        path.write_bytes(data)
        im = Image.open(path)
        print(f"{path}  {im.width}×{im.height}  {time.time() - t0:.0f}s")
        return {"file": path.name, "size": im.size, "seconds": round(time.time() - t0, 1), "usage": usage}

    with ThreadPoolExecutor(min(n, 4)) as ex:
        results = list(ex.map(one, range(n)))
    (run / "meta.json").write_text(json.dumps({
        "layout": spec["path"], "why": why, "size": size, "aspect": aspect, "thinking": thinking,
        "model": mapgen.MODEL, "cost_usd": round(mapgen.PRICE[size] * n, 3), "results": results}, indent=1))
    print(run)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("guide"); g.add_argument("spec")
    k = sub.add_parser("crops", help="cut the guide into one crop per TV screen (big maps; `guide` does it too)")
    k.add_argument("spec"); k.add_argument("--margin", type=float, default=CROP_MARGIN)
    p = sub.add_parser("paint"); p.add_argument("spec")
    p.add_argument("--size", default="2K", choices=mapgen.PRICE); p.add_argument("--n", type=int, default=1)
    p.add_argument("--tag", default=""); p.add_argument("--why", default="")
    p.add_argument("--thinking", choices=["minimal", "medium", "high"])
    p.add_argument("--albedo", action="store_true", help="paint it unlit (flat light) for a table that lights it")
    r = sub.add_parser("roof"); r.add_argument("run"); r.add_argument("image", nargs="?")
    r.add_argument("--n", type=int, default=1, help="new draws per building (0 = re-cut the picks)")
    r.add_argument("--out", help="folder in the run for raw edits, sprites, roofs.json (default: the run)")
    r.add_argument("--only", help="comma list of building ids"); r.add_argument("--size", default="1K", choices=mapgen.PRICE)
    r.add_argument("--pick", help="override picks: id=raw/roof_<id>_2.jpg;… (';'-separated, ids have commas never)")
    c = sub.add_parser("canopy"); c.add_argument("run"); c.add_argument("image", nargs="?")
    c.add_argument("--n", type=int, default=1); c.add_argument("--size", default="1K", choices=mapgen.PRICE)
    c.add_argument("--tag", default=""); c.add_argument("--plan", action="store_true", help="only write the guide, no call")
    t = sub.add_parser("tiles", help="big maps: paint each screen's crop from the master (run of `paint`)")
    t.add_argument("run"); t.add_argument("--master", help="master file in the run (default: its first draw)")
    t.add_argument("--size", default="2K", choices=mapgen.PRICE); t.add_argument("--n", type=int, default=1)
    t.add_argument("--only", help="comma list of tiles, e.g. r1c2,r3c3 (a redo)"); t.add_argument("--tag", default="")
    s = sub.add_parser("assemble", help="big maps: join the picked tiles into ground.png (+ sheet, seams)")
    s.add_argument("run"); s.add_argument("--pps", type=int, default=56)
    s.add_argument("--pick", help="override picks: r1c2=tiles/r1c2_2.jpg,…")
    s.add_argument("--match", type=float, default=4.0, help="squares; pull each tile's low frequencies onto the master (0 = off)")
    ct = sub.add_parser("canopy-tiles", help="big maps: paint the forest canopy per screen on the assembled ground")
    ct.add_argument("run"); ct.add_argument("--ground", default="ground.png")
    ct.add_argument("--size", default="2K", choices=mapgen.PRICE); ct.add_argument("--n", type=int, default=1)
    ct.add_argument("--only", help="comma list of tiles, e.g. r1c2,r1c3"); ct.add_argument("--tag", default="")
    ca = sub.add_parser("canopy-assemble", help="big maps: join the picked canopy tiles into canopy/canopy.png")
    ca.add_argument("run"); ca.add_argument("--pick", help="override picks: r1c2=tiles/r1c2_2.jpg,…")
    ca.add_argument("--only", help="assemble only these tiles (drafts)")
    a = ap.parse_args()
    if a.cmd in ("canopy-tiles", "canopy-assemble"):
        run = Path(a.run).resolve()
        spec = mapgen.load_spec(json.loads((run / "meta.json").read_text())["layout"])
        only = a.only.split(",") if a.only else None
        if a.cmd == "canopy-tiles":
            canopy_tiles(spec, run, a.ground, a.size, a.n, only, a.tag)
        else:
            canopy_assemble(spec, run, dict(kv.split("=", 1) for kv in a.pick.split(",")) if a.pick else None, only=only)
        return
    if a.cmd in ("tiles", "assemble"):
        run = Path(a.run).resolve()
        spec = mapgen.load_spec(json.loads((run / "meta.json").read_text())["layout"])
        if a.cmd == "tiles":
            tiles(spec, run, a.master, a.size, a.n, a.only.split(",") if a.only else None, a.tag)
        else:
            pick = dict(kv.split("=", 1) for kv in a.pick.split(",")) if a.pick else None
            assemble(spec, run, a.pps, pick, a.match)
        return
    if a.cmd == "canopy":
        run = Path(a.run).resolve()
        spec = mapgen.load_spec(json.loads((run / "meta.json").read_text())["layout"])
        if a.plan:
            ground = Image.open(run / (a.image or "out_1.jpg"))
            crowns = canopy_plan(spec)
            canopy_guide(ground, crowns, *spec["grid"]).save(run / "canopy_guide.jpg", quality=92)
            print(run / "canopy_guide.jpg", len(crowns), "crowns")
        else:
            canopy(spec, run, a.image, a.n, a.size, a.tag)
        return
    if a.cmd == "roof":
        run = Path(a.run).resolve()
        spec = mapgen.load_spec(json.loads((run / "meta.json").read_text())["layout"])
        folder = run / a.out if a.out else None
        pick = dict(kv.split("=", 1) for kv in a.pick.split(";")) if a.pick else None
        roof(spec, run, a.image, a.n, folder, a.only.split(",") if a.only else None, pick, a.size)
        return
    spec = mapgen.load_spec(a.spec)
    if a.cmd == "guide":
        folder = OUT / spec["name"]
        folder.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        guide = write_layers(spec, folder)
        (folder / "prompt.txt").write_text(build_prompt(spec))
        print(folder / "guide.png", guide.size, mapgen.pick_aspect(spec), f"{time.time() - t0:.0f}s")
        if len(screens(spec)) > 1:   # a big map: the per-screen crops and a contact sheet
            write_crops(spec, folder, guide)
            write_sheet(spec, folder, guide)
            print(folder / "crops" / "crops.json", folder / "guide-sheet.jpg")
    elif a.cmd == "crops":
        folder = OUT / spec["name"]
        for b in write_crops(spec, folder, margin=a.margin):
            print("r{}c{}".format(*b["screen"]), b["box_sq"], b["aspect"])
    elif a.cmd == "paint":
        paint(spec, a.size, a.n, a.tag, a.why, a.thinking, a.albedo)


if __name__ == "__main__":
    main()
