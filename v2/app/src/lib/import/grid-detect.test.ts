/// <reference types="bun" />
/**
 * Tests of the grid detection and the file-name counts — the old app's
 * `test/grid_detect_test.dart` cases, same pictures (a seeded noise floor with grid lines),
 * same expectations. Run: `bun test` in app/.
 */
import { describe, expect, test } from 'bun:test';
import {
  detectEmbeddedGrid, detectionAligned, detectionCrop, detectionToRasterGrid, detectFromLuminance,
  LuminanceBuilder, boxFactor,
} from './grid-detect.ts';
import { gridCountsFromName } from './name-counts.ts';

/** A small seeded PRNG (mulberry32), so the noise is the same every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options of `picture`. */
interface Pic {
  cell?: number;
  offset?: number;
  lineWidth?: number;
  lineDelta?: number;
  noise?: number;
  seed?: number;
  paint?: (px: Uint8Array, w: number, h: number) => void;
}

/** A `w × h` RGBA picture: grey noise (a stone floor), optional grid lines every `cell` px from `offset`. */
function picture(w: number, h: number, o: Pic = {}): Uint8Array {
  const { cell, offset = 0, lineWidth = 2, lineDelta = -40, noise = 40, seed = 1 } = o;
  const rnd = rng(seed);
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = 120 + Math.floor(rnd() * (noise + 1)) - Math.trunc(noise / 2);
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  if (cell !== undefined) {
    const onLine = (i: number): boolean => {
      const r = (((i + 0.5 - offset) % cell) + cell) % cell;
      return r < lineWidth / 2 || r >= cell - lineWidth / 2;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (onLine(x) || onLine(y)) {
          const p = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) px[p + c] = Math.min(255, Math.max(0, px[p + c]! + lineDelta));
        }
      }
    }
  }
  o.paint?.(px, w, h);
  return px;
}

