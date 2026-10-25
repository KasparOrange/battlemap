/**
 * Effect scenes for the renderer's bench page (`bench.html?fx=<id>`): lasting effects to place
 * on the bench map and one-shots to fire on a beat, chosen to cover every technique and the
 * heavy cases the TV box must survive.
 *
 * @see ../../../../docs/architecture.md "performance budgets"
 */
import type { OneShot, PlacedEffect } from '@battlemap/shared';
import { circleRegion, coneRegion, lineRegion } from './anchors.ts';

/** The bench map's size in squares. */
export interface BenchMapSize {
  /** Columns. */
  cols: number;
  /** Rows. */
  rows: number;
}

/** One bench scene. */
export interface EffectsBenchScene {
  /** URL id (`?fx=torches-rain`). */
  id: string;
  /** What it shows. */
  name: string;
  /**
   * The lasting effects to place.
   *
   * @param map - the bench map's size
   * @returns placed effects
   */
  placed(map: BenchMapSize): PlacedEffect[];
  /** Fire `shots` every this many ms (0 = never). */
  shotEveryMs: number;
  /**
   * The one-shots of one beat.
   *
   * @param map - the bench map's size
   * @param beat - the beat number (0, 1, …) — ids must be unique per beat
   * @param now - epoch ms
   * @returns shots
   */
  shots(map: BenchMapSize, beat: number, now: number): OneShot[];
}

const at = (id: string, effect: string, x: number, y: number, params: PlacedEffect['params'] = {}): PlacedEffect => ({
  id,
  effect,
  anchor: { kind: 'point', x, y },
  params,
  on: true,
});

const global = (id: string, effect: string, params: PlacedEffect['params'] = {}): PlacedEffect => ({
  id,
  effect,
  anchor: { kind: 'global' },
  params,
  on: true,
});

/**
 * The part of the map the TV shows: the centred 34 × 19 table window (the whole map when it is
 * smaller). Scenes place everything in it, so the players' view sees all of it.
 */
function win(map: BenchMapSize): { x: number; y: number; w: number; h: number } {
  const w = Math.min(34, map.cols);
  const h = Math.min(19, map.rows);
  return { x: Math.round((map.cols - w) / 2), y: Math.round((map.rows - h) / 2), w, h };
}

/** A point at fractions of the table window. */
function spot(map: BenchMapSize, fx: number, fy: number): [number, number] {
  const v = win(map);
  return [v.x + v.w * fx, v.y + v.h * fy];
}

/** Twelve torches spread over the table window (two rows of six). */
function torches(map: BenchMapSize): PlacedEffect[] {
  const out: PlacedEffect[] = [];
  for (let i = 0; i < 12; i++) {
    const [x, y] = spot(map, ((i % 6) + 0.5) / 6, i < 6 ? 0.15 : 0.85);
    out.push(at(`torch-${i}`, 'wall-torch', x, y));
  }
  return out;
}

/** Five fireballs at seeded spots. */
function fireballs(map: BenchMapSize, beat: number, now: number, n = 5): OneShot[] {
  const shots: OneShot[] = [];
  for (let i = 0; i < n; i++) {
    const k = beat * n + i;
    const [x, y] = spot(map, 0.12 + ((k * 0.217) % 0.76), 0.2 + ((k * 0.131) % 0.6));
    shots.push({ id: `fb-${beat}-${i}`, effect: 'fireball', anchor: { kind: 'region', points: circleRegion(x, y, 4, 16) }, params: { shape: 'circle' }, at: now });
  }
  return shots;
}

/** The bench's effect scenes. */
export const effectsBenchScenes: readonly EffectsBenchScene[] = [
  {
    id: 'torches-rain',
    name: 'torches ×12 + rain',
    placed: (map) => [...torches(map), global('rain', 'rain')],
    shotEveryMs: 0,
    shots: () => [],
  },
  {
    id: 'fireballs',
    name: 'fireball burst ×5 every 4 s (+ screen shake)',
    placed: () => [],
    shotEveryMs: 4000,
    shots: (map, beat, now) => [...fireballs(map, beat, now), { id: `shake-${beat}`, effect: 'screen-shake', anchor: { kind: 'global' }, params: { amplitude: 8 }, at: now }],
  },
  {
    id: 'spells',
    name: 'cloudkill + spirit guardians + magic circle',
    placed: (map) => [
      { id: 'ck', effect: 'cloudkill', anchor: { kind: 'region', points: circleRegion(...spot(map, 0.25, 0.5), 4) }, params: { shape: 'circle' }, on: true },
      at('sg', 'spirit-guardians', ...spot(map, 0.55, 0.5)),
      at('mc', 'magic-circle-indicator', ...spot(map, 0.8, 0.5), { color: '#7fc8ff' }),
      at('ca', 'circle-arcane', ...spot(map, 0.8, 0.5), { size: 6 }),
    ],
    shotEveryMs: 0,
    shots: () => [],
  },
  {
    id: 'heavy',
    name: 'everything heavy',
    placed: (map) => [
      ...torches(map),
      global('storm', 'rain-storm'),
      global('night', 'night'),
      global('embers', 'embers'),
      { id: 'ck', effect: 'cloudkill', anchor: { kind: 'region', points: circleRegion(...spot(map, 0.3, 0.5), 4) }, params: { shape: 'circle' }, on: true },
      { id: 'pool', effect: 'water-pool', anchor: { kind: 'region', points: circleRegion(...spot(map, 0.7, 0.5), 3, 12) }, params: {}, on: true },
      { id: 'lava', effect: 'lava-pool', anchor: { kind: 'region', points: lineRegion(...spot(map, 0.45, 0.2), ...spot(map, 0.6, 0.8), 2) }, params: {}, on: true },
      at('sg', 'spirit-guardians', ...spot(map, 0.5, 0.5)),
      at('ff', 'fireflies-cc0', ...spot(map, 0.85, 0.3)),
      at('mc', 'magic-circle-indicator', ...spot(map, 0.15, 0.3)),
    ],
    shotEveryMs: 3000,
    shots: (map, beat, now) => [
      ...fireballs(map, beat, now, 3),
      { id: `cone-${beat}`, effect: 'breath-fire-cone', anchor: { kind: 'region', points: coneRegion(...spot(map, 0.2, 0.8), -30, 6) }, params: { shape: 'cone' }, at: now },
      { id: `bolt-${beat}`, effect: 'lightning-bolt', anchor: { kind: 'region', points: lineRegion(...spot(map, 0.05, 0.3), ...spot(map, 0.95, 0.3), 1) }, params: { shape: 'line' }, at: now },
    ],
  },
  {
    id: 'decals',
    name: 'still decals only (must idle at 0 frames)',
    placed: (map) => Array.from({ length: 8 }, (_, i) => at(`rune-${i}`, 'runes-arcane', ...spot(map, 0.1 + i * 0.11, 0.5))),
    shotEveryMs: 0,
    shots: () => [],
  },
];
