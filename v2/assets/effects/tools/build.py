"""Build the effects library: raw downloads (v2/assets-src/) → runtime effects (v2/assets/effects/).

Run (from anywhere; Python isolated, a venv with Pillow + numpy):
    python -I build.py                 # every effect in catalog.toml
    python -I build.py fireball web    # only these ids (index.json is still rewritten)

What it does per effect (catalog.toml `[[effect]]`):
- technique "sheet": decode the source (a VP8/VP9 webm with alpha, a flipbook grid, a folder of
  frames), pick 16–48 frames evenly over the clip (loops stay seamless: frame N wraps to 0),
  apply colour ops (unblack, lum-alpha, gradient map, chroma key), trim the empty border shared by
  all frames, scale to ~56 px per map square (never above 512 px a side), pack into one (rarely
  two) WebP atlases ≤ 2048 px, and write `effect.json` with the frame rects.
- technique "texture": one picture (plus colour ops), trimmed and scaled, and a motion recipe
  (rotate, pulse, scroll, grow) that the runtime applies — no frames at all.
- technique "particles": small sprite textures plus emitter parameters.
- technique "shader": a GLSL fragment from shaders/ plus its uniforms (and optional textures).
Then `index.json` lists every effect, and each effect gets a 128 px `thumb.webp`.

Downloads are untrusted data: this script only reads pictures/videos from them (Pillow, ffmpeg)
and never runs anything that came with them.
"""
import json
import math
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
EFFECTS = HERE.parent                      # v2/assets/effects
SRC = EFFECTS.parent.parent / "assets-src"  # v2/assets-src
CACHE = SRC / ".cache"

ATLAS_MAX = 2048        # px per atlas side (the TV box handles 4096; 2048 keeps memory sane)
FRAME_MAX = 512         # px per frame side
PX_PER_SQUARE = 56      # 1080p render of the 34 × 19 table ≈ 56 px per square
PX_PER_SQUARE_MIN = 40  # how far we shrink before dropping frames
GPU_MB_LOOP = 6         # a placed loop may stay on the table all evening (shared 32 MB fx budget)
GPU_MB_ONCE = 12        # a one-shot lives for seconds, then its texture is released
WEBP_Q = 80
ALPHA_Q = 90
THUMB = 128


# ------------------------------------------------------------------ loading frames
def decode_video(path: Path) -> tuple[list[Path], float]:
    """Every frame of a webm as RGBA PNGs in the cache (libvpx keeps the alpha plane).
    Returns (frame paths, source fps)."""
    out = CACHE / "video" / path.parent.name / path.stem
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=codec_name,r_frame_rate", "-of", "csv=p=0", str(path)],
                           capture_output=True, text=True, check=True).stdout.strip().split(",")
    codec, rate = probe[0], probe[1]
    num, den = (int(x) for x in rate.split("/"))
    fps = num / den
    if not (out / "done").exists():
        out.mkdir(parents=True, exist_ok=True)
        dec = {"vp8": "libvpx", "vp9": "libvpx-vp9"}.get(codec)
        cmd = ["ffmpeg", "-v", "error", "-y"] + (["-c:v", dec] if dec else []) + \
              ["-i", str(path), "-pix_fmt", "rgba", str(out / "%04d.png")]
        subprocess.run(cmd, check=True)
        (out / "done").write_text("ok")
    return sorted(out.glob("*.png")), fps


def split_flipbook(path: Path, cols: int, rows: int, count: int | None) -> list[Image.Image]:
    """A flipbook sheet (row-major grid) → its frames as RGBA images."""
    sheet = Image.open(path)
    sheet = sheet.convert("RGBA") if sheet.mode != "RGBA" else sheet
    fw, fh = sheet.width // cols, sheet.height // rows
    frames = []
    for r in range(rows):
        for c in range(cols):
            frames.append(sheet.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)))
    return frames[:count] if count else frames


