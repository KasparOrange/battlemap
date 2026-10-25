/**
 * The relay with real sockets: hello, rooms, routing, takeover, heartbeat.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { TestClient, testServer, type TestServer } from './helpers.ts';

let srv: TestServer;
beforeAll(async () => (srv = await testServer(300)));
afterAll(async () => srv.stop());

describe('joining', () => {
  test('welcome lists the peers; the room hears about newcomers', async () => {
    const tv = await TestClient.open(srv.base, { role: 'tv', room: 'join', client: 'tv1', name: 'TV' });
    const c = await TestClient.open(srv.base, { room: 'join', client: 'c1' });
    expect((await tv.next('peer.joined')).peer).toEqual({ client: 'c1', role: 'companion', name: 'test' });
    c.close();
    expect(await tv.next('peer.left')).toMatchObject({ client: 'c1', role: 'companion' });
    tv.close();
  });

  test('the welcome tells the build the server serves', async () => {
    const ws = new WebSocket(srv.base.replace('http', 'ws') + '/ws');
    const welcome = await new Promise<Record<string, unknown>>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', protocol: 1, role: 'companion', room: 'b', client: 'cb', name: 'x', build: 'b' }));
      ws.onmessage = (ev) => resolve(JSON.parse(String(ev.data)));
    });
    expect(welcome).toMatchObject({ type: 'welcome', build: 'test-build', client: 'cb', peers: [] });
    ws.close();
  });

  test('no hello in time, a bad hello or another protocol: refused and closed', async () => {
    const silent = await TestClient.open(srv.base, null);
    expect(await silent.closed()).toBe(4002);
    const bad = await TestClient.open(srv.base, null);
    bad.send({ type: 'sync.cmd', seq: 1 });
    expect((await bad.next('server.error')).reason).toContain('hello');
    expect(await bad.closed()).toBe(4003);
    const old = await TestClient.open(srv.base, null);
    old.send({ type: 'hello', protocol: 99, role: 'tv', room: 'x', client: 'x', name: 'x', build: 'x' });
    expect(await old.closed()).toBe(4004);
  });
});

describe('routing', () => {
  test('companion → TV with from; TV → all companions; TV → one with to', async () => {
    const tv = await TestClient.open(srv.base, { role: 'tv', room: 'route', client: 'tv' });
    const a = await TestClient.open(srv.base, { room: 'route', client: 'a' });
    const b = await TestClient.open(srv.base, { room: 'route', client: 'b' });
    a.send({ type: 'sync.cmd', seq: 1, cmd: { type: 'history.undo' }, sent: 5 });
    expect(await tv.next('sync.cmd')).toEqual({ type: 'sync.cmd', seq: 1, cmd: { type: 'history.undo' }, sent: 5, from: 'a' });
    tv.send({ type: 'sync.applied', epoch: 'e', rev: 1, by: 'a', seq: 1, cmd: { type: 'history.undo' } });
    expect((await a.next('sync.applied')).from).toBe('tv');
    expect((await b.next('sync.applied')).rev).toBe(1);
    tv.send({ type: 'lib.listing', to: 'b', games: [] });
    expect((await b.next('lib.listing')).to).toBe('b');
    await Bun.sleep(50);
    expect(a.received.some((m) => m.type === 'lib.listing')).toBe(false);
    for (const c of [tv, a, b]) c.close();
  });

  test('no TV in the room: the command comes back undelivered with its seq', async () => {
    const c = await TestClient.open(srv.base, { room: 'empty', client: 'lonely' });
    c.send({ type: 'sync.cmd', seq: 7, cmd: { type: 'history.undo' } });
    expect(await c.next('relay.undelivered')).toMatchObject({ msgType: 'sync.cmd', seq: 7, reason: 'no-tv' });
    c.close();
  });

  test('ping → pong with the server clock', async () => {
    const c = await TestClient.open(srv.base, { room: 'ping', client: 'p' });
    c.send({ type: 'ping', t: 123 });
    const pong = await c.next('pong');
    expect(pong.t).toBe(123);
    expect(Math.abs(Number(pong.serverTime) - Date.now())).toBeLessThan(5_000);
    c.close();
  });
});

describe('takeover', () => {
  test('another TV takes the room: the old one is told and closed, companions see the change', async () => {
    const old = await TestClient.open(srv.base, { role: 'tv', room: 'take', client: 'tvA', name: 'Old TV' });
    const c = await TestClient.open(srv.base, { room: 'take', client: 'cx' });
    const fresh = await TestClient.open(srv.base, { role: 'tv', room: 'take', client: 'tvB', name: 'New TV' });
    expect((await old.next('replaced')).by).toBe('New TV');
    expect(await old.closed()).toBe(4001);
    expect(await c.next('peer.left')).toMatchObject({ client: 'tvA' });
    expect((await c.next('peer.joined')).peer).toMatchObject({ client: 'tvB' });
    c.send({ type: 'sync.request' });
    expect((await fresh.next('sync.request')).from).toBe('cx');
    for (const x of [c, fresh]) x.close();
  });

  test('the same client again just replaces its old socket, silently', async () => {
    const first = await TestClient.open(srv.base, { role: 'tv', room: 'same', client: 'tv1' });
    const second = await TestClient.open(srv.base, { role: 'tv', room: 'same', client: 'tv1' });
    expect(await first.closed()).toBe(4000);
    expect(first.received.some((m) => m.type === 'replaced')).toBe(false);
    const res = await fetch(`${srv.base}/api/tables`);
    const tables = ((await res.json()) as { tables: { room: string }[] }).tables;
    expect(tables.filter((t) => t.room === 'same')).toHaveLength(1);
    second.close();
  });
});
