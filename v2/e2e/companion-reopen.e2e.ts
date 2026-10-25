/**
 * The companion stays responsive when the TV closes a game and opens it again (the game screen
 * unmounts, the library shows, the game screen mounts again with a new map view). The game-night
 * run saw the page's main thread blocked after `game.close` + `game.open` (W3-A's fixme); this
 * flow repeats the round trip a few times and, when the page stops answering, pauses its
 * JavaScript through the DevTools protocol and reports where it was stuck.
 */
import { expect, test } from '@playwright/test';
import { activeMap, openTable, startGame, tvState, type Table } from './support/table.ts';
import { uploadMap } from './support/maps.ts';

/** Whether the page's main thread answers within `ms`. */
async function answers(page: Table['tv'], ms = 4000): Promise<boolean> {
  return Promise.race([page.evaluate(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);
}

/** Where a page's JavaScript is right now (top frames with their source line), through a debugger pause. */
async function stuckAt(t: Table, page: Table['tv']): Promise<string> {
  const cdp = await t.context.newCDPSession(page);
  const scripts = new Map<string, string>();
  cdp.on('Debugger.scriptParsed', (e) => scripts.set(e.scriptId, e.url));
  await cdp.send('Debugger.enable');
  const paused = new Promise<string>((resolve) => {
    cdp.on('Debugger.paused', (e) => {
      void (async () => {
        const out: string[] = [`reason ${e.reason}`];
        for (const f of e.callFrames.slice(0, 15)) {
          let src = '';
          try {
            const s = await cdp.send('Debugger.getScriptSource', { scriptId: f.location.scriptId });
            src = s.scriptSource.split('\n')[f.location.lineNumber]?.slice(Math.max(0, (f.location.columnNumber ?? 0) - 60), (f.location.columnNumber ?? 0) + 100) ?? '';
          } catch {
            /* no source */
          }
          out.push(`${f.functionName || '(anon)'} ${scripts.get(f.location.scriptId) || f.url || '(no url)'}:${f.location.lineNumber + 1}:${f.location.columnNumber} ${src}`);
        }
        resolve(out.join('\n'));
      })();
    });
  });
  await cdp.send('Debugger.pause');
  const where = await Promise.race([paused, new Promise<string>((r) => setTimeout(() => r('(no pause within 8 s)'), 8000))]);
  await cdp.send('Debugger.resume').catch(() => {});
  return where;
}

test('close and reopen a two-map game: the companion keeps answering', async ({ browser }) => {
  test.setTimeout(120_000);
  const t = await openTable(browser);
  try {
    const ground = await uploadMap(t.serverUrl, 'towerGround');
    await startGame(t, 'Reopen night', ground.info);
    const upper = await uploadMap(t.serverUrl, 'towerUpper');
    await t.bot.must({ type: 'map.add', map: upper.info, activate: true });
    await t.bot.must({ type: 'fog.all', value: 'reveal' });
    const gameId = (await tvState(t)).game!.id;
    const companion = t.companions[0]!;
    await expect(companion.getByTestId('game-screen')).toBeVisible({ timeout: 15_000 });

    for (let round = 1; round <= 3; round++) {
      t.bot.send({ type: 'game.close' });
      await t.bot.until((s) => s.game === null, 10_000);
      await expect(companion.getByTestId('library')).toBeVisible({ timeout: 10_000 });
      t.bot.send({ type: 'game.open', gameId });
      const s = await t.bot.until((x) => x.game?.id === gameId, 10_000);
      expect(s.game!.mapOrder).toEqual([ground.info.id, upper.info.id]);
      expect(activeMap(s).info.id).toBe(upper.info.id);
      // a few seconds after the game screen came back: the page must still answer
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (!(await answers(companion))) {
          const tvAnswers = await answers(t.tv, 2000);
          const where = await stuckAt(t, companion);
          throw new Error(`round ${round}: the companion page stopped answering (TV page answers: ${tvAnswers}); its JavaScript was at:\n${where}`);
        }
      }
      await expect(companion.getByTestId('game-screen')).toBeVisible();
    }
  } finally {
    await t.close();
  }
});
