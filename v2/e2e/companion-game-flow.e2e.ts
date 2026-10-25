/**
 * The companion's game screen against a real TV page through the real server (package 4a):
 * tokens placed and moved, the fog brush (a single tap too — v1 never sent it), Room and Circle
 * stopped by the map's walls, doors toggled by a tap, drawing and undo — each checked in the
 * TV's own state (a driver socket asks the TV for a snapshot). Plus screenshots of the screen
 * at tablet (1280 × 800) and phone (390 × 844) size into `e2e/test-results/shots/` (git-ignored).
 *
 * The map is the test set's vampire lair (`test_assets/maps/04-vampire-lair-19x14.dd2vtt`):
 * its picture and walls are served to the companion page by route, since the server's file
 * store is another package's work.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { maskCount, wholeGrid, type MapInfo, type RootState } from '../shared/src/index.ts';

const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const WS = `ws://localhost:${SERVER_PORT}/ws`;

const lair = JSON.parse(readFileSync(new URL('../../test_assets/maps/04-vampire-lair-19x14.dd2vtt', import.meta.url), 'utf8')) as {
  resolution: { map_origin: { x: number; y: number }; map_size: { x: number; y: number }; pixels_per_grid: number };
  line_of_sight: { x: number; y: number }[][];
  portals: { bounds: { x: number; y: number }[] }[];
  image: string;
};
const COLS = lair.resolution.map_size.x;
const ROWS = lair.resolution.map_size.y;
const PPG = lair.resolution.pixels_per_grid;
const o = lair.resolution.map_origin;
const PICTURE = Buffer.from(lair.image, 'base64');
const GEOMETRY = JSON.stringify({
  walls: lair.line_of_sight.map((line) => line.map((p) => ({ x: p.x - o.x, y: p.y - o.y }))),
  doors: lair.portals.map((d) => ({ a: { x: d.bounds[0]!.x - o.x, y: d.bounds[0]!.y - o.y }, b: { x: d.bounds[1]!.x - o.x, y: d.bounds[1]!.y - o.y } })),
  lights: [],
});
const PIC_HASH = 'aaaaaaaaaaaaaaaa';
const GEO_HASH = 'bbbbbbbbbbbbbbbb';

function lairMap(): MapInfo {
  return {
    id: 'lairmap00001', name: 'Vampire lair', kind: 'uvtt',
    picture: { hash: PIC_HASH, ext: 'jpg', bytes: PICTURE.length }, tableCopy: null,
    geometry: { hash: GEO_HASH, ext: 'json', bytes: GEOMETRY.length },
    grid: wholeGrid(COLS, ROWS, COLS * PPG, ROWS * PPG), drawGrid: false, doorCount: lair.portals.length, drawDoors: false, libraryId: null,
  };
}

/** A companion socket the test drives: starts games and reads the TV's state. */
async function driver(room: string): Promise<{ send(msg: object): void; snapshot(): Promise<RootState>; close(): void }> {
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
  return {
    send: (msg) => ws.send(JSON.stringify(msg)),
    async snapshot() {
      const snap = next('sync.snapshot');
      ws.send(JSON.stringify({ type: 'sync.request' }));
      return (await snap).state as RootState;
    },
    close: () => ws.close(),
  };
}

/**
 * Keeps Vite's hot-reload socket silent: other helpers edit the app while these flows run, and a
 * full reload of the TV or companion page mid-test would restart it (new epoch, lost state).
 */
async function noHotReload(page: Page): Promise<void> {
  await page.routeWebSocket((url) => url.searchParams.has('token') || url.pathname.endsWith('/app/'), () => {});
}

/** Serves the lair's picture and walls to a page (the server's file store is not ours). */
async function serveLair(page: Page): Promise<void> {
  await page.route(`**/files/${PIC_HASH}.jpg`, (r) => r.fulfill({ body: PICTURE, contentType: 'image/jpeg' }));
  await page.route(`**/files/${GEO_HASH}.json`, (r) => r.fulfill({ body: GEOMETRY, contentType: 'application/json' }));
}

