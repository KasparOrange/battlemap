/**
 * Companion package 4b flows, each against a real TV page and the real server: pairing with
 * the table picker, a new game from an uploaded picture whose drawn grid is detected, renaming
 * a stored game, the calibration dialog changing the TV's table, the ruler and the template
 * disc reaching the TV's state, and a DM layer that the TV never loads.
 * The TV's state is read with a raw snapshot request (`companion-lib-peek.ts`).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { activeMap, peekTv } from './companion-lib-peek.ts';

const SERVER_PORT = Number(process.env.BATTLEMAP_SERVER_PORT ?? 5929);

// One flow after the other (the file's tests share one worker): grid detection runs in a worker
// and starves when four flows share the CPU. Not 'serial': one slow flow must not skip the rest.
test.describe.configure({ mode: 'default' });

/** A 1280 × 960 picture with a 32 px grid drawn in (40 × 30 squares), made in the page. */
async function gridPicture(page: Page, w = 1280, h = 960): Promise<Buffer> {
  const b64 = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5d5040';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(0,0,0,${((i * 37) % 20) / 100})`;
      g.fillRect((i * 97) % w, (i * 53) % h, 48, 48);
    }
    g.strokeStyle = 'rgba(15,15,15,0.85)';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    return c.toDataURL('image/png').split(',')[1]!;
  }, [w, h] as const);
  return Buffer.from(b64, 'base64');
}

/** Opens a TV page on a new table. */
async function openTv(browser: Browser, name: string): Promise<{ tv: Page; table: string }> {
  const table = `lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv = await ctx.newPage();
  await tv.goto(`/app/?mode=tv&table=${table}&debug=1&name=${encodeURIComponent(name)}`);
  // generous: under load the first page load stalls the TV's event loop for 15 s and more
  await expect(tv.getByTestId('tv-status')).toContainText('open', { timeout: 45_000 });
  return { tv, table };
}

/** A tablet-sized companion page on a table. */
async function openCompanion(browser: Browser, table: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`/app/?mode=companion&table=${table}`);
  await expect(page.getByTestId('library')).toBeVisible({ timeout: 15_000 });
  return page;
}

/**
 * Uploads a grid picture and starts a game on it; returns when the TV has the game. Only the
 * pairing flow checks the detection (the big picture); the others take a small picture whose
 * squares come from its name, so a loaded machine doesn't spend the flow's time on detection
 * (qa#15: the calibration flow ran out of time before it reached the dialog).
 */
async function startGame(page: Page, tv: Page, detect = false): Promise<void> {
  const file = detect
    ? { name: 'cave_level.png', mimeType: 'image/png', buffer: await gridPicture(page) }
    : { name: 'cave_level_20x15.png', mimeType: 'image/png', buffer: await gridPicture(page, 640, 480) };
  await page.getByTestId('upload-input').setInputFiles(file);
  try {
    if (detect) await expect(page.getByText(/Found a drawn grid: 40 × 30 squares of 32 px/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Upload and play' })).toBeEnabled({ timeout: 45_000 });
  } catch (e) {
    await page.screenshot({ path: test.info().outputPath('companion.png') });
    throw e;
  }
  await page.getByRole('button', { name: 'Upload and play' }).click();
  // the upload starts at the click now (nothing goes up before the squares are confirmed)
  await expect(tv.getByTestId('tv-status')).toContainText(/game Session \d+/, { timeout: 45_000 });
  await expect(page.getByRole('tab', { name: 'Measure' }).first()).toBeVisible({ timeout: 15_000 });
}

test('pair from the picker, new game from a picture with a detected grid, rename it', async ({ browser }) => {
  test.setTimeout(240_000);
  const { tv, table } = await openTv(browser, `Pairing TV ${Date.now() % 1000}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/app/?mode=companion');
  await expect(page.getByTestId('table-picker')).toBeVisible();
  await page.getByRole('button', { name: /Pairing TV/ }).first().click();
  await expect(page.getByTestId('library')).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).searchParams.get('table')).toBe(table);

  await startGame(page, tv, true);
  const map = activeMap(await peekTv(SERVER_PORT, table));
  expect(map.info.grid).toMatchObject({ cols: 40, rows: 30 });
  expect(map.info.grid.cellW).toBeCloseTo(32, 1);
  expect(map.info.drawGrid).toBe(false); // the picture has its own lines
  expect(map.info.name).toBe('Cave level');

  // Leave the game, then rename it in the library (its card is the Continue card, first).
  const name = (await tv.getByTestId('tv-status').textContent())?.match(/game (Session \d+ · [^·]+?)\s+·/)?.[1]?.trim() ?? 'Session';
  await page.getByRole('tab', { name: 'Game' }).first().click();
  await page.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('games')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: `More for ${name}`, exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const field = page.getByRole('textbox', { name: 'Name' });
  await field.fill('Cave night');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByTestId('games')).toContainText('Cave night');
  await page.reload();
  await expect(page.getByTestId('games')).toContainText('Cave night', { timeout: 15_000 });
});

