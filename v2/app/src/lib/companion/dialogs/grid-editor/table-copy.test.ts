/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { wholeGrid } from '@battlemap/shared';
import { copyChanges } from './table-copy.ts';

describe('in-game regrid table copy (rv#29)', () => {
  test('a small picture never needs a copy', () => {
    expect(copyChanges(wholeGrid(20, 15, 1000, 750), wholeGrid(40, 30, 1000, 750))).toBe(false);
  });
  test('a much finer grid on a big picture needs a new copy', () => {
    expect(copyChanges(wholeGrid(20, 15, 8000, 6000), wholeGrid(80, 60, 8000, 6000))).toBe(true);
  });
  test('a nudge of the same grid keeps the copy', () => {
    expect(copyChanges(wholeGrid(40, 30, 8000, 6000), wholeGrid(40, 30, 8000, 6000))).toBe(false);
  });
});
