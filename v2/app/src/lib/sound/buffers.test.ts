/**
 * Decoded sounds within the budget: shared decodes, pins keep sounds in use, the least recently
 * used idle sound goes first, a trim to 0 drops every idle one, a failed load can be retried.
 */
import { describe, expect, test } from 'bun:test';
import { SoundBuffers } from './buffers.ts';

/** A cache of "buffers" that are just their byte sizes. */
function cache(budget: number, sizes: Record<string, number>) {
  const loads: string[] = [];
  const evicted: string[] = [];
  const c = new SoundBuffers<number>({
    budgetBytes: budget,
    load: async (id) => {
      loads.push(id);
      if (!(id in sizes)) throw new Error('missing');
      return sizes[id]!;
    },
    bytes: (b) => b,
    onEvict: (id) => evicted.push(id),
  });
  return { c, loads, evicted };
}

describe('sound buffers', () => {
  test('two acquires at once share one load', async () => {
    const { c, loads } = cache(100, { rain: 10 });
    await Promise.all([c.acquire('rain'), c.acquire('rain')]);
    expect(loads).toEqual(['rain']);
    expect(c.held()).toEqual({ rain: 2 });
  });

  test('over budget: idle sounds go, least recently used first; pinned ones stay', async () => {
    const { c, evicted } = cache(25, { a: 10, b: 10, c: 10 });
    await c.acquire('a');
    await c.acquire('b');
    c.release('a');
    c.release('b');
    await c.acquire('a'); // a is used again: b is now the oldest idle
    c.release('a');
    await c.acquire('c'); // 30 > 25 → b goes
    expect(evicted).toEqual(['b']);
    expect(c.has('a') && c.has('c')).toBe(true);
    expect(c.bytes()).toBe(20);
  });

  test('a sound in use is never dropped, even over budget', async () => {
    const { c } = cache(5, { big: 10 });
    await c.acquire('big');
    c.trim(0);
    expect(c.has('big')).toBe(true);
    c.release('big');
    expect(c.has('big')).toBe(false); // over budget once idle
  });

  test('a failed load throws and can be tried again', async () => {
    const sizes: Record<string, number> = {};
    const { c, loads } = cache(100, sizes);
    await expect(c.acquire('x')).rejects.toThrow('missing');
    sizes.x = 1;
    expect(await c.acquire('x')).toBe(1);
    expect(loads).toEqual(['x', 'x']);
  });
});
