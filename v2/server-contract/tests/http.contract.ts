/**
 * HTTP basics: health, the log forward, the table list, the built app, CORS, refusals, the temp
 * cleanup (at start and on its timer) and the watch on the app's build.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, DATA_DIR, MAIN, TestClient, call, closeAll, sleep } from '../lib.ts';

const APP_DIR = process.env.APP_DIR ?? '';

describe('health', () => {
  test('/health says ok, the app build, the server build, uptime and the counts', async () => {
    const { status, headers, body } = await call('GET', '/health');
    expect(status).toBe(200);
    expect(headers.get('access-control-allow-origin')).toBe('*');
    expect(headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ ok: true, build: 'test-build', serverBuild: 'contract' });
    for (const k of ['uptimeS', 'rooms', 'tvs', 'companions', 'members', 'waiting', 'library', 'games']) expect(typeof body[k]).toBe('number');
    expect(Number.isFinite(Date.parse(body.startedAt))).toBe(true);
    expect(body.mwlog).toBeDefined();
  });
});

describe('log forward', () => {
  test('/log takes a browser batch (204) from any origin, refuses junk (400), answers the preflight', async () => {
    const lines = [{ ts: new Date().toISOString(), level: 'info', area: 'test', msg: 'hello', session: 'abc' }];
    const ok = await fetch(`${BASE}/log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lines) });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    const beacon = await fetch(`${BASE}/log`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(lines[0]) });
    expect(beacon.status).toBe(204);
    expect((await fetch(`${BASE}/log`, { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await fetch(`${BASE}/log`, { method: 'OPTIONS' })).status).toBe(204);
  });

  test('/log refuses a batch over 200 lines or 64 kB (413)', async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ msg: `line ${i}` }));
    expect((await fetch(`${BASE}/log`, { method: 'POST', body: JSON.stringify(many) })).status).toBe(413);
    const big = [{ msg: 'x'.repeat(70 * 1024) }];
    expect((await fetch(`${BASE}/log`, { method: 'POST', body: JSON.stringify(big) })).status).toBe(413);
  });
});

describe('tables', () => {
  test('/api/tables lists rooms with a TV, not rooms of companions only', async () => {
    const tv = await TestClient.open(BASE, { role: 'tv', room: 'listed', client: 'tvL', name: 'Living room' });
    const lone = await TestClient.open(BASE, { room: 'no-tv-here', client: 'cL' });
    const { body } = await call('GET', '/api/tables');
    expect(body.tables).toContainEqual(expect.objectContaining({ room: 'listed', tvName: 'Living room', companions: 0 }));
    const row = (body.tables as { room: string; since: string }[]).find((t) => t.room === 'listed')!;
    expect(Number.isFinite(Date.parse(row.since))).toBe(true);
    expect((body.tables as { room: string }[]).some((t) => t.room === 'no-tv-here')).toBe(false);
    await closeAll(tv, lone);
  });
});

describe('the built app', () => {
  test('/ and /app redirect to /app/; index never cached, assets forever; routes fall back to index; missing files 404; no escaping', async () => {
    for (const p of ['/', '/app']) {
      const res = await fetch(`${BASE}${p}`, { redirect: 'manual' });
      expect([p, res.status]).toEqual([p, 302]);
      expect(res.headers.get('location')).toContain('/app/');
    }
    const index = await fetch(`${BASE}/app/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(await index.text()).toContain('<title>app</title>');
    const asset = await fetch(`${BASE}/app/assets/a-123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect(asset.headers.get('content-type')).toContain('javascript');
    const route = await fetch(`${BASE}/app/companion`);
    expect(route.status).toBe(200);
    expect(await route.text()).toContain('<title>app</title>');
    expect((await fetch(`${BASE}/app/missing.js`)).status).toBe(404);
    expect((await fetch(`${BASE}/app/..%2f..%2fpackage.json`)).status).toBe(404);
    expect((await fetch(`${BASE}/app/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
    expect((await fetch(`${BASE}/app/assets/a-123.js`, { method: 'HEAD' })).status).toBe(200);
  });
});

describe('refusals and CORS', () => {
  test('an unknown path is 404 {error} with CORS; a preflight anywhere is 204 with the CORS headers', async () => {
    const { status, headers, body } = await call('GET', '/nope');
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'not found' });
    expect(headers.get('access-control-allow-origin')).toBe('*');
    const pre = await fetch(`${BASE}/api/library`, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-methods')).toContain('PUT');
    expect(pre.headers.get('access-control-allow-headers')).toContain('content-type');
  });

  test('/ws without an upgrade is 426', async () => {
    expect((await fetch(`${BASE}/ws`)).status).toBe(426);
  });

  test('wrong methods are 405 {error}', async () => {
    expect((await call('PUT', '/api/library', {})).status).toBe(405);
    expect((await call('POST', '/api/library/x', {})).status).toBe(405);
    expect((await call('POST', '/api/games')).status).toBe(405);
    expect((await call('POST', '/api/games/g1/versions')).status).toBe(405);
    expect((await call('POST', '/api/games/g1', {})).status).toBe(405);
    const f = await call('POST', '/api/fetch');
    expect(f.status).toBe(405);
    expect(typeof f.body.error).toBe('string');
  });
});

describe.skipIf(!DATA_DIR)('cleanup', () => {
  test('at start: old link fetches, old trash and stale temp files went; the store and fresh files stayed (run.ts seeded them)', () => {
    expect(existsSync(join(DATA_DIR, 'uploads', 'aaaaaaaaaaaa.png'))).toBe(false);
    expect(existsSync(join(DATA_DIR, 'uploads', 'bbbbbbbbbbbb.png'))).toBe(true);
    expect(existsSync(join(DATA_DIR, 'trash', 'game-old-1'))).toBe(false);
    expect(existsSync(join(DATA_DIR, 'trash', 'game-new-2'))).toBe(true);
    expect(existsSync(join(DATA_DIR, 'files', `${'a'.repeat(64)}.png`))).toBe(true);
    expect(existsSync(join(DATA_DIR, 'files', 'x.png.1.1.tmp'))).toBe(false);
    expect(existsSync(join(DATA_DIR, 'library.json.1.2.tmp'))).toBe(false);
  });

  test('on its timer: an old link fetch goes while the server runs', async () => {
    mkdirSync(join(DATA_DIR, 'uploads'), { recursive: true });
    const path = join(DATA_DIR, 'uploads', 'cccccccccccc.png');
    writeFileSync(path, 'x');
    const old = (Date.now() - 10 * 86_400_000) / 1000;
    utimesSync(path, old, old);
    const until = Date.now() + MAIN.cleanupEveryMs * 4;
    while (existsSync(path) && Date.now() < until) await sleep(100);
    expect(existsSync(path)).toBe(false);
  });
});

describe.skipIf(!APP_DIR)('a new app build', () => {
  test('build.json changes: every client gets server.build, /health and the next welcome tell the new build', async () => {
    const c = await TestClient.open(BASE, { room: 'build', client: 'cBuild' });
    const file = join(APP_DIR, 'build.json');
    const before = readFileSync(file, 'utf8');
    try {
      writeFileSync(file, JSON.stringify({ build: 'test-build-2' }));
      expect((await c.next('server.build', MAIN.buildPollMs * 10)).build).toBe('test-build-2');
      expect((await call('GET', '/health')).body.build).toBe('test-build-2');
    } finally {
      writeFileSync(file, before);
    }
    expect((await c.next('server.build', MAIN.buildPollMs * 10)).build).toBe('test-build');
    await closeAll(c);
  });
});
