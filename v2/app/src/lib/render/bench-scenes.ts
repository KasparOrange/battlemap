/**
 * The renderer bench's synthetic scenes (`bench.html?scene=…`): each builds a `RootState` and
 * changes it every frame the way a game night would at its worst — a big tiled map panned, fog
 * painted at 30 Hz, 60 tokens moving, hundreds of strokes, everything at once. Pictures are
 * generated in the page (no files needed), so the bench runs anywhere, the TV box included.
 *
 * @see ../../Bench.svelte for the runner and what it measures
 */
import {
  classicDisc, emptyMask, initialRoot, newGame, setMaskCells,
  type FileRef, type MapInfo, type MapPlay, type RootState, type Stroke, type Token,
} from '@battlemap/shared';
import type { FileLoader, ViewProfile } from './types.ts';

/** What a scene's step gets. */
export interface BenchFrame {
  /** ms since the scene started measuring (or warming up). */
  t: number;
  /** Frame number since the scene started. */
  n: number;
}

/** One bench scene. */
export interface BenchScene {
  /** URL id. */
  id: string;
  /** What it stresses. */
  name: string;
  /** The first state (`params`: the page's URL parameters, e.g. `fogStyle`). */
  setup(profile: ViewProfile, viewport: { width: number; height: number }, params?: URLSearchParams): RootState;
  /** The state for this frame (null: unchanged). */
  step(state: RootState, f: BenchFrame): RootState | null;
  /** Lasting effects to add (effects scenes). */
  effects?: boolean;
}

const COLORS = ['#e53935', '#43a047', '#1e88e5', '#fdd835', '#8e24aa', '#ff8f00'];

/** A fake content hash for a generated picture of a size. */
function benchHash(w: number, h: number): string {
  return (w.toString(16).padStart(8, '0') + h.toString(16).padStart(8, '0')).slice(0, 16);
}

/** A generated picture map: `cols × rows` squares of `cell` px. */
export function benchMap(id: string, cols: number, rows: number, cell: number): MapInfo {
  const w = cols * cell;
  const h = rows * cell;
  const picture: FileRef = { hash: benchHash(w, h), ext: 'jpg', bytes: w * h };
  return {
    id,
    name: `bench ${cols}×${rows}`,
    kind: 'picture',
    picture,
    tableCopy: null,
    geometry: null,
    grid: { x: 0, y: 0, cellW: cell, cellH: cell, cols, rows, pictureW: w, pictureH: h },
    drawGrid: true,
    doorCount: 0,
    drawDoors: false,
    libraryId: null,
  };
}

/** The showcase's walls and doors file. */
export const SHOWCASE_GEOMETRY: FileRef = { hash: 'abcdef0000000001', ext: 'json', bytes: 1 };

/** Walls round a room (6..18 × 4..12) with four doors, in squares. */
function showcaseGeometry(): string {
  const door = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  return JSON.stringify({
    walls: [[{ x: 6, y: 4 }, { x: 11, y: 4 }], [{ x: 12, y: 4 }, { x: 18, y: 4 }, { x: 18, y: 7 }], [{ x: 18, y: 8 }, { x: 18, y: 12 }, { x: 6, y: 12 }, { x: 6, y: 4 }]],
    doors: [door(11, 4, 12, 4), door(18, 7, 18, 8), door(9, 12, 10, 12), door(6, 8, 6, 9)],
    lights: [],
  });
}

const made = new Map<string, Promise<Blob>>();

/**
 * The bench's file loader: draws the picture a bench hash names (stone floor blocks, square
 * lines, rubble dots) and encodes it as JPEG, once per size.
 *
 * @returns a loader
 */
export function benchFiles(): FileLoader {
  return (ref) => {
    if (ref.hash === SHOWCASE_GEOMETRY.hash) return Promise.resolve(new Blob([showcaseGeometry()], { type: 'application/json' }));
    let p = made.get(ref.hash);
    if (!p) {
      const w = parseInt(ref.hash.slice(0, 8), 16);
      const h = parseInt(ref.hash.slice(8, 16), 16);
      p = drawPicture(w, h);
      made.set(ref.hash, p);
    }
    return p;
  };
}

