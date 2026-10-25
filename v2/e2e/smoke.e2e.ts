/**
 * Smoke: a TV page and a companion page join the same table through the real server, the
 * companion sends commands, both show the TV's state, and the pages' log batches reach `/log`.
 */
import { expect, test } from '@playwright/test';

test('TV and companion connect, exchange commands, and log', async ({ browser }) => {
  const context = await browser.newContext();
  const tv = await context.newPage();
  const companion = await context.newPage();
  const table = `smoke-${Date.now()}`;

  await tv.goto(`/app/?mode=tv&table=${table}&debug=1&name=Smoke%20TV`);
  await expect(tv.getByTestId('tv-status')).toContainText('open');

  const logPosted = companion.waitForResponse((r) => r.url().endsWith('/log') && r.request().method() === 'POST', { timeout: 15_000 });
  await companion.goto(`/app/?mode=companion&table=${table}&debug=1`);
  await expect(companion.getByTestId('companion-status')).toContainText('TV online · ready');
  await expect(tv.getByTestId('tv-status')).toContainText('companions 1');
  // The kit's Button debounces from performance.now() = 0, so a press in the first 350 ms after
  // the page loaded is ignored (reported to the kit's owner); remove this wait once fixed.
  await companion.waitForTimeout(400);

  await companion.getByRole('button', { name: 'Calibrate 40 in' }).click();
  await expect(tv.getByTestId('tv-status')).toContainText('width 40 in');
  await expect(companion.getByTestId('companion-status')).toContainText('width 40 in');

  await companion.getByRole('button', { name: 'Start a test game' }).click();
  await expect(tv.getByTestId('tv-status')).toContainText('game Test game');
  await expect(companion.getByTestId('companion-status')).toContainText('game Test game');
  await companion.getByRole('button', { name: 'Reveal all' }).click();
  await expect(companion.getByTestId('companion-status')).toContainText(/rev [1-9]/);

  expect((await logPosted).status()).toBe(204);
  await context.close();
});
