#!/usr/bin/env python3
"""Builds the horizon board `battlemap-mapgen`: every image of the map-pipeline tests on one
canvas — the test layouts (guides), each painting with numbered pins on the features it shows
and a note per pin, and slots for the images still to come.

Usage: tools/mapgen/board.py            (needs the horizon server on :4643)

Re-run safe: replaces the whole scene (comments survive). Runs come from the run folders:
out/<layout>/<run>/meta.json ("round" → zone, "why"/"finding" → its text, "packed") and
judge_N.json (issues and "good" → pins, in GRID squares, so they land on the feature whatever
the display size). mapgen.py paint/judge/pack call this script, so a new run needs no edit
here. Hand-written: the test layouts, NOTES on runs judged by eye, NEXT slots, Juri's zone.
Design: docs/ai-art.md.
"""
import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

SLUG = "battlemap-mapgen"
BASE = f"http://localhost:4643/api/boards/{SLUG}"
BOARD = Path.home() / f"code/horizon/data/boards/{SLUG}.horizon"
HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

GREEN, RED, AMBER, BLUE, PURPLE, GREY = "#16a34a", "#dc2626", "#d97706", "#2563eb", "#7c3aed", "#6b7280"
PAD, TOP, GAP, EDGE_GAP = 48, 120, 24, 160   # zone padding, zone title band, piece gap, room for arrows
MAX_H = 6400                                  # tallest column of zones
CARD_W, TEXT_W = 320, 672

EL, ED = [], []
_z = [0]


def add(id, type, x, y, w, h, props, parent=None):
    _z[0] += 1
    e = {"id": id, "type": type, "x": x, "y": y, "w": w, "h": h, "z": _z[0], "props": props}
    if parent:
        e["parent"] = parent
    EL.append(e)
    return e


def card_h(title, text, w=CARD_W):
    per = max(20, int(w / 9.4))
    lines = sum(1 + len(l) // per for l in text.split("\n")) if text else 0
    return 54 + 20 * lines + (20 * (len(title) // per))


def md_h(md, w=TEXT_W):
    per = max(20, int(w / 8.6))
    lines = 0
    for l in md.split("\n"):
        lines += 1 + len(l.replace("**", "")) // per
    return 48 + lines * 22


def media(src, name):
    """Copies an image into the board's media folder (JPEG ≤ 1600 px); returns (src, w, h)."""
    dst = BOARD / "media" / name
    if Path(src).suffix == ".png" and name.endswith(".png"):
        shutil.copy(src, dst)
    else:
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "84", "-Z", "1600",
                        str(src), "--out", str(dst)], capture_output=True, check=True)
    info = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(dst)],
                          capture_output=True, text=True).stdout
    w = int(info.split("pixelWidth:")[1].split()[0])
    h = int(info.split("pixelHeight:")[1].split()[0])
    return f"media/{name}", w, h


# ------------------------------------------------------------------ content

CRYPT_GRID, KEEP_GRID = (16, 16), (32, 18)

