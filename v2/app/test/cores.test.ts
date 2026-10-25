/**
 * The log outbox and the render scheduler.
 */
import { describe, expect, test } from 'bun:test';
import { createOutbox, type StorageLike } from '../src/lib/log-outbox.ts';
import { RenderScheduler } from '../src/lib/render/scheduler.ts';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('log outbox', () => {
  test('delivers when the server answers, keeps lines when it does not, sends them later', async () => {
    let online = false;
    const posted: unknown[][] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      if (!online) throw new Error('offline');
      posted.push(JSON.parse(String(init?.body)) as unknown[]);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const storage = memoryStorage();
    const box = createOutbox({ endpoint: '/log', storage, fetch: fakeFetch, retryMs: 0 });
    await box.send([{ msg: 'a' }, { msg: 'b' }]);
    expect(box.waiting()).toBe(2);
    online = true;
    await box.send([{ msg: 'c' }]);
    await Bun.sleep(10);
    expect(posted.flat()).toEqual([{ msg: 'c' }, { msg: 'a' }, { msg: 'b' }]);
    expect(box.waiting()).toBe(0);
    box.close();
  });

  test('keeps at most maxLines, dropping the oldest', async () => {
    const box = createOutbox({ endpoint: '/log', storage: memoryStorage(), fetch: (async () => { throw new Error('x'); }) as unknown as typeof fetch, maxLines: 3, retryMs: 0 });
    await box.send([1, 2]);
    await box.send([3, 4]);
    expect(box.waiting()).toBe(3);
    expect(box.dropped()).toBe(1);
    box.close();
  });

  test('rv#25: lines trimmed while a drain is in flight are not removed twice; no keepalive while visible', async () => {
    const storage = memoryStorage();
    let hold: (() => void) | null = null;
    let fail = true;
    const keepalives: boolean[] = [];
    const posted: unknown[][] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      keepalives.push(Boolean(init?.keepalive));
      if (fail) throw new Error('offline');
      const body = JSON.parse(String(init?.body)) as unknown[];
      if (body[0] === 1) await new Promise<void>((r) => (hold = r)); // the drain's batch hangs
      posted.push(body);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const box = createOutbox({ endpoint: '/log', storage, fetch: fakeFetch, maxLines: 4, retryMs: 0 });
    await box.send([1, 2, 3, 4]); // kept: 1 2 3 4
    fail = false;
    const draining = box.drain(); // posts 1 2 3 4, hangs
    await Bun.sleep(5);
    fail = true;
    await box.send([5, 6]); // kept: 3 4 5 6 (1 2 trimmed meanwhile)
    hold!();
    await draining;
    expect(JSON.parse(storage.data.get('bm.log.outbox')!)).toEqual([5, 6]);
    expect(keepalives.every((k) => !k)).toBe(true);
    box.close();
  });
});

describe('render scheduler', () => {
  function fakeFrames() {
    const queue: ((t: number) => void)[] = [];
    return { queue, request: (cb: (t: number) => void) => queue.push(cb), tick: () => queue.splice(0).forEach((cb) => cb(0)) };
  }

  test('invalidations within one frame coalesce; idle draws nothing', () => {
    const f = fakeFrames();
    let drawn = 0;
    const s = new RenderScheduler(() => drawn++, f.request);
    s.invalidate();
    s.invalidate();
    f.tick();
    f.tick();
    expect(drawn).toBe(1);
    expect(s.frames).toBe(1);
  });

  test('a lease keeps frames coming until it is released', () => {
    const f = fakeFrames();
    let drawn = 0;
    const s = new RenderScheduler(() => drawn++, f.request);
    const release = s.hold('fade');
    f.tick();
    f.tick();
    f.tick();
    expect(drawn).toBe(3);
    release();
    f.tick();
    f.tick();
    expect(drawn).toBe(4);
    expect(s.animating).toBe(false);
  });
});
