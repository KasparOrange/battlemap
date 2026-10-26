/**
 * The companion's Effects tab against a real TV page through the real server (W3-D): a
 * fireball cast with Aim first reaches the TV's state exactly once, cloudkill placed and
 * removed, rain switched on and off, an aura that stays on its token when the token moves —
 * each checked in the TV's own state (a driver socket asks for a snapshot). Screenshots of the
 * tab (tablet and phone) and of the TV with effects go to `e2e/test-results/shots/`.
 *
 * The helpers (setup, driver, taps) follow `companion-game-flow.e2e.ts`; the map is the test
 * set's vampire lair.
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
      const snap = next('sync.snapshot', 15_000); // a TV busy opening the map answers late (qa#31)
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
    const name = (await drv.snapshot().catch(() => null))?.game?.name ?? null; // no answer yet: ask again
    if (name !== 'Night one') drv.send({ type: 'game.new', game });
    return name;
  }, { timeout: 20_000, intervals: [200, 1000, 2000] }).toBe('Night one');

  const compCtx = await browser.newContext({ viewport: size, hasTouch: size.width < 720, deviceScaleFactor: size.width < 720 ? 3 : 2 });
  const page = await compCtx.newPage();
  await noHotReload(page);
  if (process.env.E2E_CONSOLE) page.on('console', (m) => { const t = m.text(); if (/companion|sync/.test(t)) console.log('[companion]', t.slice(0, 200)); });
  await serveLair(page);
  await page.goto(`/app/?mode=companion&table=${room}&debug=1`);
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 }); // the companion's start under load
  await connected(page);
  // the map is fitted once the view is measured (then map points have a place on the page)
  // WebGL starts slowly under SwiftShader on a loaded Mac
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bmMap?: { camera(): { centerX: number } | null } }).__bmMap?.camera()?.centerX ?? 0), { timeout: 45_000 }).toBe(COLS / 2);
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

// Each flow sets up its own TV, companion and table: they run in order but independently, so one
// slow start fails only its own flow instead of skipping the rest of the file (qa#31).
test.describe.configure({ timeout: 120_000 });

/** Chooses a tool tab (a tap on the chosen one would fold the panel). */
async function openTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

/** Arms an effect from the browser by searching for it. */
async function arm(page: Page, query: string, id: string): Promise<void> {
  const search = page.getByRole('searchbox', { name: 'Search effects' }).or(page.getByPlaceholder(/Search: fireball/));
  await search.first().fill(query);
  await page.getByTestId('effects-grid').locator(`[data-effect="${id}"]`).click();
  await expect(page.getByTestId('effects-armed')).toBeVisible();
  await search.first().fill('');
}

const SHOTS = 'e2e/test-results/shots';

let seq = 1000;
/** Sends a command as the driver (a second companion). */
function command(drv: { send(msg: object): void }, cmd: object): void {
  drv.send({ type: 'sync.cmd', seq: seq++, cmd });
}

/** Reveals the whole map, so the TV shows it under the effects. */
async function revealAll(drv: Awaited<ReturnType<typeof setup>>['drv']): Promise<void> {
  command(drv, { type: 'fog.all', value: 'reveal' });
  await expect.poll(async () => revealedOn(await drv.snapshot())).toBe(COLS * ROWS);
}