# The two test layouts, explained by hand (they don't change from run to run).
# pin: (grid x, grid y, colour, title, text) — numbered in order
LAYOUTS = [
    {"id": "g_crypt", "title": "CRYPT · THE GUIDE", "img": OUT / "crypt/guide.png",
     "name": "crypt-guide.png", "grid": CRYPT_GRID, "width": 672,
     "intro": "**Why this layout:** small and square (16 × 16, 1:1), one room plus two side spaces, "
              "and every legend colour exactly once — the smallest map that tests the whole legend.",
     "pins": [
         (3, 6.5, PURPLE, "Door on a side wall", "A gap on a vertical edge: the ossuary door (a red bar in run 1). Battlemap draws the door."),
         (8, 11, PURPLE, "Double door", "Two door edges side by side: the corridor opens into the hall two squares wide; hinges at the outer ends."),
         (11.5, 9.5, PURPLE, "Terrain inside a room", "Blue water marked as lying IN the hall: no walls around it. Tests the \"in\" rule."),
         (8, 6.5, PURPLE, "Prop", "Magenta block = a prop described in words: \"carved sarcophagus of a knight\"."),
         (5, 3.3, PURPLE, "Light sources", "Yellow dots on the north wall; the packed map also carries them as lights."),
         (8, 15, PURPLE, "Corridor to the map edge", "\"Steps leading up out of the crypt\" — tests whether text adds detail without moving walls."),
     ]},
    {"id": "g_keep", "title": "KEEP · THE GUIDE", "img": OUT / "keep/guide.png",
     "name": "keep-guide.png", "grid": KEEP_GRID, "width": 960,
     "intro": "**Why this layout:** 32 × 18 = the TV's 16:9, so it fills the table edge to edge. Six rooms "
              "sharing walls, a corridor, five doors and a rubble room — the realistic case, and only "
              "~30–50 px per square at 1K, a stress test for detail.",
     "pins": [
         (14, 10.9, PURPLE, "Shared wall", "Hall, kitchen and barracks touch: walls run BETWEEN rooms, one line each, not a rock gap."),
         (17, 6.9, PURPLE, "Corridor, doors at both ends", "Links hall and armory; tests two doors on one short room."),
         (25, 12, PURPLE, "A room made of rubble", "The ruined courtyard is its own room of kind rubble: walls around it, broken floor inside."),
         (8, 6, PURPLE, "Prop + text", "Magenta = feasting table; \"cold hearth on the north wall\" lives only in the text."),
     ]},
]

# Runs are read from the run folders (out/<layout>/<run>/meta.json, judge_N.json): one zone
# per "round" in meta.json, one plate per painting, pins from the judge (or the free checks).
# NOTES adds what was seen by eye before the judge existed (its "good" list does it now),
# keyed "<layout>/<run folder>/out_N"; "id" keeps the plate ids the walk
# (presentations/overview.md) points at. Pins: (grid x, grid y, colour, title, text).
NOTES = {
    "crypt/261010-163411-v0/out_1": {"id": "p_crypt1", "pins": [
        (3, 6.5, GREEN, "A real door", "The red bar became a wooden door, turned the right way."),
        (11.5, 9.5, GREEN, "Water stays put", "The flooded corner sits exactly in its 3 × 3 squares, no walls added."),
        (8, 6.5, GREEN, "Prop from text", "A knight's effigy on a dais, on the magenta block."),
        (8, 14, GREEN, "Invented, fittingly", "Stairs in the corridor from \"steps leading up\" — detail, no geometry change."),
        (1.5, 13, GREY, "Rock outside", "Black became dark cave rock, as the legend asks."),
    ]},
    "crypt/261010-163411-v0/out_2": {"id": "p_crypt2", "intro": "Looks just as right as image 1 with a lower "
        "QA score: the score can't rank images.", "pins": [
        (3, 6.5, RED, "Door left as a red line", "The guide's red bar shows through instead of a door."),
        (8, 11, AMBER, "Door half-painted", "An arch with a red sill: the model drew the marker and a door."),
        (2, 7, GREEN, "Ossuary", "Skulls on shelves, as described."),
    ]},
    "crypt/261010-163623-high/out_1": {"id": "p_crypt3", "intro": "+2.4k thought tokens. No visible gain at 1K.", "pins": [
        (3, 6.5, RED, "Red marker again", "Doors drawn as thin red lines — door markers leak into the art."),
        (8, 11, RED, "Same at the double door", "A red strip across the corridor mouth."),
        (11.5, 9.5, GREEN, "Water with debris", "Sunken floor with floating planks, inside the hall."),
    ]},
    "keep/261010-163503-v0/out_1": {"id": "p_keep1", "pins": [
        (8, 2.4, GREEN, "Hearth from text", "\"Cold hearth on the north wall\" — placed where the text says."),
        (17, 6.5, GREEN, "Banners in the corridor", "\"Faded banners\" on both corridor walls."),
        (24.5, 8, RED, "Doors stay red", "Every door is a red bar, none became wood."),
        (30, 14.5, RED, "Wall removed", "\"Collapsed section\" made the model open the courtyard wall — the packed map still has that wall."),
        (4, 15.6, GREEN, "Light → fire pit", "The yellow dot became a burning fire pit in the kitchen."),
    ]},
    "keep/261010-163503-v0/out_2": {"id": "p_keep2", "pins": [
        (8, 6, GREEN, "Table on a rug", "The magenta prop became the feasting table, benches included."),
        (15, 13.5, GREEN, "Bunks and lockers", "Barracks furnished from one line of text."),
        (25, 12, GREEN, "Rubble room", "Fallen masonry and weeds, as the text asks."),
        (20, 11.5, RED, "Gap in the wall", "\"Collapsed\" again: the west wall of the courtyard has a hole the packed walls don't."),
        (25, 16, RED, "And in the south wall", "A second opening. Ruin text breaks walls in both draws."),
        (24.5, 8, AMBER, "Door: red with hinges", "Half door, half marker — better than run 1 image 1, still red."),
    ]},
    # runs 2 and 3 are judged (judge_N.json, with "good"): by hand only what the judge doesn't say.
    # The early notes "empty doorway" / "threshold only" were wrong — a thin rail crosses every
    # doorway, the judge caught it (2026-10-10).
    "crypt/261010-171713-doorways/out_1": {"id": "d_crypt1", "pins": [
        (8, 14, GREEN, "No red anywhere", "Nothing of the old door marker is left to leak into the art."),
    ]},
    "crypt/261010-171713-doorways/out_2": {"id": "d_crypt2"},
    "keep/261010-171818-doorways/out_1": {"id": "d_keep1"},
    "keep/261010-171818-doorways/out_2": {"id": "d_keep2", "pins": [
        (10.5, 13.5, RED, "Guide colours taken literally", "The rock gap between kitchen and barracks became a flat black bar, walls near-black."),
    ]},
    "keep/261010-173421-ruined/out_1": {"id": "r_keep1", "intro": "Highest QA score of the three — and "
        "the only one with a new exit: the score can't rank."},
    "keep/261010-173421-ruined/out_2": {"id": "r_keep2", "intro": "The test map for the table.", "pins": [
        (20, 12, GREEN, "Walls on grid lines", "The painted walls follow the grid squares, as the .dd2vtt expects (small picture with grid)."),
    ]},
    "keep/261010-173421-ruined/out_3": {"id": "r_keep3"},
}

