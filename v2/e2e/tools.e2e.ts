/**
 * The dev and test tools against a real table (parity QA-03): `tools/tv-ctl.ts` status, list,
 * prepare and resume, each run as its own process the way a deploy script or the bot uses it.
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { uploadMap } from './support/maps.ts';
import { expect, test } from './support/fixtures.ts';
import { startGame, tvState, type Table } from './support/table.ts';

const run = promisify(execFile);
const TOOL = join(import.meta.dirname, '..', 'tools', 'tv-ctl.ts');

/** Runs `bun tools/tv-ctl.ts <cmd>` against the table and parses its JSON. */
async function tvCtl(t: Table, cmd: string): Promise<Record<string, unknown>> {
  const { stdout } = await run('bun', [TOOL, cmd, '--server', t.serverUrl, '--table', t.id, '--timeout', '15'], { timeout: 30_000 });
  return JSON.parse(stdout) as Record<string, unknown>;
}

test('tv-ctl: status, list, prepare and resume reach the TV', async ({ table: t }) => {
  const map = await uploadMap(t.serverUrl, 'tavern');
  const gameId = await startGame(t, 'Tools night', map.info);

  const status = await tvCtl(t, 'status');
  expect(status.type).toBe('diag.report');
  expect(status.gameId).toBe(gameId);

  const ready = await tvCtl(t, 'prepare');
  expect(ready.type).toBe('deploy.ready');

  const list = await tvCtl(t, 'list');
  expect((list.games as { id: string }[]).some((g) => g.id === gameId)).toBe(true);

  t.bot.send({ type: 'game.close' });
  await t.bot.until((s) => s.game === null, 10_000);
  const resumed = await tvCtl(t, 'resume');
  expect(resumed.resumed).toBe(gameId);
  expect((await tvState(t)).game?.id).toBe(gameId);
});
