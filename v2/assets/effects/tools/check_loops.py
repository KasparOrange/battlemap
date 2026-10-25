"""Check that looping sheets loop cleanly: the jump from the last frame back to the first should
look like any other step. Prints effects whose seam is much bigger than their typical step.

Usage: python3 -I check_loops.py [ratio=2.5]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

EFFECTS = Path(__file__).resolve().parent.parent


def frames(m: dict, d: Path) -> list[np.ndarray]:
    s = m["sheet"]
    atlases = [Image.open(d / a["file"]).convert("RGBA") for a in s["atlases"]]
    out = []
    for ai, x, y in s["frames"]:
        f = atlases[ai].crop((x, y, x + s["frameW"], y + s["frameH"])).reduce(2)
        a = np.asarray(f, np.float32) / 255
        out.append(a[..., :3] * a[..., 3:4])      # premultiplied: what is actually seen
    return out


def main(ratio: float):
    index = json.loads((EFFECTS / "index.json").read_text())
    bad = 0
    for r in index["effects"]:
        d = EFFECTS / r["id"]
        m = json.loads((d / "effect.json").read_text())
        s = m.get("sheet")
        if not s or not s.get("loop") or len(s["frames"]) < 3:
            continue
        fr = frames(m, d)
        steps = [float(np.abs(fr[i + 1] - fr[i]).mean()) for i in range(len(fr) - 1)]
        seam = float(np.abs(fr[0] - fr[-1]).mean())
        typical = float(np.median(steps)) or 1e-6
        flag = seam > ratio * typical
        bad += flag
        if flag:
            print(f"{r['id']:28s} seam {seam:.4f}  typical step {typical:.4f}  ×{seam / typical:.1f}")
    print(f"{bad} loops with a visible seam (> ×{ratio})")


if __name__ == "__main__":
    main(float(sys.argv[1]) if len(sys.argv) > 1 else 2.5)