async function drawPicture(w: number, h: number): Promise<Blob> {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const block = 256;
  for (let y = 0; y < h; y += block) {
    for (let x = 0; x < w; x += block) {
      const v = 60 + Math.floor(rnd() * 70);
      g.fillStyle = `rgb(${v + 10},${v},${v - 15})`;
      g.fillRect(x, y, block, block);
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x <= w; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  for (let y = 0; y <= h; y += 128) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let i = 0; i < (w * h) / 40000; i++) {
    g.fillStyle = `rgba(${Math.floor(rnd() * 255)},${Math.floor(rnd() * 200)},90,0.5)`;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 4 + rnd() * 30, 0, Math.PI * 2);
    g.fill();
  }
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

/** A state with one game on one map. */
export function gameOn(map: MapInfo, viewport: { width: number; height: number }, edit?: (m: MapPlay) => MapPlay): RootState {
  const root = initialRoot();
  const game = newGame({ id: 'bench', name: 'bench', createdAt: '2026-10-25T00:00:00.000Z', map });
  const play = game.maps[map.id]!;
  game.maps[map.id] = edit ? edit(play) : play;
  return { ...root, table: { ...root.table, viewport: { ...viewport } }, game };
}

/** The active map's play state. */
export function activeMap(s: RootState): MapPlay {
  return s.game!.maps[s.game!.activeMapId]!;
}

/** Replaces the active map's play state. */
export function withMap(s: RootState, f: (m: MapPlay) => MapPlay): RootState {
  const g = s.game!;
  const m = g.maps[g.activeMapId]!;
  return { ...s, game: { ...g, maps: { ...g.maps, [g.activeMapId]: f(m) } } };
}

function tokens(n: number, cols: number, rows: number): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `t${i}`, label: String(i + 1), name: i % 4 === 0 ? `Goblin ${i + 1}` : '', color: COLORS[i % COLORS.length]!, col: (i * 7) % cols, row: (i * 3) % rows, placed: true, hidden: i % 10 === 9 });
  }
  return out;
}

function moveTokens(ts: readonly Token[], n: number, cols: number, rows: number): Token[] {
  return ts.map((t, i) => (i % 2 === n % 2 ? { ...t, col: (t.col + 1) % cols, row: (t.row + (i % 3 === 0 ? 1 : 0)) % rows } : t));
}

function strokes(n: number, points: number, cols: number, rows: number): Stroke[] {
  const out: Stroke[] = [];
  for (let i = 0; i < n; i++) {
    const p: number[] = [];
    const cx = ((i * 13) % cols) + 0.5;
    const cy = ((i * 7) % rows) + 0.5;
    for (let k = 0; k < points; k++) p.push(cx + Math.cos(k / 9 + i) * (1 + k / 40), cy + Math.sin(k / 7 + i) * (1 + k / 50));
    out.push({ id: `s${i}`, points: p, color: COLORS[i % COLORS.length]!, width: 0.08 + (i % 3) * 0.04 });
  }
  return out;
}

/** Reveals a brush circle along a path at 30 Hz; every 6 s the fog closes again. */
function paintFog(m: MapPlay, t: number, n: number): MapPlay | null {
  if (n % 2 !== 0) return null;
  const { cols, rows } = m.info.grid;
  const cells = cols * rows;
  if (Math.floor(t / 6000) !== Math.floor((t - 34) / 6000)) return { ...m, fog: { ...m.fog, revealed: emptyMask(cells) } };
  const cx = cols / 2 + Math.cos(t / 900) * cols * 0.35;
  const cy = rows / 2 + Math.sin(t / 650) * rows * 0.35;
  const idx: number[] = [];
  const r = 3;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) idx.push(y * cols + x);
    }
  }
  const { mask, changed } = setMaskCells(m.fog.revealed, cells, idx, true);
  return changed ? { ...m, fog: { ...m.fog, revealed: mask } } : null;
}

/** A free camera at one inch per square circling the map (TV), or nothing (the DM pans itself). */
function panView(m: MapPlay, t: number, ppi: number): MapPlay {
  const { cols, rows } = m.info.grid;
  return { ...m, view: { ...m.view, mode: 'free', free: { x: cols / 2 + Math.cos(t / 3000) * cols * 0.3, y: rows / 2 + Math.sin(t / 3000) * rows * 0.3, zoom: ppi } } };
}

/** A still scene with every layer (for looking at, not timing): `?scene=showcase&fogStyle=soft&inset=20&turns=1`. */
export const showcase: BenchScene = {
  id: 'showcase',
  name: 'Every layer, still (fog style, trim and turn from the URL)',
  setup: (_p, vp, params) => {
    const cols = 24, rows = 16;
    const info = { ...benchMap('show', cols, rows, 96), geometry: SHOWCASE_GEOMETRY, doorCount: 4, drawDoors: true };
    const room: number[] = [];
    for (let y = 4; y < 12; y++) for (let x = 6; x < 18; x++) room.push(y * cols + x);
    for (let y = 1; y < 4; y++) for (let x = 11; x < 13; x++) room.push(y * cols + x);
    const cells = cols * rows;
    const reveal: number[] = [];
    for (let x = 1; x < 5; x++) reveal.push(13 * cols + x);
    const s = gameOn(info, vp, (m) => ({
      ...m,
      fog: { ...m.fog, revealed: setMaskCells(emptyMask(cells), cells, room, true).mask, staged: { reveal: setMaskCells(emptyMask(cells), cells, reveal, true).mask, hide: setMaskCells(emptyMask(cells), cells, [5 * cols + 7, 5 * cols + 8], true).mask } },
      doorsOpen: [1],
      tokens: tokens(8, 10, 6).map((t, i) => ({ ...t, col: 7 + (i % 5) * 2, row: 5 + Math.floor(i / 5) * 3 })),
      strokes: strokes(3, 60, 10, 6).map((st) => ({ ...st, points: st.points.map((v, i) => v + (i % 2 ? 4 : 6)) })),
      disc: { ...classicDisc(), visible: true, x: 12, y: 8, rotation: 30 },
      ruler: { visible: true, x: 2, y: 12, rotation: 0 },
      view: { ...m.view, mode: 'fit', quarterTurns: (Number(params?.get('turns') ?? 0) % 4) as 0 | 1 | 2 | 3 },
    }));
    const style = (params?.get('fogStyle') ?? 'standard') as 'standard' | 'soft' | 'cloud' | 'atmospheric';
    const pattern = params?.get('pattern') === '1';
    return {
      ...s,
      table: { ...s.table, pattern: { on: pattern, pivot: 'bottomLeft' } },
      game: { ...s.game!, settings: { ...s.game!.settings, fogStyle: style, fogEdgeInset: Number(params?.get('inset') ?? 20) } },
      live: { ...s.live, measure: { a: { x: 14, y: 6 }, b: { x: 17, y: 10 } } },
    };
  },
  step: () => null,
};

