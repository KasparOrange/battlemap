#!/usr/bin/env python3
"""Outdoor maps: layout → guide → Nano Banana → the ground layer + the masks battlemap animates.

The outdoor counterpart of mapgen.py (design: docs/ai-art.md "outdoor maps"). The painting is the
GROUND only: no tree crowns, bushes, reeds or roofs — those are sprites placed from our layout and
animated on the table (wind), and roofs/crowns can lift when the party walks under them. The
river is painted as a still; its motion comes from the masks written here (where the water is,
which way and how fast it flows, where it is shallow, where it breaks on rocks).

Usage:
  tools/mapgen/outdoor.py guide layouts/riverbend.json             # guide + masks, free
  tools/mapgen/outdoor.py paint layouts/riverbend.json --size 2K --n 2 --why "…"
  tools/mapgen/outdoor.py roof  out/riverbend/<run> [out_1.jpg]    # roof sprites from the painting

Layout (squares, origin top-left): `zones` (forest · meadow · … polygons), `river` (centre-line
points [x, y, width, speed 0 calm…1 rapids, shallow 0 deep…1 ford]), `rocks` ([x, y, r] boulders
in the water), `paths` (polylines with width), `bridges` and `props` (rects), `buildings` (rect +
doors on a side, walls drawn like mapgen's, roof style). Run folders: tools/mapgen/out/<name>/.
"""

import argparse
import json
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
    "rock": (96, 96, 96), "bridge": (140, 92, 48),
    "wall": (32, 32, 32), "floor": (128, 128, 128), "prop": (255, 0, 255),
}

