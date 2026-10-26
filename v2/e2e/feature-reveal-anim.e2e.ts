/**
 * The reveal animation (roadmap S4, docs/features.md "Reveal animation") on a real TV page
 * through the real server: a room is revealed, then a large area next to it; the TV is shot
 * mid-animation (the fog must roll back in wisps from the room outward) and once it settled.
 *
 * Checks: mid-animation the new area is between fog and map in brightness, the fog nearer the
 * room is gone first, and after the cap (1.6 s) the area looks like the map. Shots go to
 * `e2e/test-results/shots/w5-1-reveal-*.jpg` for a look by eye.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { wholeGrid, type MapInfo, type RootState } from '../shared/src/index.ts';

const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const WS = `ws://localhost:${SERVER_PORT}/ws`;
const SHOTS = 'e2e/test-results/shots';

interface Dd2vtt {
  resolution: { map_origin: { x: number; y: number }; map_size: { x: number; y: number }; pixels_per_grid: number };
  image: string;
}

const LAIR = (() => {
  const d = JSON.parse(readFileSync(new URL('../../test_assets/maps/04-vampire-lair-19x14.dd2vtt', import.meta.url), 'utf8')) as Dd2vtt;
  const cols = d.resolution.map_size.x;
  const rows = d.resolution.map_size.y;
  const ppg = d.resolution.pixels_per_grid;
  const picture = Buffer.from(d.image, 'base64');
  const info: MapInfo = {
    id: 'revealmap001', name: 'Vampire lair', kind: 'picture',
    picture: { hash: 'eeeeeeeeeeeeeeee', ext: 'jpg', bytes: picture.length }, tableCopy: null, geometry: null,
    grid: wholeGrid(cols, rows, cols * ppg, rows * ppg), drawGrid: false, doorCount: 0, drawDoors: false, libraryId: null,
  };
  return { info, cols, rows, picture };
})();

/** A companion socket the test drives. */
async function driver(room: string): Promise<{ send(msg: object): void; cmd(c: object): void; snapshot(): Promise<RootState>; close(): void }> {
  const ws = new WebSocket(WS);
  const waiting: Array<(m: Record<string, unknown>) => boolean> = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Record<string, unknown>;
    for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i]!(m)) waiting.splice(i, 1);
  };
  const next = (type: string, timeout = 8000) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${type}`)), timeout);
    waiting.push((m) => (m.type === type ? (clearTimeout(t), resolve(m), true) : false));
  });
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('driver socket failed'));
  });
  const welcome = next('welcome');
  ws.send(JSON.stringify({ type: 'hello', protocol: 1, role: 'companion', room, client: `drv${Date.now().toString(36)}`, name: 'e2e driver', build: 'e2e' }));
  await welcome;
  let seq = 1;
  return {
    send: (msg) => ws.send(JSON.stringify(msg)),
    cmd: (c) => ws.send(JSON.stringify({ type: 'sync.cmd', seq: seq++, cmd: c })),
    async snapshot() {
      const snap = next('sync.snapshot');
      ws.send(JSON.stringify({ type: 'sync.request' }));
      return (await snap).state as RootState;
    },
    close: () => ws.close(),
  };
}

/** The squares of a block, as cell indices. */
function block(c0: number, r0: number, c1: number, r1: number, skip?: (c: number, r: number) => boolean): number[] {
  const out: number[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!skip?.(c, r)) out.push(r * LAIR.cols + c);
  return out;
}

/** Mean luminance (0–255) of a screen rect of a PNG screenshot. */
async function luma(page: Page, png: Buffer, rect: { x: number; y: number; w: number; h: number }): Promise<number> {
  return page.evaluate(async ({ b64, rect }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = rect.w;
    c.height = rect.h;
    const g = c.getContext('2d')!;
    g.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const d = g.getImageData(0, 0, rect.w, rect.h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }, { b64: png.toString('base64'), rect });
}

test('a reveal rolls the fog back in wisps, outward from the open room, and settles', async ({ browser }) => {
  test.setTimeout(90_000);
  const room = `w51-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  await tv.routeWebSocket((url) => url.searchParams.has('token') || url.pathname.endsWith('/app/'), () => {});
  await tv.route(`**/files/${LAIR.info.picture.hash}.jpg`, (r) => r.fulfill({ body: LAIR.picture, contentType: 'image/jpeg' }));
  await tv.goto(`/app/?mode=tv&table=${room}&debug=1&name=E2E%20TV`);
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 30_000 });
  const drv = await driver(room);
  const game = { id: `g${Date.now().toString(36)}`, name: 'Reveal test', createdAt: new Date().toISOString(), map: LAIR.info };
  await expect.poll(async () => {
    const name = (await drv.snapshot()).game?.name ?? null;
    if (name !== game.name) drv.send({ type: 'game.new', game });
    return name;
  }, { timeout: 20_000, intervals: [200, 1000, 2000] }).toBe(game.name);
  drv.cmd({ type: 'fog.enable', on: true });
  drv.cmd({ type: 'fog.all', value: 'hide' });
  // The room on the left, open before the reveal under test.
  drv.cmd({ type: 'fog.apply', cells: block(1, 4, 4, 9), value: 'reveal', gesture: 'room' });
  await tv.waitForTimeout(3000); // map loaded, the room's own animation over

  // The table window is the whole TV; the lair (19 × 14) sits centred: find its squares on screen.
  const cam = await tv.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const r = canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  const sq = Math.min(cam.w / 34, cam.h / 19);
  const ox = (cam.w - LAIR.cols * sq) / 2;
  const oy = (cam.h - LAIR.rows * sq) / 2;
  const at = (c: number, r: number, n = 2) => ({ x: Math.round(ox + c * sq), y: Math.round(oy + r * sq), w: Math.round(n * sq), h: Math.round(n * sq) });
  const near = at(5, 5); // right next to the room
  const far = at(14, 5); // nine squares away

  const t0 = Date.now();
  drv.cmd({ type: 'fog.apply', cells: block(5, 1, 17, 12), value: 'reveal', gesture: 'reveal' });
  const shots: Array<{ ms: number; png: Buffer }> = [];
  for (const wait of [150, 400, 700, 1000]) {
    const left = t0 + wait - Date.now();
    if (left > 0) await tv.waitForTimeout(left);
    const ms = Date.now() - t0;
    shots.push({ ms, png: await tv.screenshot() });
  }
  await tv.waitForTimeout(Math.max(0, t0 + 2600 - Date.now()));
  const done = await tv.screenshot();
  // Save the shots as JPEG (the browser encodes them).
  for (const s of [...shots, { ms: 2600, png: done }]) {
    const jpg = await tv.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.8).split(',')[1]!;
    }, s.png.toString('base64'));
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(`${SHOTS}/w5-1-reveal-${s.ms}.jpg`, Buffer.from(jpg, 'base64'));
  }

  const nearL = await Promise.all(shots.map((s) => luma(tv, s.png, near)));
  const farL = await Promise.all(shots.map((s) => luma(tv, s.png, far)));
  const nearDone = await luma(tv, done, near);
  const farDone = await luma(tv, done, far);
  test.info().annotations.push({ type: 'luma', description: JSON.stringify({ ms: shots.map((s) => s.ms), nearL, farL, nearDone, farDone }) });
  // Settled: both spots show the map.
  expect(nearDone).toBeGreaterThan(15);
  expect(farDone).toBeGreaterThan(15);
  // Mid-animation: the far spot is still darker than at the end, and darker than the near spot.
  const mid = shots.findIndex((s) => s.ms >= 350 && s.ms <= 800);
  expect(mid).toBeGreaterThanOrEqual(0);
  expect(farL[mid]!).toBeLessThan(farDone * 0.8);
  expect(farL[mid]!).toBeLessThan(nearL[mid]!);
  drv.close();
  await ctx.close();
});
