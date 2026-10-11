#!/usr/bin/env python3
"""AI map pipeline: layout spec → guide image → Nano Banana → QA → .dd2vtt.

Our layout is the truth (grid, walls, doors, lights); the image model only paints
over a color-coded guide. The packed .dd2vtt carries walls/doors/lights from the
layout, so fog, doors and room reveal work like on a Dungeondraft map.
Doors are not painted: the guide shows a doorway as a gap in the wall, and the
.dd2vtt asks battlemap to draw the door itself ("battlemap": {"draw_doors": true}).
Design: docs/ai-art.md.

Usage:
  tools/mapgen/mapgen.py guide  layouts/crypt.json            # guide PNG only, free
  tools/mapgen/mapgen.py paint  layouts/crypt.json --size 1K --n 2 --tag doorways --why "…"
  tools/mapgen/mapgen.py pack   out/crypt/<run>                # the best image (judge first)
  tools/mapgen/mapgen.py pack   layouts/crypt.json out/crypt/<run>/out_1.jpg
  tools/mapgen/mapgen.py doors  layouts/crypt.json out/crypt/<run>/out_1.jpg [--open] [--grid]
  tools/mapgen/mapgen.py check  out/crypt/<run>            # free checks again (also part of paint)
  tools/mapgen/mapgen.py judge  out/crypt/<run> [--wait] [--pack]  # Claude helper session judges each image
  tools/mapgen/mapgen.py fix    out/crypt/<run> [out_2.jpg] [--n N] [--judge] [--pack]  # doorway edit pass

Options for paint: --size 1K|2K|4K, --n N, --thinking minimal|medium|high,
--refs img... (style references), --prompt file (template), --tag name (run folder label),
--why "…" (the run's question, shown on the board), --round N (board zone; default: the
round of an earlier run with the same tag, else a new one), --judge (judge and wait),
--pack (pack the best: by the judge with --judge, else by the free checks).
paint, judge --wait and pack rebuild the horizon board (tools/mapgen/board.py) when it runs.

Model calls go through the image generation engine (~/code/image-generation-engine, or
$IGE_HOME; `ige.paint`, provider nano-banana). API key: $GEMINI_API_KEY, else 1Password item
$MAPGEN_OP_ITEM (vault dev). Model: $MAPGEN_MODEL (default gemini-nano-banana-2.1). Output: tools/mapgen/out/ (gitignored).
"""

import argparse
import io
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
MODEL = os.environ.get("MAPGEN_MODEL", "gemini-nano-banana-2.1")
os.environ.setdefault("IGE_OP_ITEM", os.environ.get("MAPGEN_OP_ITEM", "Gemini API - battlemap (Bao billing)"))
os.environ.setdefault("IGE_APP", "mapgen")
sys.path.insert(0, os.environ.get("IGE_HOME", str(Path.home() / "code/image-generation-engine")))
try:
    import ige
except ImportError:
    sys.exit("mapgen needs the image generation engine: clone it to ~/code/image-generation-engine "
             "or set IGE_HOME")

# USD per output image, standard tier (Google pricing page, 2026-10-10).
PRICE = {"1K": 0.0336, "2K": 0.0504, "4K": 0.113}
ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]

# Guide legend — must match the legend text in prompts/baseline.txt.
COLORS = {
    "solid": (0, 0, 0),
    "floor": (128, 128, 128),
    "wall": (32, 32, 32),
    "water": (32, 96, 255),
    "rubble": (160, 112, 64),
    "vegetation": (48, 160, 48),
    "light": (255, 255, 0),
    "prop": (255, 0, 255),
}
WALKABLE = {"floor", "water", "rubble", "vegetation"}
GUIDE_LONG_SIDE = 1024
WALL_THICKNESS = 0.25  # squares

# What an area with "ruined": true adds to its prompt line: decay inside, walls whole.
RUINED = ("ruined inside only: cracked and sunken floor, fallen stones and rubble lying on the floor, "
          "weeds in the cracks; its walls stand complete and unbroken")
# Free-text words that made the model open walls our .dd2vtt still has (run 1, keep).
WALL_BREAKERS = re.compile(r"\b(collaps\w*|breach\w*|ruin\w*|crumbl\w*|cave[sd]?[- ]in|destroyed|holes?|gaps?)\b", re.I)


# ---------------------------------------------------------------- layout


def load_spec(path):
    """Loads a layout spec (JSON, grid units, origin top-left, x right, y down)."""
    spec = json.loads(Path(path).read_text())
    spec.setdefault("name", Path(path).stem)
    spec["path"] = str(Path(path).resolve())
    spec.setdefault("areas", [])
    spec.setdefault("doors", [])
    spec.setdefault("lights", [])
    spec.setdefault("props", [])
    return spec


def lint(spec):
    """Warnings for free text that tends to make the model break walls; damage belongs in "ruined"."""
    texts = [("setting", spec.get("setting", ""))]
    texts += [(a.get("id", a.get("kind", "area")), a.get("desc", "")) for a in spec["areas"]]
    texts += [("prop", p.get("desc", "")) for p in spec["props"]]
    return [f'{where}: "{m.group(0)}" tends to open walls — describe the room plainly, set "ruined": true'
            for where, text in texts for m in WALL_BREAKERS.finditer(text)]


def cells(spec):
    """Returns a rows×cols array of area kinds; indoor maps start solid, outdoor maps floor."""
    cols, rows = spec["grid"]
    base = "floor" if spec.get("outdoor") else "solid"
    grid = np.full((rows, cols), base, dtype=object)
    for a in spec["areas"]:
        x, y, w, h = a["rect"]
        grid[y:y + h, x:x + w] = a.get("kind", "floor")
    return grid


def rooms(spec):
    """Returns a rows×cols array of room ids; walls run between different rooms.

    Each area is its own room unless it names a host room with "in" (water, rubble or
    vegetation lying inside a room gets no walls around it). Solid cells are room None;
    on outdoor maps the open ground is room "outside".
    """
    cols, rows = spec["grid"]
    grid = np.full((rows, cols), "outside" if spec.get("outdoor") else None, dtype=object)
    for i, a in enumerate(spec["areas"]):
        x, y, w, h = a["rect"]
        if a.get("kind") == "solid":
            grid[y:y + h, x:x + w] = None
        else:
            grid[y:y + h, x:x + w] = a.get("in") or a.get("id") or f"area{i}"
    return grid


