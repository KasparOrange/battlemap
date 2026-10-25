/**
 * The one-shot import of v1's shared library, against a test server and a made-up v1 folder.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LibraryEntry, MapGeometry } from '@battlemap/shared';
import { importV1Library } from '../scripts/import-v1-library.ts';
import { splitUvtt, uvttColor } from '../scripts/v1-library.ts';
import { testServer, type TestServer } from './helpers.ts';
import { picture } from './pictures.ts';

let srv: TestServer;
let v1: string;
const quiet = { info: () => undefined, warn: () => undefined };

/** A small .dd2vtt: 4 × 3 squares of 100 px, origin (2, 1), one wall, one door, one light. */
async function dd2vtt(drawDoors: boolean): Promise<string> {
  const png = await picture(400, 300, 'png', 'noise');
  return JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 2, y: 1 }, map_size: { x: 4, y: 3 }, pixels_per_grid: 100 },
    line_of_sight: [[{ x: 2, y: 1 }, { x: 6, y: 1 }]],
    objects_line_of_sight: [[{ x: 3, y: 2 }, { x: 3, y: 3 }]],
    portals: [{ position: { x: 4, y: 1 }, bounds: [{ x: 3.5, y: 1 }, { x: 4.5, y: 1 }], rotation: 0, closed: true, freestanding: false }],
    lights: [{ position: { x: 3, y: 2 }, range: 4, intensity: 0.8, color: 'ffeccd8b', shadows: true }],
    environment: {},
    ...(drawDoors ? { battlemap: { draw_doors: true } } : {}),
    image: Buffer.from(png).toString('base64'),
  });
}

beforeAll(async () => {
  srv = await testServer();
  v1 = mkdtempSync(join(tmpdir(), 'claude-v2-server-v1lib-'));
  writeFileSync(join(v1, 'aaaaaaaaaaaa.jpg'), await picture(400, 300, 'jpeg'));
  writeFileSync(join(v1, 'bbbbbbbbbbbb.dd2vtt'), await dd2vtt(true));
  writeFileSync(join(v1, 'cccccccccccc.png'), new TextEncoder().encode('not a picture'));
  writeFileSync(join(v1, 'index.json'), JSON.stringify({ maps: [
    { id: 'cccccccccccc', name: 'Broken', kind: 'image', gridCols: 4, gridRows: 3, hasOwnGrid: false, file: 'cccccccccccc.png', addedAt: '2026-10-10T19:30:12+00:00' },
    { id: 'bbbbbbbbbbbb', name: 'AI keep', kind: 'vtt', gridCols: 4, gridRows: 3, hasOwnGrid: false, file: 'bbbbbbbbbbbb.dd2vtt', addedAt: '2026-10-10T19:30:10+00:00' },
    { id: 'aaaaaaaaaaaa', name: "Juri's cave", kind: 'image', gridCols: 40, gridRows: 30, hasOwnGrid: true, file: 'aaaaaaaaaaaa.jpg', addedAt: '2026-10-09T10:00:00+00:00' },
  ] }));
});
afterAll(async () => {
  await srv.stop();
  rmSync(v1, { recursive: true, force: true });
});

describe('v1 library import', () => {
  test('a .dd2vtt splits into picture and geometry in squares, origin subtracted', async () => {
    const parts = splitUvtt(await dd2vtt(true));
    expect(parts).toMatchObject({ cols: 4, rows: 3, pixelsPerGrid: 100, drawDoors: true });
    expect(parts.geometry.walls).toEqual([[{ x: 0, y: 0 }, { x: 4, y: 0 }], [{ x: 1, y: 1 }, { x: 1, y: 2 }]]);
    expect(parts.geometry.doors).toEqual([{ a: { x: 1.5, y: 0 }, b: { x: 2.5, y: 0 } }]);
    expect(parts.geometry.lights).toEqual([{ x: 1, y: 1, range: 4, intensity: 0.8, color: '#eccd8b' }]);
    expect(uvttColor('#a1b2c3')).toBe('#a1b2c3');
    expect(uvttColor(null)).toBe('#ffffff');
  });

  test('imports pictures and maps with their squares, dates and order; a broken one fails alone; a second run skips', async () => {
    const first = await importV1Library(v1, srv.base, quiet);
    expect(first.imported).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(first.failed.map((f) => f.id)).toEqual(['cccccccccccc']);
    const { entries } = (await (await fetch(`${srv.base}/api/library`)).json()) as { entries: LibraryEntry[] };
    expect(entries.map((e) => e.map.id)).toEqual(['bbbbbbbbbbbb', 'aaaaaaaaaaaa']);
    const [keep, cave] = entries as [LibraryEntry, LibraryEntry];
    expect(cave.map).toMatchObject({ name: "Juri's cave", kind: 'picture', drawGrid: false, geometry: null, libraryId: 'aaaaaaaaaaaa' });
    expect(cave.map.picture.ext).toBe('jpg');
    expect(cave.map.grid).toMatchObject({ cols: 40, rows: 30, cellW: 10, pictureW: 400 });
    expect(cave.map.tableCopy).toBe(null);
    expect(cave.addedAt).toBe('2026-10-09T10:00:00.000Z');
    expect(cave.thumb).not.toBe(null);
    expect(keep.map).toMatchObject({ kind: 'uvtt', drawGrid: true, drawDoors: true, doorCount: 1 });
    expect(keep.map.grid).toMatchObject({ cols: 4, rows: 3, cellW: 100 });
    expect(keep.map.tableCopy?.ext).toBe('webp');
    const geo = (await (await fetch(`${srv.base}/files/${keep.map.geometry!.hash}.json`)).json()) as MapGeometry;
    expect(geo.doors).toHaveLength(1);
    const again = await importV1Library(v1, srv.base, quiet);
    expect(again.imported).toEqual([]);
    expect(again.skipped.sort()).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
  });
});
