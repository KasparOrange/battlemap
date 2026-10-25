/**
 * Test helper: a {@link GameContext} without Svelte or a network — a real `RootState` with a
 * game, commands applied with the shared reducer (like the companion's prediction), a camera
 * that just stores. Used by the companion's `bun test` files only.
 */
import { apply, initialRoot, newGame, newId, wholeGrid, type Camera, type Command, type MapGeometry, type MapInfo, type Point, type RootState } from '@battlemap/shared';
import { clampDmCamera, fitDmCamera, screenToSquares, squaresToScreen, zoomCameraAt, type Size } from '../../render/camera.ts';
import { hitsAt } from '../../render/hit.ts';
import type { InputView } from '../input/map-input.ts';
import type { DmCameraControl, GameContext } from './tabs.ts';

/** A fake context plus what it recorded. */
export interface FakeContext extends GameContext {
  /** Every command dispatched, in order (also the refused ones). */
  sent: Command[];
  /** Replaces the state (e.g. to open doors). */
  setState(s: RootState): void;
  /** Sets the walls and doors. */
  setGeometry(g: MapGeometry | null): void;
  /** A stand-in for the table view (the renderer's camera maths and hit test, no WebGL). */
  view: InputView;
  /** Runs the clean-ups registered with `onDispose` (the screen closed). */
  dispose(): void;
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
  const size: Size = { width: 800, height: 600 };
  const listeners = new Set<(c: Camera) => void>();
  const disposers: (() => void)[] = [];
  const limits = () => {
    const g = current.game!.maps[current.game!.activeMapId]!.info.grid;
    return { cols: g.cols, rows: g.rows, view: size };
  };
  const setCam = (c: Camera) => {
    const next = clampDmCamera(c, limits());
    if (next.centerX === cam.centerX && next.centerY === cam.centerY && next.zoom === cam.zoom && next.quarterTurns === cam.quarterTurns) return;
    cam = next;
    for (const fn of listeners) fn(cam);
  };
  const hitsAtScreen = (p: Point) => {
    const map = current.game!.maps[current.game!.activeMapId]!;
    return hitsAt({ map, doors: geometry?.doors ?? [], dm: true, zoom: cam.zoom, frame: null }, screenToSquares(cam, size, p));
  };
  const view: InputView = {
    dmCamera: () => cam,
    setDmCamera: setCam,
    viewport: () => size,
    screenToSquares: (p) => screenToSquares(cam, size, p),
    hits: hitsAtScreen,
    zoomAt: (f, at) => setCam(zoomCameraAt(cam, size, f, at)),
  };
  const camera: DmCameraControl = {
    get: () => cam,
    set: setCam,
    jumpTo: (p) => setCam({ ...cam, centerX: p.x, centerY: p.y }),
    fit: () => setCam(fitDmCamera(limits())),
    showTv: () => {},
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
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
    showDmLayers: true,
    camera,
    view,
    hitsAt: (at) => hitsAtScreen(squaresToScreen(cam, size, at)),
    onDispose: (fn) => disposers.push(fn),
    dispose: () => disposers.splice(0).forEach((fn) => fn()),
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
