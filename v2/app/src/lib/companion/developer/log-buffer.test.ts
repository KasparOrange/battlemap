/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { BUFFER_LINES, bufferedLines, clearBuffer, filterLines, lineText, onBufferChange, record } from './log-buffer.ts';

describe('developer log buffer', () => {
  test('keeps the last lines, filters by level and text, clears', () => {
    clearBuffer();
    let changes = 0;
    const stop = onBufferChange(() => changes++);
    for (let i = 0; i < BUFFER_LINES + 20; i++) record('debug', 'net', `line ${i}`);
    record('warn', 'net', 'Slow round trip', { rttMs: 2193 });
    record('error', 'companion', 'Broken');
    const all = bufferedLines();
    expect(all).toHaveLength(BUFFER_LINES);
    expect(all.at(-1)?.msg).toBe('Broken');
    expect(filterLines(all, 'warn').map((l) => l.msg)).toEqual(['Slow round trip', 'Broken']);
    expect(filterLines(all, 'debug', 'rttms')).toHaveLength(1);
    expect(lineText(all.at(-2)!)).toMatch(/^\[\d\d:\d\d:\d\d\] WARN  net Slow round trip \{"rttMs":2193\}$/);
    clearBuffer();
    expect(bufferedLines()).toHaveLength(0);
    expect(changes).toBe(BUFFER_LINES + 23);
    stop();
  });
});
