/**
 * The shared map library and the game backups over HTTP.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GameSummary, LibraryEntry } from '../../shared/src/index.ts';
import { FIXES, BASE, DATA_DIR, MAIN, call, gameOn, mapOn, picture, sleep, upload } from '../lib.ts';

/** POSTs a library entry. */
async function post(body: unknown): Promise<{ status: number; body: { entry: LibraryEntry; added: boolean; error?: string } }> {
  const res = await call('POST', '/api/library', body);
  return { status: res.status, body: res.body };
}

describe('/api/library', () => {
  test('add: the thumbnail made at upload is filled in, libraryId set; the list is newest first', async () => {
    const a = (await upload(await picture(500, 400))).body;
    const b = (await upload(await picture(500, 401))).body;
    const first = await post({ map: mapOn('lib-a', a) });
    expect(first.status).toBe(201);
    expect(first.body.added).toBe(true);
    expect(first.body.entry.thumb).toEqual(a.thumb);
    expect(first.body.entry.map.libraryId).toBe('lib-a');
    expect(first.body.entry).toMatchObject({ originalBytes: null, note: null });
    expect(Number.isFinite(Date.parse(first.body.entry.addedAt))).toBe(true);
    await post({ map: mapOn('lib-b', b), originalBytes: 1234, note: 'lossless' });
    const list = (await call('GET', '/api/library')).body as { entries: LibraryEntry[] };
    expect(list.entries.map((e) => e.map.id).slice(0, 2)).toEqual(['lib-b', 'lib-a']);
    expect(list.entries[0]).toMatchObject({ originalBytes: 1234, note: 'lossless' });
    const one = await call('GET', '/api/library/lib-a');
    expect(one.status).toBe(200);
    expect(one.body).toEqual(first.body.entry);
  });

  test('libraryId is always the map id; addedAt is taken for a new entry; a long note is cut; a bad originalBytes is dropped', async () => {
    const pic = (await upload(await picture(210, 200))).body;
    const { body } = await post({ map: { ...mapOn('lib-e', pic), libraryId: 'something-else' }, addedAt: '2026-01-02T03:04:05.000Z', note: 'n'.repeat(300), originalBytes: -5 });
    expect(body.entry.map.libraryId).toBe('lib-e');
    expect(body.entry.addedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(body.entry.note).toHaveLength(200);
    expect(body.entry.originalBytes).toBe(null);
  });

  test('the same id again replaces the entry and keeps when it was added', async () => {
    const pic = (await upload(await picture(300, 300))).body;
    const one = await post({ map: mapOn('lib-c', pic) });
    await sleep(5);
    const two = await post({ map: { ...mapOn('lib-c', pic), name: 'Renamed', drawGrid: false }, addedAt: '2020-01-01T00:00:00.000Z' });
    expect(two.status).toBe(200);
    expect(two.body.added).toBe(false);
    expect(two.body.entry.addedAt).toBe(one.body.entry.addedAt);
    const got = (await call('GET', '/api/library/lib-c')).body as LibraryEntry;
    expect(got.map).toMatchObject({ name: 'Renamed', drawGrid: false });
    const ids = ((await call('GET', '/api/library')).body as { entries: LibraryEntry[] }).entries.map((e) => e.map.id);
    expect(ids.filter((id) => id === 'lib-c')).toHaveLength(1);
  });

  test('a thumbnail: the one sent, else the picture’s, else the table copy’s', async () => {
    const pdf = (await upload(new TextEncoder().encode('%PDF-1.4 map'), 'ext=pdf')).body;
    const copy = (await upload(await picture(100, 90))).body;
    const other = (await upload(await picture(100, 91))).body;
    const viaCopy = await post({ map: { ...mapOn('lib-t', pdf), tableCopy: { hash: copy.hash, ext: copy.ext, bytes: copy.bytes } } });
    expect(viaCopy.body.entry.thumb).toEqual(copy.thumb);
    const sent = await post({ map: mapOn('lib-t2', copy), thumb: other.thumb });
    expect(sent.body.entry.thumb).toEqual(other.thumb);
    const none = await post({ map: mapOn('lib-t3', pdf) });
    expect(none.body.entry.thumb).toBe(null);
  });

  test('refused: not a map, files the server lacks (or with another size), a bad thumb, not JSON, too big', async () => {
    const bad = await post({ map: { id: 'x' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('map');
    expect((await post([])).status).toBe(400);
    expect((await post('just text')).status).toBe(400);
    const missing = await post({ map: mapOn('lib-x', { hash: 'f'.repeat(64), ext: 'png', bytes: 10, width: 10, height: 10 }) });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toContain('upload it first');
    const pic = (await upload(await picture(100, 92))).body;
    expect((await post({ map: mapOn('lib-y', { ...pic, bytes: pic.bytes + 1 }) })).body.error).toContain('upload it first');
    expect((await post({ map: mapOn('lib-y', pic), thumb: { hash: 'nothex', ext: 'webp', bytes: 1 } })).status).toBe(400);
    expect((await post({ map: mapOn('lib-y', pic), thumb: { hash: 'e'.repeat(64), ext: 'webp', bytes: 1 } })).body.error).toContain('upload it first');
    expect((await call('POST', '/api/library', '{nope')).status).toBe(400);
    const huge = await call('POST', '/api/library', { map: mapOn('lib-z', pic), note: 'x'.repeat(1_100_000) });
    expect(huge.status).toBe(413);
    expect(huge.body.error).toContain('MB');
    expect((await call('GET', '/api/library/lib-y')).status).toBe(404);
  });

  test('remove: the entry goes, its files stay; unknown → 404', async () => {
    const pic = (await upload(await picture(200, 200))).body;
    await post({ map: mapOn('lib-d', pic) });
    const res = await call('DELETE', '/api/library/lib-d');
    expect(res.status).toBe(200);
    expect(res.body.removed.map.id).toBe('lib-d');
    const gone = await call('GET', '/api/library/lib-d');
    expect(gone.status).toBe(404);
    expect(typeof gone.body.error).toBe('string');
    expect((await call('DELETE', '/api/library/lib-d')).status).toBe(404);
    expect((await fetch(`${BASE}/files/${pic.hash}.png`)).status).toBe(200);
  });

  test('/health counts the library', async () => {
    const before = (await call('GET', '/health')).body.library as number;
    const pic = (await upload(await picture(200, 203))).body;
    await post({ map: mapOn('lib-h', pic) });
    expect((await call('GET', '/health')).body.library).toBe(before + 1);
  });
});

/** PUTs a game backup. */
async function putGame(id: string, body: unknown): Promise<{ status: number; headers: Headers; body: any }> {
  return call('PUT', `/api/games/${id}`, body);
}

describe('/api/games', () => {
  test('put → its summary with the map thumbnail; get it back with x-saved-at; listed newest first', async () => {
    const pic = (await upload(await picture(400, 300))).body;
    const game = gameOn('g-one', mapOn('m1', pic));
    const res = await putGame('g-one', game);
    expect(res.status).toBe(200);
    const summary = res.body as GameSummary;
    expect(summary).toMatchObject({ id: 'g-one', name: 'Game g-one', createdAt: game.createdAt, mapNames: ['Map m1'], activeMapName: 'Map m1', where: 'server', thumb: pic.thumb });
    const back = await fetch(`${BASE}/api/games/g-one`);
    expect(back.headers.get('x-saved-at')).toBe(summary.savedAt);
    expect(back.headers.get('access-control-expose-headers')).toContain('x-saved-at');
    expect(back.headers.get('cache-control')).toBe('no-store');
    expect(await back.json()).toEqual(game);
    await sleep(5);
    await putGame('g-two', gameOn('g-two', mapOn('m1', pic)));
    const list = (await call('GET', '/api/games')).body as { games: GameSummary[] };
    const ids = list.games.map((g) => g.id);
    expect(ids.indexOf('g-two')).toBeLessThan(ids.indexOf('g-one'));
    expect(list.games.every((g) => g.where === 'server')).toBe(true);
  });

  test("the thumbnail of a library map is the library entry's", async () => {
    const pic = (await upload(await picture(400, 301))).body;
    const other = (await upload(await picture(400, 302))).body;
    await call('POST', '/api/library', { map: mapOn('lib-g', pic), thumb: other.thumb });
    const { body } = await putGame('g-lib', gameOn('g-lib', { ...mapOn('lib-g', pic), libraryId: 'lib-g' }));
    expect(body.thumb).toEqual(other.thumb);
  });

  test('latest + ten previous versions; an old one by ?at=; unknown times 404', async () => {
    const pic = (await upload(await picture(100, 80))).body;
    const base = gameOn('g-many', mapOn('m1', pic));
    for (let i = 0; i < 13; i++) {
      expect((await putGame('g-many', { ...base, name: `v${i}` })).status).toBe(200);
      await sleep(3);
    }
    const { versions } = (await call('GET', '/api/games/g-many/versions')).body as { versions: { savedAt: string; bytes: number; latest: boolean }[] };
    expect(versions.length).toBe(11);
    expect(versions[0]!.latest).toBe(true);
    expect(versions.slice(1).every((v) => !v.latest && v.bytes > 0)).toBe(true);
    expect([...versions].sort((a, b) => b.savedAt.localeCompare(a.savedAt))).toEqual(versions);
    expect(((await call('GET', '/api/games/g-many')).body as { name: string }).name).toBe('v12');
    const older = (await call('GET', `/api/games/g-many?at=${encodeURIComponent(versions[3]!.savedAt)}`)).body as { name: string };
    expect(older.name).toBe('v9');
    const latestAt = await fetch(`${BASE}/api/games/g-many?at=${encodeURIComponent(versions[0]!.savedAt)}`);
    expect(((await latestAt.json()) as { name: string }).name).toBe('v12');
    expect((await call('GET', '/api/games/g-many?at=2001-01-01T00:00:00.000Z')).status).toBe(404);
    expect((await call('GET', '/api/games/g-many?at=yesterday')).status).toBe(404);
    if (DATA_DIR) expect(readdirSync(join(DATA_DIR, 'games', 'g-many')).length).toBe(12); // latest + summary + 10
  });

  test('refused: not a game, id mismatch, bad ids, not JSON, too big; unknown → 404', async () => {
    const notGame = await putGame('g-bad', { id: 'g-bad' });
    expect(notGame.status).toBe(400);
    expect(notGame.body.error).toContain('not a game');
    const pic = (await upload(await picture(100, 81))).body;
    const other = await putGame('g-two', gameOn('g-three', mapOn('m1', pic)));
    expect(other.status).toBe(400);
    expect(other.body.error).toContain('g-three');
    if (!FIXES) expect((await call('GET', '/api/games/a.b')).status).toBe(400); // Rust takes any shared Id (review #27)
    expect((await call('GET', `/api/games/${'x'.repeat(65)}`)).status).toBe(400);
    expect((await call('GET', '/api/games/x/versions/more')).status).toBe(400);
    expect((await call('GET', '/api/games/x/other')).status).toBe(404);
    expect((await call('PUT', '/api/games/g-junk', '{nope')).status).toBe(400);
    const big = gameOn('g-big', { ...mapOn('m1', pic), name: 'x'.repeat(150) });
    const huge = await putGame('g-big', { ...big, padding: 'x'.repeat(MAIN.maxGameBytes) });
    expect(huge.status).toBe(413);
    expect(huge.body.error).toContain('MB');
    expect((await call('GET', '/api/games/nope')).status).toBe(404);
    expect((await call('GET', '/api/games/nope/versions')).status).toBe(404);
  });

  test('delete moves the game to the trash; then 404', async () => {
    const pic = (await upload(await picture(100, 82))).body;
    await putGame('g-del', gameOn('g-del', mapOn('m1', pic)));
    const del = await fetch(`${BASE}/api/games/g-del`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect(del.headers.get('access-control-allow-origin')).toBe('*');
    expect((await call('GET', '/api/games/g-del')).status).toBe(404);
    expect(((await call('GET', '/api/games')).body.games as GameSummary[]).some((g) => g.id === 'g-del')).toBe(false);
    if (DATA_DIR) {
      expect(existsSync(join(DATA_DIR, 'games', 'g-del'))).toBe(false);
      expect(readdirSync(join(DATA_DIR, 'trash')).some((n) => n.startsWith('game-g-del-'))).toBe(true);
    }
    expect((await call('DELETE', '/api/games/g-del')).status).toBe(404);
  });

  test('/health counts the games', async () => {
    const before = (await call('GET', '/health')).body.games as number;
    const pic = (await upload(await picture(100, 83))).body;
    await putGame('g-count', gameOn('g-count', mapOn('m1', pic)));
    expect((await call('GET', '/health')).body.games).toBe(before + 1);
  });
});