SEVERITY = {"high": RED, "medium": AMBER, "low": GREY}
# small pictures under a plate's image, when the run folder has them (door ones only when the
# run's doors are drawn by battlemap)
SIDES = [("doors_{n}_open.jpg", "Same map, doors open"), ("doors_{n}_grid.jpg", "With battlemap's grid"),
         ("overlay_{n}.jpg", "QA overlay: our walls cyan, doorways red"), ("doorways_{n}.jpg", "Every doorway, close up"),
         ("suspects_{n}.jpg", "Pixel-check spots")]


def short(what):
    """(title, text) for a pin from a judge entry without "title" (judged before titles existed):
    the sentence up to its first break as title, the rest (or all of it) as text."""
    cut = min((what.index(c) for c in (":", ";", "(", ",") if c in what), default=len(what))
    words = what[:cut].strip(" ~").split()
    title = " ".join(words[:6]) + (" …" if len(words) > 6 else "")
    rest = what[cut + 1:].strip() if what[cut:cut + 1] == ":" else what
    return title[:1].upper() + title[1:], rest[:1].upper() + rest[1:]


def labelled(entry):
    """(title, text) of a judge issue or "good" entry."""
    return (entry["title"], entry["what"]) if entry.get("title") else short(entry["what"])


def run_plates(run, meta):
    """Plates for every painting of one run folder, from meta.json, judge_N.json and NOTES."""
    layout = run.parent.name
    cols, rows = json.loads(Path(meta.get("layout") or HERE / f"layouts/{layout}.json").read_text())["grid"]
    tag = run.name.split("-", 2)[2] if run.name.count("-") >= 2 else run.name
    out = []
    for r in meta["results"]:
        n = Path(r["file"]).stem.split("_")[-1]
        note = NOTES.get(f"{layout}/{run.name}/out_{n}", {})
        jf = run / f"judge_{n}.json"
        j = json.loads(jf.read_text()) if jf.exists() else None
        main = run / f"doors_{n}.jpg"
        if not (meta.get("draw_doors") and main.exists()):
            main = run / r["file"]
        packed = meta.get("packed") == r["file"]

        if j:
            head = f"**Judge: {j.get('verdict')} · {j.get('score')}/10.** {j.get('notes', '')}"
        else:
            head = "**Not judged**" + (" — notes by eye." if note.get("pins") else " — free checks only.")
        stats = (f"{meta.get('size', '?')}" + (f", thinking {meta['thinking']}" if meta.get("thinking") else "")
                 + f", {r.get('seconds', 0):.0f} s, QA {r.get('qa', 0):.2f}.")
        intro = " ".join(x for x in [head, note.get("intro", ""), stats,
                                     f"**Packed** as `{layout}.dd2vtt`." if packed else ""] if x)

        pins = list(note.get("pins", []))
        if j:
            pins += [(g["x"], g["y"], GREEN, *labelled(g)) for g in j.get("good", [])]
            for i in j.get("issues", []):
                title, text = labelled(i)
                pins.append((i["x"], i["y"], SEVERITY.get(i.get("severity"), AMBER), title,
                             text + (" (pixel check, confirmed)" if i.get("source") == "check" else "")))
            pins += [(c["x"], c["y"], GREY, "Check rejected", c["why"]) for c in j.get("rejected_checks", [])]
        elif not note.get("pins"):
            pins += [(i["x"], i["y"], AMBER, "Pixel check: " + ("wall looks open" if i["what"] == "opening" else i["what"]),
                      "Flagged by the free check, not confirmed — judge the run to sort it out.")
                     for i in r.get("issues", [])]

        out.append({"id": note.get("id") or f"{layout}_{run.name}_{n}".replace("-", "_"),
                    "title": f"{layout.upper()} · {tag.upper()} · IMAGE {n}" + (" · PACKED" if packed else ""),
                    "img": main, "name": f"{layout}-{run.name}-{n}.jpg", "grid": (cols, rows),
                    "width": 960 if cols / rows > 1.2 else 672, "intro": intro, "pins": pins,
                    "sides": [(run / f.format(n=n), label) for f, label in SIDES if (run / f.format(n=n)).exists()
                              and (meta.get("draw_doors") or not f.startswith("doors"))]})
    return out


