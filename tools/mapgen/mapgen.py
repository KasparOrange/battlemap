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
  tools/mapgen/mapgen.py paint  layouts/crypt.json --size 1K --n 2
  tools/mapgen/mapgen.py pack   layouts/crypt.json out/crypt/<run>/out_1.jpg
  tools/mapgen/mapgen.py doors  layouts/crypt.json out/crypt/<run>/out_1.jpg [--open] [--grid]
  tools/mapgen/mapgen.py check  out/crypt/<run>            # free checks again (also part of paint)
  tools/mapgen/mapgen.py judge  out/crypt/<run> [--wait]   # Claude helper session judges each image

Options for paint: --size 1K|2K|4K, --n N, --thinking minimal|medium|high,
--refs img... (style references), --prompt file (template), --pack (pack the best).

API key: $GEMINI_API_KEY, else 1Password item $MAPGEN_OP_ITEM (vault dev).
Model: $MAPGEN_MODEL (default gemini-nano-banana-2.1). Output: tools/mapgen/out/ (gitignored).
"""

import argparse
import base64
import io
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
MODEL = os.environ.get("MAPGEN_MODEL", "gemini-nano-banana-2.1")
OP_ITEM = os.environ.get("MAPGEN_OP_ITEM", "Gemini API - battlemap (Bao billing)")
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

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


def api_key():
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    return subprocess.run(["op", "item", "get", OP_ITEM, "--vault", "dev", "--fields",
                           "label=credential", "--reveal"], capture_output=True, text=True,
                          check=True).stdout.strip()


def png_part(img_or_path):
    if isinstance(img_or_path, Image.Image):
        buf = io.BytesIO()
        img_or_path.save(buf, "PNG")
        data, mime = buf.getvalue(), "image/png"
    else:
        p = Path(img_or_path)
        data = p.read_bytes()
        mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(data).decode()}}


def generate(key, prompt, images, aspect, size, thinking):
    """One generateContent call; returns (image bytes, mime, usage metadata)."""
    body = {
        "contents": [{"parts": [{"text": prompt}] + [png_part(i) for i in images]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": aspect, "imageSize": size},
        },
    }
    if thinking:
        body["generationConfig"]["thinkingConfig"] = {"thinkingLevel": thinking}
    req = urllib.request.Request(API.format(model=MODEL), data=json.dumps(body).encode(),
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            resp = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"API error {e.code}: {e.read().decode()[:600]}")
    for part in resp["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            return (base64.b64decode(part["inlineData"]["data"]), part["inlineData"]["mimeType"],
                    resp.get("usageMetadata", {}))
    sys.exit(f"no image in response: {json.dumps(resp)[:600]}")


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


def issue_sheet(spec, out_img, issues):
    """A strip of 3 × 3-square crops around each issue (red ring on the spot) for a look by eye."""
    if not issues:
        return None
    a, s = exact(spec, out_img)
    img = Image.fromarray(a.astype(np.uint8))
    tiles = []
    for i in issues:
        cx, cy = i["x"] * s, i["y"] * s
        t = img.crop((int(cx - 1.5 * s), int(cy - 1.5 * s), int(cx + 1.5 * s), int(cy + 1.5 * s)))
        d = ImageDraw.Draw(t)
        d.ellipse([1.1 * s, 1.1 * s, 1.9 * s, 1.9 * s], outline=(255, 40, 40), width=max(2, s // 25))
        d.text((6, 4), f"{i['what']} @ {i['x']:g},{i['y']:g}", fill=(255, 255, 255))
        tiles.append(t)
    sheet = Image.new("RGB", (len(tiles) * (3 * s + 8) - 8, 3 * s), "white")
    for k, t in enumerate(tiles):
        sheet.paste(t, (k * (3 * s + 8), 0))
    return sheet


def review(spec, run, file):
    """Free checks for one painting of a run: returns its issues; writes `grid_N.jpg` (the
    painting at exact squares with a grid, for reading coordinates) and `suspects_N.jpg`."""
    n = Path(file).stem.split("_")[-1]
    img = Image.open(run / file)
    door_preview(spec, img, grid=True, doors=False).save(run / f"grid_{n}.jpg", quality=88)
    issues = check(spec, img)
    sheet = issue_sheet(spec, img, issues)
    if sheet:
        sheet.save(run / f"suspects_{n}.jpg", quality=88)
    else:
        (run / f"suspects_{n}.jpg").unlink(missing_ok=True)
    return issues


def best_result(results):
    """The image to pack: no high issue first, then fewest issues, then the QA score."""
    return max(results, key=lambda r: (not any(i["severity"] == "high" for i in r.get("issues", [])),
                                       -len(r.get("issues", [])), r["qa"]))


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
    painting of `run` and writes judge_N.json per image; with `wait`, blocks until all exist."""
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
    p.add_argument("--pack", action="store_true")
    k = sub.add_parser("pack"); k.add_argument("spec"); k.add_argument("image")
    k.add_argument("--ppg", type=int); k.add_argument("--png", action="store_true")
    o = sub.add_parser("doors", help="the painting with battlemap's doors drawn on (preview)")
    o.add_argument("spec"); o.add_argument("image"); o.add_argument("--open", action="store_true")
    o.add_argument("--grid", action="store_true", help="battlemap's grid on top, to check the fit")
    c = sub.add_parser("check", help="free checks on a run again (openings, markers)"); c.add_argument("run")
    j = sub.add_parser("judge", help="a Claude helper session judges a run (subscription)")
    j.add_argument("run"); j.add_argument("--model"); j.add_argument("--wait", action="store_true")
    a = ap.parse_args()

    if a.cmd in ("check", "judge"):
        run = Path(a.run).resolve()
        meta = json.loads((run / "meta.json").read_text())
        a.spec = meta.get("layout") or str(HERE / "layouts" / f"{run.parent.name}.json")
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
    elif a.cmd == "pack":
        pack(spec, a.image, OUT / name / f"{name}.dd2vtt", a.ppg, "PNG" if a.png else "WEBP")
    elif a.cmd == "check":
        for r in meta["results"]:
            r["issues"] = review(spec, run, r["file"])
            print(f"{r['file']}: " + ("; ".join(f"{i['what']} ({i['x']:g}, {i['y']:g})" for i in r["issues"]) or "clean"))
        (run / "meta.json").write_text(json.dumps(meta, indent=2))
    elif a.cmd == "judge":
        judge(spec, run, a.model, a.wait)
    else:
        run = OUT / name / (time.strftime("%y%m%d-%H%M%S") + (f"-{a.tag}" if a.tag else ""))
        run.mkdir(parents=True)
        guide = render_guide(spec)
        guide.save(run / "guide.png")
        prompt = build_prompt(spec, Path(a.prompt).read_text())
        (run / "prompt.txt").write_text(prompt)
        aspect = pick_aspect(spec)
        key = api_key()
        results = []
        for i in range(1, a.n + 1):
            t0 = time.time()
            data, mime, usage = generate(key, prompt, [guide] + a.refs, aspect, a.size, a.thinking)
            ext = "png" if "png" in mime else "jpg"
            path = run / f"out_{i}.{ext}"
            path.write_bytes(data)
            out_img = Image.open(path)
            score, overlay = qa(spec, guide, out_img)
            overlay.save(run / f"overlay_{i}.jpg", quality=85)
            door_preview(spec, out_img).save(run / f"doors_{i}.jpg", quality=88)
            issues = review(spec, run, path.name)
            results.append({"file": path.name, "qa": round(score, 3), "issues": issues, "size": out_img.size,
                            "seconds": round(time.time() - t0, 1), "usage": usage})
            print(f"{path}  {out_img.size[0]}×{out_img.size[1]}  qa {score:.2f}  {time.time() - t0:.0f}s  "
                  + ("; ".join(f"{x['what']} ({x['x']:g}, {x['y']:g})" for x in issues) or "checks clean"))
        cost = PRICE[a.size] * a.n
        (run / "meta.json").write_text(json.dumps({
            "layout": str(Path(a.spec).resolve()), "model": MODEL, "size": a.size, "aspect": aspect, "thinking": a.thinking, "refs": a.refs,
            "prompt_template": a.prompt, "lint": warnings, "est_cost_usd": round(cost, 4), "results": results}, indent=2))
        print(f"run {run}  est. ${cost:.2f}")
        if a.pack:
            best = best_result(results)
            pack(spec, run / best["file"], run / f"{name}.dd2vtt")


if __name__ == "__main__":
    main()
