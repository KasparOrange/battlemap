/** Tests of {@link LogRing}. */
import { describe, expect, test } from 'bun:test';
import { LogRing } from './log-ring.ts';

describe('LogRing', () => {
  test('keeps the newest lines, tells listeners, clears', () => {
    const ring = new LogRing(3);
    const seen: string[] = [];
    const off = ring.subscribe((l) => seen.push(l.msg));
    ring.push([1, 2, 3, 4].map((i) => ({ ts: `t${i}`, level: 'info', area: 'a', msg: `m${i}`, n: i })));
    expect(ring.lines().map((l) => l.msg)).toEqual(['m2', 'm3', 'm4']);
    expect(ring.lines()[0]!.props).toEqual({ n: 2 });
    expect(seen).toEqual(['m1', 'm2', 'm3', 'm4']);
    off();
    ring.push([{ ts: 't5', level: 'warn', area: 'a', msg: 'm5' }, null]);
    expect(seen).toHaveLength(4);
    ring.clear();
    expect(ring.lines()).toEqual([]);
  });
});
