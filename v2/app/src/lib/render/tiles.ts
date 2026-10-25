/**
 * Map picture planning — pure, no Pixi. Decides at which density a map picture is decoded (the
 * table needs ~ppi px per square on the TV; the texture budget may force less), which part of
 * the picture is the map (the `RasterGrid` rectangle, clipped to the picture), and how the
 * decoded picture is cut into tiles of at most `maxTile` px a side, with a one-pixel apron so
 * linear filtering shows no seams between tiles.
 *
 * @see ../../../../docs/architecture.md "rendering" (textures)
 */
import type { RasterGrid } from '@battlemap/shared';

/** Bytes per texel of an RGBA8 texture. */
export const BYTES_PER_TEXEL = 4;

/** What `planDecode` needs. */
export interface DecodeInput {
  /** The map's grid (on the original picture's pixels). */
  grid: RasterGrid;
  /** Size of the file actually decoded (the table copy is smaller than the original). */
  sourceW: number;
  /** Size of the file actually decoded. */
  sourceH: number;
  /** Wanted px per square (TV: its ppi; DM: as sharp as the picture). */
  wantedPxPerSquare: number;
  /** Texture bytes the map may use. */
  budgetBytes: number;
  /** Never decode below this density when the picture has more (TV: 32). */
  floorPxPerSquare: number;
  /** Largest tile side. */
  maxTile: number;
}

/** A decode plan: which source rectangle becomes how many destination pixels, and where it lies. */
export interface DecodePlan {
  /** Source rectangle (in the decoded file's pixels), clipped to the file. */
  sx: number;
  /** Source rectangle top. */
  sy: number;
  /** Source rectangle width. */
  sw: number;
  /** Source rectangle height. */
  sh: number;
  /** Decoded size in px (the textures' total size). */
  dw: number;
  /** Decoded height in px. */
  dh: number;
  /** Where the decoded picture lies on the map, in squares (left). */
  x: number;
  /** Top, in squares. */
  y: number;
  /** Width in squares. */
  w: number;
  /** Height in squares. */
  h: number;
  /** Decoded px per square (x axis). */
  pxPerSquare: number;
  /** Texture bytes of the decoded picture. */
  bytes: number;
}

/**
 * Plans the decode of a map picture: the map rectangle of the grid on the file, clipped, at
 * the density the screen wants — never more than the file has, lowered to fit the budget, but
 * not below the floor (the floor wins over the budget: an unreadable table is worse).
 *
 * @param input - grid, file size, wanted density, budget, floor
 * @returns the plan, or null when the grid does not touch the picture at all
 */
export function planDecode(input: DecodeInput): DecodePlan | null {
  const { grid, sourceW, sourceH } = input;
  // The grid is on the original picture; the file may be a scaled copy of it.
  const kx = sourceW / grid.pictureW;
  const ky = sourceH / grid.pictureH;
  const cellW = grid.cellW * kx;
  const cellH = grid.cellH * ky;
  const gx0 = grid.x * kx;
  const gy0 = grid.y * ky;
  const gx1 = gx0 + grid.cols * cellW;
  const gy1 = gy0 + grid.rows * cellH;
  const sx0 = Math.max(0, gx0);
  const sy0 = Math.max(0, gy0);
  const sx1 = Math.min(sourceW, gx1);
  const sy1 = Math.min(sourceH, gy1);
  if (sx1 - sx0 < 1 || sy1 - sy0 < 1) return null;
  const sx = Math.floor(sx0);
  const sy = Math.floor(sy0);
  const sw = Math.ceil(sx1) - sx;
  const sh = Math.ceil(sy1) - sy;

  // Density in decoded px per square (x), never above what the file has.
  const native = cellW;
  let density = Math.min(native, input.wantedPxPerSquare);
  const squaresW = sw / cellW;
  const squaresH = sh / cellH;
  const aspect = cellH / cellW;
  const bytesAt = (d: number) => Math.ceil(squaresW * d) * Math.ceil(squaresH * d * aspect) * BYTES_PER_TEXEL;
  if (bytesAt(density) > input.budgetBytes) {
    const fit = Math.sqrt(input.budgetBytes / (squaresW * squaresH * aspect * BYTES_PER_TEXEL));
    density = Math.max(Math.min(input.floorPxPerSquare, native), Math.min(density, fit));
  }
  const dw = Math.max(1, Math.round(squaresW * density));
  const dh = Math.max(1, Math.round(squaresH * density * aspect));
  return {
    sx,
    sy,
    sw,
    sh,
    dw,
    dh,
    x: (sx - gx0) / cellW,
    y: (sy - gy0) / cellH,
    w: sw / cellW,
    h: sh / cellH,
    pxPerSquare: dw / squaresW,
    bytes: dw * dh * BYTES_PER_TEXEL,
  };
}

