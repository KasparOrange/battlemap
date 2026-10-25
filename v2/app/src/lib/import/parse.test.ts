/// <reference types="bun" />
/**
 * Tests of the small pure parts: the UVTT parser (the old `uvtt_parser_test.dart` and
 * `drawn_doors_test.dart` cases, plus the origin and readable errors), picture headers, file
 * kinds, the size rules and the first grid guess. Run: `bun test` in app/.
 */
import { describe, expect, test } from 'bun:test';
import { ImportError } from './errors.ts';
import { guessGrid } from './grid-choice.ts';
import { classifyFile, kindFromName, mapNameFromFile } from './kind.ts';
import { detectionPlan, pdfRenderScale, tableCopyPlan, thumbSize, MAX_CANVAS_PIXELS } from './sizing.ts';
import { looksLikePdf, pictureKind, readPictureHeader } from './sniff.ts';
import { parseUvtt, uvttColor } from './uvtt.ts';
import { wholeGrid } from '@battlemap/shared';

/** A 1 × 1 red PNG (the old tests' dummy picture). */
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const pngBytes = () => Uint8Array.from(atob(TINY_PNG), (c) => c.charCodeAt(0));

/** A minimal UVTT file (the old `_makeUvttJson`). */
function uvtt(o: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 8 }, pixels_per_grid: 140 },
    line_of_sight: [],
    objects_line_of_sight: [],
    portals: [],
    lights: [],
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    image: TINY_PNG,
    ...o,
  });
}

const portal = (x0: number, y0: number, x1: number, y1: number, closed = true) => ({
  position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, bounds: [{ x: x0, y: y0 }, { x: x1, y: y1 }], rotation: 0, closed, freestanding: false,
});

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ImportError ? e.code : 'not-an-import-error';
  }
}

