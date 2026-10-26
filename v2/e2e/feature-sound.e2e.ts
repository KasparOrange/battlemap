/**
 * Sound (W5-3, docs/features.md "Sound") against a real TV page through the real server. The
 * TV's audio graph is read through its test hook (`__battlemapSound.graph()`), never by ear:
 *
 * - the Sound tab loads the library; two beds go into the mix, Play starts them on the TV
 *   (looping buffers at their exact loop length, ramping to their targets), a slider changes a
 *   bed's level, a pad plays a one-shot (a voice, the beds ducked);
 * - a scene saved while it plays carries the mix: Stop all, change the mix, apply the scene —
 *   its beds play again;
 * - "Effects play their sound" (off by default): a fireball from the effects one-shots then
 *   plays the fireball sound;
 * - Stop all fades every bed out.
 *
 * Shots of the tab go to `e2e/test-results/shots/w5-3-*.png` (copied to docs/qa as JPEG).
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { wholeGrid, type MapInfo, type RootState } from '../shared/src/index.ts';

const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);
const WS = `ws://localhost:${SERVER_PORT}/ws`;
const SHOTS = 'e2e/test-results/shots';

// The TV box's shell lets media start without a gesture (MainActivity: mediaPlaybackRequiresUserGesture = false).
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] } });

/** The house map from the test set: its MapInfo and the files the pages are served. */
function houseMap() {
  const d = JSON.parse(readFileSync(new URL('../../test_assets/maps/01-eldrica-house-10x8.dd2vtt', import.meta.url), 'utf8')) as {
    resolution: { map_size: { x: number; y: number }; pixels_per_grid: number };
    image: string;
  };
  const cols = d.resolution.map_size.x;
  const rows = d.resolution.map_size.y;
  const ppg = d.resolution.pixels_per_grid;
  const picture = Buffer.from(d.image, 'base64');
  const info: MapInfo = {
    id: 'housemap0001', name: 'Eldrica’s house', kind: 'picture',
    picture: { hash: 'cccccccccccccccc', ext: 'jpg', bytes: picture.length }, tableCopy: null, geometry: null,
    grid: wholeGrid(cols, rows, cols * ppg, rows * ppg), drawGrid: false, doorCount: 0, drawDoors: false, libraryId: null,
  };
  return { info, picture };
}
const HOUSE = houseMap();

/** Serves the map's picture to a page. */
async function serveMap(page: Page): Promise<void> {
  await page.route(`**/files/${HOUSE.info.picture.hash}.jpg`, (r) => r.fulfill({ body: HOUSE.picture, contentType: 'image/jpeg' }));
}

/** Keeps a dev server's hot-reload socket silent (other helpers edit the app meanwhile). */
async function noHotReload(page: Page): Promise<void> {
  await page.routeWebSocket((url) => url.searchParams.has('token') || url.pathname.endsWith('/app/'), () => {});
}