def door_edges(spec):
    """Door edges as ((x0, y0), (x1, y1)) in grid units; a door sits on one side of a cell."""
    edges = set()
    for d in spec["doors"]:
        x, y, side = d["x"], d["y"], d["side"]
        edges.add({"n": ((x, y), (x + 1, y)), "s": ((x, y + 1), (x + 1, y + 1)),
                   "w": ((x, y), (x, y + 1)), "e": ((x + 1, y), (x + 1, y + 1))}[side])
    return edges


def runs(values):
    """Groups integers into consecutive runs: [1, 2, 3, 7] → [(1, 3), (7, 7)]."""
    out = []
    for v in sorted(values):
        if out and v == out[-1][1] + 1:
            out[-1][1] = v
        else:
            out.append([v, v])
    return [tuple(r) for r in out]


def wall_segments(spec):
    """Wall segments between different rooms or room and rock (doors excluded), collinear runs merged."""
    grid = rooms(spec)
    rows, cols = grid.shape
    doors = door_edges(spec)

    def room(x, y):
        return grid[y, x] if 0 <= x < cols and 0 <= y < rows else None

    horiz, vert = [], []
    for y in range(rows + 1):  # horizontal edges at y between cell (x, y-1) and (x, y)
        for x in range(cols):
            if room(x, y - 1) != room(x, y) and ((x, y), (x + 1, y)) not in doors:
                horiz.append((x, y))
    for x in range(cols + 1):
        for y in range(rows):
            if room(x - 1, y) != room(x, y) and ((x, y), (x, y + 1)) not in doors:
                vert.append((x, y))

    segs = []
    for y in sorted({e[1] for e in horiz}):
        for a, b in runs(e[0] for e in horiz if e[1] == y):
            segs.append(((a, y), (b + 1, y)))
    for x in sorted({e[0] for e in vert}):
        for a, b in runs(e[1] for e in vert if e[0] == x):
            segs.append(((x, a), (x, b + 1)))
    return segs


# ---------------------------------------------------------------- guide


def guide_scale(spec):
    """Guide pixels per square: the long side of the guide is GUIDE_LONG_SIDE px."""
    cols, rows = spec["grid"]
    return GUIDE_LONG_SIDE / max(cols, rows)


def render_guide(spec):
    """Draws the color-coded guide image the model repaints."""
    cols, rows = spec["grid"]
    s = guide_scale(spec)
    img = Image.new("RGB", (round(cols * s), round(rows * s)), COLORS["solid"])
    d = ImageDraw.Draw(img)
    grid = cells(spec)
    for y in range(rows):
        for x in range(cols):
            if grid[y, x] != "solid":
                d.rectangle([x * s, y * s, (x + 1) * s - 1, (y + 1) * s - 1], COLORS[grid[y, x]])
    for p in spec["props"]:
        x, y, w, h = p["rect"]
        inset = 0.15 * s
        d.rectangle([x * s + inset, y * s + inset, (x + w) * s - inset, (y + h) * s - inset], COLORS["prop"])
    t = WALL_THICKNESS * s
    for (x0, y0), (x1, y1) in wall_segments(spec):
        d.rectangle([x0 * s - t / 2, y0 * s - t / 2, x1 * s + t / 2, y1 * s + t / 2], COLORS["wall"])
    # Doors: nothing drawn — the floor runs through the gap (battlemap draws the door).
    for l in spec["lights"]:
        r = 0.15 * s
        d.ellipse([l["x"] * s - r, l["y"] * s - r, l["x"] * s + r, l["y"] * s + r], COLORS["light"])
    return img


# ---------------------------------------------------------------- prompt


def squares(rect):
    x, y, w, h = rect
    return f"columns {x + 1}–{x + w}, rows {y + 1}–{y + h}"


def build_prompt(spec, template):
    """Fills the prompt template with grid size, style and per-area / per-prop text."""
    cols, rows = spec["grid"]
    lines = [f"- {a.get('id', a.get('kind', 'area'))} ({squares(a['rect'])}): "
             + "; ".join(t for t in (a.get("desc"), RUINED if a.get("ruined") else None) if t)
             for a in spec["areas"] if a.get("desc") or a.get("ruined")]
    lines += [f"- prop ({squares(p['rect'])}): {p['desc']}" for p in spec["props"]]
    return template.format(
        cols=cols, rows=rows,
        setting=spec.get("setting", "an underground dungeon"),
        style=spec.get("style", "hand-painted fantasy battle map, rich stone and wood textures, "
                                "muted earthy palette with warm light pools, crisp readable edges"),
        areas="\n".join(lines) or "- (no extra details)",
    )


def pick_aspect(spec):
    """Closest supported aspect ratio to the grid; warns when the grid gets stretched."""
    cols, rows = spec["grid"]
    want = cols / rows
    best = min(ASPECTS, key=lambda a: abs(math.log(want * int(a.split(":")[1]) / int(a.split(":")[0]))))
    a, b = map(int, best.split(":"))
    if abs(want / (a / b) - 1) > 0.02:
        print(f"warning: grid {cols}×{rows} is not {best}; the result gets stretched by "
              f"{abs(want / (a / b) - 1):.0%} when resampled", file=sys.stderr)
    return best


# ---------------------------------------------------------------- API


def generate(prompt, images, aspect, size, thinking):
    """One picture through the engine; returns (image bytes, mime, usage metadata)."""
    try:
        res = ige.paint(prompt, images, size, aspect, "nano-banana", MODEL,
                        {"thinking": thinking} if thinking else {}, label="mapgen")
    except ige.ProviderError as e:
        sys.exit(str(e))
    return res.picture.data, res.picture.mime, res.usage


# ---------------------------------------------------------------- QA