def rounds():
    """Run folders grouped by meta.json "round" → [(round, [(run, meta), …])], oldest first;
    runs without a round come last, under None."""
    groups = {}
    for m in sorted(OUT.glob("*/*/meta.json")):
        meta = json.loads(m.read_text())
        groups.setdefault(meta.get("round"), []).append((m.parent, meta))
    return sorted(groups.items(), key=lambda kv: (kv[0] is None, kv[0] or 0))


def round_zone(rnd, runs):
    """One zone for a round: its question ("why"), what was found, totals, then the plates."""
    tags = list(dict.fromkeys(r.name.split("-", 2)[2] if r.name.count("-") >= 2 else r.name for r, _ in runs))
    sizes = sorted({m.get("size", "?") for _, m in runs})
    title = (f"RUN {rnd}" if rnd is not None else "UNSORTED RUNS") + f" · {' + '.join(tags).upper()} · {' + '.join(sizes)}"
    whys = list(dict.fromkeys(m["why"] for _, m in runs if m.get("why")))
    finds = list(dict.fromkeys(m["finding"] for _, m in runs if m.get("finding")))
    verdicts = [json.loads(f.read_text()).get("verdict") for r, _ in runs for f in sorted(r.glob("judge_*.json"))]
    n = sum(len(m["results"]) for _, m in runs)
    totals = (f"{n} images · ~${sum(m.get('est_cost_usd', 0) for _, m in runs):.2f}"
              + (f" · judge: {verdicts.count('use')} use, {verdicts.count('retry')} retry" if verdicts else " · not judged"))
    summary = "\n\n".join([" ".join(whys)] + [f"**Found:** {' '.join(finds)}"] * bool(finds) + [totals])
    plates = [p for r, m in sorted(runs, key=lambda rm: (rm[0].parent.name, rm[0].name)) for p in run_plates(r, m)]
    zid = f"run{rnd}" if rnd is not None else "run_new"
    return zone_of(zid, title, summary, GREEN if rnd is not None else AMBER, 0, 0, plates, 2), tags


