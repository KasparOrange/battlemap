/**
 * The v1 import end to end against a real (test) v2 server: a made-up v1 TV library with a
 * `.dd2vtt` from the shared library, a picture map behind an upload link, a picture map only the
 * TV has (sent as chunks over a fake v1 relay, the way v1's TV sends it to a tablet), a map whose
 * file is gone, a DM layer, two games — and the bot client against a fake v1 relay.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { check, Game, maskCells, type LibraryEntry } from '../../shared/src/index.ts';
import { testServer, type TestServer } from '../../server/test/helpers.ts';
import { picture } from '../../server/test/pictures.ts';
import { V1Bot } from './relay.ts';
import { importV1 } from './run.ts';
import type { V1Listing, V1Session } from './v1.ts';
import { v2Server } from './v2-server.ts';

const HOUSE = new URL('../../../test_assets/maps/01-eldrica-house-10x8.dd2vtt', import.meta.url).pathname;
const V1 = 'http://v1.test:4242';
const quiet = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

/** A tiny .dd2vtt (10 × 8 squares of 32 px, 2 doors) when the real test map isn't checked out. */
async function houseFile(): Promise<Uint8Array> {
  if (existsSync(HOUSE)) return new Uint8Array(readFileSync(HOUSE));
  const png = await picture(320, 256, 'png', 'noise');
  return new TextEncoder().encode(JSON.stringify({
    format: 0.3, resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 8 }, pixels_per_grid: 32 },
    line_of_sight: [], objects_line_of_sight: [], lights: [], environment: {},
    portals: [0, 1].map((i) => ({ position: { x: 2 + i, y: 1 }, bounds: [{ x: 2 + i, y: 1 }, { x: 3 + i, y: 1 }], rotation: 0, closed: true, freestanding: false })),
    image: Buffer.from(png).toString('base64'),
  }));
}

let srv: TestServer;
let files: Map<string, Uint8Array>;
let tvOnly: Uint8Array;

/** A v1 session with the defaults `Session.toJson` writes. */
function session(id: string, mapId: string, extra: Partial<V1Session> = {}): V1Session {
  return { id, mapId, name: `Game ${id}`, createdAt: '2026-10-10T18:00:00.000', lastModifiedAt: '2026-10-10T21:00:00.000', revealedCells: [], openPortals: [], showGrid: true, fogEnabled: true, cameraX: 0, cameraY: 0, cameraZoom: 1, cameraAngle: 0, ...extra };
}

const listing: V1Listing = {
  maps: [
    { id: 'm-house', displayName: "Eldrica's house", gridCols: 10, gridRows: 8, portalCount: 2, serverMapId: '756a04d14b33', vpsUrl: `${V1}/uploads/library/756a04d14b33.dd2vtt`, addedAt: '2026-10-10T19:30:08Z' },
    { id: 'm-cave', displayName: "Juri's cave", gridCols: 40, gridRows: 30, isImage: true, pdfGridCols: 8, pdfGridRows: 6, drawGrid: false, vpsUrl: `${V1}/uploads/cave.jpg`,
      rasterGrid: { x: 10, y: 0, w: 48, h: 48, cols: 8, rows: 6, pw: 400, ph: 300 } },
    { id: 'm-pdf', displayName: 'Old PDF map', gridCols: 4, gridRows: 3, isPdf: true, pdfGridCols: 4, pdfGridRows: 3, vpsUrl: `${V1}/uploads/old.pdf` },
    { id: 'm-gone', displayName: 'Expired upload', gridCols: 10, gridRows: 10, vpsUrl: `${V1}/uploads/expired.dd2vtt` },
  ],
  sessions: [
    session('g-two', 'm-house', {
      name: 'Two maps', revealedCells: [0, 1, 11], openPortals: [1], mapIds: ['m-house', 'm-cave'],
      dmOverlayData: [{ id: 'l1', name: 'secrets.png', url: '/uploads/dm/secrets.png', visible: true, opacity: 0.5 }],
      parkedMaps: { 'm-cave': { revealedCells: [47], openPortals: [], tokenData: [{ id: 't1', label: '1', color: 'ffe53935', gridX: 2, gridY: 3 }] } },
    }),
    session('g-pdf', 'm-pdf', { name: 'PDF night', revealedCells: [11] }),
    session('g-gone', 'm-gone', { name: 'Lost one' }),
  ],
};

