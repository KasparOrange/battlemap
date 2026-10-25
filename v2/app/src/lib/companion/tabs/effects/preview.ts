/**
 * Small looping previews for the Effects tab: a sprite-sheet effect's own frames played in its
 * thumbnail — only for the tile under the finger / mouse / D-pad focus and for the armed effect,
 * never for the whole grid at once (cheap: one atlas download per previewed effect, one CSS
 * animation of `background-position`, no rAF loop). Effects that aren't sprite sheets (textures,
 * shaders, particles) keep their still thumbnail. The plan is pure and tested; `loadPreview`
 * fetches the effect's `effect.json` once and caches it.
 *
 * @see ../../../../../docs/effects.md "The Effects tab"
 */

/** One frame's top-left corner in the atlas, px. */
export interface PreviewFrame {
  /** Left, px. */
  x: number;
  /** Top, px. */
  y: number;
}

/** What a looping preview needs: one atlas and the frames in it. */
export interface SheetPreview {
  /** The atlas picture's URL. */
  url: string;
  /** Atlas size, px. */
  atlasW: number;
  /** Atlas height, px. */
  atlasH: number;
  /** One frame's size, px. */
  frameW: number;
  /** One frame's height, px. */
  frameH: number;
  /** The frames, in play order. */
  frames: PreviewFrame[];
  /** Frames per second. */
  fps: number;
}

/** The part of an `effect.json` the preview reads. */
interface EffectFile {
  technique?: string;
  sheet?: {
    atlases?: { file: string; w: number; h: number }[];
    frameW?: number;
    frameH?: number;
    frames?: [number, number, number][];
    fps?: number;
  };
}

/** At most this many frames are played (long sheets are sampled evenly). */
export const MAX_PREVIEW_FRAMES = 40;

/**
 * The preview plan of an effect: the frames of its first atlas (a preview never downloads a
 * second one), sampled down to {@link MAX_PREVIEW_FRAMES}.
 *
 * @param file - the parsed `effect.json`
 * @param folderUrl - the effect's folder URL, ending in `/`
 * @returns the plan, or null when the effect isn't a sprite sheet (or its sheet is unusable)
 */
export function sheetPreview(file: unknown, folderUrl: string): SheetPreview | null {
  const f = file as EffectFile | null;
  const sheet = f?.technique === 'sheet' ? f.sheet : undefined;
  const atlas = sheet?.atlases?.[0];
  if (!sheet || !atlas || !sheet.frameW || !sheet.frameH || !Array.isArray(sheet.frames)) return null;
  const own = sheet.frames.filter((fr) => Array.isArray(fr) && fr[0] === 0).map((fr) => ({ x: fr[1], y: fr[2] }));
  if (own.length < 2) return null;
  const step = Math.max(1, own.length / MAX_PREVIEW_FRAMES);
  const frames: PreviewFrame[] = [];
  for (let i = 0; i < own.length && frames.length < MAX_PREVIEW_FRAMES; i += step) frames.push(own[Math.floor(i)]!);
  const fps = (sheet.fps && sheet.fps > 0 ? sheet.fps : 12) / step;
  return { url: folderUrl + atlas.file, atlasW: atlas.w, atlasH: atlas.h, frameW: sheet.frameW, frameH: sheet.frameH, frames, fps };
}

/** How a plan is drawn into a square box: the frame's drawn size and the atlas' scaled size. */
export interface PreviewLayout {
  /** Drawn frame width, px. */
  w: number;
  /** Drawn frame height, px. */
  h: number;
  /** `background-size` of the atlas, px. */
  bgW: number;
  /** `background-size` height, px. */
  bgH: number;
  /** The scale from atlas px to drawn px. */
  scale: number;
}

/**
 * Fits a frame into a square box (contain).
 *
 * @param p - the plan
 * @param box - the box's side, px
 * @returns the layout
 */
export function previewLayout(p: SheetPreview, box: number): PreviewLayout {
  const scale = Math.min(box / p.frameW, box / p.frameH);
  return { w: p.frameW * scale, h: p.frameH * scale, bgW: p.atlasW * scale, bgH: p.atlasH * scale, scale };
}

/**
 * The keyframes of the loop: one `background-position` per frame, held until the next
 * (`step-end`), so the browser plays it without a script.
 *
 * @param p - the plan
 * @param scale - atlas px → drawn px
 * @returns WAAPI keyframes and the loop's duration in ms
 */
export function previewKeyframes(p: SheetPreview, scale: number): { keyframes: Keyframe[]; durationMs: number } {
  const n = p.frames.length;
  const pos = (f: PreviewFrame) => `${-(f.x * scale).toFixed(2)}px ${-(f.y * scale).toFixed(2)}px`;
  const keyframes: Keyframe[] = p.frames.map((f, i) => ({ offset: i / n, backgroundPosition: pos(f), easing: 'step-end' }));
  keyframes.push({ offset: 1, backgroundPosition: pos(p.frames[n - 1]!) });
  return { keyframes, durationMs: Math.round((n / p.fps) * 1000) };
}

const cache = new Map<string, Promise<SheetPreview | null>>();

/**
 * The preview plan of an effect in the library, fetched once (failures answer null — the
 * still thumbnail stays).
 *
 * @param id - the effect's id (its folder)
 * @param libraryBase - the library's base URL, ending in `/`
 * @returns the plan, or null
 */
export function loadPreview(id: string, libraryBase: string): Promise<SheetPreview | null> {
  const key = libraryBase + id;
  let p = cache.get(key);
  if (!p) {
    const folder = `${libraryBase}${id}/`;
    p = fetch(`${folder}effect.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => sheetPreview(j, folder))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}