NEXT = [
    ("On the TV", "The run-4 keep on the Android TV emulator: do fog, doors and room reveal line up with the painted walls?", BLUE),
    ("4K finals", "Both maps at 4K (~11 cents each): enough pixels per square for the table?", BLUE),
    ("Tuning grid", "Same layouts × variants: faint grid in the guide, legend as image, thinking minimal/medium/high, 1:1 vs 16:9.", BLUE),
    ("Style references", "3 reference images in one style: do maps from different layouts look like one campaign?", BLUE),
    ("Variants, same walls", "Edit a final into night, burning, flooded — the geometry must not move.", BLUE),
    ("Outdoor map", "A forest clearing with a stream (\"outdoor\": true): no rock, open edges.", BLUE),
]


# ------------------------------------------------------------------ layout


def plate(p, parent, x, y):
    """One image with numbered pins and a note per pin to its right; returns (w, h)."""
    src, iw, ih = media(p["img"], p["name"])
    w = p["width"]
    h = round(w * ih / iw)
    z = add(p["id"], "zone", x, y, 100, 100, {"title": p["title"], "titleSize": 32}, parent)
    intro_h = md_h(p["intro"], w)
    add(f"{p['id']}_intro", "markdown", PAD, 80, w, intro_h, {"md": p["intro"]}, p["id"])
    iy = 80 + intro_h + GAP
    add(f"{p['id']}_img", "image", PAD, iy, w, h, {"src": src, "label": p["title"]}, p["id"])
    cols, rows = p["grid"]
    nx = PAD + w + EDGE_GAP
    ny = iy
    pin = 44
    placed = []
    for num, (gx, gy, color, title, text) in enumerate(p["pins"], 1):
        while any(abs(gx - x) < 0.5 and abs(gy - y) < 0.5 for x, y in placed):  # same spot: step aside
            gx += 0.7 if gx < cols - 1 else -0.7
        placed.append((gx, gy))
        pid = f"{p['id']}_pin{num}"
        add(pid, "card", PAD + gx * w / cols - pin / 2, iy + gy * h / rows - pin / 2, pin, pin,
            {"title": str(num), "color": color}, p["id"])
        nh = card_h(f"{num} · {title}", text)
        nid = f"{p['id']}_n{num}"
        add(nid, "card", nx, ny, CARD_W, nh, {"title": f"{num} · {title}", "text": text, "color": color}, p["id"])
        ED.append({"id": f"e_{nid}", "from": nid, "to": pid})
        ny += nh + GAP
    # the small pictures (doors open, grid, QA overlay, check crops) in rows of 3 under the image
    sides, sy = p.get("sides", []), iy + h
    for r0 in range(0, len(sides), 3):
        row = sides[r0:r0 + 3]
        sw, rh = (w - 2 * GAP) / 3, 0
        for k, (side, label) in enumerate(row, r0):
            osrc, ow, oh = media(side, p["name"].rsplit(".", 1)[0] + f"-side{k}.jpg")
            lh = round(sw * oh / ow)
            add(f"{p['id']}_side{k}", "image", PAD + (k - r0) * (sw + GAP), sy + GAP, sw, lh,
                {"src": osrc, "label": label}, p["id"])
            rh = max(rh, lh)
        sy += GAP + rh
    z["w"] = nx + CARD_W + PAD
    z["h"] = max(sy, ny) + PAD
    return z["w"], z["h"]


def zone_of(zid, title, summary, color, x, y, items, cols):
    """A zone holding plates in a grid of `cols` columns; returns the zone."""
    z = add(zid, "zone", x, y, 100, 100, {"title": title, "color": color, "titleSize": 64})
    sh = md_h(summary, TEXT_W * 2)
    add(f"{zid}_sum", "markdown", PAD, 150, TEXT_W * 2, sh, {"md": summary, "scale": 1.4})
    EL[-1]["parent"] = zid
    cx, cy, rowh, maxw = PAD, 150 + sh * 1.4 + 48, 0, 0
    for i, p in enumerate(items):
        if i and i % cols == 0:
            cx, cy, rowh = PAD, cy + rowh + 96, 0
        w, h = plate(p, zid, cx, cy)
        rowh = max(rowh, h)
        cx += w + 96
        maxw = max(maxw, cx)
    z["w"], z["h"] = maxw - 96 + PAD, cy + rowh + PAD
    return z


