/**
 * The players' view's routing (S12) with real sockets: a `players` client gets `players.*`
 * messages from the TV and nothing else (not even with `to` naming it), and may send only
 * `players.request`. The Rust server routes it; the legacy Bun server refuses the role (it would
 * route a player like a companion) — checked under `CONTRACT_FIXES=1` (`--target rust`) and the
 * refusal otherwise.
 */
import { describe, expect, test } from 'bun:test';
import { BASE, FIXES, TestClient, closeAll, sleep } from '../lib.ts';

describe.skipIf(!FIXES)('players\' view routing', () => {
  test('players get players.* only; companions never get players.*', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'pl', client: 'tvP', name: 'TV' });
    const c = await TestClient.open(BASE, { room: 'pl', client: 'cP' });
    const p = await TestClient.open(BASE, { role: 'players', room: 'pl', client: 'pP', name: 'Phone' });
    expect((await tv.next('peer.joined')).peer).toMatchObject({ client: 'cP' });
    expect((await tv.next('peer.joined')).peer).toEqual({ client: 'pP', role: 'players', name: 'Phone' });
    tv.send({ type: 'sync.snapshot', epoch: 'e', rev: 1, state: { dm: 'secret' }, acks: {} });
    tv.send({ type: 'sync.snapshot', to: 'pP', epoch: 'e', rev: 1, state: { dm: 'secret' }, acks: {} });
    tv.send({ type: 'players.state', rev: 1, state: { safe: true } });
    expect((await c.next('sync.snapshot')).state).toEqual({ dm: 'secret' });
    expect((await tv.next('relay.undelivered')).reason).toBe('no-such-client');
    expect((await p.next('players.state')).state).toEqual({ safe: true });
    await sleep(100);
    expect(p.received.map((m) => m.type)).not.toContain('sync.snapshot');
    expect(c.received.map((m) => m.type)).not.toContain('players.state');
    await closeAll(tv, c, p);
  });

  test('a player may ask for the players\' state, nothing else reaches the TV', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'pl2', client: 'tvQ', name: 'TV' });
    const p = await TestClient.open(BASE, { role: 'players', room: 'pl2', client: 'pQ' });
    await tv.next('peer.joined');
    p.send({ type: 'players.request' });
    expect((await tv.next('players.request')).from).toBe('pQ');
    p.send({ type: 'sync.cmd', seq: 1, cmd: { type: 'fog.clear' } });
    p.send({ type: 'game.close' });
    expect((await p.next('relay.undelivered')).reason).toBe('not-allowed');
    await sleep(100);
    expect(tv.received.map((m) => m.type)).not.toContain('sync.cmd');
    expect(tv.received.map((m) => m.type)).not.toContain('game.close');
    await closeAll(tv, p);
  });
});

describe.skipIf(FIXES)('players\' view on the legacy server', () => {
  test('the players role is refused', async () => {
    const p = await TestClient.open(BASE, null);
    p.send({ type: 'hello', protocol: 1, role: 'players', room: 'pl3', client: 'pR', name: 'x', build: 'x' });
    expect((await p.next('server.error')).reason).toContain('Rust');
  });
});
