/**
 * Fog, reveals and secrets (W5-1, docs/features.md "Prepared reveal areas", "Secret doors and
 * traps") against a real TV page through the real server:
 *
 * - reveal areas: two areas drawn in prep from the Fog tab (one painted, one outlined), one tap
 *   reveals the first (the TV's fog and picture follow), the next hides it, the outlined one is
 *   deleted and comes back with the notice's Undo;
 * - secrets: a trap with a note and a secret door placed from the Secrets tab — the TV holds them
 *   but draws nothing; the door marked found shows on the TV, the trap sprung plays its effect
 *   (a shot in `live.shots`) and shows its mark; Undo hides the trap again.
 *
 * Shots of the tablet and the TV go to `e2e/test-results/shots/w5-1-*.png`.
 */
import { readFileSync } from 'node:fs';
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { maskCount, wholeGrid, type MapInfo, type RootState } from '../shared/src/index.ts';

const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const WS = `ws://localhost:${SERVER_PORT}/ws`;
const SHOTS = 'e2e/test-results/shots';
/** Generous waits: the flows run beside other helpers' e2e on one Mac (SwiftShader). */
const expect = baseExpect.configure({ timeout: 30_000 });

interface Dd2vtt {
  resolution: { map_origin: { x: number; y: number }; map_size: { x: number; y: number }; pixels_per_grid: number };
  line_of_sight: { x: number; y: number }[][];
  portals: { bounds: { x: number; y: number }[] }[];
  image: string;
}

/** The vampire lair (19 × 14, walls and doors): its MapInfo and the files the pages are served. */
const LAIR = (() => {
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
    id: 'w51lair00001', name: 'Vampire lair', kind: 'uvtt',
    picture: { hash: '5151515151515151', ext: 'jpg', bytes: picture.length }, tableCopy: null,
    geometry: { hash: '5252525252525252', ext: 'json', bytes: geometry.length },
    grid: wholeGrid(cols, rows, cols * ppg, rows * ppg), drawGrid: false, doorCount: d.portals.length, drawDoors: false, libraryId: null,
  };
  return { info, cols, rows, picture, geometry };
})();
const CELLS = LAIR.cols * LAIR.rows;

async function serveMap(page: Page): Promise<void> {
  await page.route(`**/files/${LAIR.info.picture.hash}.jpg`, (r) => r.fulfill({ body: LAIR.picture, contentType: 'image/jpeg' }));
  await page.route(`**/files/${LAIR.info.geometry!.hash}.json`, (r) => r.fulfill({ body: LAIR.geometry, contentType: 'application/json' }));
}

/** A companion socket the test drives: starts the game, reads the TV's state. */
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

