#!/usr/bin/env python3
"""Builds the horizon board `battlemap-mapgen`: every image of the map-pipeline tests on one
canvas — the test layouts (guides), each painting with numbered pins on the features it shows
and a note per pin, and slots for the images still to come.

Usage: tools/mapgen/board.py            (needs the horizon server on :4643)

Re-run safe: replaces the whole scene (comments survive). New runs → add a plate to PLATES
(pins in GRID squares, so they land on the feature whatever the display size) or move a slot
from NEXT into PLATES, then re-run. Design: docs/ai-art.md.
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
CRYPT_RUN = OUT / "crypt/261010-163411-v0"
CRYPT_HIGH = OUT / "crypt/261010-163623-high"
KEEP_RUN = OUT / "keep/261010-163503-v0"
CRYPT_DW = OUT / "crypt/261010-171713-doorways"
KEEP_DW = OUT / "keep/261010-171818-doorways"
KEEP_RU = OUT / "keep/261010-173421-ruined"

# pin: (number, grid x, grid y, colour, title, text)
PLATES = [
    {"id": "g_crypt", "zone": "layouts", "title": "CRYPT · THE GUIDE", "img": OUT / "crypt/guide.png",
     "name": "crypt-guide.png", "grid": CRYPT_GRID, "width": 672,
     "intro": "**Why this layout:** small and square (16 × 16, 1:1), one room plus two side spaces, "
              "and every legend colour exactly once — the smallest map that tests the whole legend.",
     "pins": [
         (1, 3, 6.5, PURPLE, "Door on a side wall", "A gap on a vertical edge: the ossuary door (a red bar in run 1). Battlemap draws the door."),
         (2, 8, 11, PURPLE, "Double door", "Two door edges side by side: the corridor opens into the hall two squares wide; hinges at the outer ends."),
         (3, 11.5, 9.5, PURPLE, "Terrain inside a room", "Blue water marked as lying IN the hall: no walls around it. Tests the \"in\" rule."),
         (4, 8, 6.5, PURPLE, "Prop", "Magenta block = a prop described in words: \"carved sarcophagus of a knight\"."),
         (5, 5, 3.3, PURPLE, "Light sources", "Yellow dots on the north wall; the packed map also carries them as lights."),
         (6, 8, 15, PURPLE, "Corridor to the map edge", "\"Steps leading up out of the crypt\" — tests whether text adds detail without moving walls."),
     ]},
    {"id": "g_keep", "zone": "layouts", "title": "KEEP · THE GUIDE", "img": OUT / "keep/guide.png",
     "name": "keep-guide.png", "grid": KEEP_GRID, "width": 960,
     "intro": "**Why this layout:** 32 × 18 = the TV's 16:9, so it fills the table edge to edge. Six rooms "
              "sharing walls, a corridor, five doors and a rubble room — the realistic case, and only "
              "~30–50 px per square at 1K, a stress test for detail.",
     "pins": [
         (1, 14, 10.9, PURPLE, "Shared wall", "Hall, kitchen and barracks touch: walls run BETWEEN rooms, one line each, not a rock gap."),
         (2, 17, 6.9, PURPLE, "Corridor, doors at both ends", "Links hall and armory; tests two doors on one short room."),
         (3, 25, 12, PURPLE, "A room made of rubble", "The ruined courtyard is its own room of kind rubble: walls around it, broken floor inside."),
         (4, 8, 6, PURPLE, "Prop + text", "Magenta = feasting table; \"cold hearth on the north wall\" lives only in the text."),
     ]},
    {"id": "p_crypt1", "zone": "run1", "title": "CRYPT · RUN 1 · IMAGE 1", "img": CRYPT_RUN / "out_1.jpg",
     "name": "crypt-v0-1.jpg", "grid": CRYPT_GRID, "width": 672, "overlay": CRYPT_RUN / "overlay_1.jpg",
     "intro": "Prompt v0, 1K, thinking default (medium). 16 s, ~3 cents. QA score 1.11.",
     "pins": [
         (1, 3, 6.5, GREEN, "A real door", "The red bar became a wooden door, turned the right way."),
         (2, 11.5, 9.5, GREEN, "Water stays put", "The flooded corner sits exactly in its 3 × 3 squares, no walls added."),
         (3, 8, 6.5, GREEN, "Prop from text", "A knight's effigy on a dais, on the magenta block."),
         (4, 8, 14, GREEN, "Invented, fittingly", "Stairs in the corridor from \"steps leading up\" — detail, no geometry change."),
         (5, 1.5, 13, GREY, "Rock outside", "Black became dark cave rock, as the legend asks."),
     ]},
    {"id": "p_crypt2", "zone": "run1", "title": "CRYPT · RUN 1 · IMAGE 2", "img": CRYPT_RUN / "out_2.jpg",
     "name": "crypt-v0-2.jpg", "grid": CRYPT_GRID, "width": 672, "overlay": CRYPT_RUN / "overlay_2.jpg",
     "intro": "Same prompt, second draw. 30 s. QA score 0.87 — lower, yet it looks just as right: the score "
              "can't rank images yet.",
     "pins": [
         (1, 3, 6.5, RED, "Door left as a red line", "The guide's red bar shows through instead of a door."),
         (2, 8, 11, AMBER, "Door half-painted", "An arch with a red sill: the model drew the marker and a door."),
         (3, 2, 7, GREEN, "Ossuary", "Skulls on shelves, as described."),
     ]},
    {"id": "p_crypt3", "zone": "run1", "title": "CRYPT · RUN 1 · THINKING HIGH", "img": CRYPT_HIGH / "out_1.jpg",
     "name": "crypt-high-1.jpg", "grid": CRYPT_GRID, "width": 672, "overlay": CRYPT_HIGH / "overlay_1.jpg",
     "intro": "Thinking level high: +2.4k thought tokens, 29 s. No visible gain at 1K.",
     "pins": [
         (1, 3, 6.5, RED, "Red marker again", "Doors drawn as thin red lines — door markers leak into the art."),
         (2, 8, 11, RED, "Same at the double door", "A red strip across the corridor mouth."),
         (3, 11.5, 9.5, GREEN, "Water with debris", "Sunken floor with floating planks, inside the hall."),
     ]},
    {"id": "p_keep1", "zone": "run1", "title": "KEEP · RUN 1 · IMAGE 1", "img": KEEP_RUN / "out_1.jpg",
     "name": "keep-v0-1.jpg", "grid": KEEP_GRID, "width": 960, "overlay": KEEP_RUN / "overlay_1.jpg",
     "intro": "16:9 at 1K = 1376 × 768, 43 px per square. 29 s. QA score 1.12.",
     "pins": [
         (1, 8, 2.4, GREEN, "Hearth from text", "\"Cold hearth on the north wall\" — placed where the text says."),
         (2, 17, 6.5, GREEN, "Banners in the corridor", "\"Faded banners\" on both corridor walls."),
         (3, 24.5, 8, RED, "Doors stay red", "Every door is a red bar, none became wood."),
         (4, 30, 14.5, RED, "Wall removed", "\"Collapsed section\" made the model open the courtyard wall — the packed map still has that wall."),
         (5, 4, 15.6, GREEN, "Light → fire pit", "The yellow dot became a burning fire pit in the kitchen."),
     ]},
    {"id": "p_keep2", "zone": "run1", "title": "KEEP · RUN 1 · IMAGE 2", "img": KEEP_RUN / "out_2.jpg",
     "name": "keep-v0-2.jpg", "grid": KEEP_GRID, "width": 960, "overlay": KEEP_RUN / "overlay_2.jpg",
     "intro": "Second draw, 30 s, QA score 1.33 — packed as keep.dd2vtt (best score).",
     "pins": [
         (1, 8, 6, GREEN, "Table on a rug", "The magenta prop became the feasting table, benches included."),
         (2, 15, 13.5, GREEN, "Bunks and lockers", "Barracks furnished from one line of text."),
         (3, 25, 12, GREEN, "Rubble room", "Fallen masonry and weeds, as the text asks."),
         (4, 20, 11.5, RED, "Gap in the wall", "\"Collapsed\" again: the west wall of the courtyard has a hole the packed walls don't."),
         (5, 25, 16, RED, "And in the south wall", "A second opening. Ruin text breaks walls in both draws."),
         (6, 24.5, 8, AMBER, "Door: red with hinges", "Half door, half marker — better than run 1 image 1, still red."),
     ]},
    # run 2: doorways empty in the guide and prompt; battlemap draws the doors (mapgen.py doors)
    {"id": "d_crypt1", "zone": "run2", "title": "CRYPT · RUN 2 · IMAGE 1 · DOORS SHUT", "img": CRYPT_DW / "doors_1.jpg",
     "name": "crypt-dw-1.jpg", "grid": CRYPT_GRID, "width": 672,
     "side": CRYPT_DW / "doors_1_open.jpg", "side_label": "Same map, doors open",
     "intro": "Guide without red bars, prompt \"open doorways, no doors\". 29 s, ~3 cents. The brown "
              "leaves are battlemap's doors, drawn on top exactly as the TV draws them.",
     "pins": [
         (1, 3, 6.5, GREEN, "Empty doorway, door on top", "The model painted an opening; the door leaf sits in the wall line, seen from above."),
         (2, 8, 11, GREEN, "Double door", "Two leaves hinged at the outer ends; both swing south into the corridor (small picture)."),
         (3, 8, 14, GREEN, "No red anywhere", "Nothing of the old marker is left to leak into the art."),
     ]},
    {"id": "d_crypt2", "zone": "run2", "title": "CRYPT · RUN 2 · IMAGE 2", "img": CRYPT_DW / "doors_2.jpg",
     "name": "crypt-dw-2.jpg", "grid": CRYPT_GRID, "width": 672, "overlay": CRYPT_DW / "overlay_2.jpg",
     "intro": "Second draw, 29 s. Same result: open doorways, battlemap's doors drawn on.",
     "pins": [
         (1, 8, 11, GREEN, "Threshold only", "A thin stone sill across the corridor mouth — the prompt allows it, it reads as a doorway."),
         (2, 11.5, 9.5, GREEN, "Water with stones", "Flooded corner in its 3 × 3 squares."),
     ]},
    {"id": "d_keep1", "zone": "run2", "title": "KEEP · RUN 2 · IMAGE 1", "img": KEEP_DW / "doors_1.jpg",
     "name": "keep-dw-1.jpg", "grid": KEEP_GRID, "width": 960,
     "side": KEEP_DW / "doors_1_open.jpg", "side_label": "Same map, doors open",
     "intro": "16:9, 31 s. All five doors drawn by battlemap; packed as keep.dd2vtt with draw_doors.",
     "pins": [
         (1, 14, 7, GREEN, "Corridor doors", "Both ends of the corridor: openings in the art, leaves on top."),
         (2, 24.5, 8, GREEN, "Was red in run 1", "The armory door that stayed a red bar is now a clean doorway."),
         (3, 28, 12, RED, "Ruin still opens walls", "\"Ruin\" text breaks the courtyard walls again — next step: ruins in the layout."),
     ]},
    {"id": "d_keep2", "zone": "run2", "title": "KEEP · RUN 2 · IMAGE 2", "img": KEEP_DW / "doors_2.jpg",
     "name": "keep-dw-2.jpg", "grid": KEEP_GRID, "width": 960, "overlay": KEEP_DW / "overlay_2.jpg",
     "intro": "Second draw, 32 s.",
     "pins": [
         (1, 10.5, 13.5, RED, "Guide colours taken literally", "The rock gap between kitchen and barracks became a flat black bar, walls near-black."),
         (2, 6, 10.5, GREEN, "Kitchen doorway", "Open gap, door drawn on top."),
     ]},
    # run 3: the courtyard marked "ruined": true in the layout, no ruin words in the text
    {"id": "r_keep2", "zone": "run3", "title": "KEEP · RUN 3 · IMAGE 2 · WITH GRID", "img": KEEP_RU / "doors_2_grid.jpg",
     "name": "keep-ru-2-grid.jpg", "grid": KEEP_GRID, "width": 960,
     "side": KEEP_RU / "doors_2.jpg", "side_label": "Without the grid",
     "intro": "The test map: packed as keep.dd2vtt. Battlemap's grid on top (white) to check the fit; "
              "doors drawn by battlemap.",
     "pins": [
         (1, 25, 12, GREEN, "Ruin inside, walls whole", "Rubble, broken flagstones and weeds — every courtyard wall stands."),
         (2, 20, 12, GREEN, "Walls on grid lines", "The painted walls follow the grid squares, as the .dd2vtt expects."),
     ]},
    {"id": "r_keep1", "zone": "run3", "title": "KEEP · RUN 3 · IMAGE 1", "img": KEEP_RU / "doors_1.jpg",
     "name": "keep-ru-1.jpg", "grid": KEEP_GRID, "width": 960, "overlay": KEEP_RU / "overlay_1.jpg",
     "intro": "31 s. Highest QA score of the three (1.11) — and the only one with a new opening: "
              "the score still can't rank.",
     "pins": [
         (1, 24.7, 16.6, RED, "Invented exit", "A path through the south wall to the map edge — not in the layout. A new failure, not ruin text."),
         (2, 25, 12, GREEN, "Courtyard walls stand", "The ruin stays inside."),
     ]},
    {"id": "r_keep3", "zone": "run3", "title": "KEEP · RUN 3 · IMAGE 3", "img": KEEP_RU / "doors_3.jpg",
     "name": "keep-ru-3.jpg", "grid": KEEP_GRID, "width": 960, "overlay": KEEP_RU / "overlay_3.jpg",
     "intro": "20 s. Walls whole everywhere.",
     "pins": [
         (1, 25, 12, GREEN, "Ruin inside, walls whole", "Cracked floor and fallen blocks, no gaps."),
         (2, 8, 2.3, AMBER, "Light marker leaks", "The yellow guide dot shows on the hearth instead of a brazier."),
     ]},
]

NEXT = [
    ("On the TV", "The packed crypt on the Android TV emulator: do fog, doors and room reveal line up with the painted walls?", BLUE),
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
    for num, gx, gy, color, title, text in p["pins"]:
        pid = f"{p['id']}_pin{num}"
        add(pid, "card", PAD + gx * w / cols - pin / 2, iy + gy * h / rows - pin / 2, pin, pin,
            {"title": str(num), "color": color}, p["id"])
        nh = card_h(f"{num} · {title}", text)
        nid = f"{p['id']}_n{num}"
        add(nid, "card", nx, ny, CARD_W, nh, {"title": f"{num} · {title}", "text": text, "color": color}, p["id"])
        ED.append({"id": f"e_{nid}", "from": nid, "to": pid})
        ny += nh + GAP
    if p.get("overlay") or p.get("side"):
        side = p.get("side") or p["overlay"]
        osrc, ow, oh = media(side, p["name"].rsplit(".", 1)[0] + ("-side.jpg" if p.get("side") else "-overlay.jpg"))
        lh = round(CARD_W * oh / ow)
        add(f"{p['id']}_ovl", "image", nx, ny + GAP, CARD_W, lh,
            {"src": osrc, "label": p.get("side_label", "QA overlay: our walls cyan, doors red")}, p["id"])
        ny += GAP + lh + GAP
    z["w"] = nx + CARD_W + PAD
    z["h"] = max(iy + h, ny) + PAD
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
        "**green** worked · **red** problem · **amber** open question · **purple** explains · "
        "**blue** planned · **grey** reference.\n\n"
        "**State 2026-10-10:** run 1 done (prompt v0, 1K, 6 images, ~20 cents). Geometry held; "
        "door markers leak red into the art. **Run 2** (right): doorways stay empty, battlemap "
        "draws the doors — no red left. **Run 3**: ruins marked in the layout keep their walls. "
        "Next images are the blue slots at the bottom.\n\n"
        "Source: `battlemap/docs/ai-art.md` · rebuilt by `tools/mapgen/board.py`.")
    add("intro", "markdown", 0, 0, TEXT_W, md_h(intro), {"md": intro, "color": PURPLE})

    # the pipeline as a road
    steps = [("layout", "Layout spec", "JSON on the grid: rooms, doors, lights, text per room"),
             ("guide", "Guide image", "Colour-coded, exact; drawn by our script"),
             ("model", "Nano Banana 2.1", "Repaints the guide in the campaign style"),
             ("qa", "QA overlay", "Our walls over the painting; retry on drift"),
             ("pack", ".dd2vtt", "Painting + OUR walls, doors, lights"),
             ("tv", "TV", "Loads it like any Dungeondraft map")]
    py = 0
    px = TEXT_W + 160
    for i, (sid, t, txt) in enumerate(steps):
        add(f"s_{sid}", "card", px, py + i * (110 + 64), CARD_W, 110, {"title": t, "text": txt, "color": BLUE})
        if i:
            ED.append({"id": f"e_s{i}", "from": f"s_{steps[i - 1][0]}", "to": f"s_{sid}"})

    # map: left column = start + pipeline + next slots; right column = layouts above run 1.
    # (Keep the board under ~6,500 tall: horizon draws nothing when "fit" zooms below ~0.11.)
    left_h = max(md_h(intro), len(steps) * 174)
    rx = px + CARD_W + 352
    lay = zone_of("layouts", "TEST LAYOUTS",
                  "Two hand-written layouts, chosen to cover the legend (crypt) and the real "
                  "TV-sized case (keep). Pins mark what each one tests.", PURPLE, rx, 0,
                  [p for p in PLATES if p["zone"] == "layouts"], 2)
    run = zone_of("run1", "RUN 1 · PROMPT V0 · 1K",
                  "Five paintings from the two guides. Walls landed on the layout every time; "
                  "the problems are door markers showing through and text that overrides a wall.",
                  GREEN, rx, lay["h"] + 352, [p for p in PLATES if p["zone"] == "run1"], 2)

    rx2 = rx + max(lay["w"], run["w"]) + 352
    r2 = zone_of("run2", "RUN 2 · DOORWAYS · 1K",
            "Doors are no longer painted: the guide leaves a gap, the prompt asks for empty doorways, "
            "and battlemap draws a top-down door that swings open on the phone's tap. Shown here "
            "with the doors drawn on the way the TV draws them.",
            GREEN, rx2, 0, [p for p in PLATES if p["zone"] == "run2"], 2)
    r3 = zone_of("run3", "RUN 3 · RUINS IN THE LAYOUT · 1K",
            "The courtyard is marked \"ruined\": true in the layout; the text has no ruin words and the "
            "prompt says every wall stays whole. Run 1 broke the courtyard walls in both draws; now "
            "all three keep them. One draw invented an exit instead.",
            GREEN, rx2, r2["h"] + 352, [p for p in PLATES if p["zone"] == "run3"], 2)

    juri_zone(rx2 + max(r2["w"], r3["w"]) + 352, 0)

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

    ED.append({"id": "e_lay_run", "from": "layouts", "to": "run1", "label": "painted into"})
    ED.append({"id": "e_run_next", "from": "run1", "to": "next", "label": "leads to"})
    ED.append({"id": "e_run1_run2", "from": "run1", "to": "run2", "label": "doors fixed in"})
    ED.append({"id": "e_run2_run3", "from": "run2", "to": "run3", "label": "ruins fixed in"})

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
