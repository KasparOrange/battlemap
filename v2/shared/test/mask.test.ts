import { describe, expect, test } from 'bun:test';
import {
  applyPreview, decodeBase64, emptyMask, encodeBase64, fullMask, maskCells, maskCount, maskFromCells,
  maskToBytes, maskToTexels, setMaskCells,
} from '../src/index.ts';

describe('base64', () => {
  test('round-trips every length and every byte value', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) & 0xff);
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
    const all = new Uint8Array(256).map((_, i) => i);
    expect(decodeBase64(encodeBase64(all))).toEqual(all);
  });

  test('matches the platform encoder', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  test('damaged text gives fewer bytes, never throws', () => {
    expect(decodeBase64('A*B*C*D')).toEqual(decodeBase64('ABCD'));
    expect(decodeBase64('')).toEqual(new Uint8Array(0));
  });
});

describe('masks', () => {
  test('empty and full masks; bits past the last square stay clear', () => {
    expect(maskCount(emptyMask(13), 13)).toBe(0);
    expect(maskCount(fullMask(13), 13)).toBe(13);
    expect(maskToBytes(fullMask(13), 13)).toEqual(new Uint8Array([0xff, 0x1f]));
    expect(fullMask(16)).toBe(maskFromCells(16, [...Array(16).keys()]));
  });

  test('setting cells reports what changed and keeps the string when nothing did', () => {
    const m = emptyMask(20);
    const a = setMaskCells(m, 20, [1, 5, 5, 19, 25, -1], true);
    expect(a.changed).toBe(3);
    expect(maskCells(a.mask, 20)).toEqual([1, 5, 19]);
    const b = setMaskCells(a.mask, 20, [1, 5], true);
    expect(b.changed).toBe(0);
    expect(b.mask).toBe(a.mask);
    expect(maskCells(setMaskCells(a.mask, 20, [5], false).mask, 20)).toEqual([1, 19]);
  });

  test('equal squares give equal strings', () => {
    expect(maskFromCells(30, [3, 7])).toBe(setMaskCells(maskFromCells(30, [7]), 30, [3], true).mask);
  });

  test('a short mask is padded, a long one cut', () => {
    expect(maskCells(emptyMask(4), 20)).toEqual([]);
    expect(maskCells(fullMask(40), 10)).toEqual([...Array(10).keys()]);
  });

  test('applyPreview: (revealed ∪ reveal) ∖ hide', () => {
    const n = 10;
    const out = applyPreview(maskFromCells(n, [0, 1, 2]), maskFromCells(n, [5, 6]), maskFromCells(n, [1]), n);
    expect(maskCells(out, n)).toEqual([0, 2, 5, 6]);
  });

  test('texels: 255 for revealed squares, 0 elsewhere, into a reused buffer', () => {
    const out = new Uint8Array(12).fill(7);
    maskToTexels(maskFromCells(10, [0, 9]), 10, out);
    expect([...out.subarray(0, 10)]).toEqual([255, 0, 0, 0, 0, 0, 0, 0, 0, 255]);
  });
});
