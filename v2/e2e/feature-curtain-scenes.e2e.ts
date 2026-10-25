/**
 * The curtain and scene presets (W4-F, docs/features.md) against a real TV page through the
 * real server:
 *
 * - curtain: the corner button lowers it (the TV goes dark), the map switches and the fog is
 *   revealed behind it (the TV stays dark), the plate is chosen from the button's long press,
 *   then the lift shows the new map, revealed, in one fade;
 * - scenes: two scenes saved from the Scenes tab (each its map, weather, fog look), switched
 *   between with one tap — under the curtain (lower, switch, lift) and straight — then one
 *   deleted and brought back with the notice's Undo.
 *
 * The TV's brightness is measured on its screenshots (mean luminance of the middle). Shots of
 * the tablet UI and the TV plate go to `e2e/test-results/shots/w4f-*.png`.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { maskCount, wholeGrid, type MapInfo, type RootState } from '../shared/src/index.ts';

const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const WS = `ws://localhost:${SERVER_PORT}/ws`;
const SHOTS = 'e2e/test-results/shots';

interface Dd2vtt {
  resolution: { map_origin: { x: number; y: number }; map_size: { x: number; y: number }; pixels_per_grid: number };
  line_of_sight: { x: number; y: number }[][];
  portals: { bounds: { x: number; y: number }[] }[];
  image: string;
}

/** A test map from the set: its MapInfo and the files the pages are served. */
function testMap(file: string, id: string, name: string, pic: string, geo: string) {
  const d = JSON.parse(readFileSync(new URL(`../../test_assets/maps/${file}`, import.meta.url), 'utf8')) as Dd2vtt;
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
    id, name, kind: 'uvtt',
    picture: { hash: pic, ext: 'jpg', bytes: picture.length }, tableCopy: null,
    geometry: { hash: geo, ext: 'json', bytes: geometry.length },
    grid: wholeGrid(cols, rows, cols * ppg, rows * ppg), drawGrid: false, doorCount: d.portals.length, drawDoors: false, libraryId: null,
  };
  return { info, cols, rows, picture, geometry };
}

const LAIR = testMap('04-vampire-lair-19x14.dd2vtt', 'lairmap00001', 'Vampire lair', 'aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb');
const HOUSE = testMap('01-eldrica-house-10x8.dd2vtt', 'housemap0001', 'Eldrica’s house', 'cccccccccccccccc', 'dddddddddddddddd');

/** Serves both maps' files to a page (the server's file store is not ours). */
async function serveMaps(page: Page): Promise<void> {
  for (const m of [LAIR, HOUSE]) {
    await page.route(`**/files/${m.info.picture.hash}.jpg`, (r) => r.fulfill({ body: m.picture, contentType: 'image/jpeg' }));
    await page.route(`**/files/${m.info.geometry!.hash}.json`, (r) => r.fulfill({ body: m.geometry, contentType: 'application/json' }));
  }
}

/** A companion socket the test drives: starts games, sends commands, reads the TV's state. */
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