def load_source(fx: dict, src: dict):
    """→ (list of frame loaders, source fps). A loader is a zero-arg function returning RGBA,
    so a 120-frame 1200 px video is not held in memory all at once."""
    base = SRC / src["dir"]
    kind = fx.get("input", src.get("input", "video"))
    if kind == "video":
        paths, fps = decode_video(base / fx["file"])
        return [lambda p=p: Image.open(p).convert("RGBA") for p in paths], fps
    if kind == "flipbook":
        frames = split_flipbook(base / fx["file"], *fx["grid"], fx.get("count"))
        return [lambda f=f: f for f in frames], fx.get("source_fps", 30)
    if kind == "frames":
        paths = sorted((base / fx["file"]).glob("*.png"))
        return [lambda p=p: Image.open(p).convert("RGBA") for p in paths], fx.get("source_fps", 30)
    if kind == "image":
        return [lambda: Image.open(base / fx["file"]).convert("RGBA")], 0
    raise ValueError(f"{fx['id']}: unknown input {kind}")


def pick_indices(total: int, n: int, loop: bool, first: int = 0, last: int | None = None) -> list[int]:
    """n frame indices spread evenly over [first, last). A loop leaves out the end so the last
    picked frame steps into the first like every other step; a one-shot keeps both ends."""
    last = total if last is None else last
    span = last - first
    if n >= span:
        return list(range(first, last))
    if loop:
        return [first + int(i * span / n) for i in range(n)]
    return [first + round(i * (span - 1) / (n - 1)) for i in range(n)]


# ------------------------------------------------------------------ colour operations
def op_unblack(im: Image.Image, _arg=None) -> Image.Image:
    """Colour on black (an additive render) → straight alpha: a = max channel, rgb = c / a.
    Looks the same with normal blending as the original did with additive blending."""
    a = np.asarray(im, np.float32) / 255
    rgb = a[..., :3] * a[..., 3:4]
    alpha = rgb.max(axis=-1, keepdims=True)
    col = np.where(alpha > 1e-3, rgb / np.maximum(alpha, 1e-3), 0)
    return Image.fromarray((np.dstack([col, alpha]) * 255 + 0.5).astype(np.uint8), "RGBA")


def op_lum_alpha(im: Image.Image, _arg=None) -> Image.Image:
    """Grey mask on black → white with alpha = brightness (tint it at runtime)."""
    a = np.asarray(im, np.float32) / 255
    lum = (a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)) * a[..., 3]
    out = np.dstack([np.ones_like(a[..., :3]), lum[..., None]])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def op_gradient(im: Image.Image, stops) -> Image.Image:
    """Temperature/brightness map → colours: `stops` = [[t, "#rrggbb", alpha], …], t 0..1.
    Brightness picks the colour and the alpha from the ramp (an existing alpha multiplies)."""
    a = np.asarray(im, np.float32) / 255
    t = a[..., :3].max(axis=-1)
    ts = np.array([s[0] for s in stops], np.float32)
    cols = np.array([[int(s[1][i:i + 2], 16) / 255 for i in (1, 3, 5)] for s in stops], np.float32)
    als = np.array([s[2] for s in stops], np.float32)
    out = np.zeros(a.shape, np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, ts, cols[:, c])
    out[..., 3] = np.interp(t, ts, als) * a[..., 3]
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def op_key(im: Image.Image, colour) -> Image.Image:
    """Chroma key (flat painted background) with the image engine's keyer: soft edges, the key
    un-mixed from them, spill pulled out."""
    sys.path.insert(0, str(Path.home() / "code/image-generation-engine"))
    from ige.sprite import KEYS, key_frame  # noqa: E402  (a sibling project, not a download)
    rgb = KEYS[colour] if isinstance(colour, str) else tuple(colour)
    keyed, _ = key_frame(im.convert("RGB"), rgb)
    return despill(keyed, colour)


