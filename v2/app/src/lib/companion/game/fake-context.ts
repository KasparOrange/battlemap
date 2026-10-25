/**
 * Test helper: a {@link GameContext} without Svelte or a network — a real `RootState` with a
 * game, commands applied with the shared reducer (like the companion's prediction), a camera
 * that just stores. Used by the companion's `bun test` files only.
 */
import { apply, initialRoot, newGame, newId, wholeGrid, type Camera, type Command, type MapGeometry, type MapInfo, type RootState } from '@battlemap/shared';
import type { DmCameraControl, GameContext } from './tabs.ts';

/** A fake context plus what it recorded. */
export interface FakeContext extends GameContext {
  /** Every command dispatched, in order (also the refused ones). */
  sent: Command[];
  /** Replaces the state (e.g. to open doors). */
  setState(s: RootState): void;
  /** Sets the walls and doors. */
  setGeometry(g: MapGeometry | null): void;
}

/**
 * A picture or `.dd2vtt` map for tests.
 *
 * @param cols - squares across
 * @param rows - squares down
 * @param doorCount - doors (> 0 makes it a uvtt map)
 * @returns the map
 */
export function testMap(cols = 20, rows = 15, doorCount = 0): MapInfo {
  return {
    id: 'map1', name: 'Test map', kind: doorCount ? 'uvtt' : 'picture',
    picture: { hash: '0123456789abcdef', ext: 'png', bytes: 1 }, tableCopy: null,
    geometry: doorCount ? { hash: 'fedcba9876543210', ext: 'json', bytes: 1 } : null,
    grid: wholeGrid(cols, rows, cols * 100, rows * 100), drawGrid: true, doorCount, drawDoors: false, libraryId: null,
  };
}

/**
 * A state with a game open on one map.
 *
 * @param map - the map (default 20 × 15 picture map)
 * @returns the state
 */
export function stateWithGame(map: MapInfo = testMap()): RootState {
  return { ...initialRoot(), game: newGame({ id: 'game1', name: 'Test game', createdAt: '2026-10-25T10:00:00Z', map }) };
}

/**
 * Makes a fake context.
 *
 * @param state - the starting state (a game must be open)
 * @returns the context
 */
export function fakeContext(state: RootState = stateWithGame()): FakeContext {
  let current = state;
  let geometry: MapGeometry | null = null;
  let cam: Camera = { centerX: 10, centerY: 7.5, zoom: 40, quarterTurns: 0 };
  const camera: DmCameraControl = {
    get: () => cam,
    set: (c) => (cam = c),
    jumpTo: (p) => (cam = { ...cam, centerX: p.x, centerY: p.y }),
    fit: () => {},
    showTv: () => {},
  };
  const ctx: FakeContext = {
    sent: [],
    config: { serverUrl: 'http://test' } as GameContext['config'],
    session: { get view() { return current; } } as unknown as GameContext['session'],
    get state() { return current; },
    get game() { return current.game!; },
    get map() { return current.game!.maps[current.game!.activeMapId]!; },
    get geometry() { return geometry; },
    phone: false,
    tab: 'tokens',
    selectedToken: null,
    camera,
    dispatch(cmd) {
      ctx.sent.push(cmd);
      const r = apply(current, cmd);
      if (!r.ok) return false;
      current = r.state;
      return true;
    },
    newGesture: () => newId(),
    selectTab: () => {},
    fileUrl: (ref) => `http://test/files/${ref.hash}.${ref.ext}`,
    setState: (s) => (current = s),
    setGeometry: (g) => (geometry = g),
  };
  return ctx;
}
