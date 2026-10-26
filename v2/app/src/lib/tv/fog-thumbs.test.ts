/**
 * Fog-honest thumbnails: what is planned (neutral with nothing revealed, the crop around what is,
 * the whole map without fog, kept behind the curtain and when nothing changed), and when they are
 * made (after saves, autosaves throttled, flushes soon, stored per game).
 */
import { describe, expect, test } from 'bun:test';
import { maskFromCells, newGame, wholeGrid, type Game, type MapInfo } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { cropAround, FogThumbs, planThumb, revealedBox, thumbKey, THUMB_MIN_INTERVAL_MS, type StoredThumb } from './fog-thumbs.ts';
import type { Timers } from './timers.ts';

const FILE = { hash: '0123456789abcdef', ext: 'png' as const, bytes: 10 };

function map(cols = 40, rows = 30): MapInfo {
  return {
    id: 'm1', name: 'Crypt', kind: 'picture', picture: FILE, tableCopy: null, geometry: null,
    grid: wholeGrid(cols, rows, cols * 50, rows * 50), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
  };
}

function game(revealed: number[] = [], over: (g: Game) => Game = (g) => g): Game {
  const g = newGame({ id: 'g1', name: 'Night 1', createdAt: '2026-10-25T18:00:00.000Z', map: map() });
  const m = g.maps.m1!;
  return over({ ...g, maps: { m1: { ...m, fog: { ...m.fog, revealed: maskFromCells(40 * 30, revealed) } } } });
}

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} } as unknown as Logger;

describe('planning', () => {
  test('nothing revealed → a neutral card', () => {
    expect(planThumb(game(), null)).toMatchObject({ kind: 'neutral' });
  });

  test('revealed squares → a crop around them at 16 : 9, fog bytes along', () => {
    const p = planThumb(game([5 * 40 + 10, 6 * 40 + 11]), null);
    expect(p.kind).toBe('draw');
    if (p.kind !== 'draw') return;
    expect(p.fog).not.toBeNull();
    expect(p.crop.width / p.crop.height).toBeCloseTo(16 / 9, 5);
    expect(p.crop.x).toBeLessThanOrEqual(10);
    expect(p.crop.x + p.crop.width).toBeGreaterThanOrEqual(12);
    expect(p.crop.y).toBeLessThanOrEqual(5);
  });

  test('fog off → the whole map, no fog', () => {
    const p = planThumb(game([], (g) => ({ ...g, maps: { m1: { ...g.maps.m1!, fog: { ...g.maps.m1!.fog, on: false } } } })), null);
    expect(p).toMatchObject({ kind: 'draw', fog: null });
  });

  test('kept: the curtain is down, or the same fog was drawn already; staged squares do not count', () => {
    const down = game([1], (g) => ({ ...g, curtain: { down: true, plate: false, text: '' } }));
    expect(planThumb(down, null).kind).toBe('keep');
    const g = game([1]);
    const first = planThumb(g, null);
    const stored: StoredThumb = { sig: first.kind === 'keep' ? '' : first.sig, url: 'data:x' };
    expect(planThumb(g, stored).kind).toBe('keep');
    const staged = { ...g, maps: { m1: { ...g.maps.m1!, fog: { ...g.maps.m1!.fog, staged: { reveal: maskFromCells(1200, [500]), hide: maskFromCells(1200, []) } } } } };
    expect(planThumb(staged, stored).kind).toBe('keep');
    expect(planThumb(game([1, 2]), stored).kind).toBe('draw');
  });

  test('box and crop maths', () => {
    expect(revealedBox(new Uint8Array(2), 4, 4)).toBeNull();
    expect(revealedBox(Uint8Array.from([0b0010_0000, 0b0000_0100]), 4, 4)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    // slid inside the map, never past its edge
    const c = cropAround({ x: 38, y: 28, width: 2, height: 2 }, 40, 30, 16 / 9, 1);
    expect(c.x + c.width).toBeLessThanOrEqual(40);
    expect(c.y + c.height).toBeLessThanOrEqual(30);
    // a map smaller than the aspect: the whole axis
    expect(cropAround({ x: 0, y: 0, width: 3, height: 3 }, 4, 30, 16 / 9, 1).width).toBe(4);
  });
});

describe('making them', () => {
  function rig() {
    let now = 0;
    const due: { at: number; fn: () => void; h: number }[] = [];
    let n = 0;
    const timers: Timers = {
      set: (fn, ms) => { due.push({ at: now + ms, fn, h: ++n }); return n; },
      clear: (h) => { const i = due.findIndex((d) => d.h === h); if (i >= 0) due.splice(i, 1); },
    };
    const store = new Map<string, unknown>();
    const drawn: string[] = [];
    const thumbs = new FogThumbs({
      settings: { get: async <T>(k: string) => (store.get(k) as T) ?? null, put: async (k, v) => void store.set(k, v) },
      files: async () => new Blob(['x']),
      draw: async (plan) => { drawn.push(plan.sig); return `data:image/webp;base64,${drawn.length}`; },
      log: quiet,
      timers,
      now: () => now,
    });
    const advance = async (ms: number) => {
      now += ms;
      for (const d of due.filter((d) => d.at <= now)) { due.splice(due.indexOf(d), 1); d.fn(); }
      await thumbs.idle();
    };
    return { thumbs, store, drawn, advance };
  }

  test('an autosave makes one after its delay, stored under the game; a neutral one shows no picture', async () => {
    const r = rig();
    const changes: [string, string | undefined][] = [];
    r.thumbs.onChange = (id, url) => changes.push([id, url]);
    r.thumbs.saved(game(), 'autosave');
    await r.advance(3000);
    expect(r.drawn).toEqual([]);
    expect((r.store.get(thumbKey('g1')) as StoredThumb).url).toBeNull();
    r.thumbs.saved(game([7]), 'autosave');
    await r.advance(3000); // within the 30 s interval: not yet
    expect(r.drawn).toHaveLength(0);
    await r.advance(THUMB_MIN_INTERVAL_MS);
    expect(r.drawn).toHaveLength(1);
    expect(r.thumbs.url('g1')).toStartWith('data:image/webp');
    expect(changes.at(-1)![0]).toBe('g1');
  });

  test('a close draws soon; the same fog is not drawn twice; load reads stored ones', async () => {
    const r = rig();
    r.thumbs.saved(game([3]), 'close');
    await r.advance(300);
    expect(r.drawn).toHaveLength(1);
    r.thumbs.saved(game([3]), 'close');
    await r.advance(300);
    expect(r.drawn).toHaveLength(1);
    const again = rig();
    again.store.set(thumbKey('g1'), r.store.get(thumbKey('g1')));
    await again.thumbs.load(['g1', 'g2']);
    expect(again.thumbs.url('g1')).toStartWith('data:');
    expect(again.thumbs.url('g2')).toBeUndefined();
  });

  test('a close of one game and an autosave of the next both get their thumbnail', async () => {
    const r = rig();
    r.thumbs.saved(game([3]), 'close');
    r.thumbs.saved({ ...game([5]), id: 'g2' }, 'autosave');
    await r.advance(300);
    expect(r.thumbs.url('g1')).toStartWith('data:');
    await r.advance(3000);
    expect(r.thumbs.url('g2')).toStartWith('data:');
    expect(r.drawn).toHaveLength(2);
  });
});