/** TV + companion (1280 × 800) + driver on a new table, a game on the lair, all fogged. */
async function setup(browser: Browser, tag: string) {
  const room = `w51${tag}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await noHotReload(tv);
  await serveMap(tv);
  await tv.goto(`/app/?mode=tv&table=${room}&debug=1&name=E2E%20TV`);
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 90_000 });
  const drv = await driver(room);
  const game = { id: `g${Date.now().toString(36)}`, name: 'Curse of the lair', createdAt: new Date().toISOString(), map: LAIR.info };
  await expect.poll(async () => {
    const name = (await drv.snapshot()).game?.name ?? null;
    if (name !== game.name) drv.send({ type: 'game.new', game });
    return name;
  }, { timeout: 20_000, intervals: [200, 1000, 2000] }).toBe(game.name);

  const compCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await compCtx.newPage();
  await noHotReload(page);
  await serveMap(page);
  await page.goto(`/app/?mode=companion&table=${room}&debug=1`);
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 90_000 });
  await connected(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bmMap?: { camera(): unknown } }).__bmMap?.camera() ?? null), { timeout: 45_000 }).not.toBeNull();
  await page.waitForTimeout(400); // the kit Button's start-up debounce
  const close = async () => {
    drv.close();
    await compCtx.close();
    await tvCtx.close();
  };
  return { tv, page, drv, close };
}

/** Where a map point (in squares) is on the companion's page. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([x, y]) => (window as unknown as { __bmMap: { toClient(x: number, y: number): { x: number; y: number } } }).__bmMap.toClient(x, y), [x, y] as const);
}

async function tap(page: Page, x: number, y: number): Promise<void> {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 12): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

async function openTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

/**
 * The share (0–1) of the TV's screen that is lit — luminance over 30 at 192 × 108: fog is near
 * black, revealed map is not. Robust to where the table puts the map.
 */
async function tvLit(tv: Page): Promise<number> {
  const png = (await tv.screenshot()).toString('base64');
  return tv.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 108;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 192, 108);
    const d = g.getImageData(0, 0, 192, 108).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]! > 30) lit++;
    return lit / (d.length / 4);
  }, png);
}

const mapOf = (s: RootState) => s.game!.maps[s.game!.activeMapId]!;

test.describe.configure({ mode: 'serial', timeout: 420_000 });

test.describe('reveal areas', () => {
  test('draw two in prep, reveal and hide one with a tap, delete and Undo', async ({ browser }) => {
    const { tv, page, drv, close } = await setup(browser, 'a');
    try {
      await openTab(page, 'Fog');
      await expect(page.getByTestId('areas-empty')).toBeVisible();

      // 1 · painted: a drag along row 7, cols 3 … 8
      await page.getByRole('button', { name: 'New area' }).click();
      await page.getByLabel('Name').fill('The long hall');
      await page.getByRole('radio', { name: /^Paint/ }).click();
      await drag(page, [3.5, 7.5], [8.5, 7.5]);
      await expect(page.getByTestId('area-draft-count')).toHaveText('6 squares');
      await page.screenshot({ path: `${SHOTS}/w5-1-areas-edit.png` });
      await page.getByRole('button', { name: 'Save area' }).click();
      await expect.poll(async () => (mapOf(await drv.snapshot()).areas ?? []).length).toBe(1);

      // 2 · outlined: a 3 × 2 box with its corner at (10, 2), closed on the first corner
      await page.getByRole('button', { name: 'New area' }).click();
      await page.getByRole('radio', { name: /^Outline/ }).click();
      for (const [x, y] of [[10, 2], [13, 2], [13, 4], [10, 4], [10.1, 2.1]] as const) await tap(page, x, y);
      await expect(page.getByTestId('area-draft-count')).toHaveText('6 squares');
      await page.getByRole('button', { name: 'Save area' }).click();
      await expect.poll(async () => (mapOf(await drv.snapshot()).areas ?? []).length).toBe(2);
      await expect(page.getByTestId('area-row')).toHaveCount(2);
      expect(maskCount(mapOf(await drv.snapshot()).fog.revealed, CELLS)).toBe(0);

      // one tap reveals the hall: the TV's fog and picture follow
      const dark = await tvLit(tv);
      const hall = page.locator('[data-testid="area-row"]').first();
      await hall.getByRole('button', { name: 'Reveal' }).click();
      await expect.poll(async () => maskCount(mapOf(await drv.snapshot()).fog.revealed, CELLS)).toBe(6);
      await expect.poll(() => tvLit(tv)).toBeGreaterThan(dark + 0.004);
      await expect(hall).toHaveAttribute('data-state', 'revealed');
      await hall.getByRole('button', { name: /^The long hall/ }).click(); // select: gold on the map
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/w5-1-areas.png` });
      await tv.screenshot({ path: `${SHOTS}/w5-1-areas-tv.png` });

      // the next tap hides it again
      await hall.getByRole('button', { name: 'Hide' }).click();
      await expect.poll(async () => maskCount(mapOf(await drv.snapshot()).fog.revealed, CELLS)).toBe(0);
      await expect.poll(() => tvLit(tv)).toBeLessThan(dark + 0.002);

      // delete the outlined one, then Undo brings it back at its place
      const box = page.locator('[data-testid="area-row"]').nth(1);
      const id = await box.getAttribute('data-area');
      await box.getByRole('button', { name: /More for/ }).click();
      await page.getByRole('menuitem', { name: /Delete area/ }).click();
      await expect.poll(async () => (mapOf(await drv.snapshot()).areas ?? []).length).toBe(1);
      await page.locator('.bm-notice-host .card:not([inert])').getByRole('button', { name: 'Undo', exact: true }).click();
      await expect.poll(async () => (mapOf(await drv.snapshot()).areas ?? []).map((a) => a.id)).toEqual([expect.any(String), id]);
    } finally {
      await close();
    }
  });
});

