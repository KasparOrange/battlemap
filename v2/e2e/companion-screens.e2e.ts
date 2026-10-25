/**
 * Screenshots of every companion screen on a tablet (1280 × 800) and a phone (390 × 844), for the
 * visual check against `docs/design.md`: the table picker, the library (empty, with games, the
 * shared maps), the squares dialog, the game screen with each tab open, the developer screen.
 * Pictures go to `$TMPDIR/claude-v2-companion-screens-<app port>/` (or `BATTLEMAP_SHOTS`); the
 * flow checks only that each screen shows up. Run it on its own:
 * `bun run e2e companion-screens`.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { uploadMap } from './support/maps.ts';
import { appUrl, openTable, startGame } from './support/table.ts';

const APP_PORT = Number(process.env.BATTLEMAP_APP_PORT ?? 5884);
const DIR = process.env.BATTLEMAP_SHOTS ?? join(tmpdir(), `claude-v2-companion-screens-${APP_PORT}`);
mkdirSync(DIR, { recursive: true });

const DEVICES = { tablet: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } } as const;

/** Saves a screenshot of the page as `<name>-<device>.png`. */
async function shot(page: Page, name: string, device: keyof typeof DEVICES): Promise<void> {
  await page.waitForTimeout(450); // planes and glides settle
  await page.screenshot({ path: join(DIR, `${name}-${device}.png`), animations: 'disabled' });
}

/** A 640 × 480 picture with a 32 px grid drawn in, made in the page. */
async function gridPicture(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5d5040';
    g.fillRect(0, 0, 640, 480);
    g.strokeStyle = 'rgba(15,15,15,0.85)';
    g.lineWidth = 2;
    for (let x = 0; x <= 640; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 480); g.stroke(); }
    for (let y = 0; y <= 480; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(640, y); g.stroke(); }
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}

for (const device of Object.keys(DEVICES) as (keyof typeof DEVICES)[]) {
  test(`companion screens · ${device}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const t = await openTable(browser, { companions: 0 });
    try {
      const page = await t.context.newPage();
      await page.setViewportSize(DEVICES[device]);

      await page.goto(appUrl('companion', '', t.serverUrl).replace(/&table=[^&]*/, '').replace('&debug=1', ''));
      await expect(page.getByTestId('table-picker')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('tables-online').getByRole('button').first()).toBeVisible({ timeout: 15_000 });
      await shot(page, 'picker', device);

      await page.goto(appUrl('companion', t.id, t.serverUrl).replace('&debug=1', ''));
      await expect(page.getByTestId('library')).toBeVisible({ timeout: 15_000 });
      // a fresh TV: no games of its own (the shared server may list other runs' backups)
      await expect(page.getByText('No games yet').or(page.getByTestId('backups')).or(page.getByTestId('games').getByRole('button').first()).first()).toBeVisible({ timeout: 15_000 });
      await shot(page, 'library-start', device);

      await page.getByTestId('upload-input').setInputFiles({ name: 'cave_level_20x15.png', mimeType: 'image/png', buffer: await gridPicture(page) });
      await expect(page.getByRole('button', { name: 'Upload and play' })).toBeEnabled({ timeout: 45_000 });
      await shot(page, 'squares-dialog', device);
      await page.keyboard.press('Escape');

      await page.getByRole('radio', { name: 'Maps' }).click();
      await page.waitForTimeout(800);
      await shot(page, 'library-maps', device);

      const map = await uploadMap(t.serverUrl, 'lair');
      await startGame(t, 'Screens night', map.info);
      await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await shot(page, 'game', device);

      const tabs = ['Tokens', 'Fog', 'Draw', 'Measure', 'Effects', 'Scenes', 'View', 'Game'];
      for (const name of tabs) {
        const tab = page.getByRole('tab', { name }).first();
        if (!(await tab.isVisible().catch(() => false))) continue;
        await tab.click();
        // tapping the chosen tab folds its panel (tablet) or closes the sheet (phone): tap again
        if (!(await page.getByTestId('tool-panel').isVisible().catch(() => false))) await tab.click();
        await expect(page.getByTestId('tool-panel')).toBeVisible();
        await page.waitForTimeout(600);
        await shot(page, `tab-${name.toLowerCase()}`, device);
        if (name === 'Effects' && device === 'tablet') {
          // a sprite-sheet effect loops its frames in the tile under the mouse, and only there
          const tile = page.locator('[data-testid="effects-grid"] [data-effect="fireball"]');
          await tile.hover();
          await expect(tile.locator('.pv.shown')).toBeVisible({ timeout: 10_000 });
          expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && ((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest('[data-testid="effects-grid"] .pv')).length)).toBe(1);
          await shot(page, 'tab-effects-preview', device);
          await page.mouse.move(5, 400);
          await expect(tile.locator('.pv.shown')).toHaveCount(0);
        }
      }

      await page.getByRole('button', { name: 'Game menu' }).click();
      await page.getByRole('menuitem', { name: 'Back to the library' }).click();
      await expect(page.getByTestId('games')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await shot(page, 'library-games', device);

      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Logs and diagnostics' }).click();
      await expect(page.getByTestId('dev-log')).toBeVisible();
      await shot(page, 'developer', device);
    } finally {
      await t.close();
    }
  });
}
