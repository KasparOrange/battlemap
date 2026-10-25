import { describe, expect, test } from 'bun:test';
import { BootTiming, bootSplit } from './boot-timing.ts';
import type { Logger } from '../log.ts';

function fakeLog() {
  const lines: { area: string; msg: string; fields: Record<string, unknown> }[] = [];
  const add = (area: string, msg: string, fields: Record<string, unknown> = {}) => lines.push({ area, msg, fields });
  return { lines, log: { debug: add, info: add, warn: add, error: add } as unknown as Logger };
}

describe('TV start timing', () => {
  test('the split is the time between reached steps, in order', () => {
    expect(bootSplit({ script: 30, mounted: 31, renderer: 250, booted: 180, 'map-loading': 252, 'map-shown': 400, frame: 410 }))
      .toEqual({ script: 30, mounted: 1, booted: 149, renderer: 70, 'map-loading': 2, 'map-shown': 148, frame: 10, total: 410 });
    expect(bootSplit({})).toEqual({ total: 0 });
  });

  test('marks once, reports once, as area perf', () => {
    const { lines, log } = fakeLog();
    let t = 10;
    const timing = new BootTiming(log, () => t);
    timing.mark('script');
    t = 20;
    timing.mark('script'); // the second time is ignored
    timing.mark('mounted');
    t = 500;
    timing.report({ mapMs: 90 });
    timing.report();
    timing.mark('map-loading'); // a later map is not the start any more
    expect(timing.snapshot()).toEqual({ script: 10, mounted: 20, frame: 500 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.area).toBe('perf');
    expect(lines[0]!.fields).toEqual({ script: 10, mounted: 10, frame: 480, total: 500, mapMs: 90 });
  });

  test('a start without a map reports that and nothing later', () => {
    const { lines, log } = fakeLog();
    const timing = new BootTiming(log, () => 5);
    timing.mark('script');
    timing.noMap();
    timing.report();
    expect(lines.map((l) => l.msg)).toEqual(['TV start without a map']);
  });
});
