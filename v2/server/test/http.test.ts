/**
 * HTTP: health, the log forward, the table list, the built app.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { TestClient, testServer, type TestServer } from './helpers.ts';

let srv: TestServer;
beforeAll(async () => (srv = await testServer()));
afterAll(async () => srv.stop());

describe('http', () => {
  test('/health says ok, the build and the counts', async () => {
    const body = (await (await fetch(`${srv.base}/health`)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, build: 'test-build', rooms: 0 });
    expect(body.mwlog).toBeDefined();
  });

  test('/log takes a browser batch (204) from any origin, refuses junk (400)', async () => {
    const lines = [{ ts: new Date().toISOString(), level: 'info', area: 'test', msg: 'hello', session: 'abc' }];
    const ok = await fetch(`${srv.base}/log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lines) });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    const bad = await fetch(`${srv.base}/log`, { method: 'POST', body: '{nope' });
    expect(bad.status).toBe(400);
    const pre = await fetch(`${srv.base}/log`, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
  });

  test('/api/tables lists rooms with a TV', async () => {
    const tv = await TestClient.open(srv.base, { role: 'tv', room: 'listed', client: 'tvL', name: 'Living room' });
    const body = (await (await fetch(`${srv.base}/api/tables`)).json()) as { tables: Record<string, unknown>[] };
    expect(body.tables).toContainEqual(expect.objectContaining({ room: 'listed', tvName: 'Living room', companions: 0 }));
    tv.close();
  });

  test('the app: index, assets cached forever, routes fall back to index, missing files 404, no escaping', async () => {
    expect((await fetch(srv.base, { redirect: 'manual' })).headers.get('location')).toContain('/app/');
    const index = await fetch(`${srv.base}/app/`);
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toBe('no-cache');
    const asset = await fetch(`${srv.base}/app/assets/a-123.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${srv.base}/app/companion`)).status).toBe(200);
    expect((await fetch(`${srv.base}/app/missing.js`)).status).toBe(404);
    expect((await fetch(`${srv.base}/app/..%2f..%2fpackage.json`)).status).toBe(404);
    expect((await fetch(`${srv.base}/nope`)).status).toBe(404);
  });
});
