/// <reference types="bun" />
/**
 * The test map set (`docs/test-session.md`, fetched into `test_assets/maps/` by
 * `tools/fetch_test_maps.py`; gitignored, so these tests skip on a machine without them) through
 * the worker's preparation with the sharp engine: the right squares, walls and doors, the table
 * copy within the limits, the thumbnail, and timings. Run: `bun test` in app/.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { prepareUvtt, preparePicture, type Prepared } from './prepare.ts';
import { sharpBackend } from './test/sharp-backend.ts';
import { MAX_CANVAS_PIXELS, MAX_COPY_SIDE, TABLE_PX_PER_SQUARE, THUMB_SIDE } from './sizing.ts';

const DIR = new URL('../../../../../test_assets/maps/', import.meta.url).pathname;
const backend = sharpBackend();
const have = (f: string) => backend !== null && existsSync(DIR + f);

/** Prepares one test map and logs what came out (the report's numbers). */
async function run(file: string): Promise<Prepared> {
  const blob = new Blob([readFileSync(DIR + file)]);
  const steps: string[] = [];
  const t0 = performance.now();
  const p = /\.(dd2vtt|uvtt)$/.test(file)
    ? await prepareUvtt(blob, backend!, (s) => steps.push(s))
    : await preparePicture(blob, file, backend!, (s) => steps.push(s));
  const d = p.detection;
  process.stdout.write(
    `${file}: ${p.grid.cols}×${p.grid.rows} (${p.gridOrigin})` +
    `${d ? ` cell ${d.cellPx.toFixed(2)} off ${d.offsetX.toFixed(1)},${d.offsetY.toFixed(1)} s ${d.strength.toFixed(2)}` : ''}` +
    ` picture ${p.picture.width}×${p.picture.height} copy ${p.tableCopy ? `${p.tableCopy.width}×${p.tableCopy.height}` : '-'}` +
    ` ${Math.round(performance.now() - t0)} ms ${JSON.stringify(p.timings)}${p.warnings.length ? ' ' + p.warnings.join('; ') : ''}\n`,
  );
  // Limits every map keeps.
  if (p.tableCopy) {
    expect(p.tableCopy.width * p.tableCopy.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(Math.max(p.tableCopy.width, p.tableCopy.height)).toBeLessThanOrEqual(MAX_COPY_SIDE);
    expect(p.tableCopy.width / p.grid.cols).toBeLessThanOrEqual(TABLE_PX_PER_SQUARE + 0.5);
  }
  expect(p.thumb).not.toBeNull();
  expect(Math.max(p.thumb!.width, p.thumb!.height)).toBeLessThanOrEqual(THUMB_SIDE);
  return p;
}

describe('the test map set', () => {
  const uvtt: [string, number, number, number][] = [
    ['01-eldrica-house-10x8.dd2vtt', 10, 8, 2],
    ['02-small-home-16x18.uvtt', 16, 18, 29],
    ['03-przerzut-16x16.dd2vtt', 16, 16, 12],
    ['04-vampire-lair-19x14.dd2vtt', 19, 14, 5],
    ['05-tower-ground-11x11.dd2vtt', 11, 11, 5],
    ['06-tower-upper-11x11.dd2vtt', 11, 11, 7],
  ];
  for (const [file, cols, rows, doors] of uvtt) {
    test.skipIf(!have(file))(file, async () => {
      const p = await run(file);
      expect([p.grid.cols, p.grid.rows]).toEqual([cols, rows]);
      expect(p.counts!.doors).toBe(doors);
      expect(p.kind).toBe('uvtt');
    });
  }

  test.skipIf(!have('07-STRESS-castle-114x64-30MB.dd2vtt'))('07 the 30 MB castle: 2142 walls, 57 doors, a table copy within the limits', async () => {
    const p = await run('07-STRESS-castle-114x64-30MB.dd2vtt');
    expect([p.grid.cols, p.grid.rows]).toEqual([114, 64]);
    expect(p.counts!.doors).toBe(57);
    expect(p.counts!.lights).toBe(80);
    expect(p.tableCopy).not.toBeNull();
  }, 60_000);

  test.skipIf(!have('08a-vampire-lair-image-19x14.jpg'))('08a the lair as a JPEG: 19 × 14', async () => {
    const p = await run('08a-vampire-lair-image-19x14.jpg');
    expect([p.grid.cols, p.grid.rows]).toEqual([19, 14]);
  });

  test.skipIf(!have('08b-small-home-image-16x18.webp'))('08b the small home as WebP: 16 × 18', async () => {
    const p = await run('08b-small-home-image-16x18.webp');
    expect([p.grid.cols, p.grid.rows]).toEqual([16, 18]);
  });

  test.skipIf(!have('09-dyson-twelve-goats-tavern-6000px.png'))('09 the Dyson tavern: its own grid, 25 × 25 of 240 px', async () => {
    const p = await run('09-dyson-twelve-goats-tavern-6000px.png');
    expect(p.gridOrigin).toBe('detected');
    expect([p.grid.cols, p.grid.rows]).toEqual([25, 25]);
    expect(Math.abs(p.detection!.cellPx - 240)).toBeLessThan(1);
    expect(p.drawGrid).toBe(false);
  }, 60_000);
});