/** TV page + companion page + driver on a new table with the lair open. */
async function setup(browser: import('@playwright/test').Browser, size = { width: 1280, height: 800 }) {
  const room = `cg-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await noHotReload(tv);
  await serveLair(tv);
  if (process.env.E2E_CONSOLE) tv.on('console', (m) => { const t = m.text(); if (/sync|games|tv\]/.test(t)) console.log('[tv]', t.slice(0, 220)); });
  await tv.goto(`/app/?mode=tv&table=${room}&debug=1&name=E2E%20TV`);
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 30_000 });
  const drv = await driver(room);
  const game = { id: `g${Date.now().toString(36)}`, name: 'Night one', createdAt: new Date().toISOString(), map: lairMap() };
  // the TV may still be opening its storage (it then answers with its start state): ask again
  await expect.poll(async () => {
    const name = (await drv.snapshot()).game?.name ?? null;
    if (name !== 'Night one') drv.send({ type: 'game.new', game });
    return name;
  }, { timeout: 20_000, intervals: [200, 1000, 2000] }).toBe('Night one');

  const compCtx = await browser.newContext({ viewport: size, hasTouch: size.width < 720, deviceScaleFactor: size.width < 720 ? 3 : 2 });
  const page = await compCtx.newPage();
  await noHotReload(page);
  if (process.env.E2E_CONSOLE) page.on('console', (m) => { const t = m.text(); if (/companion|sync/.test(t)) console.log('[companion]', t.slice(0, 200)); });
  await serveLair(page);
  await page.goto(`/app/?mode=companion&table=${room}&debug=1`);
  await expect(page.getByTestId('game-screen')).toBeVisible();
  await connected(page);
  // the map is fitted once the view is measured (then map points have a place on the page)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bmMap?: { camera(): { centerX: number } | null } }).__bmMap?.camera()?.centerX ?? 0), { timeout: 45_000 }) // WebGL starts slowly under SwiftShader on a loaded Mac.toBe(COLS / 2);
  await page.waitForTimeout(400); // the kit Button's start-up debounce
  const close = async () => {
    drv.close();
    await compCtx.close();
    await tvCtx.close();
  };
  return { tv, page, drv, close };
}

/** Client coordinates of a map point on the companion. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([x, y]) => (window as unknown as { __bmMap: { toClient(x: number, y: number): { x: number; y: number } } }).__bmMap.toClient(x, y), [x, y] as const);
}

/** Waits until the companion is connected to the TV with its state (after a reconnect too). */
async function connected(page: Page): Promise<void> {
  await expect(page.getByTestId('companion-status')).toContainText(/TV online · ready/, { timeout: 20_000 });
}

async function tap(page: Page, x: number, y: number): Promise<void> {
  await connected(page);
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 12): Promise<void> {
  await connected(page);
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

const mapOf = (s: RootState) => s.game!.maps[s.game!.activeMapId]!;
const revealedOn = (s: RootState) => maskCount(mapOf(s).fog.revealed, COLS * ROWS);

test.describe.configure({ mode: 'serial', timeout: 120_000 });

/** Chooses a tool tab (a tap on the chosen one would fold the panel). */
async function openTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

test('tokens: tap adds, drag moves, tap selects; the TV has them', async ({ browser }) => {
  const { page, drv, close } = await setup(browser);
  await openTab(page, 'Tokens');
  await tap(page, 9.5, 7.5);
  await expect.poll(async () => mapOf(await drv.snapshot()).tokens.map((t) => [t.col, t.row])).toEqual([[9, 7]]);
  await drag(page, [9.5, 7.5], [12.5, 8.5]);
  await expect.poll(async () => mapOf(await drv.snapshot()).tokens.map((t) => [t.col, t.row])).toEqual([[12, 8]]);
  const selected = page.getByTestId('tokens-on-map').locator('.selected');
  await expect(selected).toHaveCount(1); // the dragged token is the selected one
  await tap(page, 12.5, 8.5);
  await expect(selected).toHaveCount(0);
  await tap(page, 12.5, 8.5);
  await expect(selected).toHaveCount(1);
  // an off-map token from the name field, placed with the next tap
  await page.getByPlaceholder(/Name a new token/).fill('Thorin');
  await page.getByPlaceholder(/Name a new token/).press('Enter');
  await tap(page, 5.5, 3.5);
  await expect.poll(async () => mapOf(await drv.snapshot()).tokens.find((t) => t.name === 'Thorin')).toMatchObject({ placed: true, col: 5, row: 3 });
  await close();
});

test('fog: a single brush tap, a stroke, Room and Circle reach the TV; undo takes a stroke back', async ({ browser }) => {
  const { page, drv, close } = await setup(browser);
  await openTab(page, 'Fog');
  await page.getByRole('radio', { name: /Brush/ }).click();
  // smallest brush: one square per tap
  const slider = page.getByRole('slider', { name: 'Brush size' });
  await slider.fill('0');
  await slider.dispatchEvent('change');
  await tap(page, 5.5, 5.5);
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBe(1);

  await drag(page, [2.5, 10.5], [8.5, 10.5]);
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBe(8);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBe(1);

  await page.getByRole('radio', { name: /Room/ }).click();
  await tap(page, 9.5, 6.5);
  const afterRoom = await (async () => { await expect.poll(async () => revealedOn(await drv.snapshot())).toBeGreaterThan(1); return revealedOn(await drv.snapshot()); })();
  expect(afterRoom).toBeLessThan(COLS * ROWS); // walls stopped it

  await page.getByRole('radio', { name: /Circle/ }).click();
  await page.getByRole('radio', { name: /Hide/ }).click();
  await tap(page, 9.5, 6.5); // a circle of hidden squares, radius 4
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBeLessThan(afterRoom);
  const hidden = afterRoom - revealedOn(await drv.snapshot());
  expect(hidden).toBeGreaterThan(9);
  expect(hidden).toBeLessThanOrEqual(81);
  await close();
});

test('fog preview: staged until Apply; Reveal all with an Undo notice', async ({ browser }) => {
  const { page, drv, close } = await setup(browser);
  await openTab(page, 'Fog');
  await page.getByRole('radio', { name: /Preview first/ }).click();
  await expect.poll(async () => (await drv.snapshot()).game!.previewFirst).toBe(true);
  await page.getByRole('radio', { name: /Room/ }).click();
  await tap(page, 9.5, 6.5);
  await expect.poll(async () => mapOf(await drv.snapshot()).fog.staged !== null).toBe(true);
  expect(revealedOn(await drv.snapshot())).toBe(0);
  await page.getByRole('button', { name: /^Apply \d+ squares?$/ }).click();
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBeGreaterThan(0);

  await page.getByRole('radio', { name: /Instantly/ }).click();
  await page.getByRole('button', { name: 'Reveal all' }).click();
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBe(COLS * ROWS);
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBeLessThan(COLS * ROWS);
  await close();
});

test('a tap on a door opens it on the TV', async ({ browser }) => {
  const { page, drv, close } = await setup(browser);
  const door = JSON.parse(GEOMETRY).doors[0] as { a: { x: number; y: number }; b: { x: number; y: number } };
  await openTab(page, 'Fog');
  await page.waitForTimeout(300); // walls and doors load
  await tap(page, (door.a.x + door.b.x) / 2, (door.a.y + door.b.y) / 2);
  await expect.poll(async () => mapOf(await drv.snapshot()).doorsOpen).toEqual([0]);
  await close();
});

test('draw: a stroke reaches the TV, undo removes it, clear offers Undo', async ({ browser }) => {
  const { page, drv, close } = await setup(browser);
  await openTab(page, 'Draw');
  await drag(page, [3, 3], [10, 6], 20);
  await expect.poll(async () => mapOf(await drv.snapshot()).strokes.length).toBe(1);
  expect((await drv.snapshot()).live.stroke).toBeNull();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => mapOf(await drv.snapshot()).strokes.length).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => mapOf(await drv.snapshot()).strokes.length).toBe(1);
  await page.getByRole('button', { name: /Clear all drawings/ }).click();
  await expect.poll(async () => mapOf(await drv.snapshot()).strokes.length).toBe(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect.poll(async () => mapOf(await drv.snapshot()).strokes.length).toBe(1);
  await close();
});

test('screenshots: tablet and phone', async ({ browser }) => {
  test.setTimeout(240_000); // two tables, each starting WebGL in software (8 s and more under load)
  for (const [name, size] of [['tablet', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] as const) {
    const { page, drv, close } = await setup(browser, size);
    // something on the table: two tokens, a revealed room, a stroke
    drv.send({ type: 'sync.cmd', seq: 1, cmd: { type: 'token.add', token: { id: 'tok000000001', label: '1', name: 'Thorin', color: '#e3b45e', col: 9, row: 6, placed: true, hidden: false } } });
    drv.send({ type: 'sync.cmd', seq: 2, cmd: { type: 'token.add', token: { id: 'tok000000002', label: '2', name: 'Elira', color: '#6cb4e6', col: 10, row: 7, placed: true, hidden: false } } });
    drv.send({ type: 'sync.cmd', seq: 3, cmd: { type: 'token.add', token: { id: 'tok000000003', label: '3', name: 'Dire wolf', color: '#b693f0', col: 14, row: 4, placed: true, hidden: true } } });
    const cells: number[] = [];
    for (let r = 3; r <= 10; r++) for (let c = 5; c <= 13; c++) cells.push(r * COLS + c);
    drv.send({ type: 'sync.cmd', seq: 4, cmd: { type: 'fog.apply', cells, value: 'reveal', gesture: 'shotgesture1' } });
    drv.send({ type: 'sync.cmd', seq: 5, cmd: { type: 'layers.set', layers: [{ id: 'layer0000001', name: 'DM version of the lair', file: { hash: PIC_HASH, ext: 'jpg', bytes: PICTURE.length }, visible: true, opacity: 0.6 }] } });
    drv.send({ type: 'sync.cmd', seq: 6, cmd: { type: 'draw.add', stroke: { id: 'strk00000001', points: [6, 4, 8, 5, 10, 4.5, 12, 6], color: '#e53935', width: 0.16 } } });
    await expect.poll(async () => { const m = mapOf(await drv.snapshot()); return `${m.layers.length} ${m.strokes.length}`; }, { timeout: 10_000 }).toBe('1 1');
    for (const tab of ['Tokens', 'Fog', 'Draw', 'Measure', 'View']) {
      await openTab(page, tab);
      if (tab === 'Fog') await page.getByRole('radio', { name: /Room/ }).click();
      if (tab === 'Measure' && !(await page.getByRole('switch', { name: /Template disc on the map/ }).isChecked())) await page.getByRole('switch', { name: /Template disc on the map/ }).click();
      await page.waitForTimeout(1300); // the phone's sheet settles, then the map refits above it
      await page.screenshot({ path: `e2e/test-results/shots/companion-game-${name}-${tab.toLowerCase()}.jpg`, type: 'jpeg', quality: 70 });
    }
    // the DM-layer row at the panel's foot must fit its width (qa#5)
    await page.getByTestId('dm-layers').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const fits = await page.getByTestId('dm-layers').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
    await page.screenshot({ path: `e2e/test-results/shots/companion-game-${name}-layers.jpg`, type: 'jpeg', quality: 70 });
    await close();
  }
});