def qa(spec, guide, out_img):
    """Wall-alignment score: edge strength on our wall lines ÷ edge strength inside rooms.

    Higher is better; around 1 means the painted walls ignore our layout. Also returns an
    overlay (our walls and doors drawn thin over the painting) for a look by eye.
    """
    img = out_img.convert("L").resize(guide.size, Image.LANCZOS)
    a = np.asarray(img, dtype=np.float32)
    gx = np.zeros_like(a); gy = np.zeros_like(a)
    gx[:, 1:-1] = a[:, 2:] - a[:, :-2]
    gy[1:-1, :] = a[2:, :] - a[:-2, :]
    grad = np.hypot(gx, gy)

    s = guide_scale(spec)
    band = Image.new("L", guide.size, 0)
    bd = ImageDraw.Draw(band)
    for (x0, y0), (x1, y1) in wall_segments(spec):
        w = 0.3 * s
        bd.rectangle([x0 * s - w, y0 * s - w, x1 * s + w, y1 * s + w], 255)
    interior = Image.new("L", guide.size, 0)
    idr = ImageDraw.Draw(interior)
    grid = cells(spec)
    rows, cols = grid.shape
    for y in range(rows):
        for x in range(cols):
            if grid[y, x] in WALKABLE:
                idr.rectangle([x * s, y * s, (x + 1) * s, (y + 1) * s], 255)
    interior_a = (np.asarray(interior) > 0) & ~(np.asarray(band) > 0)
    band_a = np.asarray(band) > 0
    score = float(grad[band_a].mean() / max(grad[interior_a].mean(), 1e-6)) if band_a.any() else float("nan")

    overlay = out_img.convert("RGB").resize(guide.size, Image.LANCZOS)
    od = ImageDraw.Draw(overlay)
    for (x0, y0), (x1, y1) in wall_segments(spec):
        od.line([x0 * s, y0 * s, x1 * s, y1 * s], fill=(0, 255, 255), width=2)
    for (x0, y0), (x1, y1) in door_edges(spec):
        od.line([x0 * s, y0 * s, x1 * s, y1 * s], fill=(255, 0, 0), width=3)
    return score, overlay


