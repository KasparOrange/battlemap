/**
 * Smoke: a TV page and a companion page join the same table through the real server, the
 * companion sends commands through its session (the test hook's `dispatch`, so the flow doesn't
 * depend on where the UI puts its buttons), both show the TV's state, and the pages' log
 * batches reach `/log`.
 */
import { expect, test, type Page } from '@playwright/test';
import { uploadMap } from './support/maps.ts';
import { appUrl, SERVER_URL, type BattlemapHook } from './support/table.ts';

/** Runs `fn` against the page's test hook. */
function hook<T>(page: Page, fn: (h: BattlemapHook, arg: unknown) => T, arg?: unknown): Promise<T> {
  return page.evaluate(
    ([src, a]) => (new Function('h', 'a', `return (${src})(h, a)`) as (h: unknown, a: unknown) => T)((window as unknown as { __battlemap: unknown }).__battlemap, a),
    [fn.toString(), arg] as const,
  );
}

test('TV and companion connect, exchange commands, and log', async ({ browser }) => {
  const context = await browser.newContext();
  const tv = await context.newPage();
  const companion = await context.newPage();
  const table = `smoke-${Date.now()}`;

  await tv.goto(appUrl('tv', table, undefined, '&name=Smoke%20TV'));
  await expect(tv.getByTestId('tv-status')).toContainText('open');

  const logPosted = companion.waitForResponse((r) => r.url().endsWith('/log') && r.request().method() === 'POST', { timeout: 15_000 });
  await companion.goto(appUrl('companion', table));
  await expect(companion.getByTestId('companion-status')).toContainText('TV online · ready');
  await expect(tv.getByTestId('tv-status')).toContainText('companions 1');

  expect(await hook(companion, (h) => h.dispatch!({ type: 'table.calibrate', widthInches: 40 }))).toBe(true);
  await expect(tv.getByTestId('tv-status')).toContainText('width 40 in');
  await expect(companion.getByTestId('companion-status')).toContainText('width 40 in');

  const map = await uploadMap(SERVER_URL, 'house');
  const game = { id: `smoke-${Date.now()}`, name: 'Test game', createdAt: new Date().toISOString(), map: map.info };
  expect(await hook(companion, (h, g) => h.request!({ type: 'game.new', game: g as Record<string, unknown> }), game)).toBe(true);
  await expect(tv.getByTestId('tv-status')).toContainText('game Test game');
  await expect(companion.getByTestId('companion-status')).toContainText('game Test game');
  await expect(companion.getByTestId('companion-status')).toContainText('ready');
  expect(await hook(companion, (h) => h.dispatch!({ type: 'fog.all', value: 'reveal' }))).toBe(true);
  await expect(companion.getByTestId('companion-status')).toContainText(/rev [1-9]/);

  expect((await logPosted).status()).toBe(204);
  await context.close();
});
