/**
 * Table moments (W5-2, docs/features.md "table moments") against a real TV page through the real
 * server:
 *
 * - spotlight: in the Moments tab a tap on a mini lights it — the rest of the TV's table dims
 *   (measured on screenshots); a second tap puts it out and the table is as bright as before;
 * - timer: a preset starts the countdown, the rings appear in the TV's margin (bottom and top),
 *   the chip beside the curtain pauses it, a TV reload keeps it exactly (server-clock stamped),
 *   Off the TV takes it away;
 * - handouts: a letter written in the dialog, shown at the table's edge, turned to the left
 *   side, then full screen; the TV's Back takes it off;
 * - DM notes: a long press on the map in the Tokens tab pins a note through the dialog; it is in
 *   the game's state and the tablet's list, and the TV never draws it.
 *
 * Shots go to `e2e/test-results/shots/w5-2-*.png`.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { wholeGrid, type MapInfo, type RootState } from '../shared/src/index.ts';

const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const WS = `ws://localhost:${SERVER_PORT}/ws`;
const SHOTS = 'e2e/test-results/shots';

interface Dd2vtt {
  resolution: { map_origin: { x: number; y: number }; map_size: { x: number; y: number }; pixels_per_grid: number };
  line_of_sight: { x: number; y: number }[][];
  portals: { bounds: { x: number; y: number }[] }[];
  image: string;
}

/** The vampire lair of the test set: its MapInfo and the files the pages are served. */
function lairMap() {
  const d = JSON.parse(readFileSync(new URL('../../test_assets/maps/04-vampire-lair-19x14.dd2vtt', import.meta.url), 'utf8')) as Dd2vtt;
  const o = d.resolution.map_origin;
  const cols = d.resolution.map_size.x;
  const rows = d.resolution.map_size.y;
  const ppg = d.resolution.pixels_per_grid;
  const picture = Buffer.from(d.image, 'base64');
  const geometry = JSON.stringify({
    walls: d.line_of_sight.map((line) => line.map((p) => ({ x: p.x - o.x, y: p.y - o.y }))),
    doors: d.portals.map((p) => ({ a: { x: p.bounds[0]!.x - o.x, y: p.bounds[0]!.y - o.y }, b: { x: p.bounds[1]!.x - o.x, y: p.bounds[1]!.y - o.y } })),
    lights: [],
  });
  const info: MapInfo = {
    id: 'lairmap00001', name: 'Vampire lair', kind: 'uvtt',
    picture: { hash: 'aaaaaaaaaaaaaaaa', ext: 'jpg', bytes: picture.length }, tableCopy: null,
    geometry: { hash: 'bbbbbbbbbbbbbbbb', ext: 'json', bytes: geometry.length },
    grid: wholeGrid(cols, rows, cols * ppg, rows * ppg), drawGrid: false, doorCount: d.portals.length, drawDoors: false, libraryId: null,
  };
  return { info, cols, rows, picture, geometry };
}

const LAIR = lairMap();
/** The goblin the spotlight lands on (a square of the lair's left half). */
const GOBLIN = { id: 'gob1', label: '1', name: 'Goblin', color: '#e05050', col: 4, row: 4, placed: true, hidden: false };

async function serveMap(page: Page): Promise<void> {
  await page.route(`**/files/${LAIR.info.picture.hash}.jpg`, (r) => r.fulfill({ body: LAIR.picture, contentType: 'image/jpeg' }));
  await page.route(`**/files/${LAIR.info.geometry!.hash}.json`, (r) => r.fulfill({ body: LAIR.geometry, contentType: 'application/json' }));
}

/** A companion socket the test drives: starts the game, sends commands, reads the TV's state. */
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

/** Keeps a dev server's hot-reload socket silent (other helpers edit the app meanwhile). */
async function noHotReload(page: Page): Promise<void> {
  await page.routeWebSocket((url) => url.searchParams.has('token') || url.pathname.endsWith('/app/'), () => {});
}

async function connected(page: Page): Promise<void> {
  await expect(page.getByTestId('companion-status')).toContainText(/TV online · ready/, { timeout: 20_000 });
}

