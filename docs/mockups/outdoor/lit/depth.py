#!/usr/bin/env python3
"""Depth Anything V2 Small over pictures: one 16-bit grey PNG per input (white = near / high).

    ~/.local/share/battlemap/depth-venv/bin/python depth.py OUT_DIR IMAGE [IMAGE …]

The light lab (prepare_lit.py) reads these as one of its height sources. The model was trained
on photographs, not on maps seen straight down, so its big shapes are a guess (it tends to read
"top of the picture = far away"); what it gets right is local relief — a stone stands up from
the grass, a leaf clump bulges out of its crevice. The lab keeps only that (a high-pass).
Pictures on a magenta key are given a grey background first, so the key isn't read as a wall.
Runs on the Mac's GPU (MPS) when there is one; the model (~100 MB) is cached by Hugging Face.
"""
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi
import torch
from PIL import Image
from transformers import pipeline


def main(out, files):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf", device=dev)
    for f in files:
        img = Image.open(f).convert("RGB")
        a = np.asarray(img).astype(int)
        key = (a[..., 0] > 200) & (a[..., 1] < 80) & (a[..., 2] > 200)
        if key.mean() > 0.05:
            a[key] = 96
            img = Image.fromarray(a.astype(np.uint8))
        # the model works at ~518 px on the short side; a big map is cut into overlapping tiles
        d = run(pipe, img)
        d = (d - d.min()) / max(1e-6, d.max() - d.min())
        Image.fromarray((d * 65535).astype(np.uint16)).save(out / (Path(f).stem + "_depth.png"))
        print(out / (Path(f).stem + "_depth.png"))


def run(pipe, img, tile=768, over=128):
    """Depth at the picture's own size. A big picture goes in overlapping tiles, each high-passed
    on its own (the tiles disagree about the slope of the whole), blended with ramps — so for a big
    picture only local relief comes back, which is all the lab uses."""
    W, H = img.size
    if max(W, H) <= 1100:
        return np.asarray(pipe(img)["depth"].resize((W, H), Image.BICUBIC), float)
    acc, wsum = np.zeros((H, W)), np.zeros((H, W))
    step = tile - over
    for y in range(0, max(1, H - over), step):
        for x in range(0, max(1, W - over), step):
            x0, y0 = min(x, W - tile), min(y, H - tile)
            crop = img.crop((x0, y0, x0 + tile, y0 + tile))
            d = np.asarray(pipe(crop)["depth"].resize((tile, tile), Image.BICUBIC), float)
            d = d - ndi.gaussian_filter(d, tile / 24)       # keep local relief only: tiles disagree on slope
            d = d / (d.std() + 1e-6)
            ramp = np.minimum(1, np.minimum.outer(np.minimum(np.arange(tile), np.arange(tile)[::-1]),
                                                 np.minimum(np.arange(tile), np.arange(tile)[::-1])) / over + 0.05)
            acc[y0:y0 + tile, x0:x0 + tile] += d * ramp
            wsum[y0:y0 + tile, x0:x0 + tile] += ramp
    return acc / np.maximum(wsum, 1e-6)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