beforeAll(async () => {
  srv = await testServer();
  tvOnly = await picture(200, 150, 'png', 'noise');
  files = new Map([
    [`${V1}/library`, new TextEncoder().encode(JSON.stringify({ maps: [{ id: '756a04d14b33', name: "Eldrica's house", kind: 'vtt', url: '/uploads/library/756a04d14b33.dd2vtt' }] }))],
    [`${V1}/uploads/library/756a04d14b33.dd2vtt`, await houseFile()],
    [`${V1}/uploads/cave.jpg`, await picture(400, 300, 'jpeg', 'noise')],
    [`${V1}/uploads/old.pdf`, new TextEncoder().encode('%PDF-1.4 not used')],
    [`${V1}/uploads/dm/secrets.png`, await picture(64, 64, 'png')],
  ]);
});
afterAll(async () => {
  await srv.stop();
});

describe('v1 import against a test server', () => {
  test('converts maps from the shared library, a link and the TV; stores the games; reports the rest', async () => {
    const asked: string[] = [];
    const deleted: string[] = [];
    let backHome = 0;
    const tv = {
      async mapFromTv(mapId: string, sessionId: string | null) {
        asked.push(`${mapId}:${sessionId}`);
        if (mapId === 'm-pdf') return { bytes: tvOnly };
        throw new Error('no such map on this TV');
      },
      async listing() {
        return listing;
      },
      deleteSession: (id: string) => deleted.push(id),
      goToLibrary: () => backHome++,
    };
    const report = await importV1({
      listing, v1Http: V1, server: v2Server(srv.base), tv, library: true, dryRun: false, log: quiet,
      download: async (url) => files.get(url) ?? null,
    });

    expect(report.maps.map((m) => [m.v1Id, m.source, m.id !== null])).toEqual([
      ['m-house', 'shared library', true],
      ['m-cave', 'upload link', true],
      ['m-pdf', 'TV', true],
      ['m-gone', 'none', false],
    ]);
    expect(asked).toEqual(['m-pdf:g-pdf', 'm-gone:g-gone']);
    expect(deleted).toEqual([]);
    expect(backHome).toBe(1);
    expect(report.layers).toEqual({ copied: 1, missing: [] });
    expect(report.games.map((g) => [g.id, g.stored, g.maps])).toEqual([['g-two', true, 2], ['g-pdf', true, 1], ['g-gone', false, 0]]);

    // the backup is a v2 game a TV can open
    const res = await fetch(`${srv.base}/api/games/g-two`);
    expect(res.status).toBe(200);
    const parsed = check(Game, await res.json());
    expect(parsed.ok).toBe(true);
    const game = (parsed as { ok: true; value: Game }).value;
    expect(game.mapOrder).toEqual(['756a04d14b33', 'm-cave']);
    const house = game.maps['756a04d14b33']!;
    expect(house.info.kind).toBe('uvtt');
    expect(house.info.grid.cols).toBe(10);
    expect(house.info.doorCount).toBeGreaterThan(1);
    expect(house.info.libraryId).toBe('756a04d14b33');
    expect(maskCells(house.fog.revealed, 80)).toEqual([0, 1, 11]);
    expect(house.doorsOpen).toEqual([1]);
    expect(house.layers).toHaveLength(1);
    const cave = game.maps['m-cave']!;
    expect(cave.info.kind).toBe('picture');
    expect(cave.info.grid).toMatchObject({ x: 10, y: 0, cellW: 48, cols: 8, rows: 6, pictureW: 400, pictureH: 300 });
    expect(cave.info.drawGrid).toBe(false);
    expect(maskCells(cave.fog.revealed, 48)).toEqual([47]);
    expect(cave.tokens[0]).toMatchObject({ col: 2, row: 3, color: '#e53935' });

    // the PDF page the TV rendered, on v1's 4 × 3 squares
    const pdf = check(Game, await (await fetch(`${srv.base}/api/games/g-pdf`)).json());
    expect(pdf.ok).toBe(true);
    const pdfMap = (pdf as { ok: true; value: Game }).value.maps['m-pdf']!;
    expect(pdfMap.info.grid).toMatchObject({ cols: 4, rows: 3, pictureW: 200, pictureH: 150 });

    // the TV's maps joined the shared library (the house keeps its v1 shared id)
    const lib = (await (await fetch(`${srv.base}/api/library`)).json()) as { entries: LibraryEntry[] };
    expect(lib.entries.map((e) => e.map.id).sort()).toEqual(['756a04d14b33', 'm-cave', 'm-pdf']);
    expect(report.games.find((g) => g.id === 'g-gone')!.issues.join(' ')).toContain('no map of this game');
  }, 60_000);

  test('a dry run stores no game and no library entry', async () => {
    const before = ((await (await fetch(`${srv.base}/api/games`)).json()) as { games: unknown[] }).games.length;
    const report = await importV1({
      listing: { maps: [listing.maps[1]!], sessions: [session('g-dry', 'm-cave')] }, v1Http: V1, server: v2Server(srv.base), tv: null, library: true, dryRun: true, log: quiet,
      download: async (url) => files.get(url) ?? null,
    });
    expect(report.games[0]).toMatchObject({ id: 'g-dry', stored: false, maps: 1 });
    expect(((await (await fetch(`${srv.base}/api/games`)).json()) as { games: unknown[] }).games.length).toBe(before);
  }, 30_000);
});