/** TV + companion + driver on a new table; a game on the lair with the house as its second map. */
async function setup(browser: Browser) {
  const room = `w4f-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await noHotReload(tv);
  await serveMaps(tv);
  await tv.goto(`/app/?mode=tv&table=${room}&debug=1&name=E2E%20TV`);
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 30_000 });
  const drv = await driver(room);
  const game = { id: `g${Date.now().toString(36)}`, name: 'The Sunless Citadel', createdAt: new Date().toISOString(), map: LAIR.info };
  await expect.poll(async () => {
    const name = (await drv.snapshot()).game?.name ?? null;
    if (name !== game.name) drv.send({ type: 'game.new', game });
    return name;
  }, { timeout: 20_000, intervals: [200, 1000, 2000] }).toBe(game.name);
  drv.cmd({ type: 'map.add', map: HOUSE.info, activate: false });
  drv.cmd({ type: 'fog.all', value: 'reveal' });
  await expect.poll(async () => (await drv.snapshot()).game?.mapOrder.length).toBe(2);

  const compCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await compCtx.newPage();
  await noHotReload(page);
  await serveMaps(page);
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

/** Below the plate's text, inside both maps: a smooth glow on the plate, floor once the house shows. */
const UNDER_PLATE = { x: 720, y: 680, width: 480, height: 70 };

/**
 * Mean luminance (0–255) of part of the TV's screen, from a screenshot.
 *
 * @param tv - the TV page
 * @param clip - the part (default the middle 800 × 600)
 */
async function tvBrightness(tv: Page, clip = { x: 560, y: 240, width: 800, height: 600 }): Promise<number> {
  return (await tvLuma(tv, clip)).mean;
}

/**
 * Mean and spread (standard deviation) of the luminance of part of the TV's screen. A map is
 * textured (large spread); the curtain's plate is a smooth glow (small spread).
 *
 * @param tv - the TV page
 * @param clip - the part
 */
async function tvLuma(tv: Page, clip: { x: number; y: number; width: number; height: number }): Promise<{ mean: number; spread: number }> {
  const png = (await tv.screenshot({ clip })).toString('base64');
  return tv.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 60;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 80, 60);
    const d = g.getImageData(0, 0, 80, 60).data;
    const n = d.length / 4;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      sum += l;
      sq += l * l;
    }
    const mean = sum / n;
    return { mean, spread: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
  }, png);
}

/** Holds a control for a long press (the cross-project second action). */
async function hold(page: Page, testId: string): Promise<void> {
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

async function openTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

const mapOf = (s: RootState) => s.game!.maps[s.game!.activeMapId]!;

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test('curtain: lower → switch map → reveal → lift shows the new state', async ({ browser }) => {
  const { tv, page, drv, close } = await setup(browser);
  await expect.poll(() => tvBrightness(tv), { timeout: 30_000 }).toBeGreaterThan(40); // the lair, revealed

  await connected(page);
  await page.getByTestId('curtain-button').click();
  await expect.poll(async () => (await drv.snapshot()).game?.curtain.down).toBe(true);
  await expect(page.getByTestId('curtain-badge')).toBeVisible();
  await expect.poll(() => tvBrightness(tv), { timeout: 5000 }).toBeLessThan(15);

  // behind the curtain: the other map, revealed — the TV stays dark meanwhile
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('menuitem', { name: /Eldrica/ }).click();
  await expect.poll(async () => (await drv.snapshot()).game?.activeMapId).toBe(HOUSE.info.id);
  drv.cmd({ type: 'fog.all', value: 'reveal' });
  await expect.poll(async () => maskCount(mapOf(await drv.snapshot()).fog.revealed, HOUSE.cols * HOUSE.rows)).toBe(HOUSE.cols * HOUSE.rows);
  for (let i = 0; i < 3; i++) {
    await tv.waitForTimeout(500);
    expect(await tvBrightness(tv)).toBeLessThan(15);
  }

  // the plate, from the button's long press, with a line
  await hold(page, 'curtain-button');
  await page.getByRole('menuitem', { name: /Plate text/ }).click();
  await page.getByLabel('Line on the plate').fill('Beneath the citadel, something stirs…');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await drv.snapshot()).game?.curtain).toEqual({ down: true, plate: true, text: 'Beneath the citadel, something stirs…' });
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: `${SHOTS}/w4f-tv-plate.png` });
  await page.screenshot({ path: `${SHOTS}/w4f-tablet-curtain-down.png` });
  expect(await tvBrightness(tv)).toBeLessThan(60); // a calm plate: dark, a glow and a title
  const underPlate = await tvLuma(tv, UNDER_PLATE);
  expect(underPlate.spread).toBeLessThan(12); // a smooth glow, no map

  // lift: the new map, revealed, in one fade
  await page.getByTestId('curtain-button').click();
  await expect.poll(async () => (await drv.snapshot()).game?.curtain.down).toBe(false);
  await expect.poll(async () => (await tvLuma(tv, UNDER_PLATE)).spread, { timeout: 8000 }).toBeGreaterThan(Math.max(18, underPlate.spread * 2));
  await expect(page.getByTestId('curtain-badge')).toHaveCount(0);
  await tv.screenshot({ path: `${SHOTS}/w4f-tv-lifted.png` });
  await close();
});

test('scenes: save two, switch between them (under the curtain and straight), delete with Undo', async ({ browser }) => {
  const { tv, page, drv, close } = await setup(browser);
  await openTab(page, 'Scenes');
  await expect(page.getByTestId('scenes-empty')).toBeVisible();

  // scene 1: the lair with rain and cloud fog
  drv.cmd({ type: 'fx.place', effect: { id: 'weather-rain', effect: 'rain', anchor: { kind: 'global' }, params: { intensityPercent: 60 }, on: true } });
  drv.cmd({ type: 'game.settings', settings: { fogStyle: 'cloud' } });
  await expect.poll(async () => mapOf(await drv.snapshot()).effects.length).toBe(1);
  await connected(page);
  await page.getByTestId('scene-save').click();
  await expect.poll(async () => (await drv.snapshot()).game?.scenes.length).toBe(1);

  // scene 2: the house, no weather, standard fog
  drv.cmd({ type: 'map.switch', mapId: HOUSE.info.id });
  drv.cmd({ type: 'game.settings', settings: { fogStyle: 'standard' } });
  await expect.poll(async () => (await drv.snapshot()).game?.activeMapId).toBe(HOUSE.info.id);
  await connected(page);
  await page.waitForTimeout(400);
  await page.getByTestId('scene-save').click();
  await expect.poll(async () => (await drv.snapshot()).game?.scenes.map((s) => s.mapId)).toEqual([LAIR.info.id, HOUSE.info.id]);
  const [lairScene, houseScene] = (await drv.snapshot()).game!.scenes;
  expect(lairScene!.effects.map((e) => e.effect)).toEqual(['rain']);
  expect(lairScene!.fog.style).toBe('cloud');
  await expect(page.locator(`[data-scene="${houseScene!.id}"]`)).toContainText('On the table');
  await page.screenshot({ path: `${SHOTS}/w4f-tablet-scenes.png` });

  // one tap: the lair scene, under the curtain — it goes down, the scene applies, it lifts
  const seen: boolean[] = [];
  await page.locator(`[data-scene="${lairScene!.id}"]`).getByRole('button', { name: new RegExp(`^${lairScene!.name}`) }).click();
  await expect.poll(async () => {
    const s = await drv.snapshot();
    seen.push(s.game!.curtain.down);
    return s.game!.activeMapId === LAIR.info.id && !s.game!.curtain.down;
  }, { timeout: 10_000, intervals: [100] }).toBe(true);
  expect(seen).toContain(true); // the curtain was down on the way
  const after = await drv.snapshot();
  expect(mapOf(after).effects.map((e) => e.effect)).toEqual(['rain']);
  expect(after.game!.settings.fogStyle).toBe('cloud');
  await expect(page.locator(`[data-scene="${lairScene!.id}"]`)).toContainText('On the table');
  await expect.poll(() => tvBrightness(tv), { timeout: 8000 }).toBeGreaterThan(30);

  // straight switch (under the curtain off): the house at once, the curtain never moves
  await page.getByText('Switch under the curtain').click();
  await page.locator(`[data-scene="${houseScene!.id}"]`).getByRole('button', { name: new RegExp(`^${houseScene!.name}`) }).click();
  await expect.poll(async () => (await drv.snapshot()).game?.activeMapId).toBe(HOUSE.info.id);
  const straight = await drv.snapshot();
  expect(straight.game!.curtain.down).toBe(false);
  expect(mapOf(straight).effects).toEqual([]);
  expect(straight.game!.settings.fogStyle).toBe('standard');
  await page.getByText('Switch under the curtain').click(); // back on for the next run

  // delete with Undo
  await page.locator(`[data-scene="${lairScene!.id}"]`).getByRole('button', { name: /More for/ }).click();
  await page.getByRole('menuitem', { name: /Delete scene/ }).click();
  await expect.poll(async () => (await drv.snapshot()).game?.scenes.length).toBe(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).and(page.getByText('Undo')).click(); // the notice's, not the rail's
  await expect.poll(async () => (await drv.snapshot()).game?.scenes.map((s) => s.id)).toEqual([lairScene!.id, houseScene!.id]);
  await close();
});