/** TV + companion + driver on a new table; a game on the lair, revealed, with the goblin on it. */
async function setup(browser: Browser) {
  const room = `w52-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await noHotReload(tv);
  await serveMap(tv);
  await tv.goto(`/app/?mode=tv&table=${room}&debug=1&name=E2E%20TV`);
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 30_000 });
  const drv = await driver(room);
  const game = { id: `g${Date.now().toString(36)}`, name: 'Moments', createdAt: new Date().toISOString(), map: LAIR.info };
  await expect.poll(async () => {
    const name = (await drv.snapshot()).game?.name ?? null;
    if (name !== game.name) drv.send({ type: 'game.new', game });
    return name;
  }, { timeout: 20_000, intervals: [200, 1000, 2000] }).toBe(game.name);
  drv.cmd({ type: 'fog.all', value: 'reveal' });
  drv.cmd({ type: 'token.add', token: GOBLIN });
  await expect.poll(async () => mapOf(await drv.snapshot()).tokens.length).toBe(1);

  const compCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await compCtx.newPage();
  await noHotReload(page);
  await serveMap(page);
  await page.goto(`/app/?mode=companion&table=${room}&debug=1`);
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 });
  await connected(page);
  await page.waitForTimeout(400); // the kit Button's start-up debounce
  const close = async () => {
    drv.close();
    await compCtx.close();
    await tvCtx.close();
  };
  return { tv, page, drv, close };
}

const mapOf = (s: RootState) => s.game!.maps[s.game!.activeMapId]!;

/** Mean luminance (0–255) of part of the TV's screen, from a screenshot. */
async function tvLuma(tv: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number> {
  const png = (await tv.screenshot({ clip })).toString('base64');
  return tv.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 48;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 64, 48);
    const d = g.getImageData(0, 0, 64, 48).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }, png);
}

/** Where a map point (squares) is on the companion page, client px (the map view's e2e hook). */
async function mapPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([px, py]) => (window as unknown as { __bmMap: { toClient(x: number, y: number): { x: number; y: number } } }).__bmMap.toClient(px!, py!), [x, y]);
}

async function openTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

/**
 * Where to measure the TV: the lair is 19 × 14 squares at one inch in the 34 × 19 window, centred —
 * a part of it far from the goblin, and the margin under the map where the bottom ring sits.
 */
const FAR = { x: 1180, y: 640, width: 220, height: 180 };
const BOTTOM_RING = { x: 900, y: 948, width: 120, height: 110 };

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('spotlight, timer, handout and a DM note at the table', async ({ browser }) => {
  const { tv, page, drv, close } = await setup(browser);
  await expect.poll(() => tvLuma(tv, FAR), { timeout: 30_000 }).toBeGreaterThan(25); // the lair, revealed
  const farBefore = await tvLuma(tv, FAR);

  // ── spotlight: a tap on the goblin in the Moments tab ──
  await openTab(page, 'Moments');
  await expect(page.getByTestId('moments-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bmMap?: { camera(): unknown } }).__bmMap?.camera() ?? null), { timeout: 20_000 }).not.toBeNull();
  await page.waitForTimeout(600); // the first fit settles
  const g = await mapPoint(page, GOBLIN.col + 0.5, GOBLIN.row + 0.5);
  await page.mouse.click(g.x, g.y);
  await expect(page.getByTestId('spotlight-status')).toContainText('On Goblin');
  await expect.poll(async () => mapOf(await drv.snapshot()).spotlight?.target).toEqual({ kind: 'token', tokenId: GOBLIN.id });
  await tv.waitForTimeout(800);
  await expect.poll(() => tvLuma(tv, FAR), { timeout: 5000 }).toBeLessThan(farBefore * 0.8); // the rest of the table dims
  await tv.waitForTimeout(400);
  await tv.screenshot({ path: `${SHOTS}/w5-2-tv-spotlight.png` });

  // ── timer: 1 min from the preset, rings in the margin, paused from the chip, kept across a TV reload ──
  const ringBefore = await tvLuma(tv, BOTTOM_RING);
  await page.getByRole('button', { name: '1 min', exact: true }).click();
  await expect.poll(async () => (await drv.snapshot()).game?.timer?.startedAt ?? null).not.toBeNull();
  await expect(page.getByTestId('timer-chip')).toBeVisible();
  await expect.poll(() => tvLuma(tv, BOTTOM_RING), { timeout: 5000 }).toBeGreaterThan(ringBefore + 12);
  await tv.waitForTimeout(1200);
  await tv.screenshot({ path: `${SHOTS}/w5-2-tv-timer.png` });
  await page.getByTestId('timer-chip').click();
  await expect.poll(async () => {
    const t = (await drv.snapshot()).game?.timer;
    return t ? t.startedAt : 'no timer';
  }).toBeNull();
  const paused = (await drv.snapshot()).game!.timer!;
  expect(paused.remainingMs).toBeLessThan(60_000);
  expect(paused.remainingMs).toBeGreaterThan(40_000);
  await tv.waitForTimeout(2500); // the autosave runs 2 s after the last change (as game-night does)
  await tv.reload();
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 30_000 });
  await expect.poll(async () => (await drv.snapshot()).game?.timer ?? null, { timeout: 15_000 }).toEqual(paused);
  await expect.poll(() => tvLuma(tv, BOTTOM_RING), { timeout: 15_000 }).toBeGreaterThan(ringBefore + 12);

  // ── the spotlight goes out with a second tap ──
  await connected(page);
  await page.mouse.click(g.x, g.y);
  await expect.poll(async () => mapOf(await drv.snapshot()).spotlight ?? null).toBeNull();
  await expect.poll(() => tvLuma(tv, FAR), { timeout: 5000 }).toBeGreaterThan(farBefore * 0.92);

  // ── handout: a letter, at the edge, turned left, then full screen; Back on the TV takes it off ──
  await page.getByRole('button', { name: 'Write a letter' }).click();
  const dlg = page.getByTestId('handout-dialog');
  await dlg.locator('input').first().fill('The vampire’s letter');
  await dlg.locator('textarea').fill('Elrin —\nThe vault opens at moonrise. Come alone, and bring the silver key.\n— V.');
  await page.getByRole('button', { name: 'Add the letter' }).click();
  await expect.poll(async () => (await drv.snapshot()).game?.handouts?.length).toBe(1);
  const letter = (await drv.snapshot()).game!.handouts![0]!;
  await page.getByTestId('handouts').getByRole('button', { name: /The vampire’s letter/ }).first().click();
  await expect.poll(async () => (await drv.snapshot()).game?.handoutShown).toEqual({ id: letter.id, place: 'edge', side: 'bottom' });
  await expect(tv.getByTestId('tv-handout')).toHaveAttribute('data-place', 'edge');
  await expect(page.getByTestId('handout-chip')).toBeVisible();
  await page.getByRole('radio', { name: 'Left' }).click();
  await expect(tv.getByTestId('tv-handout')).toHaveAttribute('data-side', 'left');
  await tv.waitForTimeout(500);
  await tv.screenshot({ path: `${SHOTS}/w5-2-tv-handout-edge.png` });
  await page.getByRole('button', { name: /full screen/ }).first().click();
  await expect(tv.getByTestId('tv-handout')).toHaveAttribute('data-place', 'full');
  await tv.waitForTimeout(500);
  await tv.screenshot({ path: `${SHOTS}/w5-2-tv-handout-full.png` });
  await tv.keyboard.press('Escape');
  await expect.poll(async () => (await drv.snapshot()).game?.handoutShown ?? null).toBeNull();
  await expect(tv.getByTestId('tv-handout')).toHaveCount(0);

  // ── DM note: a long press on the map in the Tokens tab ──
  await openTab(page, 'Tokens');
  const spot = await mapPoint(page, 12.5, 9.5);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByTestId('note-dialog')).toBeVisible();
  await page.getByTestId('note-dialog').locator('textarea').fill('Trap here · DC 15');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => mapOf(await drv.snapshot()).notes?.map((n) => n.text)).toEqual(['Trap here · DC 15']);
  const note = mapOf(await drv.snapshot()).notes![0]!;
  expect(note.x).toBeCloseTo(12.5, 0);
  expect(note.y).toBeCloseTo(9.5, 0);
  expect(mapOf(await drv.snapshot()).tokens).toHaveLength(1); // the long press added no token

  // the tablet lists it in the Moments tab (the TV keeps it with the game but never builds a note
  // view: render/moments-layer.ts makes notes on the DM's view only)
  await openTab(page, 'Moments');
  await expect(page.getByTestId('notes')).toContainText('Trap here · DC 15');
  // the spotlight back on for the shot of the tablet
  await page.mouse.click(g.x, g.y);
  await expect.poll(async () => mapOf(await drv.snapshot()).spotlight?.target.kind).toBe('token');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/w5-2-tablet.png` });

  // ── Off the TV: the timer goes ──
  await page.getByRole('button', { name: 'Off the TV' }).click();
  await expect.poll(async () => (await drv.snapshot()).game?.timer).toBeNull();
  await expect.poll(() => tvLuma(tv, BOTTOM_RING), { timeout: 5000 }).toBeLessThan(ringBefore + 6);
  await close();
});