def despill(im: Image.Image, colour) -> Image.Image:
    """Take the key's colour cast out of soft edges for good: on a magenta key no pixel may be
    more red-and-blue than green (min(R, B) ≤ G), on green no pixel greener than its other
    channels, on blue no pixel bluer. Subjects far from the key are untouched."""
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if colour == "magenta":
        excess = np.maximum(np.minimum(r, b) - g, 0)
        a[..., 0] -= excess
        a[..., 2] -= excess
    elif colour == "green":
        a[..., 1] = np.minimum(g, np.maximum(r, b))
    elif colour == "blue":
        a[..., 2] = np.minimum(b, np.maximum(r, g))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def op_alpha_gamma(im: Image.Image, g) -> Image.Image:
    """alpha ** g — g > 1 thins faint haze, g < 1 thickens it."""
    a = np.asarray(im).copy()
    a[..., 3] = (255 * (a[..., 3] / 255.0) ** float(g) + 0.5).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def op_alpha_scale(im: Image.Image, k) -> Image.Image:
    """alpha × k (clamped) — for sources that are too faint or too opaque on a map."""
    a = np.asarray(im).astype(np.float32)
    a[..., 3] = np.clip(a[..., 3] * float(k), 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def op_desaturate(im: Image.Image, k) -> Image.Image:
    """Pull colour toward grey by k (1 = grey) — makes a source tintable."""
    a = np.asarray(im).astype(np.float32)
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    a[..., :3] = a[..., :3] * (1 - float(k)) + lum[..., None] * float(k)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def op_radial_fade(im: Image.Image, inner) -> Image.Image:
    """Fade alpha to 0 toward the frame edge (from `inner` × radius) — hides square cut-offs."""
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    y, x = np.mgrid[0:h, 0:w]
    r = np.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) * 2
    f = np.clip((1 - r) / max(1e-3, 1 - float(inner)), 0, 1)
    a[..., 3] *= f * f * (3 - 2 * f)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def op_edge_fade(im: Image.Image, frac) -> Image.Image:
    """Fade alpha to 0 over the outer `frac` of each side — for sources whose content is cut at
    their own frame border (Unity's small flames sway out of their 128 px cells)."""
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    fx = np.clip(np.minimum(np.arange(w) + 0.5, w - np.arange(w) - 0.5) / (frac * w), 0, 1)
    fy = np.clip(np.minimum(np.arange(h) + 0.5, h - np.arange(h) - 0.5) / (frac * h), 0, 1)
    m = np.outer(fy, fx)
    a[..., 3] *= m * m * (3 - 2 * m)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


OPS = {"edge_fade": op_edge_fade, "unblack": op_unblack, "lum_alpha": op_lum_alpha, "gradient": op_gradient, "key": op_key,
       "alpha_gamma": op_alpha_gamma, "alpha_scale": op_alpha_scale, "desaturate": op_desaturate,
       "radial_fade": op_radial_fade}


def apply_ops(im: Image.Image, ops) -> Image.Image:
    """Run the catalog's colour ops in order. Each op is "name" or ["name", argument]."""
    for op in ops or []:
        name, arg = (op, None) if isinstance(op, str) else (op[0], op[1])
        im = OPS[name](im, arg)
    a = np.asarray(im).copy()
    a[a[..., 3] < 4] = 0          # codec noise in the alpha plane → clean zero
    return Image.fromarray(a, "RGBA")


# ------------------------------------------------------------------ trim, size, pack
def union_box(frames: list[Image.Image], margin=2):
    """The smallest box holding every frame's visible pixels, plus a transparent margin."""
    box = None
    for f in frames:
        b = f.getchannel("A").point(lambda v: 255 if v >= 6 else 0).getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                         max(box[2], b[2]), max(box[3], b[3]))
    w, h = frames[0].size
    if box is None:
        return (0, 0, w, h)
    return (max(0, box[0] - margin), max(0, box[1] - margin),
            min(w, box[2] + margin), min(h, box[3] + margin))


def visible_span(loaders, first, last, share=0.04):
    """A one-shot's frames from the first to the last that shows at least `share` of the peak
    coverage — cuts the empty lead-in and the long faint fade many sources carry."""
    cover = []
    for i in range(first, last):
        a = np.asarray(loaders[i]().getchannel("A").reduce(4), np.float32)
        cover.append(float(a.mean()))
    peak = max(cover) or 1.0
    on = [k for k, c in enumerate(cover) if c >= share * peak]
    if not on:
        return first, last
    return first + on[0], first + on[-1] + 1