describe('parseUvtt', () => {
  test('resolution, squares and the picture', () => {
    const m = parseUvtt(uvtt());
    expect([m.cols, m.rows, m.pixelsPerGrid]).toEqual([10, 8, 140]);
    expect(m.format).toBe(0.3);
    expect(m.pictureExt).toBe('png');
    expect(Array.from(m.picture)).toEqual(Array.from(pngBytes()));
  });

  test('walls from both sight lists, doors from portal bounds, lights with #rrggbb colours', () => {
    const m = parseUvtt(uvtt({
      line_of_sight: [[{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]],
      objects_line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]],
      portals: [portal(3, 2, 3, 3), portal(6, 4, 7, 4, false)],
      lights: [{ position: { x: 2.5, y: 3.5 }, range: 4, intensity: 3, color: 'ffFFEBCF', shadows: true }],
    }));
    expect(m.geometry.walls).toEqual([[{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], [{ x: 1, y: 1 }, { x: 2, y: 1 }]]);
    expect(m.geometry.doors).toEqual([{ a: { x: 3, y: 2 }, b: { x: 3, y: 3 } }, { a: { x: 6, y: 4 }, b: { x: 7, y: 4 } }]);
    expect(m.geometry.lights).toEqual([{ x: 2.5, y: 3.5, range: 4, intensity: 3, color: '#ffebcf' }]);
  });

  test('the map origin is subtracted from walls, doors and lights', () => {
    const m = parseUvtt(uvtt({
      resolution: { map_origin: { x: 2, y: 1 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 256 },
      line_of_sight: [[{ x: 7, y: 2 }, { x: 7, y: 2.5 }]],
      portals: [portal(7, 2.5, 7, 3.5)],
      lights: [{ position: { x: 8.5, y: 9 }, range: 5, intensity: 1, color: 'ffeccd8b' }],
    }));
    expect(m.origin).toEqual({ x: 2, y: 1 });
    expect(m.geometry.walls[0]).toEqual([{ x: 5, y: 1 }, { x: 5, y: 1.5 }]);
    expect(m.geometry.doors[0]).toEqual({ a: { x: 5, y: 1.5 }, b: { x: 5, y: 2.5 } });
    expect(m.geometry.lights[0]).toMatchObject({ x: 6.5, y: 8 });
  });

  test('missing optional sections are empty; draw_doors defaults to false', () => {
    const m = parseUvtt(JSON.stringify({ resolution: { map_size: { x: 4, y: 3 }, pixels_per_grid: 50 }, image: TINY_PNG }));
    expect(m.geometry).toEqual({ walls: [], doors: [], lights: [] });
    expect(m.origin).toEqual({ x: 0, y: 0 });
    expect(m.drawDoors).toBe(false);
    expect(m.format).toBeNull();
  });

  test('battlemap.draw_doors is read; an extension without it means false', () => {
    expect(parseUvtt(uvtt({ battlemap: { draw_doors: true } })).drawDoors).toBe(true);
    expect(parseUvtt(uvtt({ battlemap: { other: 1 } })).drawDoors).toBe(false);
  });

  test('malformed entries are dropped and counted, not fatal', () => {
    const m = parseUvtt(uvtt({
      line_of_sight: [[{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 'a', y: 1 }, { x: 1, y: 1 }], 'junk'],
      portals: [{ bounds: [{ x: 1, y: 1 }] }, portal(1, 1, 2, 1)],
      lights: [{ range: 3 }],
    }));
    expect(m.geometry.walls).toEqual([[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
    expect(m.geometry.doors).toHaveLength(1);
    expect(m.dropped).toEqual({ walls: 2, doors: 1, lights: 1 });
  });

  test('a data: URL picture is accepted', () => {
    expect(parseUvtt(uvtt({ image: `data:image/png;base64,${TINY_PNG}` })).pictureExt).toBe('png');
  });

  test('broken files give readable errors', () => {
    expect(codeOf(() => parseUvtt(''))).toBe('corrupt');
    expect(codeOf(() => parseUvtt('{"foo": "bar"}'))).toBe('corrupt');
    expect(codeOf(() => parseUvtt('[1,2]'))).toBe('corrupt');
    expect(codeOf(() => parseUvtt(uvtt({ image: undefined })))).toBe('corrupt');
    expect(codeOf(() => parseUvtt(uvtt({ image: 'aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYSBwaWN0dXJl' })))).toBe('corrupt');
    expect(codeOf(() => parseUvtt(uvtt({ resolution: { map_size: { x: 10, y: 8 } } })))).toBe('corrupt');
    expect(codeOf(() => parseUvtt(uvtt({ resolution: { map_size: { x: 2000, y: 8 }, pixels_per_grid: 10 } })))).toBe('too-big');
    try {
      parseUvtt('{oops');
    } catch (e) {
      expect((e as Error).message).toContain('not valid JSON');
    }
  });

  test('colours', () => {
    expect(uvttColor('ffFFEBCF')).toBe('#ffebcf');
    expect(uvttColor('#a0b0c0')).toBe('#a0b0c0');
    expect(uvttColor(42)).toBe('#ffffff');
    expect(uvttColor('nope')).toBe('#ffffff');
  });
});

describe('picture headers', () => {
  test('PNG', () => {
    expect(readPictureHeader(pngBytes())).toEqual({ ext: 'png', width: 1, height: 1 });
  });

  test('JPEG: the size from the first frame marker, after other segments', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
    const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0xf0, 0x05, 0x58, 0x03, ...new Array(9).fill(0)];
    const b = new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
    expect(readPictureHeader(b)).toEqual({ ext: 'jpg', width: 1368, height: 1008 });
  });

  test('WebP lossy, lossless and extended', () => {
    const riff = (chunk: string, body: number[]) => new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)), [...chunk].map((c) => c.charCodeAt(0)), [0, 0, 0, 0], body));
    // VP8: frame tag (3), start code (3), then 14-bit width and height.
    expect(readPictureHeader(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x06, 0x08, 0x07, 0, 0])))
      .toEqual({ ext: 'webp', width: 1600, height: 1800 });
    // VP8L: signature 0x2f, then (w − 1) in 14 bits, (h − 1) in 14 bits.
    const bits = (1600 - 1) | ((1800 - 1) << 14);
    expect(readPictureHeader(riff('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255, 0, 0, 0, 0, 0])))
      .toEqual({ ext: 'webp', width: 1600, height: 1800 });
    // VP8X: flags (4), then (w − 1) and (h − 1) in 24 bits each.
    expect(readPictureHeader(riff('VP8X', [0, 0, 0, 0, 0x5b, 0x42, 0, 0x7f, 0x25, 0])))
      .toEqual({ ext: 'webp', width: 16988, height: 9600 });
  });

  test('anything else is no picture; PDFs are recognised', () => {
    expect(pictureKind(new TextEncoder().encode('{"format":0.3}'))).toBeNull();
    expect(readPictureHeader(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('hello'))).toBe(false);
  });
});

