/**
 * The PDF page picker's logic (S16).
 */
import { describe, expect, test } from 'bun:test';
import { isPdfFile, pageCommitLabel, pickerSummary, togglePage } from './pdf-pages.ts';

describe('pdf page picker', () => {
  test('toggling keeps the pages sorted', () => {
    expect(togglePage([1], 3)).toEqual([1, 3]);
    expect(togglePage([1, 3], 2)).toEqual([1, 2, 3]);
    expect(togglePage([1, 2, 3], 1)).toEqual([2, 3]);
    expect(togglePage([], 5)).toEqual([5]);
  });

  test('texts', () => {
    expect(pickerSummary(1, 3, 3)).toEqual({ description: '3 pages — tap the maps', commit: 'Import this page' });
    expect(pickerSummary(2, 80, 60).commit).toBe('Import 2 pages as 2 maps');
    expect(pickerSummary(2, 80, 60).description).toBe('80 pages (the first 60 shown) — tap the maps');
    expect(pageCommitLabel('Upload and play', 0, 2)).toBe('Upload, next page (2 of 2)');
    expect(pageCommitLabel('Upload and play', 1, 2)).toBe('Upload and play');
    expect(pageCommitLabel('Add to the game', 0, 1)).toBe('Add to the game');
  });

  test('a PDF by name or by its first bytes', () => {
    const pdf = new TextEncoder().encode('%PDF-');
    expect(isPdfFile('Adventure.PDF', new Uint8Array())).toBe(true);
    expect(isPdfFile('download', pdf)).toBe(true);
    expect(isPdfFile('map.png', new Uint8Array([0x89, 0x50]))).toBe(false);
  });
});
