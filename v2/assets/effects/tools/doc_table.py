"""Rewrite the catalogue table in v2/docs/effects.md from index.json + the manifests, so the doc
always matches what ships. Replaces the text between `<!-- catalogue:start -->` and
`<!-- catalogue:end -->`.

Usage: python3 -I doc_table.py
"""
import json
from pathlib import Path

EFFECTS = Path(__file__).resolve().parent.parent
DOC = EFFECTS.parent.parent / "docs" / "effects.md"
ORDER = ["global", "regional", "point", "aura", "map-loop"]
SHORT = {"CC BY-NC-SA 4.0": "BY-NC-SA", "CC0 1.0": "CC0", "CC BY 3.0": "BY 3.0",
         "Lottie Simple License": "Lottie SL", "Own work (repo licence)": "own",
         "Own work (generated)": "own (Gemini)"}


def row(r: dict) -> str:
    m = json.loads((EFFECTS / r["manifest"]).read_text())
    sheet = m.get("sheet")
    if m["technique"] == "sheet":
        frames = f"{len(sheet['frames'])} @ {sheet['fps']:g} fps{' loop' if sheet['loop'] else ''}"
    elif m["technique"] in ("set", "layers"):
        frames = f"{len(sheet['frames'])} {'variants' if m['technique'] == 'set' else 'layers'}"
    elif m["technique"] == "particles":
        frames = f"{len(m['particles']['textures'])} tex"
    elif m["technique"] == "shader":
        frames = m["shader"]["fragment"].split("/")[-1]
    elif m["technique"] == "composite":
        frames = " + ".join(p["id"] for p in m["parts"][:3]) + ("…" if len(m["parts"]) > 3 else "")
    else:
        frames = "1 tex + motion"
    size = f"{m['size']['w']:.1f}×{m['size']['h']:.1f}" if m.get("size") else "map"
    kb = r["bytes"] / 1024
    gpu = m.get("gpuBytes", 0) / 1e6
    return (f"| `{m['id']}` | {m['name']} | {m['technique']} | {frames} | {size} | {m['blend']} | "
            f"{kb:.0f} KB / {gpu:.1f} MB | {SHORT.get(m['licence']['id'], m['licence']['id'])} |")


def main():
    index = json.loads((EFFECTS / "index.json").read_text())
    lines = []
    for cat in ORDER:
        rows = [r for r in index["effects"] if r["category"] == cat]
        if not rows:
            continue
        lines += [f"### {cat} ({len(rows)})", "",
                  "| id | name | technique | frames | size (squares) | blend | disk / GPU | licence |",
                  "|---|---|---|---|---|---|---|---|"]
        lines += [row(r) for r in rows]
        lines.append("")
    text = DOC.read_text()
    a, b = text.index("<!-- catalogue:start -->"), text.index("<!-- catalogue:end -->")
    DOC.write_text(text[:a] + "<!-- catalogue:start -->\n\n" + "\n".join(lines) + "\n" + text[b:])
    print(f"{DOC}: {index['count']} effects")


if __name__ == "__main__":
    main()