JURI = OUT / "juri-dungeon"


def juri_zone(x, y):
    """Juri's printed dungeon page with the labels taken off: map and overlay side by side, then stacked."""
    z = add("juri", "zone", x, y, 100, 100, {"title": "JURI'S DUNGEON · LABELS OFF · 2K", "color": AMBER, "titleSize": 64})
    summary = ("Juri's photo of a printed dungeon page (rooms B13–B26). Nano Banana 2.1 removed the room "
               "numbers, captions, arrows, **S** (secret door) and **T** (trap) marks, and turned the four rooms "
               "behind secret doors into plain rock. The second image holds everything removed on a transparent "
               "background: a DM layer to lay over the map on demand.\n\n"
               "**Recipe:** blank the secret rooms in magenta before the call (asked to turn a room into rock, the "
               "model keeps its walls); paste only the edited spots into the original photo, so the overlay lines "
               "up to the pixel. 11 images at 2K, ~55 cents. Files: `tools/mapgen/out/juri-dungeon/`.")
    sh = md_h(summary, TEXT_W * 2)
    add("juri_sum", "markdown", PAD, 150, TEXT_W * 2, sh, {"md": summary, "scale": 1.4}, "juri")
    msrc, mw, mh = media(JURI / "dungeon-map.png", "juri-map.jpg")
    osrc, _, _ = media(JURI / "dungeon-overlay.png", "juri-overlay.png")
    w = 960
    h = round(w * mh / mw)
    y0 = 150 + sh * 1.4 + 48
    for i, (iid, src, label) in enumerate([("map", msrc, "Map for the players"),
                                           ("overlay", osrc, "Overlay: everything removed")]):
        ix = PAD + i * (w + 96)
        add(f"juri_{iid}_t", "markdown", ix, y0, w, 48, {"md": f"**{label}**", "scale": 1.4}, "juri")
        add(f"juri_{iid}", "image", ix, y0 + 80, w, h, {"src": src, "label": label}, "juri")
    y1 = y0 + 80 + h + 96
    add("juri_stack_t", "markdown", PAD, y1, w, 48, {"md": "**Overlaid: map + overlay**", "scale": 1.4}, "juri")
    # horizon's image node paints an opaque frame, so two stacked images hide each other: merge them here
    ssrc, _, _ = media(JURI / "dungeon-stacked.png", "juri-stacked.jpg")
    add("juri_stack", "image", PAD, y1 + 80, w, h, {"src": ssrc, "label": "Map with the overlay laid on top"}, "juri")
    z["w"] = PAD + 2 * w + 96 + PAD
    z["h"] = y1 + 80 + h + PAD
    return z


