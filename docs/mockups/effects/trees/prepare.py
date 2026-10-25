#!/usr/bin/env python3
"""The tree demos' assets, from image-generation-engine's `tree-crowns` project.

    python3 prepare.py [~/Pictures/ige/tree-crowns]

Per tree: the keyed still (WebP, longest side 512), the video sprite sheet (copied), and for the
clumpy crowns a clump label map (PNG, one grey value per clump) + its JSON. Writes trees.json,
the index the demo pages read. Clumps: bright cores of the painted leaf clusters as seeds, a
marker watershed along the painting's dark crevices, kept near each core."""
import heapq, json, os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.environ.get("IGE_HOME", os.path.expanduser("~/code/image-generation-engine")))
from ige import sprite  # noqa: E402

# name, picture node, sheet node, cut into clumps (only crowns made of round leaf clusters)
TREES = [("oak", 2, 9, True), ("pine", 12, 29, False), ("birch", 14, 26, True),
         ("maple", 17, 28, True), ("dead", 19, 27, False)]
SIDE = 512
HERE = os.path.dirname(os.path.abspath(__file__))


def keyed_still(path):
    img = Image.open(path).convert("RGB")
    rgba, _ = sprite.key_frame(img, sprite.border_colour(img))
    a = np.asarray(rgba)[..., 3]
    ys, xs = np.nonzero(a > 8)
    pad = 6
    rgba = rgba.crop((max(0, xs.min() - pad), max(0, ys.min() - pad),
                      min(img.width, xs.max() + pad + 1), min(img.height, ys.max() + pad + 1)))
    s = SIDE / max(rgba.size)
    return rgba.resize((round(rgba.width * s), round(rgba.height * s)), Image.LANCZOS)


def flood(cost, markers, mask):
    """Meyer's marker watershed (scipy's watershed_ift lets one marker take a whole plateau)."""
    h, w = cost.shape
    lab = markers.astype(int).copy()
    heap, k = [], 0
    for y, x in zip(*np.nonzero(lab)):
        heapq.heappush(heap, (int(cost[y, x]), k, y, x)); k += 1
    while heap:
        c, _, y, x = heapq.heappop(heap)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and lab[yy, xx] == 0 and mask[yy, xx]:
                lab[yy, xx] = lab[y, x]
                heapq.heappush(heap, (max(c, int(cost[yy, xx])), k, yy, xx)); k += 1
    return lab


def clumps(rgba):
    A = np.asarray(rgba, float) / 255
    alpha, lum = A[..., 3], A[..., :3] @ [0.3, 0.59, 0.11]
    n = max(rgba.size)
    fill = np.where(alpha > 0.5, lum, lum[alpha > 0.5].mean())
    # a clump's core = brighter than its neighbourhood (so shaded clumps count too)
    dome = ndi.gaussian_filter(fill, n / 64) - ndi.gaussian_filter(fill, n / 13)
    R = n / 13
    inner = ndi.binary_erosion(alpha > 0.5, iterations=int(R / 4))
    peaks = (dome == ndi.maximum_filter(dome, size=int(R))) & inner & (dome > 0)
    markers, _ = ndi.label(peaks)
    fine = ndi.gaussian_filter(fill, 1.5) - ndi.gaussian_filter(fill, n / 13)
    crevice = np.clip(0.5 - fine * 2.4, 0, 1)
    near = np.minimum(ndi.distance_transform_edt(~peaks) / R / 1.6, 1)
    cost = np.clip(255 * (0.55 * crevice + 0.45 * near), 0, 255).astype(np.uint8)
    lab = flood(cost, markers, alpha > 0.05)
    lab[alpha < 0.05] = 0
    ids = [i for i in np.unique(lab) if i]
    remap = np.zeros(lab.max() + 1, int)
    for k, i in enumerate(ids):
        remap[i] = k + 1
    lab = remap[lab]
    cy, cx = ndi.center_of_mass(alpha)
    parts = []
    for k in range(1, len(ids) + 1):
        py, px = ndi.center_of_mass(lab == k)
        parts.append({"id": k, "cx": round(px, 1), "cy": round(py, 1)})
    return lab, parts


def main(project):
    graph = json.load(open(os.path.join(project, "graph.json")))["nodes"]
    index = []
    for name, pic, sheet, cut in TREES:
        still = keyed_still(os.path.join(project, graph[str(pic)]["file"]))
        still.save(os.path.join(HERE, f"{name}-still.webp"), quality=92, alpha_quality=100, exact=True, method=6)
        a = np.asarray(still)[..., 3].astype(float)
        cy, cx = ndi.center_of_mass(a)
        s = graph[str(sheet)]
        shutil.copy(os.path.join(project, s["file"]), os.path.join(HERE, f"{name}-sheet.webp"))
        entry = {"name": name, "still": f"{name}-still.webp", "w": still.width, "h": still.height,
                 "centre": [round(cx, 1), round(cy, 1)], "still_gpu": still.width * still.height * 4,
                 "sheet": {"file": f"{name}-sheet.webp", "fw": s["frame_w"], "fh": s["frame_h"], "cols": s["cols"],
                           "frames": s["frames"], "fps": s["fps"], "gpu": s["grade"]["gpu_bytes"]},
                 "nodes": {"picture": pic, "sheet": sheet}}
        if cut:
            lab, parts = clumps(still)
            Image.fromarray(lab.astype(np.uint8), "L").save(os.path.join(HERE, f"{name}-parts.png"))
            entry["parts"] = {"file": f"{name}-parts.png", "list": parts}
        index.append(entry)
        print(name, still.size, len(entry.get("parts", {}).get("list", [])), "clumps")
    json.dump(index, open(os.path.join(HERE, "trees.json"), "w"), indent=1)


if __name__ == "__main__":
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Pictures/ige/tree-crowns"))
