/**
 * The relay with real sockets on the main server: hello, rooms, routing, takeover, heartbeat.
 */
import { describe, expect, test } from 'bun:test';
import { BASE, MAIN, TestClient, call, closeAll, sleep } from '../lib.ts';

describe('joining', () => {
  test('welcome lists the peers; the room hears about newcomers and leavers', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'join', client: 'tv1', name: 'TV' });
    const c = await TestClient.open(BASE, { room: 'join', client: 'c1' });
    expect((await tv.next('peer.joined')).peer).toEqual({ client: 'c1', role: 'companion', name: 'test' });
    const d = await TestClient.open(BASE, { room: 'join', client: 'c2', name: 'Second' });
    expect((await tv.next('peer.joined')).peer).toEqual({ client: 'c2', role: 'companion', name: 'Second' });
    expect((await c.next('peer.joined')).peer).toMatchObject({ client: 'c2' });
    c.close();
    expect(await tv.next('peer.left')).toEqual({ type: 'peer.left', client: 'c1', role: 'companion' });
    expect(await d.next('peer.left')).toMatchObject({ client: 'c1' });
    await closeAll(tv, d);
  });

  test('the welcome: client, room, role, the peers, the build the server serves, the server clock', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'wel', client: 'tvW', name: 'Table' });
    const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws');
    const welcome = await new Promise<Record<string, unknown>>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', protocol: 1, role: 'companion', room: 'wel', client: 'cb', name: 'x', build: 'b' }));
      ws.onmessage = (ev) => resolve(JSON.parse(String(ev.data)));
    });
    expect(welcome).toMatchObject({ type: 'welcome', client: 'cb', room: 'wel', role: 'companion', build: 'test-build', peers: [{ client: 'tvW', role: 'tv', name: 'Table' }] });
    expect(Math.abs(Number(welcome.serverTime) - Date.now())).toBeLessThan(5_000);
    ws.close();
    await closeAll(tv);
  });

  test('no hello in time, a bad hello, a ping first, another protocol: server.error and closed', async () => {
    const silent = await TestClient.open(BASE, null);
    expect(await silent.closed(MAIN.helloTimeoutMs + 2_000)).toBe(4002);
    const bad = await TestClient.open(BASE, null);
    bad.send({ type: 'sync.cmd', seq: 1 });
    expect((await bad.next('server.error')).reason).toContain('hello');
    expect(await bad.closed()).toBe(4003);
    const pinger = await TestClient.open(BASE, null);
    pinger.send({ type: 'ping', t: 1 });
    expect(await pinger.closed()).toBe(4003);
    const role = await TestClient.open(BASE, null);
    role.send({ type: 'hello', protocol: 1, role: 'admin', room: 'x', client: 'x', name: 'x', build: 'x' });
    expect((await role.next('server.error')).reason).toContain('hello');
    expect(await role.closed()).toBe(4003);
    const old = await TestClient.open(BASE, null);
    old.send({ type: 'hello', protocol: 99, role: 'tv', room: 'x', client: 'x', name: 'x', build: 'x' });
    expect((await old.next('server.error')).reason).toContain('protocol');
    expect(await old.closed()).toBe(4004);
  });

  test('an unreadable frame before hello is ignored; the hello after it still works', async () => {
    const c = await TestClient.open(BASE, null);
    c.ws.send('not json at all');
    await sleep(50);
    expect(c.closedWith).toBe(null);
    c.send({ type: 'hello', protocol: 1, role: 'companion', room: 'late', client: 'cLate', name: 'x', build: 'x' });
    expect((await c.next('welcome')).room).toBe('late');
    await closeAll(c);
  });
});