def main():
    (BOARD / "media").mkdir(parents=True, exist_ok=True)

    intro = (
        "# battlemap · AI map tests\n\n"
        "Every image from the **map pipeline** tests: we own the layout (walls, doors, lights), "
        "draw it as a colour-coded **guide**, and Nano Banana 2.1 only **paints** over it. The "
        "painting is packed with our walls into a `.dd2vtt` the TV already loads.\n\n"
        "**Pins** sit on the feature a note talks about (numbers match). Colours: "
        "**green** worked · **red** problem · **amber** open question or flaw · **purple** explains · "
        "**blue** planned · **grey** minor, rejected check or reference.\n\n"
        "**Built from the run folders:** one zone per round, one plate per painting; pins come "
        "from the Claude judge's scorecard (or the free pixel checks), notes by eye on the "
        "early runs. Every paint, judge and pack rebuilds the board.\n\n"
        "**State 2026-10-10:** run 1 (prompt v0): geometry held, door markers leaked red. "
        "**Run 2**: doorways stay empty, battlemap draws the doors. **Run 3**: ruins marked in "
        "the layout keep their walls; judged. Next images are the blue slots at the bottom.\n\n"
        "Source: `battlemap/docs/ai-art.md` · rebuilt by `tools/mapgen/board.py`.")
    add("intro", "markdown", 0, 0, TEXT_W, md_h(intro), {"md": intro, "color": PURPLE})

    # the pipeline as a road
    steps = [("layout", "Layout spec", "JSON on the grid: rooms, doors, lights, text per room"),
             ("guide", "Guide image", "Colour-coded, exact; drawn by our script"),
             ("model", "Nano Banana 2.1", "Repaints the guide in the campaign style"),
             ("qa", "Checks + judge", "Free pixel checks, then a Claude judge scores each painting"),
             ("pack", ".dd2vtt", "Painting + OUR walls, doors, lights"),
             ("tv", "TV", "Loads it like any Dungeondraft map")]
    py = 0
    px = TEXT_W + 160
    for i, (sid, t, txt) in enumerate(steps):
        add(f"s_{sid}", "card", px, py + i * (110 + 64), CARD_W, 110, {"title": t, "text": txt, "color": BLUE})
        if i:
            ED.append({"id": f"e_s{i}", "from": f"s_{steps[i - 1][0]}", "to": f"s_{sid}"})

    # map: left column = start + pipeline + next slots; to the right, columns of zones in
    # order — layouts, the runs by round, Juri's dungeon — each column under MAX_H tall.
    # (horizon draws nothing when "fit" zooms below ~0.11, so the board stays wide, not tall.)
    left_h = max(md_h(intro), len(steps) * 174)
    zones = [zone_of("layouts", "TEST LAYOUTS",
                     "Two hand-written layouts, chosen to cover the legend (crypt) and the real "
                     "TV-sized case (keep). Pins mark what each one tests.", PURPLE, 0, 0, LAYOUTS, 2)]
    runs = []
    for rnd, group in rounds():
        z, tags = round_zone(rnd, group)
        zones.append(z)
        runs.append((z["id"], tags))
    zones.append(juri_zone(0, 0))
    cx, cy, colw = px + CARD_W + 352, 0, 0
    for z in zones:
        if cy and cy + z["h"] > MAX_H:
            cx, cy, colw = cx + colw + 352, 0, 0
        z["x"], z["y"] = cx, cy
        cy += z["h"] + 352
        colw = max(colw, z["w"])

    nz = add("next", "zone", 0, left_h + 352, 100, 100, {"title": "NEXT IMAGES", "color": BLUE, "titleSize": 64})
    add("next_sum", "markdown", PAD, 150, CARD_W * 2 + 32, 130,
        {"md": "Slots for the images this test project makes next. A slot becomes a plate on the right when its run is done.", "scale": 1.4}, "next")
    cx, cy = PAD, 150 + 220
    for i, (t, txt, col) in enumerate(NEXT):
        if i and i % 2 == 0:
            cx, cy = PAD, cy + 260
        add(f"next_{i}", "card", cx, cy, CARD_W, 220,
            {"title": t, "text": txt, "color": col, "status": "proposed" if col == BLUE else "open"}, "next")
        cx += CARD_W + 32
    nz["w"] = PAD + 2 * (CARD_W + 32) - 32 + PAD
    nz["h"] = cy + 220 + PAD

    if runs:
        ED.append({"id": "e_lay_run", "from": "layouts", "to": runs[0][0], "label": "painted into"})
        ED.append({"id": "e_run_next", "from": runs[-1][0], "to": "next", "label": "leads to"})
    for (a, _), (b, tags) in zip(runs, runs[1:]):
        ED.append({"id": f"e_{a}_{b}", "from": a, "to": b, "label": "then: " + " + ".join(tags)})

    for i, e in enumerate(ED):  # a PUT stores edges as sent; the app needs id + props on each
        e.setdefault("id", f"e{i}")
        e.setdefault("props", {})
    body = {"meta": {"title": "battlemap · AI map tests", "style": 2,
                     "description": "Map pipeline test images: layouts, paintings with pinned notes, next slots"},
            "elements": EL, "edges": ED}
    req = urllib.request.Request(BASE + "/scene", method="PUT", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    print(json.load(urllib.request.urlopen(req)))


if __name__ == "__main__":
    main()
