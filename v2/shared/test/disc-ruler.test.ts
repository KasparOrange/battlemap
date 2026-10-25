/**
 * The template disc (ported from `test/template_disc_test.dart`) and the L-ruler.
 */
import { describe, expect, test } from 'bun:test';
import {
  classicDisc, coneTriangle, discReach, discToMap, knobLocal, markerAngles, markerRadius, normalizeDisc, placeRuler,
  RIM_MARGIN, rimRadius, rotateRulerClockwise, rulerCenter, snapDiscPoint, type Ruler,
} from '../src/index.ts';

describe('the classic disc — the photo', () => {
  const d = classicDisc();

  test('rings, cubes and cones of the acrylic disc', () => {
    expect(d.rings.sizes).toEqual([5, 10, 15, 20]);
    expect(d.cubes.sizes).toEqual([10, 20, 30]);
    expect(d.cones.sizes).toEqual([15, 30]);
    expect([d.rings.line, d.cubes.line, d.cones.line]).toEqual(['solid', 'dotted', 'dotted']);
    expect(d.visible).toBe(false);
  });

  test('cones share one base; the 30 ft cone is centred, the 15 ft tip is the middle', () => {
    const c30 = coneTriangle(d, 30);
    const c15 = coneTriangle(d, 15);
    expect(c30[0].x).toBeCloseTo(3, 9);
    expect(c30[1].x).toBeCloseTo(-3, 9);
    expect(c15[0]).toEqual({ x: 0, y: 0 });
    expect(c15[1].x).toBeCloseTo(-3, 9);
    expect(c30[2].y - c30[1].y).toBeCloseTo(6, 9);
    expect(c15[2].y - c15[1].y).toBeCloseTo(3, 9);
  });

  test('the edge sits just outside the 30 ft cube corners (~21.2 ft)', () => {
    expect(discReach(d)).toBeCloseTo(3 * Math.SQRT2, 9);
    expect(rimRadius(d)).toBeCloseTo(3 * Math.SQRT2 + RIM_MARGIN, 9);
  });

  test('12 compass marks, the one under the ring labels left out', () => {
    const a = markerAngles(d);
    expect(a).toHaveLength(11);
    expect(a.some((x) => Math.abs(x - (3 * Math.PI) / 2) < 1e-9)).toBe(false);
    expect(markerRadius(d)).toBeCloseTo(3.5, 9);
  });
});

describe('disc', () => {
  test('cones from the middle start at the middle', () => {
    const d = { ...classicDisc(), coneAnchor: 'center' as const };
    expect(coneTriangle(d, 30)[0]).toEqual({ x: 0, y: 0 });
    expect(coneTriangle(d, 30)[1].x).toBeCloseTo(-6, 9);
  });

  test('rotation is normalised, sizes sorted and unique', () => {
    expect(normalizeDisc({ ...classicDisc(), rotation: -15 }).rotation).toBe(345);
    expect(normalizeDisc({ ...classicDisc(), rotation: 375 }).rotation).toBe(15);
    const d = classicDisc();
    expect(normalizeDisc({ ...d, rings: { ...d.rings, sizes: [20, 5, 20, 10] } }).rings.sizes).toEqual([5, 10, 20]);
  });

  test('toMap turns and moves a point of the disc; the knob sits west', () => {
    const d = { ...classicDisc(), x: 10, y: 5, rotation: 90 };
    const p = discToMap(d, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(6, 9);
    expect(knobLocal(d).x).toBeCloseTo(-rimRadius(d), 9);
  });

  test('snap to square middles and corners', () => {
    const p = { x: 3.3, y: 7.8 };
    expect(snapDiscPoint(classicDisc(), p)).toEqual(p);
    expect(snapDiscPoint({ ...classicDisc(), snap: 'squareCenters' }, p)).toEqual({ x: 3.5, y: 7.5 });
    expect(snapDiscPoint({ ...classicDisc(), snap: 'squareCorners' }, p)).toEqual({ x: 3, y: 8 });
  });
});

describe('ruler', () => {
  const r: Ruler = { visible: true, x: 0, y: 10, rotation: 0 };

  test('the middle of the L is half an arm right and half an arm up', () => {
    expect(rulerCenter(r)).toEqual({ x: 5, y: 5 });
  });

  test('turning keeps the middle; four turns come back', () => {
    let t = r;
    for (let i = 0; i < 4; i++) {
      t = rotateRulerClockwise(t);
      expect(rulerCenter(t)).toEqual({ x: 5, y: 5 });
    }
    expect(t).toEqual(r);
  });

  test('placing normalises the rotation', () => {
    expect(placeRuler(r, { x: 0, y: 0 }, 450).rotation).toBe(90);
    expect(placeRuler(r, { x: 0, y: 0 }, -90).rotation).toBe(270);
  });
});