describe('routing', () => {
  test('companion → TV with from; TV → all companions; TV → one with to', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'route', client: 'tv' });
    const a = await TestClient.open(BASE, { room: 'route', client: 'a' });
    const b = await TestClient.open(BASE, { room: 'route', client: 'b' });
    a.send({ type: 'sync.cmd', seq: 1, cmd: { type: 'history.undo' }, sent: 5 });
    expect(await tv.next('sync.cmd')).toEqual({ type: 'sync.cmd', seq: 1, cmd: { type: 'history.undo' }, sent: 5, from: 'a' });
    tv.send({ type: 'sync.applied', epoch: 'e', rev: 1, by: 'a', seq: 1, cmd: { type: 'history.undo' } });
    expect((await a.next('sync.applied')).from).toBe('tv');
    expect((await b.next('sync.applied')).rev).toBe(1);
    tv.send({ type: 'lib.listing', to: 'b', games: [] });
    expect((await b.next('lib.listing')).to).toBe('b');
    await sleep(50);
    expect(a.received.some((m) => m.type === 'lib.listing')).toBe(false);
    await closeAll(tv, a, b);
  });

  test('the payload passes through untouched (unknown types and fields too); a forged from is overwritten', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'pass', client: 'tvP' });
    const c = await TestClient.open(BASE, { room: 'pass', client: 'cP' });
    const payload = { type: 'future.thing', deep: { list: [1, 'two', null, { x: 1.5 }], unicode: 'Würfel 🎲' }, from: 'someone-else', big: 12345678901234 };
    c.send(payload);
    expect(await tv.next('future.thing')).toEqual({ ...payload, from: 'cP' });
    await closeAll(tv, c);
  });

  test('a binary frame is read as text', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'bin', client: 'tvBin' });
    const c = await TestClient.open(BASE, { room: 'bin', client: 'cBin' });
    c.ws.send(new TextEncoder().encode(JSON.stringify({ type: 'sync.request' })));
    expect((await tv.next('sync.request')).from).toBe('cBin');
    await closeAll(tv, c);
  });

  test('unreadable or unroutable messages after hello are dropped; the socket stays', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'junk', client: 'tvJ' });
    const c = await TestClient.open(BASE, { room: 'junk', client: 'cJ' });
    await tv.next('peer.joined');
    c.ws.send('{nope');
    c.send({ type: 'x'.repeat(65) });
    c.send({ type: 7 });
    c.send({ type: 'sync.cmd', seq: -1 });
    c.send({ type: 'sync.request', to: '' });
    c.send({ type: 'sync.request' });
    expect((await tv.next('sync.request')).from).toBe('cJ');
    await sleep(50);
    expect(tv.received.length).toBe(0);
    expect(c.closedWith).toBe(null);
    await closeAll(tv, c);
  });

  test('a second hello is ignored', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'twice', client: 'tvT' });
    const c = await TestClient.open(BASE, { room: 'twice', client: 'cT' });
    c.send({ type: 'hello', protocol: 1, role: 'tv', room: 'elsewhere', client: 'cT', name: 'x', build: 'x' });
    c.send({ type: 'sync.request' });
    expect((await tv.next('sync.request')).from).toBe('cT');
    await sleep(50);
    expect(c.received.some((m) => m.type === 'welcome')).toBe(false);
    await closeAll(tv, c);
  });

  test('no TV in the room: a command comes back undelivered with its seq; other messages without', async () => {
    const c = await TestClient.open(BASE, { room: 'empty', client: 'lonely' });
    c.send({ type: 'sync.cmd', seq: 7, cmd: { type: 'history.undo' } });
    expect(await c.next('relay.undelivered')).toEqual({ type: 'relay.undelivered', msgType: 'sync.cmd', seq: 7, reason: 'no-tv' });
    c.send({ type: 'lib.list' });
    expect(await c.next('relay.undelivered')).toEqual({ type: 'relay.undelivered', msgType: 'lib.list', reason: 'no-tv' });
    await closeAll(c);
  });

  test('a TV message for an unknown companion comes back as no-such-client', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'to', client: 'tvTo' });
    tv.send({ type: 'lib.listing', to: 'ghost', games: [] });
    expect(await tv.next('relay.undelivered')).toMatchObject({ msgType: 'lib.listing', reason: 'no-such-client' });
    await closeAll(tv);
  });

  test('a client cannot send server messages (they are dropped)', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'forge-main', client: 'tvF' });
    const c = await TestClient.open(BASE, { room: 'forge-main', client: 'liar' });
    await tv.next('peer.joined');
    for (const type of ['welcome', 'pong', 'peer.joined', 'peer.left', 'replaced', 'relay.undelivered', 'server.build', 'server.error']) c.send({ type });
    c.send({ type: 'sync.request' });
    await tv.next('sync.request');
    expect(tv.received).toEqual([]);
    await closeAll(tv, c);
  });

  test('ping → pong with the t echoed and the server clock', async () => {
    const c = await TestClient.open(BASE, { room: 'ping', client: 'p' });
    c.send({ type: 'ping', t: 123.5 });
    const pong = await c.next('pong');
    expect(pong.t).toBe(123.5);
    expect(Math.abs(Number(pong.serverTime) - Date.now())).toBeLessThan(5_000);
    c.send({ type: 'ping' });
    c.send({ type: 'ping', t: 9 });
    expect((await c.next('pong')).t).toBe(9);
    await closeAll(c);
  });
});