describe('detectEmbeddedGrid', () => {
  test("finds a 32 px grid that meets the edges (Juri's cave map)", () => {
    const g = detectEmbeddedGrid(picture(1280, 960, { cell: 32 }), 1280, 960)!;
    expect(g).not.toBeNull();
    expect(Math.abs(g.cellPx - 32)).toBeLessThanOrEqual(0.05);
    expect(g.cols).toBe(40);
    expect(g.rows).toBe(30);
    expect(detectionAligned(g)).toBe(true);
    const c = detectionCrop(g);
    expect(c.left).toBe(0);
    expect(c.top).toBe(0);
    expect(Math.abs(c.right - c.left - 1280)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.bottom - c.top - 960)).toBeLessThanOrEqual(2);
  });

  test('finds a faint grid (lines only 12 levels darker)', () => {
    const g = detectEmbeddedGrid(picture(900, 700, { cell: 50, lineDelta: -12, lineWidth: 1 }), 900, 700)!;
    expect(g).not.toBeNull();
    expect(Math.abs(g.cellPx - 50)).toBeLessThanOrEqual(0.1);
    expect([g.cols, g.rows]).toEqual([18, 14]);
  });

  test('a grid that starts inside the picture is cropped to whole squares', () => {
    // Lines at 23, 83, 143, …: a 23 px sliver on the left and top.
    const g = detectEmbeddedGrid(picture(1000, 800, { cell: 60, offset: 23 }), 1000, 800)!;
    expect(g).not.toBeNull();
    expect(Math.abs(g.cellPx - 60)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(g.offsetX - 23)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.offsetY - 23)).toBeLessThanOrEqual(1);
    expect(detectionAligned(g)).toBe(false);
    // (1000 − 23) / 60 = 16.3 → 16; (800 − 23) / 60 = 12.95 → 13 (inside the tolerance).
    expect(g.cols).toBe(16);
    expect(g.rows).toBe(13);
    const c = detectionCrop(g);
    expect(Math.abs(c.left - 23)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.right - c.left - 960)).toBeLessThanOrEqual(2);
    // As a picture grid: lines through the offset, nothing cropped.
    const r = detectionToRasterGrid(g);
    expect(Math.abs(r.x - 23)).toBeLessThanOrEqual(1);
    expect([r.cols, r.rows]).toEqual([16, 13]);
  });

  test('no grid in plain noise', () => {
    expect(detectEmbeddedGrid(picture(800, 600), 800, 600)).toBeNull();
  });

  test('fine texture (12 px bricks) is not a grid', () => {
    expect(detectEmbeddedGrid(picture(1024, 768, { cell: 12 }), 1024, 768)).toBeNull();
  });

  test('heavier lines every fifth square do not multiply the cell', () => {
    const px = picture(1200, 880, {
      cell: 40, lineDelta: -18, noise: 20,
      paint: (px, w, h) => {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = (x + 0.5) % 200;
            const dy = (y + 0.5) % 200;
            if (Math.min(dx, 200 - dx) < 2 || Math.min(dy, 200 - dy) < 2) {
              const p = (y * w + x) * 4;
              px[p] = px[p + 1] = px[p + 2] = 20;
            }
          }
        }
      },
    });
    const g = detectEmbeddedGrid(px, 1200, 880)!;
    expect(g).not.toBeNull();
    expect(Math.abs(g.cellPx - 40)).toBeLessThanOrEqual(0.2);
    expect(g.cols).toBe(30);
    expect(g.rows).toBe(22);
  });

  test('a big picture is averaged down and reported in its own pixels', () => {
    const g = detectEmbeddedGrid(picture(2560, 1920, { cell: 64 }), 2560, 1920, { maxSide: 1280 })!;
    expect(g).not.toBeNull();
    expect(Math.abs(g.cellPx - 64)).toBeLessThanOrEqual(0.2);
    expect([g.pictureW, g.pictureH]).toEqual([2560, 1920]);
    expect([g.cols, g.rows]).toEqual([40, 30]);
    expect(detectionAligned(g)).toBe(true);
  });

  test('transparent background counts as white paper', () => {
    const px = picture(800, 800, {
      cell: 80, lineDelta: -60,
      paint: (px, w, h) => {
        for (let i = 0; i < w * h; i++) {
          if (i % w > 400) px[i * 4 + 3] = px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 0;
        }
      },
    });
    const g = detectEmbeddedGrid(px, 800, 800)!;
    expect(g).not.toBeNull();
    expect(Math.abs(g.cellPx - 80)).toBeLessThanOrEqual(0.2);
  });

  test('too small or truncated input gives null', () => {
    expect(detectEmbeddedGrid(new Uint8Array(10), 100, 100)).toBeNull();
    expect(detectEmbeddedGrid(new Uint8Array(8 * 8 * 4), 8, 8)).toBeNull();
  });

  test('strip by strip gives exactly the same result as all at once', () => {
    const w = 2560;
    const h = 1920;
    const px = picture(w, h, { cell: 64, offset: 10 });
    const whole = detectEmbeddedGrid(px, w, h, { maxSide: 1280 });
    const lb = new LuminanceBuilder(w, h, boxFactor(w, h, 1280));
    for (let y = 0; y < h; y += 333) {
      const n = Math.min(333, h - y);
      lb.addRows(px.subarray(y * w * 4, (y + n) * w * 4), y, n);
    }
    expect(detectFromLuminance(lb)).toEqual(whole);
  });
});

describe('gridCountsFromName', () => {
  const [W, H] = [3000, 4000]; // 30 × 40 squares of 100 px
  test('reads the squares from the file name', () => {
    expect(gridCountsFromName('Tavern_30x40.jpg', W, H)).toEqual({ cols: 30, rows: 40 });
    expect(gridCountsFromName('tavern [30 X 40] gridless.png', W, H)).toEqual({ cols: 30, rows: 40 });
    expect(gridCountsFromName('Tavern 30×40.webp', W, H)).toEqual({ cols: 30, rows: 40 });
  });

  test('rows first in the name are turned round', () => {
    expect(gridCountsFromName('Tavern_40x30.jpg', W, H)).toEqual({ cols: 30, rows: 40 });
  });

  test('pixel sizes and counts that do not fit are skipped', () => {
    expect(gridCountsFromName('Tavern_3000x4000_30x40.jpg', W, H)).toEqual({ cols: 30, rows: 40 });
    expect(gridCountsFromName('Tavern_20x40.jpg', W, H)).toBeNull();
    expect(gridCountsFromName('Tavern.jpg', W, H)).toBeNull();
    expect(gridCountsFromName('Tavern_30x40.jpg', 0, 0)).toBeNull();
  });
});