LEGEND = {
    "meadow": "light green = sunny summer meadow grass",
    "forest": "dark green = forest floor under a canopy (see the ground-layer rule)",
    "garden": "brown = tilled garden soil",
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


def render_guide(spec, pps=GUIDE_PPS):
    """The colour-coded guide the model repaints (smooth edges by supersampling)."""
    cols, rows = spec["grid"]
    k = pps * SS
    img = Image.new("RGB", (cols * k, rows * k), COLORS[spec.get("ground", "meadow")])
    d = ImageDraw.Draw(img)
    S = lambda pts: [(px * k, py * k) for px, py in pts]
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
    for i in range(len(r) - 1):
        seg = r[i:i + 2]
        sp, sh = seg[:, 3].mean(), seg[:, 4].mean()
        c = np.array(COLORS["deep"]) * (1 - sh) + np.array(COLORS["ford"]) * sh
        c = c * (1 - sp) + np.array(COLORS["rapids"]) * sp
        d.polygon(S(strip(seg, seg[:, 2] / 2)), tuple(int(v) for v in c))
    for x, y, rr in spec.get("rocks", []):
        d.ellipse([(x - rr) * k, (y - rr) * k, (x + rr) * k, (y + rr) * k], COLORS["rock"])
    for b in spec.get("bridges", []):
        x, y, w, h = b["rect"]
        d.rectangle([x * k, y * k, (x + w) * k, (y + h) * k], COLORS["bridge"])
    for b in spec.get("buildings", []):
        x, y, w, h = b["rect"]
        d.rectangle([x * k, y * k, (x + w) * k, (y + h) * k], COLORS["floor"])
        for x0, y0, x1, y1 in walls(b):
            d.rectangle([x0 * k, y0 * k, x1 * k, y1 * k], COLORS["wall"])
    for p in spec.get("props", []):
        x, y, w, h = p["rect"]
        d.rectangle([(x + 0.1) * k, (y + 0.1) * k, (x + w - 0.1) * k, (y + h - 0.1) * k], COLORS["prop"])
    return img.resize((cols * pps, rows * pps), Image.LANCZOS)


def squares(x0, y0, x1, y1):
    return f"columns {int(x0) + 1}–{int(np.ceil(x1))}, rows {int(y0) + 1}–{int(np.ceil(y1))}"


def bbox(pts, cols, rows):
    a = np.clip(np.asarray(pts, float), 0, [cols, rows])
    return (*a.min(0), *a.max(0))


def build_prompt(spec):
    """Fills prompts/outdoor.txt: the legend for the colours this layout uses + one line per area."""
    cols, rows = spec["grid"]
    used = {spec.get("ground", "meadow")} | {z["kind"] for z in spec.get("zones", [])}
    used |= {p["kind"] for p in spec.get("paths", [])}
    if spec.get("river"):
        used |= {"deep", "rapids", "ford", "gravel", "mud"}
    for key, flag in (("rock", "rocks"), ("bridge", "bridges"), ("prop", "props")):
        if spec.get(flag):
            used.add(key)
    if spec.get("buildings"):
        used |= {"wall", "floor"}
    legend = "; ".join(v for k, v in LEGEND.items() if k in used) + "."
    lines = []
    for z in spec.get("zones", []):
        if z.get("desc"):
            lines.append(f"- {z['id']} ({squares(*bbox(z['poly'], cols, rows))}): {z['desc']}")
    if spec.get("river"):
        lines.append(f"- river: {spec['river']['desc']}")
    for p in spec.get("paths", []):
        if p.get("desc"):
            lines.append(f"- {p['id']} ({squares(*bbox(p['points'], cols, rows))}): {p['desc']}")
    for b in spec.get("bridges", []) + spec.get("buildings", []) + spec.get("props", []):
        x, y, w, h = b["rect"]
        lines.append(f"- {b.get('id', 'prop')} ({squares(x, y, x + w, y + h)}): {b['desc']}")
    return (HERE / "prompts" / "outdoor.txt").read_text().format(
        cols=cols, rows=rows, setting=spec["setting"], legend=legend,
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
        # the rapids' mean flow direction at the boulders
        rx, ry = np.mean([r[np.argmin(np.hypot(r[:, 0] - x, r[:, 1] - y)), 5:7] for x, y, _ in spec["rocks"]], axis=0)
        steps = 14
        for i in range(1, steps + 1):
            d = 1.5 * i / steps
            moved = ndi.shift(rockm, (ry * d * pps, rx * d * pps), order=1)
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


def footprints(spec, pps):
    """One grey value per building (index + 1) over its outer wall rectangle."""
    cols, rows = spec["grid"]
    img = Image.new("L", (cols * pps, rows * pps), 0)
    d = ImageDraw.Draw(img)
    for i, b in enumerate(spec.get("buildings", [])):
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


# ---------------------------------------------------------------- roofs


def roof(spec, run, file=None, n=1):
    """Roof sprites from the painting: per building, an edit pass on a crop around it puts a roof
    on exactly its walls; the result is cut by our footprint (+ a small eave) → roof_<id>.png with
    alpha, in map pixels, placed at the crop's offset (roofs.json)."""
    meta = json.loads((run / "meta.json").read_text())
    file = file or meta["results"][0]["file"]
    img = Image.open(run / file).convert("RGB")
    cols, rows = spec["grid"]
    ppsx, ppsy = img.width / cols, img.height / rows
    template = (HERE / "prompts" / "edit-roof.txt").read_text()
    out = []
    for b in spec.get("buildings", []):
        x, y, w, h = b["rect"]
        box = aspect_box(img.size, ((x - 1.5) * ppsx, (y - 1.5) * ppsy, (x + w + 1.5) * ppsx, (y + h + 1.5) * ppsy))
        crop = img.crop(box[:4])
        prompt = template.format(roof=b.get("roof", "thatched"), desc=b["desc"])
        best = None
        for i in range(n):
            t0 = time.time()
            data, mime, usage = mapgen.generate(prompt, [crop], box[4], "1K", None)
            ext = ".png" if "png" in mime else ".jpg"
            raw = run / f"roof_{b['id']}_{i + 1}_raw{ext}"
            raw.write_bytes(data)
            edit = Image.open(raw).convert("RGB").resize(crop.size, Image.LANCZOS)
            print(f"{raw}  {time.time() - t0:.0f}s")
            best = best or edit
        box = box[:4]
        # cut: what the edit changed, kept inside the outer walls + 0.45 squares (eaves, chimney),
        # and always the whole footprint; feathered
        e = WALL / 2 + 0.45
        near = Image.new("L", crop.size, 0)
        ImageDraw.Draw(near).rectangle([(x - e) * ppsx - box[0], (y - e) * ppsy - box[1],
                                        (x + w + e) * ppsx - box[0], (y + h + e) * ppsy - box[1]], 255)
        core = Image.new("L", crop.size, 0)
        ImageDraw.Draw(core).rectangle([(x - WALL / 2) * ppsx - box[0], (y - WALL / 2) * ppsy - box[1],
                                        (x + w + WALL / 2) * ppsx - box[0], (y + h + WALL / 2) * ppsy - box[1]], 255)
        diff = np.abs(np.asarray(best, float) - np.asarray(crop, float)).mean(-1)
        changed = ndi.binary_fill_holes(ndi.binary_opening(ndi.gaussian_filter(diff, 2) > 22, iterations=2))
        m = (changed & (np.asarray(near) > 0)) | (np.asarray(core) > 0)
        lab, k = ndi.label(m)
        if k > 1:  # the roof is one piece; specks the edit changed in the grass around it drop out
            m = lab == 1 + np.argmax(ndi.sum(m, lab, range(1, k + 1)))
        mask = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
        sprite = best.convert("RGBA")
        sprite.putalpha(mask)
        name = f"roof_{b['id']}.png"
        sprite.save(run / name)
        out.append({"id": b["id"], "file": name, "x": box[0], "y": box[1], "w": crop.width, "h": crop.height,
                    "footprint": b["rect"]})
    (run / "roofs.json").write_text(json.dumps({"image": file, "roofs": out}, indent=1))
    print(run / "roofs.json")


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


# ---------------------------------------------------------------- CLI


def paint(spec, size, n, tag, why, thinking):
    name = spec["name"]
    run = OUT / name / (time.strftime("%y%m%d-%H%M%S") + (f"-{tag}" if tag else ""))
    run.mkdir(parents=True)
    guide = write_layers(spec, run)
    prompt = build_prompt(spec)
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
    p = sub.add_parser("paint"); p.add_argument("spec")
    p.add_argument("--size", default="2K", choices=mapgen.PRICE); p.add_argument("--n", type=int, default=1)
    p.add_argument("--tag", default=""); p.add_argument("--why", default="")
    p.add_argument("--thinking", choices=["minimal", "medium", "high"])
    r = sub.add_parser("roof"); r.add_argument("run"); r.add_argument("image", nargs="?")
    r.add_argument("--n", type=int, default=1)
    a = ap.parse_args()
    if a.cmd == "roof":
        run = Path(a.run).resolve()
        spec = mapgen.load_spec(json.loads((run / "meta.json").read_text())["layout"])
        roof(spec, run, a.image, a.n)
        return
    spec = mapgen.load_spec(a.spec)
    if a.cmd == "guide":
        folder = OUT / spec["name"]
        folder.mkdir(parents=True, exist_ok=True)
        write_layers(spec, folder)
        (folder / "prompt.txt").write_text(build_prompt(spec))
        print(folder / "guide.png", mapgen.pick_aspect(spec))
    elif a.cmd == "paint":
        paint(spec, a.size, a.n, a.tag, a.why, a.thinking)


if __name__ == "__main__":
    main()