test('cast: a fireball aimed then fired reaches the TV once', async ({ browser }) => {
  const { tv, page, drv, close } = await setup(browser);
  await revealAll(drv);
  await openTab(page, 'Effects');
  await arm(page, 'fireball', 'fireball');
  await tap(page, 9.4, 7.2); // aims: nothing sent yet
  await expect(page.getByTestId('effects-aim-area')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cast Fireball/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/effects-tablet-aim.png` });
  expect((await drv.snapshot()).live.shots.filter((s) => s.effect === 'fireball')).toHaveLength(0);
  await tap(page, 9.5, 7.5); // inside the aim: fires
  await expect.poll(async () => (await drv.snapshot()).live.shots.filter((s) => s.effect === 'fireball').length).toBe(1);
  const shot = (await drv.snapshot()).live.shots.find((s) => s.effect === 'fireball')!;
  expect(shot.anchor.kind).toBe('region');
  expect(shot.params.shape).toBe('circle');
  await tv.waitForTimeout(1100);
  await tv.screenshot({ path: `${SHOTS}/effects-tv-fireball.png` });
  await page.waitForTimeout(800);
  expect((await drv.snapshot()).live.shots.filter((s) => s.effect === 'fireball')).toHaveLength(1);
  await close();
});

test('areas: cloudkill placed, then removed from the list', async ({ browser }) => {
  const { tv, page, drv, close } = await setup(browser);
  await revealAll(drv);
  await openTab(page, 'Effects');
  await arm(page, 'cloudkill', 'cloudkill');
  await tap(page, 6.5, 6.5);
  await tap(page, 6.5, 6.5);
  await expect.poll(async () => mapOf(await drv.snapshot()).effects.filter((e) => e.effect === 'cloudkill').length).toBe(1);
  await expect(page.getByTestId('effects-on-map')).toContainText('Cloudkill');
  await tv.waitForTimeout(1200);
  await tv.screenshot({ path: `${SHOTS}/effects-tv-cloudkill.png` });
  await page.getByRole('button', { name: 'Remove Cloudkill' }).first().click();
  await expect.poll(async () => mapOf(await drv.snapshot()).effects.length).toBe(0);
  await close();
});

test('weather: rain on and off; a screen flash is one shot', async ({ browser }) => {
  const { page, drv, close } = await setup(browser);
  await openTab(page, 'Effects');
  const rain = page.getByTestId('weather').locator('[data-effect="rain"]');
  await rain.click();
  await expect.poll(async () => mapOf(await drv.snapshot()).effects.map((e) => e.id)).toEqual(['weather-rain']);
  await expect(rain).toHaveAttribute('aria-pressed', 'true');
  await rain.click();
  await expect.poll(async () => mapOf(await drv.snapshot()).effects.length).toBe(0);
  await page.getByRole('button', { name: 'Flash' }).click();
  await expect.poll(async () => (await drv.snapshot()).live.shots.filter((s) => s.effect === 'screen-flash').length).toBe(1);
  await close();
});

test('auras: bless on a token follows it when it moves', async ({ browser }) => {
  const { tv, page, drv, close } = await setup(browser);
  await revealAll(drv);
  await openTab(page, 'Tokens');
  await tap(page, 9.5, 7.5);
  await expect.poll(async () => mapOf(await drv.snapshot()).tokens.length).toBe(1);
  const tokenId = mapOf(await drv.snapshot()).tokens[0]!.id;
  await openTab(page, 'Effects');
  await arm(page, 'bless', 'bless');
  await tap(page, 9.5, 7.5);
  await expect.poll(async () => mapOf(await drv.snapshot()).effects.map((e) => e.anchor)).toEqual([{ kind: 'token', tokenId }]);
  await openTab(page, 'Tokens');
  await drag(page, [9.5, 7.5], [12.5, 9.5]);
  await expect.poll(async () => mapOf(await drv.snapshot()).tokens.map((t) => [t.col, t.row])).toEqual([[12, 9]]);
  expect(mapOf(await drv.snapshot()).effects.map((e) => e.anchor)).toEqual([{ kind: 'token', tokenId }]);
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: `${SHOTS}/effects-tv-aura.png` });
  await close();
});

test('screenshots: the Effects tab on a tablet and a phone', async ({ browser }) => {
  for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const { page, close } = await setup(browser, size);
    const name = size.width < 720 ? 'phone' : 'tablet';
    await openTab(page, 'Effects');
    await expect(page.getByTestId('effects-grid').locator('[data-effect]').first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/effects-${name}-browser.png` });
    await arm(page, 'burning hands', 'burning-hands');
    await drag(page, [6, 7], [10, 9]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/effects-${name}-cone.png` });
    await close();
  }
});

test('showcase: a dressed table on the TV (torches, campfire, web, aura, mist)', async ({ browser }) => {
  const { tv, page, drv, close } = await setup(browser);
  await revealAll(drv);
  command(drv, { type: 'token.add', token: { id: 'tokshow00001', label: '1', name: 'Thorin', color: '#e3b45e', col: 9, row: 9, placed: true, hidden: false } });
  const at = (id: string, effect: string, x: number, y: number, size: number) => ({ type: 'fx.place', effect: { id, effect, anchor: { kind: 'point', x, y }, params: { size }, on: true } });
  command(drv, at('fxshow000001', 'wall-torch', 4.2, 9.1, 1));
  command(drv, at('fxshow000002', 'wall-torch', 14.8, 9.1, 1));
  command(drv, at('fxshow000003', 'campfire', 12.5, 11.5, 2));
  command(drv, { type: 'fx.place', effect: { id: 'fxshow000004', effect: 'web', anchor: { kind: 'region', points: [{ x: 3, y: 2 }, { x: 7, y: 2 }, { x: 7, y: 6 }, { x: 3, y: 6 }] }, params: { shape: 'cube' }, on: true } });
  command(drv, { type: 'fx.place', effect: { id: 'fxshow000005', effect: 'spirit-guardians', anchor: { kind: 'token', tokenId: 'tokshow00001' }, params: { size: 6 }, on: true } });
  command(drv, { type: 'fx.place', effect: { id: 'weather-mist', effect: 'mist', anchor: { kind: 'global' }, params: { uDensity: 0.3, intensityPercent: 70 }, on: true } });
  await expect.poll(async () => mapOf(await drv.snapshot()).effects.length).toBe(6);
  await tv.waitForTimeout(2500);
  await tv.screenshot({ path: `${SHOTS}/effects-tv-showcase.png` });
  await openTab(page, 'Effects');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/effects-tablet-onmap.png` });
  await close();
});
