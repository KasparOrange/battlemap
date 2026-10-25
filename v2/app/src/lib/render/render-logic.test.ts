/// <reference types="bun" />
/**
 * Tests of the renderer's pure parts: camera maths and DM clamps, decode and tile planning,
 * picture headers, fog texels (rows, edges, atmospheric distance, fade), hit tests and the
 * render scheduler's capped leases. Run: `bun test` in app/.
 */
import { describe, expect, test } from 'bun:test';
import { classicDisc, discToMap, knobLocal, emptyMask, fullMask, maskFromCells, type FogState, type MapPlay, type RasterGrid, type Token } from '@battlemap/shared';
import { clampDmCamera, fitDmCamera, panCamera, screenToSquares, squaresToScreen, visibleSquares, zoomCameraAt, DM_MAX_ZOOM } from './camera.ts';
import { planDecode, planTiles } from './tiles.ts';
import { imageSize } from './image-size.ts';
import { atmosphericLevels, changedRows, FogFade, FOG_NEAR, STAGED_HIDE, STAGED_REVEAL, writeFogTexels } from './fog-texels.ts';
import { doorAt, hitsAt, onRuler, tokenAt } from './hit.ts';
import { RenderScheduler } from './scheduler.ts';

const view = { width: 1920, height: 1080 };

