/**
 * Fog-honest game thumbnails for the TV's own screens (roadmap S24, the "thumbnail spoiler" in
 * `docs/action.md`): the TV home's Continue card and the TV library's game cards show the map
 * **as the players last saw it** — the picture with its fog applied, cropped to what was revealed —
 * or a neutral card when nothing was revealed yet. The server's thumbnails (the whole picture,
 * unfogged) stay for the tablet, which may see the DM's full view.
 *
 * Made on the TV after the game saves, off the critical path: a few seconds after an autosave,
 * at most every {@link THUMB_MIN_INTERVAL_MS} per game while playing, at once (300 ms) on a
 * close or any other flush. Never while the curtain is down (the players saw the curtain, not
 * what the DM prepared behind it) — the last thumbnail stays. Stored per game in the TV's
 * settings store as a small WebP data URL (~10–30 kB), with a signature of what it shows, so an
 * unchanged fog is never drawn twice.
 *
 * The planning is pure and tested (`fog-thumbs.test.ts`); the drawing is `fog-thumbs-draw.ts`.
 */
import { maskToBytes, type Game, type MapInfo, type Rect } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { TvSettingsStore } from './ports.ts';
import { errorText, type Timers } from './timers.ts';

/** Thumbnail width in px (16 : 9, the cards crop it by CSS where they are wider). */
export const THUMB_W = 480;
/** Thumbnail height in px. */
export const THUMB_H = 270;
/** Wait after an autosave before a thumbnail is made, ms. */
export const THUMB_DELAY_MS = 3000;
/** Wait after any other save (close, page hide, before another game opens), ms. */
export const THUMB_URGENT_MS = 300;
/** Least time between two thumbnails of one game made after autosaves, ms. */
export const THUMB_MIN_INTERVAL_MS = 30_000;
/** Squares kept around the revealed part. */
export const THUMB_MARGIN = 1;

/**
 * The settings key of a game's thumbnail.
 *
 * @param gameId - the game
 * @returns the key
 */
export function thumbKey(gameId: string): string {
  return `tv.thumb.${gameId}`;
}

/** What is stored per game. */
export interface StoredThumb {
  /** What the picture shows ({@link thumbSignature}). */
  sig: string;
  /** The picture as a data URL, or null for "neutral" (nothing revealed yet). */
  url: string | null;
}

/** What to do for a game now. */
export type ThumbPlan =
  | { kind: 'keep' }
  | { kind: 'neutral'; sig: string }
  | { kind: 'draw'; sig: string; map: MapInfo; crop: Rect; fog: Uint8Array | null };

/** FNV-1a of a text, as 8 hex digits (a fog mask's fingerprint). */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The signature of what a game's thumbnail shows: the map on the table, its picture, whether
 * fog is on and the revealed squares (staged previews don't count — the players don't see them).
 *
 * @param game - the game
 * @returns the signature, or '' when the game has no map on the table
 */
export function thumbSignature(game: Game): string {
  const map = game.maps[game.activeMapId];
  if (!map) return '';
  const pic = map.info.tableCopy ?? map.info.picture;
  return `${map.info.id}|${pic.hash}|${map.info.grid.cols}x${map.info.grid.rows}|${map.fog.on ? fnv(map.fog.revealed) : 'nofog'}`;
}

/**
 * The bounding box of the revealed squares.
 *
 * @param bytes - the mask's bytes (`maskToBytes`)
 * @param cols - map width
 * @param rows - map height
 * @returns the box in squares, or null when nothing is revealed
 */
