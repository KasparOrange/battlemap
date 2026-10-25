/**
 * The relay's hardening with real sockets and small limits: zombies, the rate limit, caps on
 * rooms / companions / waiting sockets, forged server messages.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { TestClient, testServer, type TestServer } from './helpers.ts';

let srv: TestServer;
beforeAll(async () => {
  srv = await testServer(500, {
    relay: { zombieMs: 300, sweepMs: 50, ratePerS: 10, rateBurst: 5, rateCloseAfter: 15, companionsPerRoom: 2, maxRooms: 3, waitingPerIp: 2 },
  });
});
afterAll(async () => srv.stop());

/** Closes clients and lets the server notice. */
async function closeAll(...clients: TestClient[]): Promise<void> {
  for (const c of clients) c.close();
  await Bun.sleep(50);
}

describe('relay limits', () => {
  test('a silent socket is closed as a zombie; one that pings stays', async () => {
    const silent = await TestClient.open(srv.base, { room: 'z', client: 'silent' });
    const alive = await TestClient.open(srv.base, { room: 'z', client: 'alive' });
    const pinger = setInterval(() => alive.send({ type: 'ping', t: Date.now() }), 100);
    expect(await silent.closed(2_000)).toBe(4005);
    expect(alive.closedWith).toBe(null);
    clearInterval(pinger);
    await closeAll(alive);
  });

  test('over the rate: messages dropped, a sync.cmd comes back rate-limited; a flood closes the socket', async () => {
    const tv = await TestClient.open(srv.base, { role: 'tv', room: 'rate', client: 'tvR' });
    const c = await TestClient.open(srv.base, { room: 'rate', client: 'fast' });
    for (let seq = 1; seq <= 8; seq++) c.send({ type: 'sync.cmd', seq, cmd: { type: 'history.undo' } });
    const back = await c.next('relay.undelivered');
    expect(back).toMatchObject({ reason: 'rate-limited', msgType: 'sync.cmd' });
    await Bun.sleep(100);
    const arrived = tv.received.filter((m) => m.type === 'sync.cmd').length;
    expect(arrived).toBeGreaterThanOrEqual(5);
    expect(arrived).toBeLessThan(8);
    for (let i = 0; i < 40; i++) c.send({ type: 'diag.status' });
    expect(await c.closed()).toBe(4006);
    await closeAll(tv);
  });

  test('a client cannot forge server messages', async () => {
    const tv = await TestClient.open(srv.base, { role: 'tv', room: 'forge', client: 'tvF' });
    const c = await TestClient.open(srv.base, { room: 'forge', client: 'liar' });
    await tv.next('peer.joined');
    c.send({ type: 'replaced', by: 'me' });
    c.send({ type: 'welcome', client: 'x' });
    c.send({ type: 'sync.request' });
    await tv.next('sync.request');
    expect(tv.received.some((m) => m.type === 'replaced' || m.type === 'welcome')).toBe(false);
    await closeAll(tv, c);
  });

  test('companions per room: the third is refused; the same client again is fine', async () => {
    const a = await TestClient.open(srv.base, { room: 'full', client: 'a' });
    const b = await TestClient.open(srv.base, { room: 'full', client: 'b' });
    const c = await TestClient.open(srv.base, null);
    c.send({ type: 'hello', protocol: 1, role: 'companion', room: 'full', client: 'c', name: 'x', build: 'x' });
    expect((await c.next('server.error')).reason).toContain('companions');
    expect(await c.closed()).toBe(4008);
    const again = await TestClient.open(srv.base, { room: 'full', client: 'b' });
    expect(await b.closed()).toBe(4000);
    await closeAll(a, again);
  });

  test('rooms on the server are capped', async () => {
    const open = [];
    for (const r of ['r1', 'r2', 'r3']) open.push(await TestClient.open(srv.base, { room: r, client: `c-${r}` }));
    const fourth = await TestClient.open(srv.base, null);
    fourth.send({ type: 'hello', protocol: 1, role: 'tv', room: 'r4', client: 'tv4', name: 'x', build: 'x' });
    expect(await fourth.closed()).toBe(4008);
    const sameRoom = await TestClient.open(srv.base, { room: 'r1', client: 'c-r1b' });
    expect(sameRoom.closedWith).toBe(null);
    await closeAll(...open, sameRoom);
  });

  test('sockets waiting for hello are capped per address', async () => {
    const a = await TestClient.open(srv.base, null);
    const b = await TestClient.open(srv.base, null);
    const c = await TestClient.open(srv.base, null);
    expect(await c.closed()).toBe(4008);
    await closeAll(a, b);
    const later = await TestClient.open(srv.base, { room: 'w', client: 'later' });
    expect(later.closedWith).toBe(null);
    await closeAll(later);
  });

  test('/health counts tvs and companions', async () => {
    const tv = await TestClient.open(srv.base, { role: 'tv', room: 'h', client: 'tvH' });
    const c = await TestClient.open(srv.base, { room: 'h', client: 'cH' });
    const body = (await (await fetch(`${srv.base}/health`)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, tvs: 1, companions: 1, rooms: 1, library: 0, games: 0, serverBuild: 'dev' });
    await closeAll(tv, c);
  });
});
