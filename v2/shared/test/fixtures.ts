/**
 * Test helpers: maps, a state with a game, applying commands that must succeed.
 */
import { expect } from 'bun:test';
import {
  apply, initialRoot, newGame, wholeGrid,
  type Command, type MapInfo, type RootState,
} from '../src/index.ts';

/** A fake file reference. */
export const FILE = { hash: '0123456789abcdef', ext: 'png' as const, bytes: 1000 };

/**
 * A picture map of `cols × rows` squares of 100 px.
 *
 * @param id - map id
 * @param cols - squares across
 * @param rows - squares down
 * @returns the map
 */
export function pictureMap(id = 'm1', cols = 20, rows = 15): MapInfo {
  return {
    id, name: `Map ${id}`, kind: 'picture', picture: FILE, tableCopy: null, geometry: null,
    grid: wholeGrid(cols, rows, cols * 100, rows * 100), drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
  };
}

/**
 * A `.dd2vtt` map with `doors` doors.
 *
 * @param id - map id
 * @param cols - squares across
 * @param rows - squares down
 * @param doors - door count
 * @returns the map
 */
export function uvttMap(id = 'u1', cols = 10, rows = 8, doors = 2): MapInfo {
  return { ...pictureMap(id, cols, rows), kind: 'uvtt', doorCount: doors, drawGrid: false };
}

/**
 * The initial state with a game open on `map` and a 1920 × 1080 TV viewport (34 × 19 table).
 *
 * @param map - the first map
 * @returns the state
 */
export function withGame(map: MapInfo = pictureMap()): RootState {
  const root = initialRoot();
  return {
    ...root,
    table: { ...root.table, viewport: { width: 1920, height: 1080 } },
    game: newGame({ id: 'g1', name: 'Test game', createdAt: '2026-10-25T18:00:00.000Z', map }),
  };
}

/**
 * Applies commands that must all succeed.
 *
 * @param state - the start
 * @param cmds - the commands
 * @returns the final state
 */
export function run(state: RootState, ...cmds: Command[]): RootState {
  let s = state;
  for (const cmd of cmds) {
    const r = apply(s, cmd);
    if (!r.ok) throw new Error(`${cmd.type} refused: ${r.reason}`);
    s = r.state;
  }
  return s;
}

/**
 * Applies a command that must be refused.
 *
 * @param state - the state
 * @param cmd - the command
 * @returns the reason
 */
export function refused(state: RootState, cmd: Command): string {
  const r = apply(state, cmd);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.reason;
}

/**
 * The map on the table.
 *
 * @param s - the state
 * @returns its play state
 */
export function active(s: RootState) {
  const g = s.game!;
  return g.maps[g.activeMapId]!;
}