describe('v1 relay bot', () => {
  test('registers as bot, gets the listing, reassembles a chunked map, answers pings', async () => {
    const payload = new Uint8Array(70_000).map((_, i) => i % 251);
    const b64 = Buffer.from(payload).toString('base64');
    const seen: string[] = [];
    const relay = Bun.serve({
      port: 0,
      fetch(req, server) {
        return server.upgrade(req) ? undefined : new Response('no', { status: 400 });
      },
      websocket: {
        message(ws, raw) {
          const m = JSON.parse(String(raw)) as { type: string; mapId?: string };
          seen.push(m.type);
          if (m.type === 'register') {
            ws.send(JSON.stringify({ type: 'registered', role: 'bot', paired: true }));
            ws.send(JSON.stringify({ type: 'ping', sent: 42 }));
          }
          if (m.type === 'lib.requestList') ws.send(JSON.stringify({ type: 'lib.listing', ...listing }));
          if (m.type === 'nav.goToGame' && m.mapId === 'm-pdf') {
            const parts = b64.match(/.{1,30000}/g)!;
            ws.send(JSON.stringify({ type: 'vtt.mapStart', chunks: parts.length }));
            parts.forEach((d, i) => ws.send(JSON.stringify({ type: 'vtt.mapChunk', i, d })));
            ws.send(JSON.stringify({ type: 'vtt.mapEnd' }));
          }
          if (m.type === 'nav.goToGame' && m.mapId === 'm-house') ws.send(JSON.stringify({ type: 'vtt.downloadMap', url: `${V1}/x.dd2vtt`, displayName: 'x' }));
        },
      },
    });
    try {
      const bot = new V1Bot(`ws://127.0.0.1:${relay.port}`);
      expect(await bot.connect()).toBe(true);
      const l = await bot.listing();
      expect(l.sessions.map((s) => s.id)).toEqual(['g-two', 'g-pdf', 'g-gone']);
      const t = await bot.mapFromTv('m-pdf', 'g-pdf');
      expect('bytes' in t && Buffer.from(t.bytes).equals(Buffer.from(payload))).toBe(true);
      expect(await bot.mapFromTv('m-house', null)).toEqual({ url: `${V1}/x.dd2vtt` });
      bot.close();
      expect(seen).toContain('pong');
      expect(seen.filter((s) => s === 'nav.goToGame')).toHaveLength(2);
    } finally {
      relay.stop(true);
    }
  });
});
