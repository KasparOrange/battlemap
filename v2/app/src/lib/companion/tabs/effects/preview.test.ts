/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { MAX_PREVIEW_FRAMES, previewKeyframes, previewLayout, sheetPreview } from './preview.ts';

const sheet = (frames: [number, number, number][], fps = 10) => ({
  technique: 'sheet',
  sheet: { atlases: [{ file: 'atlas-0.webp', w: 1000, h: 500 }, { file: 'atlas-1.webp', w: 1000, h: 500 }], frameW: 200, frameH: 100, frames, fps },
});

describe('effect previews', () => {
  test('only sprite sheets, only the first atlas, long sheets sampled', () => {
    expect(sheetPreview({ technique: 'shader' }, '/fx/a/')).toBeNull();
    expect(sheetPreview(sheet([[0, 0, 0]]), '/fx/a/')).toBeNull(); // one frame: nothing to loop
    const p = sheetPreview(sheet([[0, 0, 0], [0, 200, 0], [1, 0, 0]]), '/fx/a/')!;
    expect(p.url).toBe('/fx/a/atlas-0.webp');
    expect(p.frames).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const long = sheetPreview(sheet(Array.from({ length: 120 }, (_, i) => [0, i, 0] as [number, number, number]), 30), '/fx/a/')!;
    expect(long.frames).toHaveLength(MAX_PREVIEW_FRAMES);
    expect(long.fps).toBeCloseTo(10, 5); // the same loop length: 120 frames at 30 fps = 40 at 10
  });

  test('fits the frame into the stage and steps through the frames', () => {
    const p = sheetPreview(sheet([[0, 0, 0], [0, 200, 0], [0, 400, 100]]), '/fx/a/')!;
    const l = previewLayout(p, 50);
    expect(l).toMatchObject({ w: 50, h: 25, bgW: 250, bgH: 125, scale: 0.25 });
    const { keyframes, durationMs } = previewKeyframes(p, l.scale);
    expect(durationMs).toBe(300);
    expect(keyframes.map((k) => k.backgroundPosition)).toEqual(['0px 0px', '-50px 0px', '-100px -25px', '-100px -25px']);
    expect(keyframes[1]).toMatchObject({ offset: 1 / 3, easing: 'step-end' });
  });
});
