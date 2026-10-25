/**
 * Wave-4 QA: checks that a sample of the wave-3 fixes (`docs/qa.md` "Bugs found", `docs/review.md`)
 * really work in the running app, not only in their commits. One flow per fix, named by its
 * number; each fails with the symptom the bug report described.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildWallGrid, floodFill, tableCode } from '../shared/src/index.ts';
import { parseUvtt } from '../app/src/lib/import/uvtt.ts';
import { uploadMap } from './support/maps.ts';
import { expect, test } from './support/fixtures.ts';
import { V2_DIR } from './support/server.ts';
import { startGame, waitSynced, waitTvOnline, type BattlemapHook } from './support/table.ts';
import type { Page } from '@playwright/test';

/**
 * The real vampire lair of the old test set (`../test_assets/maps`, fetched by
 * `tools/fetch-test-maps.ts`; another folder with `BATTLEMAP_TEST_MAPS`).
 */
const LAIR = join(process.env.BATTLEMAP_TEST_MAPS ?? join(V2_DIR, '..', 'test_assets', 'maps'), '04-vampire-lair-19x14.dd2vtt');

/**
 * Frames the TV renderer draws in a window of time.
 *
 * @param tv - the TV page (with the test hook)
 * @param ms - how long to count
 * @returns frames drawn in that time
 */
async function framesIn(tv: Page, ms: number): Promise<number> {
  const read = () => tv.evaluate(() => (window as unknown as { __battlemap?: BattlemapHook }).__battlemap?.render?.()?.frames ?? -1);
  const a = await read();
  await tv.waitForTimeout(ms);
  return (await read()) - a;
}

test('qa#2 a Room tap in the lair\'s top room stays inside its walls (walls mid-square)', () => {
  test.skip(!existsSync(LAIR), 'the real test maps are not on this machine (tools/fetch-test-maps.ts)');
  const m = parseUvtt(readFileSync(LAIR, 'utf8'));
  const room = floodFill(buildWallGrid(m.cols, m.rows, m.geometry, []), 3 * m.cols + 7);
  test.info().annotations.push({ type: 'room', description: `${room.length} of ${m.cols * m.rows} squares` });
  // Before the fix the fill leaked through every off-grid wall: 264 of 266 squares.
  expect(room.length).toBeGreaterThan(4);
  expect(room.length).toBeLessThan(m.cols * m.rows / 3);
});

test('qa#3 the TV keeps its calibration across a reload', async ({ table }) => {
  await table.bot.must({ type: 'table.calibrate', widthInches: 26 });
  await waitSynced(table);
  await table.tv.waitForTimeout(1500); // the TV stores it (IndexedDB)
  await table.tv.reload();
  await waitTvOnline(table.tv);
  await expect.poll(async () => (await table.bot.snapshot()).state.table.widthInches, { timeout: 15_000 }).toBe(26);
});

test('qa#18 the TV home shows the table code the picker uses, never the raw room id', async ({ table }) => {
  const code = table.tv.getByTestId('tv-table-code');
  await expect(code).toHaveText(tableCode(table.id));
  await expect(table.tv.locator('body')).not.toContainText(table.id);
});

test('rv#4 cloud fog drifts only while the fog shows; fog off leaves the TV idle', async ({ table }) => {
  test.setTimeout(90_000);
  const map = await uploadMap(table.serverUrl, 'tavern');
  await startGame(table, 'Cloud idle', map.info);
  await table.bot.must({ type: 'game.settings', settings: { fogStyle: 'cloud' } });
  await table.bot.must({ type: 'fog.enable', on: true });
  await waitSynced(table);
  await table.tv.waitForTimeout(1500);
  const drifting = await framesIn(table.tv, 3000);
  await table.bot.must({ type: 'fog.enable', on: false });
  await waitSynced(table);
  await table.tv.waitForTimeout(1500);
  const idle = await framesIn(table.tv, 3000);
  test.info().annotations.push({ type: 'frames', description: `cloud fog on: ${drifting} frames in 3 s; fog off: ${idle}` });
  expect(drifting, 'the cloud drift lease should run while the fog shows').toBeGreaterThan(5); // 20 fps lease; SwiftShader under load draws ~5 fps
  expect(idle, 'fog off: render on demand, nothing drifts').toBeLessThanOrEqual(2);
});

test('rv#1 "TV follows the tablet" in free view sends nothing while the DM does nothing', async ({ table }) => {
  test.setTimeout(90_000);
  const map = await uploadMap(table.serverUrl, 'tavern');
  await startGame(table, 'Follow idle', map.info);
  await table.bot.must({ type: 'view.mode', mode: 'free' });
  await waitSynced(table);
  const page = table.companions[0]!;
  const tab = page.getByRole('tab', { name: 'View' });
  await expect(tab).toBeVisible({ timeout: 45_000 });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  const follow = page.getByRole('switch', { name: 'TV follows the tablet' });
  await follow.click();
  await expect(follow).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(2000); // the first follow step may send once
  const rev0 = (await table.bot.snapshot()).rev;
  await page.waitForTimeout(5000);
  const sent = (await table.bot.snapshot()).rev - rev0;
  test.info().annotations.push({ type: 'commands', description: `${sent} revisions in 5 s idle with follow on (the loop sent ~12/s)` });
  expect(sent).toBeLessThanOrEqual(1);
});