/** The TV's screen as luminance at 480 × 270 (for counting what changed between two moments). */
async function tvLuma(tv: Page): Promise<number[]> {
  const png = (await tv.screenshot()).toString('base64');
  return tv.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 270;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 480, 270);
    const d = g.getImageData(0, 0, 480, 270).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4) out.push(Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!));
    return out;
  }, png);
}

/** How many of two TV pictures' pixels differ clearly. */
function changed(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 25) n++;
  return n;
}

test.describe('secrets', () => {
  test('a trap and a secret door stay off the TV until found / sprung; Undo hides the trap again', async ({ browser }) => {
    const { tv, page, drv, close } = await setup(browser, 's');
    try {
      drv.cmd({ type: 'fog.all', value: 'reveal' });
      await expect.poll(async () => maskCount(mapOf(await drv.snapshot()).fog.revealed, CELLS)).toBe(CELLS);
      await tv.waitForTimeout(2500); // the reveal animation settles
      const before = await tvLuma(tv);
      const secretsOf = async () => mapOf(await drv.snapshot()).secrets ?? [];

      await openTab(page, 'Secrets');
      await expect(page.getByTestId('secrets-empty')).toBeVisible();
      // a trap with a note
      await tap(page, 6.5, 10.5);
      await expect.poll(async () => (await secretsOf()).length).toBe(1);
      await page.getByLabel('Note for you').fill('DC 15 to spot · 2d6 piercing');
      await page.getByLabel('Name').fill('Spiked pit');
      await expect.poll(async () => (await secretsOf())[0]?.note).toBe('DC 15 to spot · 2d6 piercing');
      // one of the map's doors made secret
      const geo = JSON.parse(LAIR.geometry) as { doors: { a: { x: number; y: number }; b: { x: number; y: number } }[] };
      const d = geo.doors[0]!;
      await page.getByRole('radio', { name: /^Secret door/ }).click();
      await tap(page, (d.a.x + d.b.x) / 2, (d.a.y + d.b.y) / 2);
      await expect.poll(async () => (await secretsOf()).map((s) => [s.kind, s.door])).toEqual([['trap', null], ['door', 0]]);

      // the TV holds both but draws nothing of them
      await tv.waitForTimeout(800);
      expect(changed(before, await tvLuma(tv))).toBeLessThan(15);

      // the door found: its leaf shows on the TV
      const rows = page.getByTestId('secret-row');
      await page.locator('[data-testid="secret-row"][data-found="false"]').nth(1).getByRole('button', { name: 'Found' }).click();
      await expect.poll(async () => (await secretsOf()).find((s) => s.kind === 'door')?.found).toBe(true);
      await expect.poll(async () => changed(before, await tvLuma(tv))).toBeGreaterThan(15);
      const withDoor = await tvLuma(tv);

      // the trap sprung: a shot plays — and the notice's Undo hides it again at once
      const spring = () => page.locator('[data-testid="secret-row"][data-found="false"]').first().getByRole('button', { name: 'Spring' }).click();
      const trapFound = async () => (await secretsOf()).find((s) => s.kind === 'trap')?.found;
      await spring();
      await expect.poll(trapFound).toBe(true);
      expect((await drv.snapshot()).live.shots.at(-1)?.effect).toBe('shockwave-ring');
      await page.locator('.bm-notice-host .card:not([inert])').getByRole('button', { name: 'Undo', exact: true }).click();
      await expect.poll(trapFound).toBe(false);

      // sprung for good: its glyph shows on the TV once the shot is over
      await spring();
      await expect.poll(trapFound).toBe(true);
      await tv.waitForTimeout(2500);
      expect(changed(withDoor, await tvLuma(tv))).toBeGreaterThan(15);
      await expect(rows).toHaveCount(2);
      await page.locator('[data-testid="secret-row"]').filter({ hasText: 'Spiked pit' }).getByRole('button', { name: /^Spiked pit/ }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/w5-1-secrets.png` });
      await tv.screenshot({ path: `${SHOTS}/w5-1-secrets-tv.png` });
    } finally {
      await close();
    }
  });
});
