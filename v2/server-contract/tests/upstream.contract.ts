/**
 * LAN play (Rust only): a second server — the "table server" as it runs on the TV box — with
 * `UPSTREAM_URL` = the main server (standing in for the VPS). Checks the upstream link
 * (`server-rs/src/upstream.rs`): file pull, library + backup mirror, game push with its files,
 * delete forwarding, log forwarding, `/api/upstream`. Needs `SERVER_BIN` (run.ts sets it for
 * `--target rust`).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type Subprocess } from 'bun';
import { BASE, FIXES, call, gameOn, mapOn, picture, sleep, upload } from '../lib.ts';

const BIN = process.env.SERVER_BIN ?? '';
const PORT = Number(process.env.TABLE_PORT ?? 0);
const TABLE = `http://127.0.0.1:${PORT}`;

let proc: Subprocess | null = null;
let data = '';

/** Polls `check` until it is true or `ms` pass. */
async function eventually(check: () => Promise<boolean>, ms = 8_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(150);
  }
  return false;
}

describe.skipIf(!FIXES || !BIN || !PORT)('table server with an upstream (LAN play)', () => {
  beforeAll(async () => {
    data = mkdtempSync(join(tmpdir(), 'bm-table-'));
    proc = spawn({
      cmd: [BIN],
      env: {
        ...process.env, MWLOG_DISABLE: '1', HOST: '127.0.0.1', PORT: String(PORT), DATA_DIR: data, APP_DIR: join(data, 'app'),
        UPSTREAM_URL: BASE, UPSTREAM_SYNC_MS: '400', BUILD_POLL_MS: '0', CLEANUP_EVERY_MS: '0', BATTLEMAP_LOG_STDERR: '1',
      },
      stdout: 'ignore',
      stderr: Bun.file(join(data, 'server.log')),
    });
    expect(await eventually(async () => (await fetch(`${TABLE}/health`).catch(() => null))?.ok === true)).toBe(true);
  });

  afterAll(async () => {
    proc?.kill('SIGTERM');
    await proc?.exited;
    rmSync(data, { recursive: true, force: true });
  });

  test('a file the table lacks is pulled from upstream (and checked against its hash)', async () => {
    const pic = (await upload(await picture(120, 90))).body;
    const res = await fetch(`${TABLE}/files/${pic.hash}.${pic.ext}`);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(pic.bytes);
    expect((await fetch(`${TABLE}/files/${'0'.repeat(64)}.png`)).status).toBe(404);
  });

  test('the upstream library is mirrored and its files prefetched', async () => {
    const pic = (await upload(await picture(130, 90))).body;
    const added = await call('POST', '/api/library', { map: mapOn('lan-lib-1', pic) });
    expect([200, 201]).toContain(added.status);
    expect(await eventually(async () => {
      const r = await fetch(`${TABLE}/api/library`);
      return ((await r.json()) as { entries: { map: { id: string } }[] }).entries.some((e) => e.map.id === 'lan-lib-1');
    })).toBe(true);
    expect((await fetch(`${TABLE}/api/library/lan-lib-1`)).status).toBe(200);
    expect(await eventually(async () => Bun.file(join(data, 'files', `${pic.hash}.${pic.ext}`)).exists())).toBe(true);
  });

  test('a game saved on the table is pushed upstream with its file; a delete follows it', async () => {
    const tableUp = await fetch(`${TABLE}/files?ext=png`, { method: 'POST', body: await picture(140, 90) });
    const pic = (await tableUp.json()) as { hash: string; ext: string; bytes: number; width: number; height: number };
    const put = await fetch(`${TABLE}/api/games/lan-g1`, { method: 'PUT', body: JSON.stringify(gameOn('lan-g1', mapOn('m1', pic as never))) });
    expect(put.status).toBe(200);
    expect(await eventually(async () => (await call('GET', '/api/games/lan-g1')).status === 200)).toBe(true);
    expect((await fetch(`${BASE}/files/${pic.hash}.${pic.ext}`)).status).toBe(200);
    expect((await fetch(`${TABLE}/api/games/lan-g1`, { method: 'DELETE' })).status).toBe(204);
    expect(await eventually(async () => (await call('GET', '/api/games/lan-g1')).status === 404)).toBe(true);
  });

  test('an upstream backup the table lacks is listed and served', async () => {
    const pic = (await upload(await picture(150, 90))).body;
    expect((await call('PUT', '/api/games/vps-g1', gameOn('vps-g1', mapOn('m1', pic)))).status).toBe(200);
    expect(await eventually(async () => {
      const r = (await (await fetch(`${TABLE}/api/games`)).json()) as { games: { id: string }[] };
      return r.games.some((g) => g.id === 'vps-g1');
    })).toBe(true);
    const got = await fetch(`${TABLE}/api/games/vps-g1`);
    expect(got.status).toBe(200);
    expect(((await got.json()) as { id: string }).id).toBe('vps-g1');
  });

  test('log batches are forwarded upstream; /api/upstream reports the link', async () => {
    const batch = [{ ts: new Date().toISOString(), level: 'info', area: 'test', msg: 'from the table' }];
    const res = await fetch(`${TABLE}/log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) });
    expect(res.status).toBe(204);
    const s = (await (await fetch(`${TABLE}/api/upstream`)).json()) as { online: boolean; url: string; logsForwarded: number; filesPulled: number; gamesPushed: number };
    expect(s.online).toBe(true);
    expect(s.url).toBe(BASE);
    expect(s.logsForwarded).toBeGreaterThanOrEqual(1);
    expect(s.filesPulled).toBeGreaterThanOrEqual(1);
    expect(s.gamesPushed).toBeGreaterThanOrEqual(1);
  });
});
