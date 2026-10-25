/**
 * Where an effect sits, worked out from its anchor (`EffectAnchor`, in squares) and params —
 * pure geometry, no Pixi.
 *
 * The state's `region` anchor is a polygon. The D&D shapes (sphere/circle, cone, line, cube)
 * are polygons too, made by the helpers here ({@link circleRegion}, {@link coneRegion},
 * {@link lineRegion}, {@link cubeRegion}), and the placed effect says which shape it is in
 * `params.shape` so the art can be fitted: a circle's art is centred and scaled to its
 * diameter, a cone's art starts at the apex and turns toward the far edge, a line's beam is
 * stretched from start to end.
 *
 * Common params (all optional): `shape`, `scale` (× nominal size), `size` (squares across),
 * `rotation` (degrees), `toX`/`toY` (a point anchor's beam target, squares).
 *
 * @see ../../../../docs/effects.md "Categories and how they anchor"
 */
import type { EffectAnchor, EffectParams } from '@battlemap/shared';
import type { EffectManifest } from './manifest.ts';

/** A point in squares. */
export interface Pt {
  /** Squares from the map's left edge. */
  x: number;
  /** Squares from the map's top edge. */
  y: number;
}

/** The shapes a region can be. */
export type RegionShape = 'circle' | 'cone' | 'line' | 'cube' | 'polygon';

/** How to draw an effect's picture: an affine placement in squares. */
export interface Placement {
  /** Position of the picture's anchor point, squares. */
  x: number;
  /** Position of the picture's anchor point, squares. */
  y: number;
  /** Rotation, radians (clockwise, 0 = the art's own direction, which is +x for cones and beams). */
  angle: number;
  /** Width factor on the art's drawn size. */
  sx: number;
  /** Height factor on the art's drawn size. */
  sy: number;
  /** The point of the picture (0..1) that sits on (x, y). */
  ax: number;
  /** The point of the picture (0..1) that sits on (x, y). */
  ay: number;
}

const DEG = Math.PI / 180;

/**
 * A circle (a sphere seen from above) as a polygon.
 *
 * @param cx - centre, squares
 * @param cy - centre, squares
 * @param radius - radius, squares (a 20 ft sphere = 4)
 * @param sides - polygon corners (default 32)
 * @returns the polygon
 */
export function circleRegion(cx: number, cy: number, radius: number, sides = 32): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
}

/**
 * A D&D cone: as wide at its end as it is long. The apex comes first, then the far edge.
 *
 * @param ax - apex, squares
 * @param ay - apex, squares
 * @param angleDeg - direction, degrees (0 = right, 90 = down)
 * @param length - squares (a 15 ft cone = 3)
 * @param arcSteps - points along the far edge (default 6)
 * @returns the polygon, apex first
 */
export function coneRegion(ax: number, ay: number, angleDeg: number, length: number, arcSteps = 6): Pt[] {
  const half = Math.atan(0.5);
  const pts: Pt[] = [{ x: ax, y: ay }];
  const dir = angleDeg * DEG;
  for (let i = 0; i <= arcSteps; i++) {
    const a = dir - half + (2 * half * i) / arcSteps;
    const r = length / Math.cos(a - dir);
    pts.push({ x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r });
  }
  return pts;
}

/**
 * A line from a start to an end point, `width` squares wide: four corners, start edge first
 * (`[start+n, end+n, end−n, start−n]`).
 *
 * @param x1 - start, squares
 * @param y1 - start, squares
 * @param x2 - end, squares
 * @param y2 - end, squares
 * @param width - squares (default 1 = 5 ft)
 * @returns the polygon
 */
export function lineRegion(x1: number, y1: number, x2: number, y2: number, width = 1): Pt[] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * (width / 2);
  const ny = ((x2 - x1) / len) * (width / 2);
  return [
    { x: x1 + nx, y: y1 + ny },
    { x: x2 + nx, y: y2 + ny },
    { x: x2 - nx, y: y2 - ny },
    { x: x1 - nx, y: y1 - ny },
  ];
}

/**
 * A cube seen from above: a square, centred.
 *
 * @param cx - centre, squares
 * @param cy - centre, squares
 * @param side - squares (a 10 ft cube = 2)
 * @param angleDeg - turn, degrees
 * @returns the polygon
 */
export function cubeRegion(cx: number, cy: number, side: number, angleDeg = 0): Pt[] {
  const h = side / 2;
  const c = Math.cos(angleDeg * DEG);
  const s = Math.sin(angleDeg * DEG);
  return [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ].map(([x, y]) => ({ x: cx + x! * c - y! * s, y: cy + x! * s + y! * c }));
}

