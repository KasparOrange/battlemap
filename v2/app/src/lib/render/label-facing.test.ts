import { describe, expect, test } from 'bun:test';
import { edgeFacing } from './label-facing.ts';

const size = { width: 1920, height: 1080 };

describe('labels face the nearest table edge', () => {
  test('each edge', () => {
    expect(edgeFacing({ x: 960, y: 1000 }, size)).toBe(0);
    expect(edgeFacing({ x: 960, y: 80 }, size)).toBe(Math.PI);
    expect(edgeFacing({ x: 60, y: 540 }, size)).toBe(Math.PI / 2);
    expect(edgeFacing({ x: 1860, y: 540 }, size)).toBe(-Math.PI / 2);
  });

  test('the middle of the table and ties go to the long sides', () => {
    expect(edgeFacing({ x: 960, y: 540 }, size)).toBe(0); // bottom = top: bottom
    expect(edgeFacing({ x: 100, y: 100 }, size)).toBe(Math.PI); // top = left: top
    expect(edgeFacing({ x: 100, y: 980 }, size)).toBe(0); // bottom = left: bottom
  });
});