def door_preview(spec, out_img, open_=False, grid=False, doors=True):
    """The painting as the TV shows it: resampled to exact squares (as `pack` does) with
    doors drawn the way battlemap draws them (PortalComponent), optionally a grid on top.

    Same geometry and colours as lib/game/components/portal_component.dart: a wooden
    leaf 0.14 squares thick hinged at bounds[0], two iron straps, a south-east shadow;
    open = turned 85° toward the south / east side of the wall. Keep the two in step.
    The grid is battlemap's grid overlay (white lines), drawn stronger to check the fit.
    """
    cols, rows = spec["grid"]
    s = max(50, out_img.width // cols)
    img = out_img.convert("RGB").resize((cols * s, rows * s), Image.LANCZOS)
    d = ImageDraw.Draw(img, "RGBA")

    def poly(hx, hy, ang, x0, x1, y0, y1, off=0.0):
        c, n = math.cos(ang), math.sin(ang)
        return [(hx + off + x * c - y * n, hy + off + x * n + y * c)
                for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]

    for (ax, ay), (bx, by) in door_bounds(spec) if doors else []:
        hx, hy = ax * s, ay * s
        wall = math.atan2(by - ay, bx - ax)
        sign = 1 if -math.sin(wall) + math.cos(wall) >= 0 else -1
        ang = wall + sign * math.radians(85) * open_
        length, t = s * (1 - 0.04), 0.14 * s
        d.polygon(poly(hx, hy, ang, 0, length, -t / 2, t / 2, 0.035 * s), fill=(0, 0, 0, 102))
        d.polygon(poly(hx, hy, ang, 0, length, -t / 2, t / 2), fill=(0x6E, 0x4B, 0x2C),
                  outline=(0x2F, 0x1F, 0x12), width=max(1, round(0.014 * s)))
        for at in (0.2, 0.8):
            m, w = length * at, 0.025 * s
            d.polygon(poly(hx, hy, ang, m - w, m + w, -t / 2 - 0.01 * s, t / 2 + 0.01 * s),
                      fill=(0x3A, 0x3A, 0x3C))
    if grid:
        lw = max(1, round(s / 40))
        for x in range(cols + 1):
            d.line([(x * s, 0), (x * s, rows * s)], fill=(255, 255, 255, 110), width=lw)
        for y in range(rows + 1):
            d.line([(0, y * s), (cols * s, y * s)], fill=(255, 255, 255, 110), width=lw)
    return img


# ---------------------------------------------------------------- checks (free, no model)

# A wall edge counts as open when BOTH its features fall this far below the image's median
# wall edge: calibrated on the keep runs of 2026-10-10 (run 3 image 1's invented exit, the
# courtyard gaps of runs 1–2). Relative to the image, so it holds across styles.
OPEN_EDGE_RATIO = 0.45     # strongest brightness step across the line (wall outline)
OPEN_SPREAD_RATIO = 0.6    # colour variation across the line (floor-wall-floor vs floor-floor)
MARKER_RATIO = 0.05        # share of pure-yellow pixels around a light (a leaked dot: ~0.10,
                           # painted flames: ~0.02 — flames are orange-yellow, the dot is R = G)


def wall_units(spec):
    """Every wall as unit edges ((x, y), (x+1, y)) or ((x, y), (x, y+1))."""
    out = []
    for (x0, y0), (x1, y1) in wall_segments(spec):
        out += ([((x, y0), (x + 1, y0)) for x in range(x0, x1)] if y0 == y1
                else [((x0, y), (x0, y + 1)) for y in range(y0, y1)])
    return out


def exact(spec, out_img):
    """The painting at exact squares, as `pack` resamples it; returns (float array, px per square)."""
    cols, rows = spec["grid"]
    s = max(50, out_img.width // cols)
    img = out_img.convert("RGB").resize((cols * s, rows * s), Image.LANCZOS)
    return np.asarray(img, dtype=np.float32), s


def across(a, s, edge, reach=0.9):
    """Median colour per pixel row across a unit edge (−reach…+reach squares), over its middle 60 %."""
    (x0, y0), (x1, y1) = edge
    n, (H, W, _) = int(reach * s), a.shape
    if y0 == y1:
        c = int(y0 * s)
        strip = a[c - n:c + n, int((x0 + 0.2) * s):int((x0 + 0.8) * s)] if n <= c <= H - n else None
    else:
        c = int(x0 * s)
        strip = (a[int((y0 + 0.2) * s):int((y0 + 0.8) * s), c - n:c + n].transpose(1, 0, 2)
                 if n <= c <= W - n else None)
    return None if strip is None else np.median(strip, axis=1)


def check(spec, out_img):
    """Free checks of one painting against the layout; returns a list of issues.

    - "opening": a wall edge that looks open — no outline across the line and the same
      colours on both sides (an exit or breach the layout doesn't have). Map-edge walls are
      skipped (no room to look across).
    - "marker": a guide marker left in the art — the yellow light dot at a light, magenta
      prop colour anywhere.
    Issues carry x/y in grid squares (the edge's or light's centre) like the judge's.
    """
    a, s = exact(spec, out_img)
    feats = []
    for e in wall_units(spec):
        prof = across(a, s, e)
        if prof is None:
            continue
        lum, n = prof.mean(1), len(prof) // 2
        step = float(np.abs(np.diff(lum))[n - int(0.45 * s):n + int(0.45 * s)].max())
        spread = float(np.abs(prof - np.median(prof, 0)).mean())
        feats.append((e, step, spread))
    issues = []
    if feats:
        m_step = float(np.median([f[1] for f in feats]))
        m_spread = float(np.median([f[2] for f in feats]))
        for ((x0, y0), (x1, y1)), step, spread in feats:
            if step < OPEN_EDGE_RATIO * m_step and spread < OPEN_SPREAD_RATIO * m_spread:
                issues.append({"x": (x0 + x1) / 2, "y": (y0 + y1) / 2, "what": "opening",
                               "severity": "high", "edge": [[x0, y0], [x1, y1]],
                               "step": round(step / m_step, 2), "spread": round(spread / m_spread, 2)})
    r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]
    yellow = (r_ > 220) & (g_ > 220) & (b_ < 60) & (np.abs(r_ - g_) < 25)
    for l in spec["lights"]:
        cx, cy, r = int(l["x"] * s), int(l["y"] * s), max(2, int(0.2 * s))
        box = yellow[max(cy - r, 0):cy + r, max(cx - r, 0):cx + r]
        if box.size and box.mean() > MARKER_RATIO:
            issues.append({"x": l["x"], "y": l["y"], "what": "marker: yellow light dot",
                           "severity": "medium", "share": round(float(box.mean()), 2)})
    magenta = (r_ > 200) & (b_ > 200) & (g_ < 80)
    if magenta.mean() > 0.001:
        ys, xs = np.nonzero(magenta)
        issues.append({"x": round(float(xs.mean()) / s, 1), "y": round(float(ys.mean()) / s, 1),
                       "what": "marker: magenta prop colour", "severity": "medium",
                       "share": round(float(magenta.mean()), 4)})
    return issues


def spot_sheet(spec, out_img, spots, ring=True):
    """A strip of 3 × 3-square crops, one per spot (x, y, label), at exact squares; a red ring
    marks the spot unless `ring` is False (doorways: the ring would hide what's in the gap)."""
    if not spots:
        return None
    a, s = exact(spec, out_img)
    img, u = Image.fromarray(a.astype(np.uint8)), max(s, 80)
    tiles = []
    for x, y, label in spots:
        cx, cy = x * s, y * s
        t = img.crop((int(cx - 1.5 * s), int(cy - 1.5 * s), int(cx + 1.5 * s), int(cy + 1.5 * s)))
        t = t.resize((3 * u, 3 * u), Image.LANCZOS)  # ≥ 80 px per square, readable for the judge
        d = ImageDraw.Draw(t)
        if ring:
            d.ellipse([1.1 * u, 1.1 * u, 1.9 * u, 1.9 * u], outline=(255, 40, 40), width=max(2, u // 25))
        d.rectangle([0, 0, 7 * len(label) + 10, 18], fill=(0, 0, 0))
        d.text((5, 3), label, fill=(255, 255, 255))
        tiles.append(t)
    sheet = Image.new("RGB", (len(tiles) * (3 * u + 8) - 8, 3 * u), "white")
    for k, t in enumerate(tiles):
        sheet.paste(t, (k * (3 * u + 8), 0))
    return sheet


def issue_sheet(spec, out_img, issues):
    """Crops around each issue of the free checks (red ring on the spot), for a look by eye."""
    return spot_sheet(spec, out_img, [(i["x"], i["y"], f"{i['what']} @ {i['x']:g},{i['y']:g}") for i in issues])


def doorway_sheet(spec, out_img):
    """Crops centred on every doorway, labelled with the edge's centre: the judge checks each one
    (a rail or bar across a gap hides in the full painting, 2026-10-10)."""
    return spot_sheet(spec, out_img, [((x0 + x1) / 2, (y0 + y1) / 2, f"doorway {(x0 + x1) / 2:g},{(y0 + y1) / 2:g}")
                                      for (x0, y0), (x1, y1) in sorted(door_edges(spec))], ring=False)


def review(spec, run, file):
    """Free checks for one painting of a run: returns its issues; writes `grid_N.jpg` (the
    painting at exact squares with a grid, for reading coordinates), `doorways_N.jpg` (a crop
    per doorway, for the judge) and `suspects_N.jpg`."""
    n = Path(file).stem.split("_")[-1]
    img = Image.open(run / file)
    door_preview(spec, img, grid=True, doors=False).save(run / f"grid_{n}.jpg", quality=88)
    sheet = doorway_sheet(spec, img)
    if sheet:
        sheet.save(run / f"doorways_{n}.jpg", quality=88)
    issues = check(spec, img)
    sheet = issue_sheet(spec, img, issues)
    if sheet:
        sheet.save(run / f"suspects_{n}.jpg", quality=88)
    else:
        (run / f"suspects_{n}.jpg").unlink(missing_ok=True)
    return issues


def judged(run, file):
    """The judge's verdict on one painting of `run` (judge_N.json), or None when not judged."""
    f = Path(run) / f"judge_{Path(file).stem.split('_')[-1]}.json"
    return json.loads(f.read_text()) if f.exists() else None


def best_result(results, run=None):
    """The image to pack. With judge verdicts in `run`: "use" first, then the judge's score;
    otherwise (and as tie-break) no high free-check issue, fewest issues, then the QA score."""
    def key(r):
        j = judged(run, r["file"]) if run else None
        return ((j or {}).get("verdict") == "use", (j or {}).get("score", 0),
                not any(i["severity"] == "high" for i in r.get("issues", [])), -len(r.get("issues", [])), r["qa"])
    return max(results, key=key)


def next_round(tag):
    """Board round for a new run: the round of an earlier run with the same tag (a crypt and a
    keep painted for one question share a zone), else one past the highest round so far."""
    rounds = []
    for m in OUT.glob("*/*/meta.json"):
        r = json.loads(m.read_text()).get("round")
        if r is None:
            continue
        if tag and m.parent.name.split("-", 2)[2:] == [tag]:
            return r
        rounds.append(r)
    return max(rounds, default=0) + 1


def refresh_board():
    """Rebuilds the horizon board from the run folders (board.py); a note when horizon is down."""
    r = subprocess.run([sys.executable, str(HERE / "board.py")], capture_output=True, text=True)
    print("board rebuilt (horizon battlemap-mapgen)" if r.returncode == 0
          else "board: not rebuilt — horizon running? (tools/mapgen/board.py)")


# ---------------------------------------------------------------- judge (Claude helper session)


def layout_text(spec):
    """The layout in words for the judge: 0-based squares, rects as [x, y, w, h]."""
    lines = []
    for a in spec["areas"]:
        flags = [a.get("kind", "floor")] + (["ruined"] if a.get("ruined") else []) + \
                ([f"inside {a['in']}"] if a.get("in") else [])
        lines.append(f"- area {a.get('id', '?')} rect {a['rect']} ({', '.join(flags)}): {a.get('desc', '')}")
    lines += [f"- doorway on edge {list(a)}–{list(b)}" for a, b in sorted(door_edges(spec))]
    lines += [f"- light at ({l['x']}, {l['y']})" for l in spec["lights"]]
    lines += [f"- prop rect {p['rect']}: {p['desc']}" for p in spec["props"]]
    return "\n".join(lines)


def judge(spec, run, model=None, wait=False):
    """Starts a Claude helper session (claude-bridge headless, subscription) that judges every
    painting of `run` and writes judge_N.json per image; with `wait`, blocks until all exist
    (exits when the session dies or after 15 min)."""
    meta = json.loads((run / "meta.json").read_text())
    files = [r["file"] for r in meta["results"]]
    checks = "\n".join(
        f"   - {r['file']}: " + ("; ".join(f"{i['what']} at ({i['x']:g}, {i['y']:g})" for i in r.get("issues", []))
                                 or "nothing flagged")
        for r in meta["results"])
    cols, rows = spec["grid"]
    prompt = (HERE / "prompts" / "judge.txt").read_text().format(
        run=run, cols=cols, rows=rows, layout=layout_text(spec), checks=checks,
        images=", ".join(files), setting=spec.get("setting", ""))
    (run / "judge_prompt.txt").write_text(prompt)
    for f in run.glob("judge_*.json"):
        f.unlink()
    # "auto": no permission prompts — a headless session has nobody to answer one, and with
    # acceptEdits the first shell command hung the judge for good (2026-10-10).
    cmd = ["claude-bridge", "headless", "new", "--cwd", str(HERE.parent.parent), "--permission-mode", "auto"]
    sid = subprocess.run(cmd + (["--model", model] if model else []), capture_output=True, text=True,
                         check=True).stdout.strip().split()[-1]
    subprocess.run(["claude-bridge", "headless", "send", sid, "-"], input=prompt, text=True, check=True,
                   capture_output=True)
    (run / "judge_session.txt").write_text(sid + "\n")
    print(f"judge session {sid} on {len(files)} images → {run}/judge_N.json")
    if not wait:
        return
    want = [run / f"judge_{Path(f).stem.split('_')[-1]}.json" for f in files]
    t0 = time.time()
    while not all(w.exists() for w in want):
        done = sum(w.exists() for w in want)
        listing = subprocess.run(["claude-bridge", "headless", "list"], capture_output=True, text=True).stdout
        if any(l.startswith(sid[:8]) and " gone " in l for l in listing.splitlines()):
            sys.exit(f"judge: session {sid[:8]} ended with {done}/{len(want)} written — "
                     f"see `claude-bridge thread {sid[:8]}`")
        if time.time() - t0 > 900:
            sys.exit(f"judge: timed out after 15 min, {done}/{len(want)} written — "
                     f"see `claude-bridge thread {sid[:8]}`")
        time.sleep(10)
    time.sleep(2)  # let the last write finish
    for w in want:
        j = json.loads(w.read_text())
        print(f"{w.name}: {j.get('verdict')} score {j.get('score')} · "
              + "; ".join(f"{i['what']} ({i['x']:g}, {i['y']:g})" for i in j.get("issues", [])))


# ---------------------------------------------------------------- doorway edit pass


def doorway_regions(spec):
    """Rects [x0, y0, x1, y1] in squares around each doorway plus the wall unit right beside it
    on each side: where the edit pass may change a painting (a rail across the gap, a missing
    wall stub where a corridor end was opened over its full width)."""
    walls = set(wall_units(spec))
    out = []
    for (x0, y0), (x1, y1) in sorted(door_edges(spec)):
        if y0 == y1:
            lo = x0 - (((x0 - 1, y0), (x0, y0)) in walls)
            hi = x1 + (((x1, y0), (x1 + 1, y0)) in walls)
            out.append([lo - 0.1, y0 - 0.4, hi + 0.1, y0 + 0.4])
        else:
            lo = y0 - (((x0, y0 - 1), (x0, y0)) in walls)
            hi = y1 + (((x0, y1), (x0, y1 + 1)) in walls)
            out.append([x0 - 0.4, lo - 0.1, x0 + 0.4, hi + 0.1])
    return out


def paste_regions(src, edit, spec, feather=4):
    """`src` with `edit` pasted in only inside the doorway regions — the rest of an edit is never
    taken (Juri: an edit that fixed what was asked dropped doors elsewhere). Each patch is
    shifted by the mean colour difference on a ring around it, edges feathered."""
    cols, rows = spec["grid"]
    sx, sy = src.width / cols, src.height / rows
    a0, a1 = np.asarray(src, dtype=np.float32), np.asarray(edit, dtype=np.float32)
    out = a0.copy()
    for x0, y0, x1, y1 in doorway_regions(spec):
        box = (int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy))
        m = Image.new("L", src.size, 0)
        ImageDraw.Draw(m).rectangle(box, 255)
        grow = lambda r: np.asarray(m.filter(ImageFilter.MaxFilter(2 * r + 1))) > 0
        ring = grow(6) & ~grow(2)
        shift = a0[ring].mean(0) - a1[ring].mean(0)
        alpha = np.asarray(m.filter(ImageFilter.GaussianBlur(feather)), dtype=np.float32)[..., None] / 255
        out = out * (1 - alpha) + (a1 + shift) * alpha
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


WALL_HALF = 0.22  # half the band copied by close_stubs, in squares: the painted wall (~0.3–0.35
                  # thick in the keep runs) with its dark outlines — 0.17 left a faint strip


def close_stubs(img, spec):
    """Paints the wall unit right beside each doorway with a copy of the same wall line two
    units further along (only the wall band, ±WALL_HALF across the line): the model opens a
    doorway 1.5–2 squares wide where the layout has one (9 of 10 keep draws) and the edit
    pass doesn't narrow it, while battlemap's door leaf is exactly one square. Free and
    deterministic; a stub that was whole just gets a copy of its own wall."""
    walls = set(wall_units(spec))
    cols, rows = spec["grid"]
    sx, sy = img.width / cols, img.height / rows
    a = np.asarray(img, dtype=np.float32)
    out = a.copy()
    for (x0, y0), (x1, y1) in sorted(door_edges(spec)):
        hor = y0 == y1
        step = (lambda u, k: ((u[0][0] + k, u[0][1]), (u[1][0] + k, u[1][1]))) if hor else \
               (lambda u, k: ((u[0][0], u[0][1] + k), (u[1][0], u[1][1] + k)))
        sides = [(((x0 - 1, y0), (x0, y0)), -1), (((x1, y0), (x1 + 1, y0)), 1)] if hor else \
                [(((x0, y0 - 1), (x0, y0)), -1), (((x0, y1), (x0, y1 + 1)), 1)]
        for unit, d in sides:
            donor = next((step(unit, d * k) for k in (2, 3) if unit in walls and step(unit, d * k) in walls
                          and step(unit, d * k) not in door_edges(spec)), None)
            if donor is None:
                continue
            (ux0, uy0), (ux1, uy1) = unit
            box = ([ux0, uy0 - WALL_HALF, ux1, uy0 + WALL_HALF] if hor else [ux0 - WALL_HALF, uy0, ux0 + WALL_HALF, uy1])
            px = [int(box[0] * sx), int(box[1] * sy), int(box[2] * sx), int(box[3] * sy)]
            ox, oy = int(round((donor[0][0] - ux0) * sx)), int(round((donor[0][1] - uy0) * sy))
            moved = a.copy()
            moved[px[1]:px[3], px[0]:px[2]] = a[px[1] + oy:px[3] + oy, px[0] + ox:px[2] + ox]
            m = Image.new("L", img.size, 0)
            ImageDraw.Draw(m).rectangle([px[0], px[1], px[2] - 1, px[3] - 1], 255)
            alpha = np.asarray(m.filter(ImageFilter.GaussianBlur(1)), dtype=np.float32)[..., None] / 255
            out = out * (1 - alpha) + moved * alpha
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def offset(a, b):
    """Integer (dx, dy) that best lines up image b with a (phase correlation on grey levels)."""
    f = np.fft.fft2(a.mean(2)) * np.conj(np.fft.fft2(b.mean(2)))
    c = np.abs(np.fft.ifft2(f / (np.abs(f) + 1e-9)))
    y, x = np.unravel_index(c.argmax(), c.shape)
    return (int(x) if x < c.shape[1] // 2 else int(x) - c.shape[1],
            int(y) if y < c.shape[0] // 2 else int(y) - c.shape[0])


def fix(spec, src_run, file, n, tag="fix-doorways", why=""):
    """Doorway edit pass: Nano Banana edits the painting (prompts/edit-doorways.txt: rails out),
    only the doorway regions are pasted into the original, then [close_stubs] puts the wall
    back beside each doorway so every opening is one square per door edge. Writes a
    new run folder (out_N.jpg = composites, edit_N.png raw, doorways_before.jpg) and returns
    (run, results) — check, judge, pack and the board treat it like any paint run."""
    src = Image.open(src_run / file).convert("RGB")
    run = OUT / spec["name"] / (time.strftime("%y%m%d-%H%M%S") + f"-{tag}")
    run.mkdir(parents=True)
    guide = render_guide(spec)
    guide.save(run / "guide.png")
    prompt = (HERE / "prompts" / "edit-doorways.txt").read_text()
    (run / "prompt.txt").write_text(prompt)
    doorway_sheet(spec, src).save(run / "doorways_before.jpg", quality=88)
    size = json.loads((src_run / "meta.json").read_text()).get("size", "1K")
    a0, results = np.asarray(src, dtype=np.float32), []
    for i in range(1, n + 1):
        t0 = time.time()
        data, mime, usage = generate(prompt, [src, guide], pick_aspect(spec), size, None)
        (run / f"edit_{i}.png").write_bytes(data)
        edit = Image.open(io.BytesIO(data)).convert("RGB").resize(src.size, Image.LANCZOS)
        dx, dy = offset(a0, np.asarray(edit, dtype=np.float32))
        if (dx, dy) != (0, 0):  # never seen (Juri: ≤ 0.02 px); a shifted edit would smear the patches
            print(f"edit {i}: shifted by ({dx}, {dy}) px — rolled back into place", file=sys.stderr)
            edit = Image.fromarray(np.roll(np.asarray(edit), (dy, dx), axis=(0, 1)))
        path = run / f"out_{i}.jpg"
        close_stubs(paste_regions(src, edit, spec), spec).save(path, quality=95)
        results.append(finish_image(spec, guide, run, path, t0, usage))
    cost = PRICE[size] * n
    meta = {"layout": spec["path"], "model": MODEL,
            "size": size, "aspect": pick_aspect(spec), "fix_of": f"{src_run.name}/{file}",
            "prompt_template": str(HERE / "prompts" / "edit-doorways.txt"), "est_cost_usd": round(cost, 4),
            "round": next_round(tag), "draw_doors": True,
            "why": why or f"Doorway edit pass on {src_run.name}/{file}: rails out (edit, only the doorway "
                          "regions pasted back), wall beside each doorway copied from further along the line.",
            "results": results}
    (run / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"run {run}  est. ${cost:.2f}")
    return run


def finish_image(spec, guide, run, path, t0, usage):
    """Everything a new painting gets: QA score + overlay, door preview, free checks with
    doorway / grid / suspect sheets; returns its meta.json result entry."""
    out_img = Image.open(path)
    n = path.stem.split("_")[-1]
    score, overlay = qa(spec, guide, out_img)
    overlay.save(run / f"overlay_{n}.jpg", quality=85)
    door_preview(spec, out_img).save(run / f"doors_{n}.jpg", quality=88)
    issues = review(spec, run, path.name)
    print(f"{path}  {out_img.size[0]}×{out_img.size[1]}  qa {score:.2f}  {time.time() - t0:.0f}s  "
          + ("; ".join(f"{x['what']} ({x['x']:g}, {x['y']:g})" for x in issues) or "checks clean"))
    return {"file": path.name, "qa": round(score, 3), "issues": issues, "size": out_img.size,
            "seconds": round(time.time() - t0, 1), "usage": usage}


# ---------------------------------------------------------------- pack


def door_bounds(spec):
    """Door edges as .dd2vtt bounds, hinge first: battlemap hinges a drawn door at bounds[0].

    A door edge runs from its top/left end; a door whose neighbour in the same wall line
    sits on its hinge side (and none on the other) is the second leaf of a double door
    and gets its hinge on the far end, so the pair opens from the middle.
    """
    edges = door_edges(spec)
    out = []
    for a, b in sorted(edges):
        horizontal = a[1] == b[1]
        before = ((a[0] - 1, a[1]), a) if horizontal else ((a[0], a[1] - 1), a)
        after = (b, (b[0] + 1, b[1])) if horizontal else (b, (b[0], b[1] + 1))
        out.append((b, a) if before in edges and after not in edges else (a, b))
    return out


def pack_run(spec, run, image=None, ppg=None, fmt="WEBP"):
    """Packs a painting of `run` (default: [best_result], judge first) as <run>/<name>.dd2vtt
    and records it as meta.json "packed" — the board marks that image."""
    meta = json.loads((run / "meta.json").read_text())
    file = Path(image).name if image else best_result(meta["results"], run)["file"]
    pack(spec, run / file, run / f"{spec['name']}.dd2vtt", ppg, fmt)
    meta["packed"] = file
    (run / "meta.json").write_text(json.dumps(meta, indent=2))
    return file


def pack(spec, image_path, out_path, ppg=None, fmt="WEBP"):
    """Writes a .dd2vtt: the painting resampled to exact squares + walls/doors/lights from the spec.

    The file carries battlemap's extension {"draw_doors": true}: the painting has empty
    doorways, battlemap draws the doors (other VTTs ignore the key).
    """
    cols, rows = spec["grid"]
    img = Image.open(image_path).convert("RGB")
    ppg = ppg or max(50, img.width // cols)
    img = img.resize((cols * ppg, rows * ppg), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, fmt, quality=90) if fmt != "PNG" else img.save(buf, "PNG")
    pt = lambda x, y: {"x": x, "y": y}
    portals = []
    for (x0, y0), (x1, y1) in door_bounds(spec):
        portals.append({"position": pt((x0 + x1) / 2, (y0 + y1) / 2), "bounds": [pt(x0, y0), pt(x1, y1)],
                        "rotation": 0.0 if y0 == y1 else math.pi / 2, "closed": True, "freestanding": False})
    data = {
        "format": 0.3,
        "resolution": {"map_origin": pt(0, 0), "map_size": pt(cols, rows), "pixels_per_grid": ppg},
        "line_of_sight": [[pt(*a), pt(*b)] for a, b in wall_segments(spec)],
        "objects_line_of_sight": [],
        "portals": portals,
        "environment": {"baked_lighting": True, "ambient_light": "ffffffff"},
        "lights": [{"position": pt(l["x"], l["y"]), "range": l.get("range", 4), "intensity": l.get("intensity", 1),
                    "color": "ff" + l.get("color", "ffb060"), "shadows": True} for l in spec["lights"]],
        "image": base64.b64encode(buf.getvalue()).decode(),
        "battlemap": {"draw_doors": True},
    }
    Path(out_path).write_text(json.dumps(data))
    print(f"packed {out_path}  {cols}×{rows} squares @ {ppg} px, {len(data['line_of_sight'])} walls, "
          f"{len(portals)} doors, {Path(out_path).stat().st_size / 1e6:.1f} MB")


# ---------------------------------------------------------------- CLI


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("guide"); g.add_argument("spec")
    p = sub.add_parser("paint"); p.add_argument("spec")
    p.add_argument("--size", default="1K", choices=PRICE)
    p.add_argument("--n", type=int, default=1)
    p.add_argument("--thinking", choices=["minimal", "medium", "high"])
    p.add_argument("--refs", nargs="*", default=[])
    p.add_argument("--prompt", default=str(HERE / "prompts" / "baseline.txt"))
    p.add_argument("--tag", default="", help="label for the run folder (e.g. a tuning variant)")
    p.add_argument("--why", default="", help="the question this run answers (board zone text)")
    p.add_argument("--round", type=int, help="board round (zone); default by tag, else a new one")
    p.add_argument("--judge", action="store_true", help="judge the run and wait (before --pack)")
    p.add_argument("--pack", action="store_true")
    k = sub.add_parser("pack", help="pack a run's best image, or a given image, as .dd2vtt")
    k.add_argument("spec", help="layout JSON, or a run folder (packs its best image)")
    k.add_argument("image", nargs="?")
    k.add_argument("--ppg", type=int); k.add_argument("--png", action="store_true")
    o = sub.add_parser("doors", help="the painting with battlemap's doors drawn on (preview)")
    o.add_argument("spec"); o.add_argument("image"); o.add_argument("--open", action="store_true")
    o.add_argument("--grid", action="store_true", help="battlemap's grid on top, to check the fit")
    c = sub.add_parser("check", help="free checks on a run again (openings, markers)"); c.add_argument("run")
    j = sub.add_parser("judge", help="a Claude helper session judges a run (subscription)")
    j.add_argument("run"); j.add_argument("--model"); j.add_argument("--wait", action="store_true")
    j.add_argument("--pack", action="store_true", help="with --wait: pack the judge's best image")
    f = sub.add_parser("fix", help="doorway edit pass on a painting → a new run (per image)")
    f.add_argument("run"); f.add_argument("image", nargs="?", help="default: the run's packed image, else its best")
    f.add_argument("--n", type=int, default=1); f.add_argument("--why", default="")
    f.add_argument("--judge", action="store_true"); f.add_argument("--pack", action="store_true")
    a = ap.parse_args()

    if a.cmd == "pack" and Path(a.spec).is_dir():
        a.run, a.spec = a.spec, None
    elif a.cmd == "pack" and a.image and (Path(a.image).resolve().parent / "meta.json").exists():
        a.run = str(Path(a.image).resolve().parent)
    if getattr(a, "run", None):
        run = Path(a.run).resolve()
        meta = json.loads((run / "meta.json").read_text())
        a.spec = getattr(a, "spec", None) or meta.get("layout") or str(HERE / "layouts" / f"{run.parent.name}.json")
    spec = load_spec(a.spec)
    name = spec["name"]
    warnings = lint(spec)
    for w in warnings:
        print(f"lint: {w}", file=sys.stderr)
    if a.cmd == "guide":
        (OUT / name).mkdir(parents=True, exist_ok=True)
        path = OUT / name / "guide.png"
        render_guide(spec).save(path)
        print(f"{path}  walls {len(wall_segments(spec))}, doors {len(spec['doors'])}, aspect {pick_aspect(spec)}")
    elif a.cmd == "doors":
        img = Image.open(a.image)
        path = Path(a.image).with_name(Path(a.image).stem.replace("out_", "doors_")
                                       + ("_open" if a.open else "") + ("_grid" if a.grid else "") + ".jpg")
        door_preview(spec, img, a.open, a.grid).save(path, quality=90)
        print(path)
    elif a.cmd == "pack" and getattr(a, "run", None):
        pack_run(spec, run, a.image, a.ppg, "PNG" if a.png else "WEBP")
        refresh_board()
    elif a.cmd == "pack":
        pack(spec, a.image, OUT / name / f"{name}.dd2vtt", a.ppg, "PNG" if a.png else "WEBP")
    elif a.cmd == "check":
        for r in meta["results"]:
            r["issues"] = review(spec, run, r["file"])
            print(f"{r['file']}: " + ("; ".join(f"{i['what']} ({i['x']:g}, {i['y']:g})" for i in r["issues"]) or "clean"))
        (run / "meta.json").write_text(json.dumps(meta, indent=2))
    elif a.cmd == "fix":
        file = a.image or meta.get("packed") or best_result(meta["results"], run)["file"]
        new = fix(spec, run, Path(file).name, a.n, why=a.why)
        if a.judge:
            judge(spec, new, wait=True)
        if a.pack:
            pack_run(spec, new)
        refresh_board()
    elif a.cmd == "judge":
        judge(spec, run, a.model, a.wait or a.pack)
        if a.pack:
            pack_run(spec, run)
        if a.wait or a.pack:
            refresh_board()
    else:
        run = OUT / name / (time.strftime("%y%m%d-%H%M%S") + (f"-{a.tag}" if a.tag else ""))
        run.mkdir(parents=True)
        guide = render_guide(spec)
        guide.save(run / "guide.png")
        prompt = build_prompt(spec, Path(a.prompt).read_text())
        (run / "prompt.txt").write_text(prompt)
        aspect = pick_aspect(spec)
        results = []
        for i in range(1, a.n + 1):
            t0 = time.time()
            data, mime, usage = generate(prompt, [guide] + a.refs, aspect, a.size, a.thinking)
            ext = "png" if "png" in mime else "jpg"
            path = run / f"out_{i}.{ext}"
            path.write_bytes(data)
            results.append(finish_image(spec, guide, run, path, t0, usage))
        cost = PRICE[a.size] * a.n
        (run / "meta.json").write_text(json.dumps({
            "layout": str(Path(a.spec).resolve()), "model": MODEL, "size": a.size, "aspect": aspect, "thinking": a.thinking, "refs": a.refs,
            "prompt_template": a.prompt, "lint": warnings, "est_cost_usd": round(cost, 4),
            "round": a.round or next_round(a.tag), "why": a.why, "draw_doors": True, "results": results}, indent=2))
        print(f"run {run}  est. ${cost:.2f}")
        if a.judge:
            judge(spec, run, wait=True)
        if a.pack:
            pack_run(spec, run)
        refresh_board()


if __name__ == "__main__":
    main()