/** The bounding box of points. */
export interface Box {
  /** Left. */
  minX: number;
  /** Top. */
  minY: number;
  /** Right. */
  maxX: number;
  /** Bottom. */
  maxY: number;
}

/**
 * The bounding box of points.
 *
 * @param pts - at least one point
 * @returns the box
 */
export function boxOf(pts: readonly Pt[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The shape a placed effect says it is (`params.shape`), defaulting to `polygon`.
 *
 * @param params - the effect's params
 * @returns the shape
 */
export function shapeOf(params: EffectParams): RegionShape {
  const s = params.shape;
  return s === 'circle' || s === 'cone' || s === 'line' || s === 'cube' ? s : 'polygon';
}

/**
 * The art's nominal size in squares: what `scale = 1` means. The catalogue's `squares` (the
 * source frame's width) when it has one, else the drawn size's larger side, else 1.
 *
 * @param m - the manifest
 * @returns squares
 */
export function nominalSquares(m: EffectManifest): number {
  if (m.squares && m.squares > 0) return m.squares;
  if (m.size) return Math.max(m.size.w, m.size.h) || 1;
  return 1;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Where to draw an effect's picture (sheets, sets, layers, textures; composites per part). The
 * picture's own size in squares is `m.size` (or the nominal size); the placement scales,
 * turns and anchors it.
 *
 * - `point`: at (x, y), `params.size` squares across or `params.scale` × nominal; a beam with
 *   `toX`/`toY` stretches from the point to the target.
 * - `region`: fitted to the shape ({@link shapeOf}).
 * - `token` and `global`: at (0, 0) of their container, `params.scale` × nominal.
 *
 * @param m - the manifest
 * @param anchor - where it sits
 * @param params - its params
 * @returns the placement
 */
export function placementFor(m: EffectManifest, anchor: EffectAnchor, params: EffectParams): Placement {
  const nominal = nominalSquares(m);
  const ax = m.anchor?.[0] ?? 0.5;
  const ay = m.anchor?.[1] ?? 0.5;
  const turn = num(params.rotation, 0) * DEG;
  const scale = num(params.scale, 1);
  const sized = typeof params.size === 'number' && params.size > 0 ? params.size / nominal : scale;
  switch (anchor.kind) {
    case 'point': {
      if (typeof params.toX === 'number' && typeof params.toY === 'number') {
        return lineFit(m, { x: anchor.x, y: anchor.y }, { x: params.toX, y: params.toY }, scale);
      }
      return { x: anchor.x, y: anchor.y, angle: turn, sx: sized, sy: sized, ax, ay };
    }
    case 'region': {
      const pts = anchor.points;
      const shape = shapeOf(params);
      if (shape === 'cone') {
        const apex = pts[0]!;
        const rest = pts.slice(1);
        const far = centroid(rest);
        let length = 0;
        for (const p of rest) length = Math.max(length, Math.hypot(p.x - apex.x, p.y - apex.y) * Math.cos(Math.atan2(p.y - apex.y, p.x - apex.x) - Math.atan2(far.y - apex.y, far.x - apex.x)));
        const s = length / nominal;
        return { x: apex.x, y: apex.y, angle: Math.atan2(far.y - apex.y, far.x - apex.x), sx: s, sy: s, ax, ay };
      }
      if (shape === 'line' && pts.length === 4) {
        const start = mid(pts[0]!, pts[3]!);
        const end = mid(pts[1]!, pts[2]!);
        const width = Math.hypot(pts[0]!.x - pts[3]!.x, pts[0]!.y - pts[3]!.y);
        const h = m.size?.h ?? 1;
        return lineFit(m, start, end, width / h);
      }
      const b = boxOf(pts);
      const extent = Math.max(b.maxX - b.minX, b.maxY - b.minY);
      const s = (extent / nominal) * scale;
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, angle: turn, sx: s, sy: s, ax: 0.5, ay: 0.5 };
    }
    default:
      return { x: 0, y: 0, angle: turn, sx: sized, sy: sized, ax, ay };
  }
}

/**
 * Fits a line effect between two points: beams (`m.beam`) are stretched so their start→end
 * marks span the points; other art (a wall of fire) is centred and stretched along its length.
 */
function lineFit(m: EffectManifest, a: Pt, b: Pt, heightFactor: number): Placement {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const w = m.size?.w ?? nominalSquares(m);
  const ay = m.anchor?.[1] ?? 0.5;
  if (m.beam) {
    const span = Math.max(0.05, m.beam.end - m.beam.start) * w;
    return { x: a.x, y: a.y, angle, sx: length / span, sy: heightFactor, ax: m.beam.start, ay };
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle, sx: length / w, sy: heightFactor, ax: 0.5, ay };
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function centroid(pts: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}