export function revealedBox(bytes: Uint8Array, cols: number, rows: number): Rect | null {
  let x0 = cols;
  let y0 = rows;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!(bytes[i >> 3]! & (1 << (i & 7)))) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * A crop of the map around a box: the box plus `margin` squares, grown to the thumbnail's aspect
 * around its centre, then slid inside the map; where the map is too small on an axis, the crop is
 * the whole axis (the card's CSS cover hides the difference).
 *
 * @param box - what must be in it, squares
 * @param cols - map width
 * @param rows - map height
 * @param aspect - width ÷ height of the thumbnail
 * @param margin - squares around the box
 * @returns the crop in squares
 */
export function cropAround(box: Rect, cols: number, rows: number, aspect: number, margin: number): Rect {
  let w = box.width + 2 * margin;
  let h = box.height + 2 * margin;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  w = Math.min(w, cols);
  h = Math.min(h, rows);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const x = Math.min(Math.max(0, cx - w / 2), cols - w);
  const y = Math.min(Math.max(0, cy - h / 2), rows - h);
  return { x, y, width: w, height: h };
}

/**
 * Decides what a game's thumbnail should be now.
 *
 * @param game - the game as saved
 * @param stored - its stored thumbnail, or null
 * @returns keep (unchanged, or the curtain is down), neutral (fog on, nothing revealed), or draw
 */
export function planThumb(game: Game, stored: StoredThumb | null): ThumbPlan {
  if (game.curtain?.down) return { kind: 'keep' };
  const map = game.maps[game.activeMapId];
  if (!map) return { kind: 'keep' };
  const sig = thumbSignature(game);
  if (stored && stored.sig === sig) return { kind: 'keep' };
  const { cols, rows } = map.info.grid;
  const aspect = THUMB_W / THUMB_H;
  if (!map.fog.on) return { kind: 'draw', sig, map: map.info, crop: cropAround({ x: 0, y: 0, width: cols, height: rows }, cols, rows, aspect, 0), fog: null };
  const bytes = maskToBytes(map.fog.revealed, cols * rows);
  const box = revealedBox(bytes, cols, rows);
  if (!box) return { kind: 'neutral', sig };
  return { kind: 'draw', sig, map: map.info, crop: cropAround(box, cols, rows, aspect, THUMB_MARGIN), fog: bytes };
}

/** Draws a thumbnail: the plan and the map's picture (table copy if any) → a data URL. */
export type ThumbDrawer = (plan: Extract<ThumbPlan, { kind: 'draw' }>, picture: Blob) => Promise<string>;

/** What {@link FogThumbs} needs. */
export interface FogThumbsDeps {
  /** The TV's settings store (where thumbnails are kept). */
  settings: TvSettingsStore;
  /** Loads a file from the device's cache (fetched when missing). */
  files: (ref: MapInfo['picture']) => Promise<Blob>;
  /** Draws one ({@link ThumbDrawer}; `drawFogThumb` in the browser). */
  draw: ThumbDrawer;
  /** The logger (area `tv`). */
  log: Logger;
  /** Timers (fakes in tests). */
  timers: Timers;
  /** The clock, ms. */
  now: () => number;
}

/** The TV's fog-honest thumbnails: made after saves, read for the screens. */
export class FogThumbs {
  /** Called when a game's thumbnail URL changed (undefined: none / neutral). */
  onChange: ((gameId: string, url: string | undefined) => void) | null = null;
  private readonly stored = new Map<string, StoredThumb | null>();
  private readonly lastDrawn = new Map<string, number>();
  /** Per game: the latest saved state waiting for its thumbnail, and its timer. */
  private readonly pending = new Map<string, { game: Game; timer: unknown }>();
  private running: Promise<void> = Promise.resolve();

  /** @param deps - storage, files, drawer, log, timers, clock */
  constructor(private readonly deps: FogThumbsDeps) {}

  /**
   * The thumbnail to show for a game.
   *
   * @param gameId - the game
   * @returns its data URL, or undefined (neutral card)
   */
  url(gameId: string): string | undefined {
    return this.stored.get(gameId)?.url ?? undefined;
  }

  /**
   * Reads the stored thumbnails of games not read yet (the library listed them).
   *
   * @param ids - game ids
   */
  async load(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      if (this.stored.has(id)) continue;
      let t: StoredThumb | null = null;
      try {
        t = await this.deps.settings.get<StoredThumb>(thumbKey(id));
      } catch (e) {
        this.deps.log.warn('tv', 'Thumbnail could not be read', { gameId: id, error: errorText(e) });
      }
      if (this.stored.has(id)) continue; // made meanwhile
      this.stored.set(id, t && typeof t.sig === 'string' ? t : null);
      if (t?.url) this.onChange?.(id, t.url);
    }
  }

  /**
   * The TV saved a game: schedule its thumbnail.
   *
   * @param game - the game as saved
   * @param reason - why it was saved (`autosave` waits longer and is throttled)
   */
  saved(game: Game, reason: string): void {
    // Per game, so a close of one game followed at once by another game's autosave keeps both.
    const urgent = reason !== 'autosave';
    const last = this.lastDrawn.get(game.id) ?? -Infinity;
    const wait = urgent ? THUMB_URGENT_MS : Math.max(THUMB_DELAY_MS, last + THUMB_MIN_INTERVAL_MS - this.deps.now());
    const before = this.pending.get(game.id);
    if (before) this.deps.timers.clear(before.timer);
    const timer = this.deps.timers.set(() => {
      const p = this.pending.get(game.id);
      if (!p) return;
      this.pending.delete(game.id);
      this.running = this.running.then(() => this.make(p.game));
    }, wait);
    this.pending.set(game.id, { game, timer });
  }

  /** Resolves when the thumbnails started so far are done (tests). */
  idle(): Promise<void> {
    return this.running;
  }

  /** Makes (or keeps) one game's thumbnail. Never throws. */
  private async make(game: Game): Promise<void> {
    const t0 = this.deps.now();
    try {
      await this.load([game.id]);
      const plan = planThumb(game, this.stored.get(game.id) ?? null);
      if (plan.kind === 'keep') return;
      let url: string | null = null;
      if (plan.kind === 'draw') {
        const ref = plan.map.tableCopy ?? plan.map.picture;
        url = await this.deps.draw(plan, await this.deps.files(ref));
      }
      const t: StoredThumb = { sig: plan.sig, url };
      this.stored.set(game.id, t);
      this.lastDrawn.set(game.id, this.deps.now());
      await this.deps.settings.put(thumbKey(game.id), t);
      this.onChange?.(game.id, url ?? undefined);
      this.deps.log.info('tv', 'Thumbnail made', { gameId: game.id, kind: plan.kind, kb: url ? Math.round(url.length / 1024) : 0, ms: this.deps.now() - t0 });
    } catch (e) {
      this.deps.log.warn('tv', 'Thumbnail failed', { gameId: game.id, error: errorText(e) });
    }
  }
}
