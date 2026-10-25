/**
 * The harness checks itself: a table opens (TV page, companion page, bot), the bot's commands
 * reach the TV and every page, the fixture maps upload, and a private server starts, stops and
 * restarts on its own data. If this file fails, every other flow's result means little.
 */
import { fixture, fixtureGeometry, MAP_SET, topLeftRoom, uploadMap } from './support/maps.ts';
import { expect, test } from './support/fixtures.ts';
import { ProtoClient } from './support/proto.ts';
import { E2E_SERVER } from './support/server.ts';
import { activeMap, hasHook, startGame, tvState, waitSynced } from './support/table.ts';
import { buildWallGrid, floodFill } from '../shared/src/index.ts';

test('a table opens and a bot command reaches the TV and the companion page', async ({ table }) => {
  test.info().annotations.push({ type: 'hook', description: `TV hook: ${await hasHook(table.tv)}, companion hook: ${await hasHook(table.companions[0]!)}` });
  await table.bot.must({ type: 'table.calibrate', widthInches: 41 });
  const snap = await waitSynced(table);
  expect(snap.state.table.widthInches).toBe(41);
  expect(table.bot.confirmed).toEqual(snap.state);
});

test('a game starts from a fixture map and the companion page follows', async ({ table }) => {
  const map = await uploadMap(table.serverUrl, 'tavern');
  await startGame(table, 'Harness game', map.info);
  await table.bot.must({ type: 'fog.all', value: 'reveal' });
  await waitSynced(table);
  const s = await tvState(table);
  expect(s.game?.name).toBe('Harness game');
  expect(activeMap(s).info.grid.cols).toBe(16);
  await expect(table.companions[0]!.getByTestId('companion-status')).toContainText('game Harness game');
});

test('fixture geometry: four rooms, door 0 joins the top two', () => {
  for (const f of MAP_SET.filter((m) => m.kind === 'uvtt')) {
    const g = fixtureGeometry(f);
    expect(g.doors.length, f.key).toBe(f.doors);
    const closed = floodFill(buildWallGrid(f.cols, f.rows, g, []), 0).sort((a, b) => a - b);
    expect(closed, f.key).toEqual(topLeftRoom(f));
    const open = floodFill(buildWallGrid(f.cols, f.rows, g, [0]), 0);
    expect(open.length, f.key).toBe(topLeftRoom(f).length + Math.floor(f.cols / 2) * Math.ceil(f.rows / 2));
  }
  expect(fixture('castle').cols).toBe(114);
});

test('the run uses the server it was asked for (BATTLEMAP_E2E_SERVER)', async ({ privateServer, baseURL }) => {
  // The Rust server says `server: "rust"` in /health; the Bun server has no such field.
  const kind = async (url: string) => ((await (await fetch(`${url}/health`)).json()) as { server?: string }).server ?? 'bun';
  expect(await kind(privateServer.url)).toBe(E2E_SERVER);
  expect(await kind(new URL(baseURL ?? '').origin)).toBe(E2E_SERVER);
});

test('a private server restarts on its own data and the bot reconnects', async ({ privateServer }) => {
  const bot = new ProtoClient({ wsUrl: privateServer.wsUrl, room: 'e2e-restart' });
  await bot.connect();
  await privateServer.kill();
  await expect.poll(() => bot.open).toBe(false);
  await privateServer.restart();
  await bot.connect();
  expect(bot.open).toBe(true);
  bot.close();
});
