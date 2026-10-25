/**
 * TV mode end to end, against the real server, with a bare WebSocket companion
 * (`tv-companion.ts`):
 *
 * - a new game survives a reload of the TV (autosave + reopen at start);
 * - every TV screen is walked with the D-pad and OK only (home, calibration, library, game);
 * - a box reset (a fresh browser profile, empty IndexedDB) gets a game back from the server's
 *   backup.
 *
 * `TV_SHOTS=<dir>` also saves a screenshot of each screen at 1920 × 1080.
 */
import { expect, test, type Page } from '@playwright/test';
import { BareCompanion, testMap } from './tv-companion.ts';

const SHOTS = process.env.TV_SHOTS ?? null;

test.use({ viewport: { width: 1920, height: 1080 } });

/** Saves a screenshot when `TV_SHOTS` is set. */
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Opens the TV page for a table and waits until it is connected. */
async function openTv(page: Page, table: string): Promise<void> {
  await page.goto(`/app/?mode=tv&table=${table}&debug=1&name=E2E%20TV`);
  await expect(page.getByTestId('tv-status')).toContainText('open');
}

/** The id of the focused element's accessible label or text, for D-pad checks. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return (el?.getAttribute('aria-label') ?? el?.innerText ?? '').trim().replace(/\s+/g, ' ');
  });
}

function newGameMsg(id: string, name: string) {
  return { type: 'game.new', game: { id, name, createdAt: new Date().toISOString(), map: testMap() } };
}

test('a new game comes back after a reload', async ({ page }) => {
  const table = `tv-reload-${Date.now()}`;
  await openTv(page, table);
  const c = new BareCompanion(table);
  await c.connect();

  const gameId = `g${Date.now().toString(36)}`.slice(0, 12);
  c.send(newGameMsg(gameId, 'Reload test'));
  await expect(page.getByTestId('tv-status')).toContainText('game Reload test');
  await expect(page.getByTestId('tv-game')).toBeVisible();
  c.command({ type: 'fog.all', value: 'reveal' });
  c.command({ type: 'view.grid', on: false });
  await expect(page.getByTestId('tv-status')).toContainText('rev 2');
  await page.waitForTimeout(2600); // the autosave runs 2 s after the last change

  await page.reload();
  await expect(page.getByTestId('tv-status')).toContainText('open');
  await expect(page.getByTestId('tv-status')).toContainText('game Reload test');
  await expect(page.getByTestId('tv-status')).toContainText('screen game');
  const snap = await c.snapshot();
  const state = snap.state as { game: { id: string; maps: Record<string, { showGrid: boolean; fog: { revealed: string } }> } };
  expect(state.game.id).toBe(gameId);
  const play = Object.values(state.game.maps)[0]!;
  expect(play.showGrid).toBe(false);
  expect(play.fog.revealed).toMatch(/^\/\/\//); // all bits set
  c.close();
});

test('every TV screen works with the D-pad and OK only', async ({ page }) => {
  const table = `tv-dpad-${Date.now()}`;
  await openTv(page, table);
  const c = new BareCompanion(table);
  await c.connect();

  // home: nothing to continue yet, so Library has the focus
  await expect(page.getByTestId('tv-home')).toBeVisible();
  await expect(page.getByTestId('tv-badge')).toContainText('Tablet connected');
  expect(await focused(page)).toContain('Library');
  await shot(page, 'home-empty');

  // Measure the table → the calibration card, Done focused → OK turns it off
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toContain('Measure the table');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tv-calibration')).toBeVisible();
  await expect(page.getByTestId('tv-status')).toContainText('pattern');
  expect(await focused(page)).toContain('Done');
  await shot(page, 'calibration');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tv-home')).toBeVisible();

  // Back also turns the pattern off
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tv-calibration')).toBeVisible();
  await page.waitForTimeout(450); // Back is debounced 400 ms
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tv-calibration')).toBeHidden();

  // a stored game, so home and the library have something to show
  c.send(newGameMsg(`gd${Date.now().toString(36)}`.slice(0, 12), 'Dpad cave'));
  await expect(page.getByTestId('tv-game')).toBeVisible();
  // game: the back arrow is hidden until a remote key, then the first OK only shows it
  const arrow = page.getByRole('button', { name: 'Back to the library' });
  await expect(arrow).toBeFocused();
  await expect(arrow).toHaveCSS('opacity', '0');
  await shot(page, 'game-calm');
  await page.keyboard.press('Enter');
  await expect(arrow).toHaveClass(/shown/);
  await expect(page.getByTestId('tv-game')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'game-chrome');
  // second OK: back to the library (the game is saved and closed)
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tv-library')).toBeVisible();
  await expect(page.getByTestId('tv-status')).toContainText('game none');
  await expect.poll(() => focused(page)).toContain('Dpad cave');
  await shot(page, 'library');

  // library: up to the back square, right to the shelf switch, over to Maps, then Back → home
  await page.keyboard.press('ArrowUp');
  expect(await focused(page)).toBe('Back');
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toMatch(/Games|Maps/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tv-library')).toContainText('shared library');
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tv-home')).toBeVisible();

  // home now continues the game: Continue has the focus, OK opens it
  await expect.poll(() => focused(page)).toContain('Dpad cave');
  await shot(page, 'home-continue');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tv-status')).toContainText('game Dpad cave');

  // the tablet leaves: the game shows the problem badge, nothing else
  c.close();
  await expect(page.getByTestId('tv-badge')).toContainText('Tablet not connected');
  await shot(page, 'game-problem');
});

test('a box reset gets the game back from the server backup', async ({ browser }) => {
  const table = `tv-reset-${Date.now()}`;
  const gameId = `gr${Date.now().toString(36)}`.slice(0, 12);

  const before = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv1 = await before.newPage();
  await openTv(tv1, table);
  const c = new BareCompanion(table);
  await c.connect();
  c.send(newGameMsg(gameId, 'Backed up'));
  await expect(tv1.getByTestId('tv-status')).toContainText('game Backed up');
  c.command({ type: 'fog.all', value: 'reveal' });
  // wait until the server holds the backup with the revealed fog
  await expect.poll(async () => {
    const res = await tv1.request.get(`/api/games/${gameId}`);
    if (!res.ok()) return '';
    const g = (await res.json()) as { game?: { maps: Record<string, { fog: { revealed: string } }> }; maps?: Record<string, { fog: { revealed: string } }> };
    const maps = g.game?.maps ?? g.maps ?? {};
    return Object.values(maps)[0]?.fog.revealed.slice(0, 3) ?? '';
  }, { timeout: 15_000 }).toBe('///');
  await before.close();

  // a fresh box: no IndexedDB, same table
  const after = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv2 = await after.newPage();
  await openTv(tv2, table);
  await expect(tv2.getByTestId('tv-status')).toContainText('game none');

  const listing = c.next((m) => m.type === 'lib.listing');
  c.send({ type: 'lib.list' });
  const games = (await listing).games as { id: string; where: string }[];
  expect(games.find((g) => g.id === gameId)?.where).toBe('server');

  c.send({ type: 'game.open', gameId });
  await expect(tv2.getByTestId('tv-status')).toContainText('game Backed up');
  const snap = await c.snapshot();
  const state = snap.state as { game: { maps: Record<string, { fog: { revealed: string } }> } };
  expect(Object.values(state.game.maps)[0]!.fog.revealed).toMatch(/^\/\/\//);

  // and it is on this TV now: a reload reopens it without the server's help
  await tv2.reload();
  await expect(tv2.getByTestId('tv-status')).toContainText('game Backed up');
  c.close();
  await after.close();
});