def plan(src_w, box, squares, n_want, n_min, max_atlases, frame_max, budget, once=False):
    """Choose the scale and frame count within a GPU budget (bytes, RGBA8).
    Loops keep resolution first (they sit on the table all evening, and crossfade hides a low
    frame rate): shrink from ~56 to 40 px per square, then drop frames toward 24 and shrink to
    32, then settle for `n_min` frames. One-shots keep motion first: shrink to 32 px per square
    before dropping frames. → (scale, frame w, frame h, frames, cols, rows)."""
    bw, bh = box[2] - box[0], box[3] - box[1]

    def at(pxps, n_target):
        scale = min(pxps * squares / src_w, frame_max / max(bw, bh))
        fw, fh = max(1, round(bw * scale)), max(1, round(bh * scale))
        cols, rows = max(1, ATLAS_MAX // fw), max(1, ATLAS_MAX // fh)
        fit = min(cols * rows * max_atlases, budget // (fw * fh * 4))
        return scale, fw, fh, min(n_target, fit), cols, rows, fit >= n_target

    passes = ((32, n_want), (32, max(n_min, 32)), (32, max(n_min, 24)), (32, n_min)) if once else \
        ((40, n_want), (32, min(n_want, max(n_min, 24))), (32, n_min))
    for floor, target in passes:
        target = min(target, n_want)
        for pxps in range(PX_PER_SQUARE, floor - 1, -4):
            scale, fw, fh, n, cols, rows, ok = at(pxps, target)
            if ok:
                return scale, fw, fh, n, cols, rows
    scale, fw, fh, n, cols, rows, _ = at(32, n_min)
    return scale, fw, fh, max(n, min(n_min, cols * rows * max_atlases)), cols, rows


def pack(frames, fw, fh, cols, rows):
    """Grid-pack equal frames into as few atlases as needed (each cut to the rows it uses)."""
    per = cols * rows
    atlases, rects = [], []
    for start in range(0, len(frames), per):
        chunk = frames[start:start + per]
        used_rows = math.ceil(len(chunk) / cols)
        used_cols = min(cols, len(chunk))
        atlas = Image.new("RGBA", (used_cols * fw, used_rows * fh), (0, 0, 0, 0))
        for i, f in enumerate(chunk):
            x, y = (i % cols) * fw, (i // cols) * fh
            atlas.paste(f, (x, y))
            rects.append([len(atlases), x, y])
        atlases.append(atlas)
    return atlases, rects


def save_webp(im: Image.Image, path: Path, quality=WEBP_Q, lossless=False):
    """WebP with straight alpha; fully transparent pixels zeroed so they compress to nothing."""
    a = np.asarray(im).copy()
    a[a[..., 3] == 0] = 0
    Image.fromarray(a, "RGBA").save(path, "WEBP", quality=quality, alpha_quality=ALPHA_Q,
                                    method=6, lossless=lossless, exact=False)


def thumb(im: Image.Image, path: Path):
    """128 px preview for the companion's effect picker."""
    t = im.copy()
    t.thumbnail((THUMB, THUMB), Image.LANCZOS)
    save_webp(t, path, quality=75)


# ------------------------------------------------------------------ techniques
def build_sheet(fx, src, out: Path) -> dict:
    """Frames → trimmed, scaled, packed atlases + the sheet block of the manifest."""
    loaders, src_fps = load_source(fx, src)
    mode = fx.get("mode", "loop")
    loop = mode == "loop"
    total = len(loaders)
    first = int(fx.get("start", 0) * src_fps) if "start" in fx else 0
    last = min(total, int(fx["end"] * src_fps)) if "end" in fx else total
    if mode == "once" and total > 1:
        first, last = visible_span(loaders, first, last)
    duration = (last - first) / src_fps
    fps_target = fx.get("fps", 12 if loop else 20)
    n_want = max(fx.get("min_frames", 16), min(fx.get("max_frames", 48), round(duration * fps_target)))
    n_want = min(n_want, last - first)
    # The trim box must hold every frame that could be picked — a box from a sample cut flames
    # that flared wider in the frames between (hard straight edges). Measured on the alpha only.
    box = None
    for i in range(first, last):
        b = union_box([apply_ops(loaders[i](), fx.get("ops"))])
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    src_w, src_h = loaders[first]().size
    max_atlases = fx.get("max_atlases", 2 if mode == "once" else 1)
    budget = int(fx.get("gpu_mb", GPU_MB_ONCE if mode == "once" else GPU_MB_LOOP) * 1e6)
    if mode == "set":
        budget = 10 ** 9
    scale, fw, fh, n, cols, rows = plan(src_w, box, fx["squares"], n_want, fx.get("min_frames", 16),
                                        max_atlases, fx.get("frame_max", FRAME_MAX), budget,
                                        once=mode == "once")
    k = fx.get("loop_blend", 0) if loop else 0
    idx = pick_indices(total, n + k, k == 0 and loop, first, last)
    frames = []
    for i in idx:
        im = apply_ops(loaders[i](), fx.get("ops")).crop(box)
        frames.append(im.resize((fw, fh), Image.LANCZOS))
    if k:  # a source that does not loop by itself: fade the frames after the window into its start
        frames = [Image.blend(frames[n + j], frames[j], (j + 1) / (k + 1)) if j < k else frames[j]
                  for j in range(n)]
    atlases, rects = pack(frames, fw, fh, cols, rows)
    files = []
    for k, atlas in enumerate(atlases):
        name = f"atlas-{k}.webp"
        save_webp(atlas, out / name, fx.get("quality", WEBP_Q))
        files.append({"file": name, "w": atlas.width, "h": atlas.height})
    thumb(frames[len(frames) // 2 if not loop else 0], out / "thumb.webp")
    fps = (n / duration) if loop else ((n - 1) / duration if n > 1 else fps_target)
    sq_per_px = fx["squares"] / src_w      # map squares per source pixel
    ax, ay = fx.get("anchor", [0.5, 0.5])
    block = {
        "atlases": files,
        "frameW": fw, "frameH": fh,
        "frames": rects,
        "fps": round(fps, 2),
        "loop": loop,
        "crossfade": bool(fx.get("crossfade", loop and fps < 11)),
    }
    if mode == "set":   # variants, not an animation: the runtime picks one per placement
        block = {"atlases": files, "frameW": fw, "frameH": fh, "frames": rects, "variants": True}
    geo = {
        "size": {"w": round((box[2] - box[0]) * sq_per_px, 3), "h": round((box[3] - box[1]) * sq_per_px, 3)},
        "anchor": [round((ax * src_w - box[0]) / (box[2] - box[0]), 4),
                   round((ay * src_h - box[1]) / (box[3] - box[1]), 4)],
    }
    if "beam" in fx:  # a line effect: where along x the start and end point sit (trimmed frame)
        s, e = fx["beam"]
        geo["beam"] = {"start": round((s * src_w - box[0]) / (box[2] - box[0]), 4),
                       "end": round((e * src_w - box[0]) / (box[2] - box[0]), 4)}
    gpu = sum(f["w"] * f["h"] * 4 for f in files)
    return {"sheet": block, **geo, "gpuBytes": gpu, "duration": round(duration, 2)}


def build_texture(fx, src, out: Path, key="texture") -> dict:
    """One picture → trimmed, scaled WebP + the motion recipe from the catalog."""
    loaders, _ = load_source(fx, src)
    im = apply_ops(loaders[int(fx.get("pick", 0.5) * (len(loaders) - 1))](), fx.get("ops"))
    src_w, src_h = im.size
    box = union_box([im]) if fx.get("trim", True) else (0, 0, src_w, src_h)
    im = im.crop(box)
    side = fx.get("max_px", 1024)
    s = min(1.0, side / max(im.size))
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    save_webp(im, out / "texture.webp", fx.get("quality", 85), lossless=fx.get("lossless", False))
    thumb(im, out / "thumb.webp")
    sq_per_px = fx["squares"] / src_w
    ax, ay = fx.get("anchor", [0.5, 0.5])
    return {
        "texture": {"file": "texture.webp", "w": im.width, "h": im.height,
                    "wrap": fx.get("wrap", "clamp")},
        "motion": fx.get("motion", {}),
        "size": {"w": round((box[2] - box[0]) * sq_per_px, 3), "h": round((box[3] - box[1]) * sq_per_px, 3)},
        "anchor": [round((ax * src_w - box[0]) / (box[2] - box[0]), 4),
                   round((ay * src_h - box[1]) / (box[3] - box[1]), 4)],
        "gpuBytes": im.width * im.height * 4,
    }


def build_particles(fx, sources, out: Path) -> dict:
    """Sprite textures for a particle emitter (copied small) + the emitter recipe."""
    textures = []
    for k, t in enumerate(fx["textures"]):
        src = sources[t["source"]]
        im = Image.open(SRC / src["dir"] / t["file"]).convert("RGBA")
        if "cell" in t:  # one cell of a grid picture: [col, row, cols, rows]
            c, r, cols, rows = t["cell"]
            cw, ch = im.width // cols, im.height // rows
            im = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        im = apply_ops(im, t.get("ops"))
        im = im.crop(union_box([im]))
        im.thumbnail((t.get("max_px", 64), t.get("max_px", 64)), Image.LANCZOS)
        name = f"particle-{k}.webp"
        save_webp(im, out / name, 85)
        textures.append({"file": name, "w": im.width, "h": im.height,
                         "licence": src["licence"], "author": src["author"]})
    if fx.get("thumb_from"):
        shutil.copy(EFFECTS / fx["thumb_from"], out / "thumb.webp")
    else:
        thumb(Image.open(out / textures[0]["file"]), out / "thumb.webp")
    return {"particles": {"textures": textures, **fx["particles"]},
            "gpuBytes": sum(t["w"] * t["h"] * 4 for t in textures)}


def build_shader(fx, sources, out: Path) -> dict:
    """A procedural effect: shader file reference, uniforms, optional textures."""
    frag = EFFECTS / "shaders" / fx["shader"]
    if not frag.exists():
        raise FileNotFoundError(frag)
    textures = {}
    gpu = 0
    for name, t in fx.get("textures", {}).items():
        src = sources[t["source"]]
        im = apply_ops(Image.open(SRC / src["dir"] / t["file"]).convert("RGBA"), t.get("ops"))
        im.thumbnail((t.get("max_px", 512), t.get("max_px", 512)), Image.LANCZOS)
        fname = f"{name}.webp"
        save_webp(im, out / fname, 85)
        textures[name] = {"file": fname, "w": im.width, "h": im.height, "wrap": t.get("wrap", "repeat")}
        gpu += im.width * im.height * 4
    if fx.get("thumb_from"):
        shutil.copy(EFFECTS / fx["thumb_from"], out / "thumb.webp")
    return {"shader": {"fragment": f"../shaders/{fx['shader']}", "vertex": "../shaders/filter.vert",
                       "apply": fx.get("apply", "filter"), "uniforms": fx.get("uniforms", {}),
                       "textures": textures}, "gpuBytes": gpu}


# ------------------------------------------------------------------ manifest
def licence_block(src: dict) -> dict:
    return {"id": src["licence"], "url": src["licence_url"], "commercial": src.get("commercial", True),
            "shareAlike": src.get("share_alike", False)}


def build_one(fx: dict, sources: dict) -> dict:
    out = EFFECTS / fx["id"]
    tech = fx.get("technique", "sheet")
    # Procedural effects get their thumbnail from the preview (shoot_preview.mjs --thumbs);
    # keep it across rebuilds.
    kept_thumb = None
    if tech in ("shader", "particles", "composite") and (out / "thumb.webp").exists():
        kept_thumb = (out / "thumb.webp").read_bytes()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    src = sources[fx["source"]]
    if tech in ("sheet", "set"):
        body = build_sheet({**fx, "mode": "set"} if tech == "set" else fx, src, out)
    elif tech == "layers":   # one texture per layer, each with its own motion
        body = build_sheet({**fx, "mode": "set"}, src, out)
        body["layers"] = fx["layers"]
        body["motion"] = fx.get("motion", {})
    elif tech == "composite":  # other effects placed together (a campfire = base + flames + glow)
        body = {"parts": fx["parts"], "size": fx.get("size", {"w": fx["squares"], "h": fx["squares"]}),
                "anchor": [0.5, 0.5], "gpuBytes": 0}
        shutil.copy(EFFECTS / fx.get("thumb_from", fx["parts"][0]["id"] + "/thumb.webp"), out / "thumb.webp")
    elif tech == "texture":
        body = build_texture(fx, src, out)
    elif tech == "particles":
        body = build_particles(fx, sources, out)
    elif tech == "shader":
        body = build_shader(fx, sources, out)
    else:
        raise ValueError(tech)
    if kept_thumb:
        (out / "thumb.webp").write_bytes(kept_thumb)
    origin = fx.get("origin", src.get("url"))
    default_blend = "normal" if tech in ("shader", "composite") else src.get("blend", "normal")
    manifest = {
        "id": fx["id"],
        "name": fx["name"],
        "category": fx["category"],
        "technique": tech,
        "tags": fx.get("tags", []),
        "damage": fx.get("damage", []),
        "spells": fx.get("spells", []),
        "layer": fx.get("layer", "air"),
        "blend": fx.get("blend", default_blend),
        "tint": fx.get("tint", False),
        "squares": fx.get("squares"),
        **body,
        "licence": licence_block(src),
        "author": fx.get("author", src["author"]),
        "source": origin,
        "sourceFile": fx.get("file"),
        "attribution": fx.get("attribution", src["attribution"]),
        "notes": fx.get("notes", ""),
    }
    (out / "effect.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    return manifest


def disk_bytes(d: Path) -> int:
    return sum(p.stat().st_size for p in d.rglob("*") if p.is_file())


def write_index(effects: list[dict]):
    rows = []
    for fx in effects:
        d = EFFECTS / fx["id"]
        if not (d / "effect.json").exists():
            continue
        m = json.loads((d / "effect.json").read_text())
        rows.append({"id": m["id"], "name": m["name"], "category": m["category"],
                     "technique": m["technique"], "tags": m["tags"], "damage": m["damage"],
                     "spells": m["spells"], "blend": m["blend"], "licence": m["licence"]["id"],
                     "commercial": m["licence"]["commercial"],
                     "manifest": f"{m['id']}/effect.json",
                     "thumb": f"{m['id']}/thumb.webp" if (d / "thumb.webp").exists() else None,
                     "bytes": disk_bytes(d), "gpuBytes": m.get("gpuBytes", 0)})
    index = {"version": 1, "count": len(rows),
             "categories": sorted({r["category"] for r in rows}), "effects": rows}
    (EFFECTS / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n")
    return rows


def main(argv):
    cat = tomllib.loads((HERE / "catalog.toml").read_text())
    sources = cat["sources"]
    effects = cat["effect"]
    ids = {e["id"] for e in effects}
    if len(ids) != len(effects):
        raise SystemExit("duplicate effect id in catalog.toml")
    if argv == ["--index-only"]:
        rows = write_index(effects)
        print(f"index: {len(rows)} effects, {sum(r['bytes'] for r in rows) / 1e6:.1f} MB on disk")
        return
    want = set(argv)
    for fx in effects:
        if want and fx["id"] not in want:
            continue
        try:
            m = build_one(fx, sources)
        except Exception as e:  # keep going; report at the end
            print(f"FAIL {fx['id']}: {e}")
            continue
        sh = m.get("sheet")
        info = f"{len(sh['frames'])}f {sh['frameW']}x{sh['frameH']} {len(sh['atlases'])}atl {sh.get('fps', '-')}fps" if sh else m["technique"]
        print(f"{fx['id']:28s} {info:34s} {disk_bytes(EFFECTS / fx['id']) / 1e6:6.2f} MB  gpu {m.get('gpuBytes', 0) / 1e6:5.1f} MB")
    rows = write_index(effects)
    total = sum(r["bytes"] for r in rows)
    print(f"index: {len(rows)} effects, {total / 1e6:.1f} MB on disk")


if __name__ == "__main__":
    main(sys.argv[1:])
