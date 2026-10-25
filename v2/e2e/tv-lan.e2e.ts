/**
 * The TV home's LAN join band (shell.md "Table server"): with a stand-in for the shell's bridge
 * that says "this TV hosts the table", the home shows the short code and the QR code of the join
 * address, follows the shell's `lan` events (a new address, hosting stopped), and keeps the
 * online table code. Without the shell the band is absent.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1920, height: 1080 } });

/** A shell LAN status as `BattlemapShell.lan()` returns it. */
function lanStatus(code: string | null, running = true) {
  return {
    hosting: true,
    server: { running, port: 5930, localUrl: running ? 'http://127.0.0.1:5930' : null, upstream: null, error: running ? null : 'port 5930 is taken', rssKb: 0 },
    address: '192.168.1.42',
    url: 'http://192.168.1.42:5930',
    code,
    tableId: 'tv-lan',
    joinUrl: 'http://192.168.1.42:5930/app/?mode=companion&table=tv-lan',
    announced: true,
  };
}

/** Installs a minimal `window.BattlemapShell` whose `lan()` answers `status`. */
async function fakeShell(page: Page, status: ReturnType<typeof lanStatus>): Promise<void> {
  await page.addInitScript((st) => {
    (window as unknown as { __lan: unknown }).__lan = st;
    (window as unknown as { BattlemapShell: unknown }).BattlemapShell = new Proxy({}, {
      get: (_, key) => {
        if (key === 'lan') return () => JSON.stringify((window as unknown as { __lan: unknown }).__lan);
        if (key === 'info') return () => 'null';
        if (key === 'takeLogs') return () => '[]';
        return () => undefined;
      },
    });
  }, status);
  // The box's own server draws the QR code; here a stand-in SVG answers.
  await page.route('http://127.0.0.1:5930/api/qr.svg**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>' }));
}

/** Sends a shell `lan` event, as the shell does when hosting changes. */
async function lanEvent(page: Page, status: ReturnType<typeof lanStatus> | { hosting: false }): Promise<void> {
  await page.evaluate((st) => {
    (window as unknown as { __lan: unknown }).__lan = st;
    window.dispatchEvent(new CustomEvent('battlemapshell', { detail: { type: 'lan', ...st } }));
  }, status);
}

test('the TV home shows how to join its LAN table and follows changes', async ({ page }) => {
  await fakeShell(page, lanStatus('009A'));
  await page.goto('/app/?mode=tv&table=tv-lan&debug=1&name=LAN%20TV');
  await expect(page.getByTestId('tv-lan-code')).toHaveText('009A');
  const qr = page.getByTestId('tv-lan').locator('img');
  await expect(qr).toHaveAttribute('src', /\/api\/qr\.svg\?text=.*&dark=%231a1306&light=%23f7f1e4$/);
  await expect(qr).toHaveJSProperty('complete', true);
  await expect(page.getByTestId('tv-table-code')).toBeVisible(); // the online way stays

  // The band is information: the D-pad never stops on it.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => document.activeElement?.closest('[data-testid=tv-lan]') ?? null)).toBeNull();

  await lanEvent(page, lanStatus('00B7'));
  await expect(page.getByTestId('tv-lan-code')).toHaveText('00B7');

  await lanEvent(page, lanStatus(null, false));
  await expect(page.getByTestId('tv-lan')).toContainText('port 5930 is taken');
  await expect(page.getByTestId('tv-lan-code')).toHaveCount(0);

  await lanEvent(page, { hosting: false });
  await expect(page.getByTestId('tv-lan')).toHaveCount(0);
  await expect(page.getByTestId('tv-table-code')).toBeVisible();
});

test('without the shell there is no LAN band', async ({ page }) => {
  await page.goto('/app/?mode=tv&table=tv-nolan&debug=1');
  await expect(page.getByTestId('tv-home')).toBeVisible();
  await expect(page.getByTestId('tv-lan')).toHaveCount(0);
  await expect(page.getByTestId('tv-table-code')).toBeVisible();
});