describe('file kinds', () => {
  const head = (s: string) => new TextEncoder().encode(s);
  test('by extension, case-insensitive', () => {
    expect(kindFromName('Castle.DD2VTT')).toBe('uvtt');
    expect(kindFromName('home.uvtt')).toBe('uvtt');
    expect(kindFromName('map.pdf')).toBe('pdf');
    expect(kindFromName('a.jpeg')).toBe('picture');
    expect(kindFromName('notes.txt')).toBeNull();
  });

  test('checked against the content', () => {
    expect(classifyFile('m.dd2vtt', 100, head('  {"format":0.3'))).toBe('uvtt');
    expect(classifyFile('m.png', 100, pngBytes())).toBe('picture');
    expect(classifyFile('m.pdf', 100, head('%PDF-1.4'))).toBe('pdf');
    expect(classifyFile('shared-file', 100, pngBytes())).toBe('picture'); // no extension: the content decides
  });

  test('empty, too big, unsupported, misnamed', () => {
    expect(codeOf(() => classifyFile('m.png', 0, new Uint8Array()))).toBe('empty');
    expect(codeOf(() => classifyFile('m.png', 300 * 1024 * 1024, pngBytes()))).toBe('too-big');
    expect(codeOf(() => classifyFile('notes.txt', 10, head('hello')))).toBe('unsupported');
    expect(codeOf(() => classifyFile('m.png', 10, head('%PDF-1.4')))).toBe('corrupt');
    expect(codeOf(() => classifyFile('m.dd2vtt', 10, pngBytes()))).toBe('corrupt');
  });

  test('map names', () => {
    expect(mapNameFromFile('04-vampire_lair.dd2vtt')).toBe('04-vampire lair');
    expect(mapNameFromFile('Tavern 30×40.webp')).toBe('Tavern 30×40');
    expect(mapNameFromFile('.png')).toBe('Map');
  });
});

describe('size rules', () => {
  test('table copy: 72 px per square, none when the picture keeps to it', () => {
    expect(tableCopyPlan(wholeGrid(16, 16, 1152, 1152))).toBeNull(); // 72 px squares already
    const p = tableCopyPlan(wholeGrid(10, 8, 1500, 1200))!; // 150 px squares
    expect([p.width, p.height]).toEqual([720, 576]);
    expect(p.pxPerSquare).toBeCloseTo(72, 5);
  });

  test('table copy: a huge map is held within the canvas area', () => {
    const p = tableCopyPlan(wholeGrid(114, 64, 17100, 9600))!;
    expect(p.width * p.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(p.pxPerSquare).toBeGreaterThan(32); // the renderer's floor
    expect(p.pxPerSquare).toBeLessThan(72);
  });

  test('table copy: a picture at low density but over the area limit still gets one', () => {
    const p = tableCopyPlan(wholeGrid(200, 200, 8000, 8000))!; // 40 px squares, 64 M px
    expect(p.width * p.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  test('thumbnail: 288 on the long side, never enlarged', () => {
    expect(thumbSize(6000, 3000)).toEqual({ width: 288, height: 144 });
    expect(thumbSize(100, 50)).toEqual({ width: 100, height: 50 });
  });

  test('PDF: the long side becomes 4096 px', () => {
    expect(pdfRenderScale(612, 792) * 792).toBeCloseTo(4096, 5); // US letter
    expect(pdfRenderScale(100, 5000) * 100 * pdfRenderScale(100, 5000) * 5000).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  test('detection plan: whole-factor averaging, strips within the canvas limit, scaled decode for giants', () => {
    expect(detectionPlan(1280, 960)).toMatchObject({ mode: 'strips', factor: 1 });
    const d = detectionPlan(6000, 6000);
    expect(d).toMatchObject({ mode: 'strips', factor: 2 });
    expect(d.stripRows % 2).toBe(0);
    expect(d.stripRows * 6000).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(detectionPlan(17100, 9600)).toMatchObject({ mode: 'scaled', factor: 6, width: 2850, height: 1600 });
  });
});

describe('first grid guess', () => {
  test('detected grid wins, with the note', () => {
    const g = guessGrid('x_10x10.png', 1000, 800, {
      cellPx: 60, offsetX: 23, offsetY: 23, strength: 0.8, cols: 16, rows: 13, pictureW: 1000, pictureH: 800,
    });
    expect(g.source).toBe('detected');
    expect(g.drawGrid).toBe(false);
    expect(g.note).toBe('Found a drawn grid: 16 × 13 squares of 60 px, starting 23 px in, 23 px down. Check it with "Fit on the picture".');
  });

  test('then the file name, then 20 across', () => {
    const n = guessGrid('Tavern_30x40.jpg', 3000, 4000, null);
    expect([n.source, n.grid.cols, n.grid.rows, n.drawGrid]).toEqual(['name', 30, 40, true]);
    expect(n.note).toContain('The file name says 30 × 40 squares');
    const d = guessGrid('tavern.jpg', 3000, 2000, null);
    expect([d.source, d.grid.cols, d.grid.rows, d.note]).toEqual(['default', 20, 13, null]);
  });
});
