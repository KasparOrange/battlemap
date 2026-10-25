"""Contact sheet: many pictures (or one frame of each animated GIF/WebP) in one labelled grid,
so a person (or Claude) can look at a whole batch at once.

Usage: python3 -I contact_sheet.py OUT.png CELL_PX FILE... [--frame 0.5] [--cols 10]
  --frame  where in an animation to take the frame (0 = first, 0.5 = middle)
  --cols   columns of the grid
Labels are the file names without extension. Transparent pictures sit on a checker-free dark
grey so glows and dark smoke both show.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageSequence


def frame_of(path: Path, where: float) -> Image.Image:
    """One frame of `path` as RGBA; `where` 0..1 picks it inside an animation."""
    im = Image.open(path)
    n = getattr(im, "n_frames", 1)
    if n > 1:
        im.seek(min(n - 1, int(where * n)))
    return im.convert("RGBA")


def main(argv):
    out, cell, *rest = argv
    cell = int(cell)
    where, cols, files = 0.5, 10, []
    it = iter(rest)
    for a in it:
        if a == "--frame":
            where = float(next(it))
        elif a == "--cols":
            cols = int(next(it))
        else:
            files.append(Path(a))
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 14)), (38, 38, 42))
    draw = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        x, y = (i % cols) * cell, (i // cols) * (cell + 14)
        try:
            im = frame_of(f, where)
        except Exception as e:  # a broken download should not stop the sheet
            draw.text((x + 4, y + 4), f"bad: {e}"[:30], fill=(255, 80, 80))
            continue
        im.thumbnail((cell - 4, cell - 4))
        bg = Image.new("RGBA", im.size, (38, 38, 42, 255))
        bg.alpha_composite(im)
        sheet.paste(bg.convert("RGB"), (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        draw.text((x + 3, y + cell), f.stem[:24], fill=(220, 220, 220))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main(sys.argv[1:])