/** A companion socket the test drives: starts the game, sends commands, reads the state. */
async function driver(room: string) {
  const ws = new WebSocket(WS);
  const waiting: Array<(m: Record<string, unknown>) => boolean> = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Record<string, unknown>;
    for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i]!(m)) waiting.splice(i, 1);
  };
  const next = (type: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${type}`)), 8000);
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
    send: (msg: object) => ws.send(JSON.stringify(msg)),
    cmd: (c: object) => ws.send(JSON.stringify({ type: 'sync.cmd', seq: seq++, cmd: c })),
    async state(): Promise<RootState> {
      const snap = next('sync.snapshot');
      ws.send(JSON.stringify({ type: 'sync.request' }));
      return (await snap).state as RootState;
    },
    close: () => ws.close(),
  };
}

/** The TV's audio graph (the test hook). */
interface Graph {
  context: string;
  master: number;
  duck: number;
  beds: Array<{ sound: string; target: number; gain: number; leaving: boolean; playing: boolean; loop: boolean; loopEnd: number }>;
  voices: Array<{ sound: string }>;
  played: number;
}
const graph = (tv: Page) => tv.evaluate(() => (globalThis as unknown as { __battlemapSound: { graph(): Graph } }).__battlemapSound.graph());
const live = (g: Graph) => g.beds.filter((b) => !b.leaving).map((b) => b.sound).sort();

/** Holds a control for a long press (the cross-project second action). */
async function hold(page: Page, el: ReturnType<Page['locator']>): Promise<void> {
  const box = (await el.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('sound: mix beds, play one-shots, scenes carry the mix, effects sounds, stop all', async ({ browser }) => {
  test.setTimeout(120_000);
  const room = `w53-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  await noHotReload(tv);
  await serveMap(tv);
  await tv.goto(`/app/?mode=tv&table=${room}&debug=1&name=E2E%20TV`);
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 30_000 });
  const drv = await driver(room);
  const game = { id: `g${Date.now().toString(36)}`, name: 'Sound check', createdAt: new Date().toISOString(), map: HOUSE.info };
  await expect.poll(async () => {
    const name = (await drv.state()).game?.name ?? null;
    if (name !== game.name) drv.send({ type: 'game.new', game });
    return name;
  }, { timeout: 20_000, intervals: [200, 1000, 2000] }).toBe(game.name);
  expect((await drv.state()).game!.sound).toMatchObject({ on: false, beds: [], fxSounds: false });

  const compCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await compCtx.newPage();
  await noHotReload(page);
  await serveMap(page);
  await page.goto(`/app/?mode=companion&table=${room}&debug=1`);
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('companion-status')).toContainText(/TV online · ready/, { timeout: 20_000 });
  await page.waitForTimeout(400); // the kit Button's start-up debounce

  // ── the tab: library, two beds into the mix, Play ────────────────────────────────────────
  await page.getByRole('tab', { name: 'Sound' }).click();
  await expect(page.locator('[data-testid="sound-bed"]').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('[data-testid="sound-bed"]').count()).toBeGreaterThanOrEqual(10);
  const rain = page.locator('[data-testid="sound-bed"][data-sound="rain"]');
  await rain.click();
  await page.locator('[data-testid="sound-bed"][data-sound="campfire"]').click();
  await expect.poll(async () => (await drv.state()).game!.sound.beds.map((b) => b.sound)).toEqual(['rain', 'campfire']);
  expect((await graph(tv)).context).toBe('none'); // silent: no audio context made yet
  await page.getByTestId('sound-toggle').click();
  await expect.poll(async () => live(await graph(tv)), { timeout: 15_000 }).toEqual(['campfire', 'rain']);
  await expect.poll(async () => (await graph(tv)).beds.every((b) => b.playing && b.loop), { timeout: 15_000 }).toBe(true);
  const g1 = await graph(tv);
  expect(g1.context).toBe('running');
  for (const b of g1.beds) expect(b.loopEnd).toBeCloseTo(60, 1);
  await expect.poll(async () => (await graph(tv)).beds.every((b) => Math.abs(b.gain - b.target) < 0.01), { timeout: 8000 }).toBe(true);
  await page.getByTestId('sound-mix').evaluate((el) => el.scrollIntoView({ block: 'start' })); // the shot shows the mix, not the library's end
  await page.screenshot({ path: `${SHOTS}/w5-3-tab.png` });

  // ── a fourth bed is refused; the rain's slider ───────────────────────────────────────────
  await page.locator('[data-testid="sound-bed"][data-sound="ocean"]').click();
  await page.locator('[data-testid="sound-bed"][data-sound="crypt"]').click();
  await expect(page.getByText(/3 sounds play at once/)).toBeVisible();
  expect((await drv.state()).game!.sound.beds.length).toBe(3);
  await page.waitForTimeout(400); // the kit Button ignores a second press within 350 ms
  await page.locator('[data-testid="sound-bed"][data-sound="ocean"]').click(); // out again
  await expect.poll(async () => (await drv.state()).game!.sound.beds.length).toBe(2);
  const rainSlider = page.getByTestId('sound-mix').getByRole('slider').first();
  await rainSlider.fill('0.3');
  await expect.poll(async () => (await drv.state()).game!.sound.beds.find((b) => b.sound === 'rain')?.volume).toBeCloseTo(0.3, 2);
  await expect.poll(async () => (await graph(tv)).beds.find((b) => b.sound === 'rain' && !b.leaving)?.target).toBeCloseTo(0.09, 2); // squared taper

  // ── a pad: a voice plays, the beds duck ──────────────────────────────────────────────────
  const played = (await graph(tv)).played;
  await page.locator('[data-testid="sound-pad"][data-sound="thunder"]').click();
  await expect.poll(async () => (await graph(tv)).played, { timeout: 10_000 }).toBe(played + 1);
  const g2 = await graph(tv);
  expect(g2.voices.map((v) => v.sound)).toContain('thunder');
  expect(g2.duck).toBeLessThan(1);
  await hold(page, page.locator('[data-testid="sound-pad"][data-sound="thunder"]'));
  await expect(page.getByRole('menuitem', { name: /Listen here/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/w5-3-pad-menu.png` });
  await page.keyboard.press('Escape');

  // ── a scene carries the mix ──────────────────────────────────────────────────────────────
  await page.getByRole('tab', { name: 'Scenes' }).click();
  await page.getByTestId('scene-save').click();
  await expect.poll(async () => (await drv.state()).game!.scenes?.[0]?.sound?.beds.map((b) => b.sound)).toEqual(['rain', 'campfire']);
  const sceneId = (await drv.state()).game!.scenes![0]!.id;
  await page.getByRole('tab', { name: 'Sound' }).click();
  await page.getByTestId('sound-toggle').click(); // Stop all
  await expect.poll(async () => (await graph(tv)).beds.length, { timeout: 10_000 }).toBe(0);
  drv.cmd({ type: 'sound.set', beds: [{ sound: 'tavern', volume: 0.5 }] });
  drv.cmd({ type: 'scene.apply', id: sceneId });
  await expect.poll(async () => live(await graph(tv)), { timeout: 15_000 }).toEqual(['campfire', 'rain']);
  expect((await drv.state()).game!.sound.on).toBe(true);

  // ── effects play their sound (off by default) ────────────────────────────────────────────
  const fx = (id: string) => ({ type: 'fx.trigger', shot: { id, effect: 'fireball', anchor: { kind: 'point', x: 4, y: 4 }, params: {}, at: Date.now() } });
  const before = (await graph(tv)).played;
  drv.cmd(fx(`fx${Date.now().toString(36)}a`));
  await tv.waitForTimeout(1500);
  expect((await graph(tv)).played).toBe(before);
  await page.getByText('Effects play their sound').click();
  await expect.poll(async () => (await drv.state()).game!.sound.fxSounds).toBe(true);
  drv.cmd(fx(`fx${Date.now().toString(36)}b`));
  await expect.poll(async () => (await graph(tv)).played, { timeout: 10_000 }).toBe(before + 1);

  // ── stop all fades everything out ────────────────────────────────────────────────────────
  await page.getByTestId('sound-toggle').click();
  await expect.poll(async () => (await graph(tv)).beds.every((b) => b.leaving), { timeout: 5000 }).toBe(true);
  await expect.poll(async () => (await graph(tv)).beds.length, { timeout: 10_000 }).toBe(0);
  expect((await drv.state()).game!.sound).toMatchObject({ on: false, beds: [{ sound: 'rain' }, { sound: 'campfire' }] });

  drv.close();
  await compCtx.close();
  await tvCtx.close();
});
