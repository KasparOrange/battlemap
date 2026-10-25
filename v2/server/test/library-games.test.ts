/**
 * The shared library and the game backups over HTTP.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GameSummary, LibraryEntry } from '@battlemap/shared';
import { testServer, type TestServer } from './helpers.ts';
import { gameOn, mapOn, picture, upload } from './pictures.ts';

let srv: TestServer;
beforeAll(async () => (srv = await testServer()));
afterAll(async () => srv.stop());

/** POSTs a library entry. */
async function post(body: unknown): Promise<{ status: number; body: { entry: LibraryEntry; added: boolean; error?: string } }> {
  const res = await fetch(`${srv.base}/api/library`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { entry: LibraryEntry; added: boolean; error?: string } };
}

describe('/api/library', () => {
  test('add: the thumbnail made at upload is filled in, libraryId set; list is newest first', async () => {
    const a = (await upload(srv.base, await picture(500, 400))).body;
    const b = (await upload(srv.base, await picture(500, 401))).body;
    const first = await post({ map: mapOn('lib-a', a) });
    expect(first.status).toBe(201);
    expect(first.body.added).toBe(true);
    expect(first.body.entry.thumb).toEqual(a.thumb);
    expect(first.body.entry.map.libraryId).toBe('lib-a');
    await post({ map: mapOn('lib-b', b), originalBytes: 1234, note: 'lossless' });
    const list = (await (await fetch(`${srv.base}/api/library`)).json()) as { entries: LibraryEntry[] };
    expect(list.entries.map((e) => e.map.id).slice(0, 2)).toEqual(['lib-b', 'lib-a']);
    expect(list.entries[0]).toMatchObject({ originalBytes: 1234, note: 'lossless' });
  });

  test('the same id again replaces the entry and keeps when it was added', async () => {
    const pic = (await upload(srv.base, await picture(300, 300))).body;
    const one = await post({ map: mapOn('lib-c', pic) });
    await Bun.sleep(5);
    const two = await post({ map: { ...mapOn('lib-c', pic), name: 'Renamed', drawGrid: false } });
    expect(two.status).toBe(200);
    expect(two.body.added).toBe(false);
    expect(two.body.entry.addedAt).toBe(one.body.entry.addedAt);
    const got = (await (await fetch(`${srv.base}/api/library/lib-c`)).json()) as LibraryEntry;
    expect(got.map).toMatchObject({ name: 'Renamed', drawGrid: false });
  });

  test('refused: not a map, files the server does not have, not JSON', async () => {
    expect((await post({ map: { id: 'x' } })).status).toBe(400);
    const missing = await post({ map: mapOn('lib-x', { hash: 'f'.repeat(64), ext: 'png', bytes: 10, width: 10, height: 10, thumb: null, originalBytes: null, note: null }) });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toContain('upload it first');
    const bad = await fetch(`${srv.base}/api/library`, { method: 'POST', body: '{nope' });
    expect(bad.status).toBe(400);
  });

  test('remove: the entry goes, its files stay; unknown → 404', async () => {
    const pic = (await upload(srv.base, await picture(200, 200))).body;
    await post({ map: mapOn('lib-d', pic) });
    const res = await fetch(`${srv.base}/api/library/lib-d`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { removed: LibraryEntry }).removed.map.id).toBe('lib-d');
    expect((await fetch(`${srv.base}/api/library/lib-d`)).status).toBe(404);
    expect((await fetch(`${srv.base}/api/library/lib-d`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${srv.base}/files/${pic.hash}.png`)).status).toBe(200);
  });
});

/** PUTs a game backup. */
async function putGame(id: string, body: unknown): Promise<Response> {
  return fetch(`${srv.base}/api/games/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('/api/games', () => {
  test('put → summary with the map thumbnail; get it back; listed', async () => {
    const pic = (await upload(srv.base, await picture(400, 300))).body;
    const game = gameOn('g-one', mapOn('m1', pic));
    const res = await putGame('g-one', game);
    expect(res.status).toBe(200);
    const summary = (await res.json()) as GameSummary;
    expect(summary).toMatchObject({ id: 'g-one', name: 'Game g-one', mapNames: ['Map m1'], activeMapName: 'Map m1', where: 'server', thumb: pic.thumb });
    const back = await fetch(`${srv.base}/api/games/g-one`);
    expect(back.headers.get('x-saved-at')).toBe(summary.savedAt);
    expect(await back.json()).toEqual(game);
    const list = (await (await fetch(`${srv.base}/api/games`)).json()) as { games: GameSummary[] };
    expect(list.games.map((g) => g.id)).toContain('g-one');
  });

  test('latest + ten previous versions; an old one by ?at=', async () => {
    const pic = (await upload(srv.base, await picture(100, 80))).body;
    const base = gameOn('g-many', mapOn('m1', pic));
    for (let i = 0; i < 13; i++) {
      expect((await putGame('g-many', { ...base, name: `v${i}` })).status).toBe(200);
      await Bun.sleep(3);
    }
    const { versions } = (await (await fetch(`${srv.base}/api/games/g-many/versions`)).json()) as { versions: { savedAt: string; latest: boolean }[] };
    expect(versions.length).toBe(11);
    expect(versions[0]!.latest).toBe(true);
    const latest = (await (await fetch(`${srv.base}/api/games/g-many`)).json()) as { name: string };
    expect(latest.name).toBe('v12');
    const older = (await (await fetch(`${srv.base}/api/games/g-many?at=${encodeURIComponent(versions[3]!.savedAt)}`)).json()) as { name: string };
    expect(older.name).toBe('v9');
    expect(readdirSync(join(srv.dataDir, 'games', 'g-many')).length).toBe(12); // latest + summary + 10
  });

  test('refused: not a game, id mismatch, bad id; unknown → 404', async () => {
    expect((await putGame('g-bad', { id: 'g-bad' })).status).toBe(400);
    const pic = (await upload(srv.base, await picture(100, 80))).body;
    const other = await putGame('g-two', gameOn('g-three', mapOn('m1', pic)));
    expect(other.status).toBe(400);
    expect(((await other.json()) as { error: string }).error).toContain('g-three');
    expect((await fetch(`${srv.base}/api/games/a.b`)).status).toBe(400);
    expect((await fetch(`${srv.base}/api/games/nope`)).status).toBe(404);
    expect((await fetch(`${srv.base}/api/games/nope/versions`)).status).toBe(404);
  });

  test('delete moves the game to the trash', async () => {
    const pic = (await upload(srv.base, await picture(100, 80))).body;
    await putGame('g-del', gameOn('g-del', mapOn('m1', pic)));
    expect((await fetch(`${srv.base}/api/games/g-del`, { method: 'DELETE' })).status).toBe(204);
    expect((await fetch(`${srv.base}/api/games/g-del`)).status).toBe(404);
    expect(existsSync(join(srv.dataDir, 'games', 'g-del'))).toBe(false);
    expect(readdirSync(join(srv.dataDir, 'trash')).some((n) => n.startsWith('game-g-del-'))).toBe(true);
    expect((await fetch(`${srv.base}/api/games/g-del`, { method: 'DELETE' })).status).toBe(404);
  });
});