/** The bench's scenes, in run order. */
export const benchScenes: readonly BenchScene[] = [
  {
    id: 'empty',
    name: 'No game: the bare loop',
    setup: (_p, vp) => ({ ...initialRoot(), table: { ...initialRoot().table, viewport: { ...vp } } }),
    step: () => null,
  },
  {
    id: 'big-map',
    name: 'Big map 8192 × 8192 px (64 × 64 squares) panned at one inch',
    setup: (_p, vp) => gameOn(benchMap('big', 64, 64, 128), vp),
    step: (s, f) => withMap(s, (m) => panView(m, f.t, (s.table.viewport?.width ?? 1920) / 34.5)),
  },
  {
    id: 'fog-paint',
    name: 'Fog painted at 30 Hz with fade and trimmed edges (100 × 100 squares)',
    setup: (_p, vp) => {
      const s = gameOn(benchMap('fog', 100, 100, 32), vp, (m) => ({ ...m, view: { ...m.view, mode: 'fit' } }));
      return { ...s, game: { ...s.game!, settings: { ...s.game!.settings, fogEdgeInset: 20 } } };
    },
    step: (s, f) => {
      const m = activeMap(s);
      const next = paintFog(m, f.t, f.n);
      return next ? withMap(s, () => next) : null;
    },
  },
  {
    id: 'tokens',
    name: '60 tokens moving every frame (40 × 30 squares)',
    setup: (_p, vp) => gameOn(benchMap('tok', 40, 30, 64), vp, (m) => ({ ...m, tokens: tokens(60, 40, 30), fog: { ...m.fog, on: false } })),
    step: (s, f) => withMap(s, (m) => ({ ...m, tokens: moveTokens(m.tokens, f.n, 40, 30) })),
  },
  {
    id: 'drawings',
    name: '400 strokes × 150 points + a live stroke growing',
    setup: (_p, vp) => gameOn(benchMap('draw', 40, 30, 64), vp, (m) => ({ ...m, strokes: strokes(400, 150, 40, 30), fog: { ...m.fog, on: false } })),
    step: (s, f) => {
      const pts: number[] = [];
      const k = 2 + (f.n % 240);
      for (let i = 0; i < k; i++) pts.push(10 + i * 0.08, 10 + Math.sin(i / 6) * 2);
      return { ...s, live: { ...s.live, stroke: { id: 'live', points: pts, color: '#fdd835', width: 0.12 } } };
    },
  },
  {
    id: 'everything',
    name: 'Everything at once: big map panned, fog painted, 60 tokens, 200 strokes, disc turning, ruler, measure',
    effects: true,
    setup: (_p, vp) =>
      gameOn(benchMap('big', 64, 64, 128), vp, (m) => ({
        ...m,
        tokens: tokens(60, 64, 64),
        strokes: strokes(200, 120, 64, 64),
        disc: { ...classicDisc(), visible: true, x: 32, y: 32 },
        ruler: { visible: true, x: 28, y: 36, rotation: 0 },
        fog: { ...m.fog, revealed: emptyMask(64 * 64) },
      })),
    step: (s, f) => {
      const ppi = (s.table.viewport?.width ?? 1920) / 34.5;
      const next = withMap(s, (m) => {
        let mm = panView(m, f.t, ppi);
        mm = paintFog(mm, f.t, f.n) ?? mm;
        mm = { ...mm, tokens: moveTokens(mm.tokens, f.n, 64, 64), disc: { ...mm.disc, rotation: (f.t / 20) % 360 } };
        return mm;
      });
      return { ...next, live: { ...next.live, measure: { a: { x: 30, y: 30 }, b: { x: 30 + Math.cos(f.t / 500) * 6, y: 30 + Math.sin(f.t / 500) * 6 } } } };
    },
  },
];
