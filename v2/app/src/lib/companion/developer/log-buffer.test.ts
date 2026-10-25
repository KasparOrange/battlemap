/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { LogRing } from '../../log-ring.ts';
import { bufferedLines, clearBuffer, filterLines, lineText, onBufferChange } from './log-buffer.ts';

/** A line as the logger ships it (page context included). */
function shipped(level: string, area: string, msg: string, props: Record<string, unknown> = {}) {
  return { ts: '2026-10-25T20:15:07.000Z', level, area, msg, session: 's1', build: 'dev', role: 'companion', client: 'c-1', ...props };
}

describe('developer log lines (from the logger ring)', () => {
  test('reads the ring, drops the page context, filters by level and text, clears', () => {
    const ring = new LogRing(500);
    let changes = 0;
    const stop = onBufferChange(() => changes++, ring);
    ring.push(Array.from({ length: 520 }, (_, i) => shipped('debug', 'net', `line ${i}`)));
    ring.push([shipped('warn', 'net', 'Slow round trip', { rttMs: 2193 }), shipped('error', 'companion', 'Broken')]);
    const all = bufferedLines(ring);
    expect(all).toHaveLength(500);
    expect(all.at(-1)?.msg).toBe('Broken');
    expect(all.at(-1)?.props).toBe(''); // only context: nothing to show
    expect(filterLines(all, 'warn').map((l) => l.msg)).toEqual(['Slow round trip', 'Broken']);
    expect(filterLines(all, 'debug', 'rttms')).toHaveLength(1);
    expect(lineText(all.at(-2)!)).toMatch(/^\[\d\d:\d\d:\d\d\] WARN  net Slow round trip \{"rttMs":2193\}$/);
    // numbers stay with their line between reads (list keys)
    expect(bufferedLines(ring).at(-1)!.n).toBe(all.at(-1)!.n);
    clearBuffer(ring);
    expect(bufferedLines(ring)).toHaveLength(0);
    expect(changes).toBe(522);
    stop();
  });
});