/** One tile of a decoded picture. */
export interface TilePlan {
  /** The tile's texture rectangle in the decoded picture, apron included. */
  readonly tx: number;
  /** Top, apron included. */
  readonly ty: number;
  /** Texture width, apron included. */
  readonly tw: number;
  /** Texture height, apron included. */
  readonly th: number;
  /** The part the sprite shows (inside the texture, apron excluded): left offset. */
  readonly fx: number;
  /** Top offset of the shown part. */
  readonly fy: number;
  /** Shown width. */
  readonly fw: number;
  /** Shown height. */
  readonly fh: number;
  /** Where the shown part starts in the decoded picture (x). */
  readonly x: number;
  /** Where the shown part starts in the decoded picture (y). */
  readonly y: number;
}

/**
 * Cuts a decoded picture into tiles of at most `maxTile` px a side (apron included), evenly
 * sized. Each tile carries a one-pixel apron from its neighbours (where there is one), shown
 * part excluded, so linear filtering samples real neighbour pixels and no seam appears.
 *
 * @param w - decoded width in px
 * @param h - decoded height in px
 * @param maxTile - largest texture side
 * @param apron - apron in px (default 1)
 * @returns the tiles, row by row
 */
export function planTiles(w: number, h: number, maxTile: number, apron = 1): TilePlan[] {
  const xs = splitAxis(w, maxTile, apron);
  const ys = splitAxis(h, maxTile, apron);
  const out: TilePlan[] = [];
  for (const yy of ys) {
    for (const xx of xs) {
      out.push({ tx: xx.t, ty: yy.t, tw: xx.tl, th: yy.tl, fx: xx.f, fy: yy.f, fw: xx.len, fh: yy.len, x: xx.start, y: yy.start });
    }
  }
  return out;
}

/** One axis of the tiling: shown start/length, texture start/length, shown offset in the texture. */
function splitAxis(len: number, maxTile: number, apron: number): { start: number; len: number; t: number; tl: number; f: number }[] {
  if (len <= maxTile) return [{ start: 0, len, t: 0, tl: len, f: 0 }];
  const usable = maxTile - 2 * apron;
  const n = Math.ceil(len / usable);
  const base = Math.floor(len / n);
  const extra = len - base * n;
  const out: { start: number; len: number; t: number; tl: number; f: number }[] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const l = base + (i < extra ? 1 : 0);
    const t = Math.max(0, start - apron);
    const end = Math.min(len, start + l + apron);
    out.push({ start, len: l, t, tl: end - t, f: start - t });
    start += l;
  }
  return out;
}

/** Texture budgets of a screen. */
export interface TextureBudget {
  /** Map picture bytes. */
  readonly mapBytes: number;
  /** Everything else (fog, tokens, text, effects, DM layers on the companion). */
  readonly otherBytes: number;
  /** Largest tile side. */
  readonly maxTile: number;
  /** Lowest map density when the picture has more. */
  readonly floorPxPerSquare: number;
}

/**
 * Of a screen's "everything else" budget, what fog, the token atlas and the glyph pages may
 * take; the effects get the rest (`effectsBudget`).
 */
export const RESERVED_OTHER_BYTES = 4 * 2 ** 20;

/**
 * The effects' share of a texture budget — one budget for map tiles and effects (rv#17): the
 * map has its own, fog/tokens/text a fixed reserve, the effects what is left of "everything else".
 *
 * @param b - the screen's budget
 * @returns bytes the effects registry may hold
 */
export function effectsBudget(b: TextureBudget): number {
  return Math.max(0, b.otherBytes - RESERVED_OTHER_BYTES);
}

/** The TV box: 128 MB of map, 32 MB for the rest, 2048 px tiles (smooth uploads). */
export const TV_BUDGET: TextureBudget = { mapBytes: 128 * 2 ** 20, otherBytes: 32 * 2 ** 20, maxTile: 2048, floorPxPerSquare: 32 };

/** The companion: tablets have more memory; 4096 px tiles. */
export const DM_BUDGET: TextureBudget = { mapBytes: 192 * 2 ** 20, otherBytes: 96 * 2 ** 20, maxTile: 4096, floorPxPerSquare: 32 };