describe('camera', () => {
  test('screen ↔ squares round-trips in every turn', () => {
    for (const q of [0, 1, 2, 3]) {
      const cam = { centerX: 12.5, centerY: 7, zoom: 55.6, quarterTurns: q };
      const p = { x: 300, y: 900 };
      const s = screenToSquares(cam, view, p);
      const back = squaresToScreen(cam, view, s);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  test('the screen centre is the camera centre; one square is zoom px', () => {
    const cam = { centerX: 10, centerY: 5, zoom: 50, quarterTurns: 0 };
    expect(screenToSquares(cam, view, { x: 960, y: 540 })).toEqual({ x: 10, y: 5 });
    expect(screenToSquares(cam, view, { x: 1010, y: 540 })).toEqual({ x: 11, y: 5 });
  });

  test('a quarter turn clockwise puts +x of the map downwards on screen', () => {
    const cam = { centerX: 0, centerY: 0, zoom: 10, quarterTurns: 1 };
    const p = squaresToScreen(cam, view, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(960);
    expect(p.y).toBeCloseTo(550);
  });

  test('visible squares swap axes when sideways', () => {
    const v = visibleSquares({ centerX: 0, centerY: 0, zoom: 10, quarterTurns: 1 }, view);
    expect(v.x1 - v.x0).toBeCloseTo(108);
    expect(v.y1 - v.y0).toBeCloseTo(192);
  });

  test('pan follows the finger, also turned', () => {
    for (const q of [0, 1, 2, 3]) {
      const cam = { centerX: 10, centerY: 10, zoom: 40, quarterTurns: q };
      const at = { x: 500, y: 400 };
      const under = screenToSquares(cam, view, at);
      const moved = panCamera(cam, 37, -12);
      const now = screenToSquares(moved, view, { x: at.x + 37, y: at.y - 12 });
      expect(now.x).toBeCloseTo(under.x, 9);
      expect(now.y).toBeCloseTo(under.y, 9);
    }
  });

  test('zoom keeps the square under the fingers', () => {
    const cam = { centerX: 10, centerY: 10, zoom: 40, quarterTurns: 3 };
    const at = { x: 1500, y: 200 };
    const under = screenToSquares(cam, view, at);
    const z = zoomCameraAt(cam, view, 1.7, at);
    expect(z.zoom).toBeCloseTo(68);
    const now = screenToSquares(z, view, at);
    expect(now.x).toBeCloseTo(under.x, 9);
    expect(now.y).toBeCloseTo(under.y, 9);
  });

  test('DM clamps: zoom between half the fit and the maximum, centre on the map', () => {
    const lim = { cols: 40, rows: 30, view };
    const fit = fitDmCamera(lim);
    expect(fit.centerX).toBe(20);
    expect(fit.zoom).toBeCloseTo((1080 * 0.96) / 30);
    const out = clampDmCamera({ ...fit, zoom: 1 }, lim);
    expect(out.zoom).toBeCloseTo(fit.zoom * 0.5);
    expect(clampDmCamera({ ...fit, zoom: 9999 }, lim).zoom).toBe(DM_MAX_ZOOM);
    const off = clampDmCamera({ ...fit, centerX: -50, centerY: 99 }, lim);
    expect(off.centerX).toBe(0);
    expect(off.centerY).toBe(30);
    expect(clampDmCamera(fit, lim)).toBe(fit);
  });
});

const grid = (over: Partial<RasterGrid> = {}): RasterGrid => ({ x: 0, y: 0, cellW: 100, cellH: 100, cols: 40, rows: 30, pictureW: 4000, pictureH: 3000, ...over });

describe('decode planning', () => {
  const base = { wantedPxPerSquare: 56, budgetBytes: 128 * 2 ** 20, floorPxPerSquare: 32, maxTile: 2048 };

  test('the TV decodes at its ppi, the whole map', () => {
    const p = planDecode({ ...base, grid: grid(), sourceW: 4000, sourceH: 3000 })!;
    expect(p).toMatchObject({ sx: 0, sy: 0, sw: 4000, sh: 3000, dw: 2240, dh: 1680, x: 0, y: 0, w: 40, h: 30 });
    expect(p.pxPerSquare).toBeCloseTo(56);
  });

  test('never above the picture own density', () => {
    const p = planDecode({ ...base, grid: grid({ cellW: 40, cellH: 40, pictureW: 1600, pictureH: 1200 }), sourceW: 1600, sourceH: 1200 })!;
    expect(p.dw).toBe(1600);
  });

  test('a table copy (smaller file) maps the grid by scale', () => {
    const p = planDecode({ ...base, grid: grid(), sourceW: 2000, sourceH: 1500 })!;
    expect(p.sw).toBe(2000);
    expect(p.dw).toBe(2000); // 50 px per square in the copy < 56 wanted
  });

  test('a grid starting inside the picture crops; one reaching past it leaves the rest dark', () => {
    const p = planDecode({ ...base, grid: grid({ x: 50, y: -100, cols: 40, rows: 30 }), sourceW: 4000, sourceH: 3000 })!;
    expect(p.sx).toBe(50);
    expect(p.sy).toBe(0);
    expect(p.sw).toBe(3950);
    expect(p.sh).toBe(2900);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1); // the first row has no picture
    expect(p.w).toBeCloseTo(39.5);
  });

  test('the budget lowers the density, the floor stops it', () => {
    const big = grid({ cols: 400, rows: 300, cellW: 100, cellH: 100, pictureW: 40000, pictureH: 30000 });
    const p = planDecode({ ...base, grid: big, sourceW: 40000, sourceH: 30000 })!;
    expect(p.pxPerSquare).toBeCloseTo(32, 0); // 400×300 at 56 = 1.5 GB; budget gives ~19 → floor 32
    const mid = grid({ cols: 150, rows: 100, pictureW: 15000, pictureH: 10000 });
    const q = planDecode({ ...base, grid: mid, sourceW: 15000, sourceH: 10000 })!;
    expect(q.bytes).toBeLessThanOrEqual(base.budgetBytes * 1.01);
    expect(q.pxPerSquare).toBeGreaterThan(32);
    expect(q.pxPerSquare).toBeLessThan(56);
  });

  test('no picture under the grid → null', () => {
    expect(planDecode({ ...base, grid: grid({ x: 5000 }), sourceW: 4000, sourceH: 3000 })).toBeNull();
  });
});

describe('tile planning', () => {
  test('a small picture is one tile without apron', () => {
    expect(planTiles(2000, 1500, 2048)).toEqual([{ tx: 0, ty: 0, tw: 2000, th: 1500, fx: 0, fy: 0, fw: 2000, fh: 1500, x: 0, y: 0 }]);
  });

  test('tiles cover the picture exactly, stay within the limit and carry a 1 px apron', () => {
    const w = 8192, h = 5000, max = 2048;
    const tiles = planTiles(w, h, max);
    let area = 0;
    for (const t of tiles) {
      expect(t.tw).toBeLessThanOrEqual(max);
      expect(t.th).toBeLessThanOrEqual(max);
      expect(t.tx + t.fx).toBe(t.x);
      expect(t.ty + t.fy).toBe(t.y);
      expect(t.fx + t.fw).toBeLessThanOrEqual(t.tw);
      if (t.x > 0) expect(t.fx).toBe(1);
      if (t.x + t.fw < w) expect(t.tw - t.fx - t.fw).toBe(1);
      area += t.fw * t.fh;
    }
    expect(area).toBe(w * h);
    const columns = new Set(tiles.map((t) => t.x)).size;
    expect(columns).toBe(5); // 8192 / 2046 → 5
  });
});

describe('picture headers', () => {
  test('PNG', () => {
    const b = new Uint8Array(32);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x1f, 0x40, 0, 0, 0x0b, 0xb8]);
    expect(imageSize(b)).toEqual({ width: 8000, height: 3000 });
  });

  test('JPEG skips segments to the frame', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x01, 0x2c, 0x02, 0x58, 3, 0, 0, 0, 0]);
    expect(imageSize(b)).toEqual({ width: 600, height: 300 });
  });

  test('WebP VP8X and VP8L', () => {
    const x = new Uint8Array(40);
    x.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    x.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
    x.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12);
    x.set([0xff, 0x1f, 0x00, 0x9f, 0x0f, 0x00], 24); // 8192 × 4000
    expect(imageSize(x)).toEqual({ width: 8192, height: 4000 });
    const l = new Uint8Array(40);
    l.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    l.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
    l.set([...'VP8L'].map((c) => c.charCodeAt(0)), 12);
    // width-1 = 99 (14 bits), height-1 = 49 (14 bits): bits = 99 | 49 << 14
    const v = 99 | (49 << 14);
    l.set([0x2f, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff], 20);
    expect(imageSize(l)).toEqual({ width: 100, height: 50 });
  });

  test('unknown → null', () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

function fogOf(cols: number, rows: number, revealed: number[], staged?: { reveal: number[]; hide: number[] }): FogState {
  const cells = cols * rows;
  return {
    on: true,
    revealed: maskFromCells(cells, revealed),
    staged: staged ? { reveal: maskFromCells(cells, staged.reveal), hide: maskFromCells(cells, staged.hide) } : null,
    live: null,
  };
}

describe('fog texels', () => {
  test('R = revealed, B = staged and fog-near, A = atmospheric steps', () => {
    const cols = 5, rows = 1;
    const out = new Uint8Array(cols * rows * 4);
    writeFogTexels(fogOf(cols, rows, [0], { reveal: [3], hide: [0] }), cols, rows, out, new Uint8Array(cols * rows));
    const r = [0, 1, 2, 3, 4].map((i) => out[i * 4]);
    expect(r).toEqual([255, 0, 0, 0, 0]);
    expect(out[2]! & 3).toBe(STAGED_HIDE);
    expect(out[3 * 4 + 2]! & 3).toBe(STAGED_REVEAL);
    expect(out[2]! & FOG_NEAR).toBe(FOG_NEAR); // square 1 is fog
    const a = [0, 1, 2, 3, 4].map((i) => out[i * 4 + 3]! / 63);
    expect(a).toEqual([0, 1, 2, 3, 4]);
  });

  test('atmospheric distance is Chebyshev and capped at 4', () => {
    const cols = 9, rows = 9;
    const t = new Uint8Array(cols * rows * 4);
    t[(4 * cols + 4) * 4] = 255;
    const d = new Uint8Array(cols * rows);
    atmosphericLevels(t, cols, rows, d);
    expect(d[4 * cols + 4]).toBe(0);
    expect(d[3 * cols + 3]).toBe(1);
    expect(d[2 * cols + 6]).toBe(2);
    expect(d[0]).toBe(4);
  });

  test('a fully revealed map has no fog-near flags', () => {
    const cols = 4, rows = 3;
    const out = new Uint8Array(cols * rows * 4);
    writeFogTexels({ on: true, revealed: fullMask(12), staged: null, live: null }, cols, rows, out, new Uint8Array(12));
    for (let i = 0; i < 12; i++) expect(out[i * 4 + 2]).toBe(0);
  });

  test('changed rows: first and last differing row, null when equal', () => {
    const cols = 3;
    const a = new Uint8Array(cols * 5 * 4);
    const b = a.slice();
    expect(changedRows(a, b, cols)).toBeNull();
    b[(1 * cols + 2) * 4] = 255;
    b[(3 * cols) * 4 + 3] = 9;
    expect(changedRows(a, b, cols)).toEqual({ first: 1, last: 3 });
  });

  test('the fade starts on newly revealed squares only and ends after 500 ms', () => {
    const cols = 4, rows = 1;
    const prev = new Uint8Array(16);
    prev[0] = 255;
    const next = prev.slice();
    next[4] = 255; // square 1 revealed now
    const fade = new FogFade();
    expect(fade.start(prev, next, 1000)).toBe(1);
    expect(next[5]).toBe(255);
    expect(next[1]).toBe(0);
    const mid = fade.step(next, cols, 1250);
    expect(mid).toEqual({ first: 0, last: 0 });
    expect(next[5]).toBeGreaterThan(0);
    expect(next[5]).toBeLessThan(255);
    fade.step(next, cols, 1500);
    expect(next[5]).toBe(0);
    expect(fade.active).toBe(0);
    expect(fade.step(next, cols, 1600)).toBeNull();
  });
});

function token(over: Partial<Token>): Token {
  return { id: 't', label: '1', name: '', color: '#e53935', col: 0, row: 0, placed: true, hidden: false, ...over };
}

function mapPlay(over: Partial<MapPlay> = {}): MapPlay {
  return {
    info: { id: 'm', name: 'm', kind: 'picture', picture: { hash: '0123456789abcdef', ext: 'png', bytes: 1 }, tableCopy: null, geometry: null, grid: grid(), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null },
    fog: { on: true, revealed: emptyMask(1200), staged: null, live: null },
    doorsOpen: [],
    tokens: [],
    strokes: [],
    layers: [],
    ruler: { visible: false, x: 0, y: 0, rotation: 0 },
    disc: classicDisc(),
    effects: [],
    view: { mode: 'table', col: null, row: null, quarterTurns: 0, free: null },
    showGrid: true,
    ...over,
  };
}

describe('hit tests', () => {
  test('tokens: topmost wins, hidden only for the DM, unplaced never', () => {
    const tokens = [token({ id: 'a', col: 3, row: 3 }), token({ id: 'b', col: 3, row: 3 }), token({ id: 'h', col: 5, row: 5, hidden: true }), token({ id: 'u', col: 7, row: 7, placed: false })];
    expect(tokenAt(tokens, { x: 3.5, y: 3.6 }, false, 0.4)?.id).toBe('b');
    expect(tokenAt(tokens, { x: 5.5, y: 5.5 }, false, 0.4)).toBeNull();
    expect(tokenAt(tokens, { x: 5.5, y: 5.5 }, true, 0.4)?.id).toBe('h');
    expect(tokenAt(tokens, { x: 7.5, y: 7.5 }, true, 0.4)).toBeNull();
  });

  test('ruler arms with their pad, in every rotation', () => {
    expect(onRuler(10, 10, 0, { x: 15, y: 9.7 }, 0.15)).toBe(true); // horizontal arm (−y side)
    expect(onRuler(10, 10, 0, { x: 15, y: 11 }, 0.15)).toBe(false);
    expect(onRuler(10, 10, 0, { x: 9.7, y: 5 }, 0.15)).toBe(true); // vertical arm
    expect(onRuler(10, 10, 90, { x: 10.3, y: 15 }, 0.15)).toBe(true); // +x arm turned to +y
  });

  test('doors: the nearest door whose padded box holds the point', () => {
    const doors = [{ a: { x: 2, y: 2 }, b: { x: 3, y: 2 } }, { a: { x: 2, y: 2.4 }, b: { x: 3, y: 2.4 } }];
    expect(doorAt(doors, { x: 2.5, y: 2.1 }, 0.25)).toBe(0);
    expect(doorAt(doors, { x: 2.5, y: 2.35 }, 0.25)).toBe(1);
    expect(doorAt(doors, { x: 5, y: 5 }, 0.25)).toBe(-1);
  });

  test('priority: knob, disc, ruler, token, door', () => {
    const disc = { ...classicDisc(), visible: true, x: 10, y: 10 };
    const map = mapPlay({ disc, ruler: { visible: true, x: 10, y: 10.2, rotation: 0 }, tokens: [token({ id: 'x', col: 10, row: 9 })] });
    const hits = hitsAt({ map, doors: [{ a: { x: 9.8, y: 10 }, b: { x: 10.4, y: 10 } }], dm: true, zoom: 60, frame: null }, { x: 10.3, y: 9.8 });
    expect(hits.map((h) => h.kind)).toEqual(['disc', 'ruler', 'token', 'door']);
    const k = discToMap(disc, knobLocal(disc));
    const knob = hitsAt({ map, doors: [], dm: true, zoom: 60, frame: null }, k);
    expect(knob[0]).toEqual({ kind: 'disc', part: 'knob' });
    const tv = hitsAt({ map, doors: [], dm: false, zoom: 60, frame: null }, k);
    expect(tv[0]).toEqual({ kind: 'disc', part: 'move' }); // no knob on the TV, the rim band moves
  });

  test('the players frame: on its outline only', () => {
    const map = mapPlay();
    const frame = { x: 2, y: 2, width: 34, height: 19 };
    expect(hitsAt({ map, doors: [], dm: true, zoom: 60, frame }, { x: 2.1, y: 10 })).toEqual([{ kind: 'frame' }]);
    expect(hitsAt({ map, doors: [], dm: true, zoom: 60, frame }, { x: 15, y: 10 })).toEqual([]);
  });
});

describe('scheduler', () => {
  function fakeFrames() {
    const queue: ((t: number) => void)[] = [];
    const timers: { cb: () => void; ms: number }[] = [];
    let now = 0;
    return {
      request: (cb: (t: number) => void) => queue.push(cb),
      delay: (cb: () => void, ms: number) => timers.push({ cb, ms }),
      clock: () => now,
      flush() {
        const q = queue.splice(0);
        for (const cb of q) cb(now);
        return q.length;
      },
      advance(ms: number) {
        now += ms;
        const due = timers.splice(0);
        for (const t of due) t.cb();
      },
      get timers() {
        return timers.length;
      },
    };
  }

  test('tickers run before each render', () => {
    const f = fakeFrames();
    const order: string[] = [];
    const s = new RenderScheduler(() => order.push('render'), f.request, f.delay, f.clock);
    s.onFrame(() => order.push('tick'));
    s.invalidate();
    f.flush();
    expect(order).toEqual(['tick', 'render']);
  });

  test('a capped lease waits on a timer instead of every frame; release stops it', () => {
    const f = fakeFrames();
    let drawn = 0;
    const s = new RenderScheduler(() => drawn++, f.request, f.delay, f.clock);
    const release = s.hold('cloud', 20);
    f.flush();
    expect(drawn).toBe(1);
    expect(f.flush()).toBe(0); // no frame queued right away
    expect(f.timers).toBe(1);
    f.advance(50);
    f.flush();
    expect(drawn).toBe(2);
    release();
    f.advance(50);
    expect(f.flush()).toBe(0);
  });

  test('an uncapped lease next to a capped one runs every frame', () => {
    const f = fakeFrames();
    let drawn = 0;
    const s = new RenderScheduler(() => drawn++, f.request, f.delay, f.clock);
    s.hold('cloud', 20);
    const fast = s.hold('fade');
    f.flush();
    f.flush();
    f.flush();
    expect(drawn).toBe(3);
    fast();
  });
});
