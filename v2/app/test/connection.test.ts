/**
 * The connection against a small fake relay on a real socket: welcome, offline drops,
 * reconnect with backoff, replaced.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import { Connection, type ConnectionState } from '../src/lib/net/connection.ts';
import { recordingLog } from './helpers.ts';

const sockets = new Set<ServerWebSocket<undefined>>();
let replaceNext = false;
const relay = Bun.serve({
  port: 0,
  fetch(req, srv) {
    return srv.upgrade(req) ? undefined : new Response('no', { status: 400 });
  },
  websocket: {
    open(ws) { sockets.add(ws); },
    close(ws) { sockets.delete(ws); },
    message(ws, data) {
      const msg = JSON.parse(String(data)) as { type: string; t?: number; client?: string; room?: string; role?: string };
      if (msg.type === 'hello') {
        if (replaceNext) {
          replaceNext = false;
          ws.send(JSON.stringify({ type: 'replaced', by: 'Other TV' }));
          ws.close(4001, 'replaced');
          return;
        }
        ws.send(JSON.stringify({ type: 'welcome', client: msg.client, room: msg.room, role: msg.role, peers: [], build: 'b1', serverTime: Date.now() }));
      }
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: msg.t, serverTime: Date.now() }));
    },
  },
});
afterAll(() => relay.stop(true));

const fast = { pingMs: 50, silentMs: 400, welcomeMs: 500, backoffMs: [30, 60] };

function connection(log = recordingLog()) {
  const states: ConnectionState[] = [];
  const conn = new Connection({ url: `ws://127.0.0.1:${relay.port}/ws`, role: 'tv', room: 'r', client: 'tv1', name: 'TV', build: 'b', log, timing: fast });
  conn.onState = (s) => states.push(s);
  return { conn, states, log };
}

async function until(f: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error('timed out');
    await Bun.sleep(10);
  }
}

describe('connection', () => {
  test('connects, is welcomed, pings', async () => {
    const { conn, log } = connection();
    conn.connect();
    await until(() => conn.state === 'open');
    expect(conn.serverBuild).toBe('b1');
    await until(() => conn.rttMs !== null);
    conn.close();
    expect(log.has('Welcomed')).toBe(true);
  });

  test('sending while not connected drops and says so on the next welcome', async () => {
    const { conn, log } = connection();
    expect(conn.send({ type: 'sync.cmd', seq: 1 })).toBe(false);
    conn.connect();
    await until(() => conn.state === 'open');
    expect(log.has('Dropped while offline')).toBe(true);
    conn.close();
  });

  test('a lost socket reconnects after the backoff', async () => {
    const { conn, log } = connection();
    conn.connect();
    await until(() => conn.state === 'open');
    for (const ws of sockets) ws.close(1011, 'test');
    await until(() => conn.state === 'waiting');
    await until(() => conn.state === 'open');
    expect(log.has('Connection lost')).toBe(true);
    expect(log.has('Reconnect scheduled')).toBe(true);
    conn.close();
  });

  test('replaced: stays down until takeOver', async () => {
    const { conn } = connection();
    replaceNext = true;
    conn.connect();
    await until(() => conn.state === 'replaced');
    await Bun.sleep(150);
    expect(conn.state).toBe('replaced');
    conn.takeOver();
    await until(() => conn.state === 'open');
    conn.close();
  });
});