test('the calibration dialog changes the TV table', async ({ browser }) => {
  test.setTimeout(240_000);
  const { tv, table } = await openTv(browser, 'Calibration TV');
  const page = await openCompanion(browser, table);
  await startGame(page, tv);

  await page.getByRole('tab', { name: 'Game' }).first().click();
  await page.getByRole('button', { name: /Measure the TV/ }).click();
  await expect(page.getByTestId('calibration-result')).toContainText('34 × 19 squares');
  await expect.poll(async () => (await peekTv(SERVER_PORT, table)).table.pattern.on).toBe(true);

  await page.getByRole('textbox', { name: 'Measured' }).fill('27,94'); // 11 in measured for 10 in
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(async () => (await peekTv(SERVER_PORT, table)).table.widthInches).toBeCloseTo(37.95, 1);
  await expect(page.getByTestId('calibration-result')).toContainText('37 × 21 squares');
  await expect(tv.getByTestId('tv-status')).toContainText('width 37.95');

  await page.getByRole('button', { name: /Back to auto/ }).click();
  await expect.poll(async () => (await peekTv(SERVER_PORT, table)).table.widthInches).toBe(34.5);
  // the notice's Undo — drawn inside the open dialog, where it can be pressed (qa#15: `.last()`
  // took the rail's disabled Undo, and the root notice sat inert behind the modal dialog)
  await page.getByRole('status').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await peekTv(SERVER_PORT, table)).table.widthInches).toBeCloseTo(37.95, 1);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await peekTv(SERVER_PORT, table)).table.pattern.on).toBe(false);
});

test('the ruler and the template disc reach the TV', async ({ browser }) => {
  test.setTimeout(240_000);
  const { tv, table } = await openTv(browser, 'Measure TV');
  const page = await openCompanion(browser, table);
  await startGame(page, tv);

  await page.getByRole('tab', { name: 'Measure' }).first().click();
  await page.getByRole('switch', { name: /Ruler on the table/ }).click();
  await expect.poll(async () => activeMap(await peekTv(SERVER_PORT, table)).ruler.visible).toBe(true);
  await page.getByRole('switch', { name: /Template disc on the map/ }).click();
  await expect.poll(async () => activeMap(await peekTv(SERVER_PORT, table)).disc.visible).toBe(true);

  // A look change goes to the TV too.
  await page.getByRole('button', { name: 'Disc', exact: true }).click();
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await expect.poll(async () => activeMap(await peekTv(SERVER_PORT, table)).disc.markers).toBe(4);
});

test('a DM layer is in the game but the TV never loads its picture', async ({ browser }) => {
  test.setTimeout(240_000);
  const { tv, table } = await openTv(browser, 'Layers TV');
  const tvFiles: string[] = [];
  tv.on('request', (r) => r.url().includes('/files/') && tvFiles.push(r.url()));
  const page = await openCompanion(browser, table);
  await startGame(page, tv);

  await page.getByRole('tab', { name: 'View' }).first().click();
  await page.getByTestId('layer-input').setInputFiles({ name: 'secret doors.png', mimeType: 'image/png', buffer: await gridPicture(page, 320, 240) });
  await expect(page.getByTestId('dm-layers')).toContainText('secret doors', { timeout: 15_000 });
  let hash = '';
  await expect.poll(async () => {
    const layers = activeMap(await peekTv(SERVER_PORT, table)).layers;
    hash = layers[0]?.file.hash ?? '';
    return layers.length;
  }).toBe(1);
  await tv.waitForTimeout(1500);
  expect(hash).not.toBe('');
  expect(tvFiles.filter((u) => u.includes(hash))).toEqual([]);
});

test('a cancelled import leaves nothing on the server; the upload starts at the squares dialog', async ({ browser }) => {
  test.setTimeout(120_000);
  const { table } = await openTv(browser, `Cancel TV ${Date.now() % 1000}`);
  const page = await openCompanion(browser, table);
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/files')) uploads.push(r.url());
  });
  const file = { name: 'cave_level_20x15.png', mimeType: 'image/png', buffer: await gridPicture(page, 640, 480) };
  await page.getByTestId('upload-input').setInputFiles(file);
  await expect(page.getByRole('button', { name: 'Upload and play' })).toBeEnabled({ timeout: 45_000 });
  // "Store as" is offered: the picture isn't on the server yet
  await expect(page.getByRole('radiogroup', { name: 'Store as' })).toBeVisible();
  expect(uploads, 'reading the map uploads nothing').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Upload and play' })).toBeHidden();
  await page.waitForTimeout(500);
  expect(uploads, 'a cancelled import uploads nothing').toEqual([]);
});