describe('takeover', () => {
  test('another TV takes the room: the old one is told and closed, companions see the change', async () => {
    const old = await TestClient.open(BASE, { role: 'tv', room: 'take', client: 'tvA', name: 'Old TV' });
    const c = await TestClient.open(BASE, { room: 'take', client: 'cx' });
    const fresh = await TestClient.open(BASE, { role: 'tv', room: 'take', client: 'tvB', name: 'New TV' });
    expect((await old.next('replaced')).by).toBe('New TV');
    expect(await old.closed()).toBe(4001);
    expect(await c.next('peer.left')).toMatchObject({ client: 'tvA', role: 'tv' });
    expect((await c.next('peer.joined')).peer).toMatchObject({ client: 'tvB', role: 'tv', name: 'New TV' });
    c.send({ type: 'sync.request' });
    expect((await fresh.next('sync.request')).from).toBe('cx');
    const tables = (await call('GET', '/api/tables')).body.tables as { room: string; tvName: string; companions: number }[];
    expect(tables.find((t) => t.room === 'take')).toMatchObject({ tvName: 'New TV', companions: 1 });
    await closeAll(c, fresh);
  });

  test('the same client again just replaces its old socket, silently', async () => {
    const first = await TestClient.open(BASE, { role: 'tv', room: 'same', client: 'tv1' });
    const c = await TestClient.open(BASE, { room: 'same', client: 'cSame' });
    await first.next('peer.joined');
    const second = await TestClient.open(BASE, { role: 'tv', room: 'same', client: 'tv1' });
    expect(await first.closed()).toBe(4000);
    expect(first.received.some((m) => m.type === 'replaced')).toBe(false);
    const tables = (await call('GET', '/api/tables')).body.tables as { room: string }[];
    expect(tables.filter((t) => t.room === 'same')).toHaveLength(1);
    c.send({ type: 'sync.request' });
    expect((await second.next('sync.request')).from).toBe('cSame');
    const companionAgain = await TestClient.open(BASE, { room: 'same', client: 'cSame' });
    expect(await c.closed()).toBe(4000);
    companionAgain.send({ type: 'sync.request' });
    expect((await second.next('sync.request')).from).toBe('cSame');
    await closeAll(second, companionAgain);
  });

  test('a room goes when its last member leaves', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'gone', client: 'tvGone' });
    await closeAll(tv);
    const tables = (await call('GET', '/api/tables')).body.tables as { room: string }[];
    expect(tables.some((t) => t.room === 'gone')).toBe(false);
  });
});
