/**
 * The relay's hardening on the tight server (tiny limits, `run.ts`): zombies, the rate limit,
 * caps on rooms / companions / waiting sockets, the frame size. Skipped without
 * `SERVER_TIGHT_URL`. The tests run one after another and close what they open — the room cap
 * is three.
 */
import { describe, expect, test } from 'bun:test';
import { TIGHT, TIGHT_LIMITS, TestClient, closeAll } from '../lib.ts';

const T = TIGHT;

describe.skipIf(!TIGHT)('relay limits', () => {
  test('a silent socket is closed as a zombie; one that pings stays', async () => {
    const silent = await TestClient.open(T, { room: 'z', client: 'silent' });
    const alive = await TestClient.open(T, { room: 'z', client: 'alive' });
    const pinger = setInterval(() => alive.send({ type: 'ping', t: Date.now() }), 100);
    expect(await silent.closed(2_000)).toBe(4005);
    expect(alive.closedWith).toBe(null);
    clearInterval(pinger);
    await closeAll(alive);
  });

  test('over the rate: messages dropped, a sync.cmd comes back rate-limited; a flood closes the socket', async () => {
    const tv = await TestClient.open(T, { role: 'tv', room: 'rate', client: 'tvR' });
    const c = await TestClient.open(T, { room: 'rate', client: 'fast' });
    for (let seq = 1; seq <= 8; seq++) c.send({ type: 'sync.cmd', seq, cmd: { type: 'history.undo' } });
    const back = await c.next('relay.undelivered');
    expect(back).toMatchObject({ reason: 'rate-limited', msgType: 'sync.cmd' });
    await new Promise((r) => setTimeout(r, 100));
    const arrived = tv.received.filter((m) => m.type === 'sync.cmd').length;
    expect(arrived).toBeGreaterThanOrEqual(TIGHT_LIMITS.rateBurst);
    expect(arrived).toBeLessThan(8);
    for (let i = 0; i < 40; i++) c.send({ type: 'diag.status' });
    expect(await c.closed()).toBe(4006);
    await closeAll(tv);
  });

  test('companions per room: the third is refused; the same client again is fine', async () => {
    const a = await TestClient.open(T, { room: 'full', client: 'a' });
    const b = await TestClient.open(T, { room: 'full', client: 'b' });
    const c = await TestClient.open(T, null);
    c.send({ type: 'hello', protocol: 1, role: 'companion', room: 'full', client: 'c', name: 'x', build: 'x' });
    expect((await c.next('server.error')).reason).toContain('companions');
    expect(await c.closed()).toBe(4008);
    const again = await TestClient.open(T, { room: 'full', client: 'b' });
    expect(await b.closed()).toBe(4000);
    const tv = await TestClient.open(T, { role: 'tv', room: 'full', client: 'tvFull' });
    expect(tv.closedWith).toBe(null);
    await closeAll(a, again, tv);
  });

  test('rooms on the server are capped', async () => {
    const open = [];
    for (const r of ['r1', 'r2', 'r3']) open.push(await TestClient.open(T, { room: r, client: `c-${r}` }));
    const fourth = await TestClient.open(T, null);
    fourth.send({ type: 'hello', protocol: 1, role: 'tv', room: 'r4', client: 'tv4', name: 'x', build: 'x' });
    expect((await fourth.next('server.error')).reason).toContain('full');
    expect(await fourth.closed()).toBe(4008);
    const sameRoom = await TestClient.open(T, { room: 'r1', client: 'c-r1b' });
    expect(sameRoom.closedWith).toBe(null);
    await closeAll(...open, sameRoom);
  });

  test('sockets waiting for hello are capped per address; a hello frees the slot', async () => {
    const a = await TestClient.open(T, null);
    const b = await TestClient.open(T, null);
    const c = await TestClient.open(T, null);
    expect(await c.closed()).toBe(4008);
    a.send({ type: 'hello', protocol: 1, role: 'companion', room: 'w', client: 'wa', name: 'x', build: 'x' });
    await a.next('welcome');
    const d = await TestClient.open(T, null);
    await new Promise((r) => setTimeout(r, 50));
    expect(d.closedWith).toBe(null);
    await closeAll(a, b, d);
    const later = await TestClient.open(T, { room: 'w', client: 'later' });
    expect(later.closedWith).toBe(null);
    await closeAll(later);
  });

  test('a frame over the size limit closes the socket (1009 "too big", or dropped: 1006)', async () => {
    const c = await TestClient.open(T, { room: 'frame', client: 'cFrame' });
    c.send({ type: 'sync.request', pad: 'x'.repeat(TIGHT_LIMITS.maxFrameBytes + 1024) });
    expect([1006, 1009]).toContain(await c.closed());
  });

  test('/health counts tvs and companions on a fresh data folder', async () => {
    const tv = await TestClient.open(T, { role: 'tv', room: 'h', client: 'tvH' });
    const c = await TestClient.open(T, { room: 'h', client: 'cH' });
    const body = (await (await fetch(`${T}/health`)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, tvs: 1, companions: 1, rooms: 1, members: 2, waiting: 0, library: 0, games: 0, serverBuild: 'contract' });
    await closeAll(tv, c);
  });
});
