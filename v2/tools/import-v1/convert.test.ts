/**
 * The pure v1 → v2 conversion, on session JSON shaped like v1's own (`test/session_test.dart`,
 * `Session.toJson`, `parkedMaps` from `Session.switchTo`).
 */
import { describe, expect, test } from 'bun:test';
import { check, Game, maskCells, wholeGrid, type FileRef, type MapInfo } from '../../shared/src/index.ts';
import { argbHex, argbIntHex, convertDisc, convertSession, convertSettings, convertView, type ConvertedMap } from './convert.ts';
import type { V1Session } from './v1.ts';

const ref = (c: string, ext: FileRef['ext'] = 'png'): FileRef => ({ hash: c.repeat(64).slice(0, 64), ext, bytes: 100 });

/** A converted map of `cols × rows` squares at `ppg` px. */
function map(id: string, cols: number, rows: number, ppg: number, doors = 0, kind: MapInfo['kind'] = 'uvtt'): ConvertedMap {
  return {
    ppg,
    info: {
      id, name: `Map ${id}`, kind, picture: ref('a'), tableCopy: null, geometry: kind === 'uvtt' ? ref('b', 'json') : null,
      grid: wholeGrid(cols, rows, cols * ppg, rows * ppg), drawGrid: true, doorCount: doors, drawDoors: false, libraryId: null,
    },
  };
}

/** A v1 session as `Session.toJson` writes it (two maps: the tower ground on the table, upper parked). */
function session(): V1Session {
  return {
    id: '7f1c2a9e-4b1d-4c2e-9a77-0d5c3e9b1f20',
    mapId: 'ground',
    name: 'Session 2 · Sat 10 Oct',
    createdAt: '2026-10-10T18:00:00.000',
    lastModifiedAt: '2026-10-10T21:30:00.000',
    revealedCells: [0, 1, 2, 12, 120, 9999],
    openPortals: [0, 2, 7],
    showGrid: false,
    fogEnabled: true,
    showWalls: false,
    brushRadius: 2,
    revealMode: true,
    tvCameraMode: 'table',
    tableCol: 3,
    tableRow: null,
    mapFit: { cellPx: 64, tvZoom: 0.4, drawGrid: false, screenWidthInches: 47.5 } as never,
    tokenData: [
      { id: 'tk1', label: '1', color: 'ffe53935', gridX: 3, gridY: 4 },
      { id: 'tk2', label: 'BOSS-LONG-LABEL', color: 'ff1e88e5', gridX: 7, gridY: 1, placed: false, hidden: true, name: 'Strahd', maxHp: 120, currentHp: 80, conditions: ['charmed'] },
    ],
    strokeData: [
      { points: [[64, 128], [128, 128], [192, 192]], color: 'ff43a047', width: 6.4 },
      { points: [], color: 'ff43a047', width: 3 },
    ],
    drawColorValue: 0xffe53935,
    drawWidth: 3,
    interactionMode: 'fogReveal',
    isPdfSession: false,
    isImageSession: false,
    rulerVisible: true,
    rulerX: 4.5,
    rulerY: 6,
    rulerRotation: 270,
    templateDisc: {
      visible: true, x: 5.5, y: 5.5, rotation: 30,
      rings: { visible: true, sizes: [20, 5, 10, 10], color: 0xffe0402c, line: 'solid', labels: false },
      cubes: { visible: false, sizes: [10], color: 0xff141414, line: 'dotted', labels: true },
      coneAnchor: 'center', coneDegrees: 53.13, centerMark: false, markers: 36, rim: true, tint: 0.2, lineWidth: 0.3, labelSize: 0.08, snap: 'squareCenters',
    },
    dmOverlayData: [
      { id: 'l1', name: 'DM map.png', url: 'http://72.62.88.197:4242/uploads/dm/DM%20map.png', visible: true, opacity: 0.6 },
      { id: 'l2', name: 'gone.png', url: 'http://72.62.88.197:4242/uploads/dm/gone.png' },
    ],
    mapIds: ['ground', 'upper', 'lost'],
    parkedMaps: {
      upper: {
        revealedCells: [5, 6], openPortals: [1], showGrid: true, fogEnabled: false, tvCameraMode: 'free', tableCol: null, tableRow: null,
        tokenData: [], strokeData: [], cameraX: 352, cameraY: 352, cameraZoom: 0.5, cameraAngle: Math.PI / 2,
      },
    },
    settings: { fogOfWar: true, shadowMode: true, drawingTools: false, measureTool: true, hpBars: true, fogMode: 'cloud', fogAnimation: false, fogEdgeInset: 20, globalEffects: true, lightAnimations: true },
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    cameraAngle: 0,
  };
}

const maps = new Map<string, ConvertedMap>([['ground', map('ground', 11, 11, 64, 3)], ['upper', map('upper', 11, 11, 64, 2)]]);
const layers = new Map<string, FileRef>([['http://72.62.88.197:4242/uploads/dm/DM%20map.png', ref('c')]]);

describe('v1 game conversion', () => {
  const { game, issues } = convertSession(session(), maps, layers);

  test('makes a game the shared schema accepts, maps in v1 order, the table map active', () => {
    expect(game).not.toBeNull();
    expect(check(Game, game).ok).toBe(true);
    expect(game!.id).toBe('7f1c2a9e-4b1d-4c2e-9a77-0d5c3e9b1f20');
    expect(game!.name).toBe('Session 2 · Sat 10 Oct');
    expect(game!.mapOrder).toEqual(['ground', 'upper']);
    expect(game!.activeMapId).toBe('ground');
    expect(game!.createdAt).toMatch(/^2026-10-10T/);
  });

  test('fog and doors: cells kept as row × cols + col, out-of-range ones dropped and reported', () => {
    const g = game!.maps.ground!;
    expect(maskCells(g.fog.revealed, 121)).toEqual([0, 1, 2, 12, 120]);
    expect(g.doorsOpen).toEqual([0, 2]);
    expect(issues.some((i) => i.includes('1 revealed square(s) outside'))).toBe(true);
    expect(issues.some((i) => i.includes("1 open door(s) the map doesn't have"))).toBe(true);
    const u = game!.maps.upper!;
    expect(maskCells(u.fog.revealed, 121)).toEqual([5, 6]);
    expect(u.fog.on).toBe(false);
    expect(u.doorsOpen).toEqual([1]);
  });

  test('tokens keep place, colour, hidden and waiting; HP and conditions are reported as dropped', () => {
    const t = game!.maps.ground!.tokens;
    expect(t[0]).toEqual({ id: 'tk1', label: '1', name: '', color: '#e53935', col: 3, row: 4, placed: true, hidden: false });
    expect(t[1]).toMatchObject({ id: 'tk2', label: 'BOSS-LON', name: 'Strahd', color: '#1e88e5', placed: false, hidden: true });
    expect(issues.some((i) => i.includes('HP and conditions dropped'))).toBe(true);
  });

  test('drawings go from world pixels to squares (mapFit.cellPx), empty ones are dropped', () => {
    const s = game!.maps.ground!.strokes;
    expect(s).toHaveLength(1);
    expect(s[0]!.points).toEqual([1, 2, 2, 2, 3, 3]);
    expect(s[0]!.width).toBeCloseTo(0.1);
    expect(s[0]!.color).toBe('#43a047');
  });

  test('DM layers point at the copied pictures; a missing one is reported', () => {
    const l = game!.maps.ground!.layers;
    expect(l).toEqual([{ id: 'l1', name: 'DM map.png', file: ref('c'), visible: true, opacity: 0.6 }]);
    expect(issues.some((i) => i.includes('DM layer "gone.png"'))).toBe(true);
  });

  test('ruler, disc, view and grid lines', () => {
    const g = game!.maps.ground!;
    expect(g.ruler).toEqual({ visible: true, x: 4.5, y: 6, rotation: 270 });
    expect(g.disc).toMatchObject({ visible: true, x: 5.5, y: 5.5, rotation: 30, coneAnchor: 'center', markers: 24, labelSize: 0.08, snap: 'squareCenters', centerMark: false, tint: 0.2 });
    expect(g.disc.rings).toEqual({ visible: true, sizes: [5, 10, 20], color: '#e0402c', line: 'solid', labels: false });
    expect(g.disc.cones.sizes).toEqual([15, 30]); // missing family: the classic disc's
    expect(g.view).toEqual({ mode: 'table', col: 3, row: null, quarterTurns: 0, free: null });
    expect(g.showGrid).toBe(false);
    const u = game!.maps.upper!;
    expect(u.view).toEqual({ mode: 'free', col: null, row: null, quarterTurns: 1, free: { x: 5.5, y: 5.5, zoom: 32 } });
  });

  test('settings: fog look, trim, fade, effects, lights, preview first, tabs; digital ones reported', () => {
    expect(game!.settings).toEqual({ fogStyle: 'cloud', fogEdgeInset: 20, fogFade: false, effects: true, mapLights: true, drawTools: false, measureTools: true });
    expect(game!.previewFirst).toBe(true);
    expect(issues.some((i) => i.includes('dropped: hpBars'))).toBe(true);
  });

  test('a map that could not be converted is left out and reported', () => {
    expect(issues.some((i) => i.includes('map lost: not converted'))).toBe(true);
  });

  test('a session from before several maps (no mapIds / parkedMaps / settings) converts with defaults', () => {
    const old: V1Session = { id: 'old', mapId: 'ground', name: 'Session 1', createdAt: '2026-09-01T10:00:00.000', revealedCells: [3], openPortals: [], showGrid: true, fogEnabled: true, cameraX: 0, cameraY: 0, cameraZoom: 1, cameraAngle: 0 };
    const r = convertSession(old, maps, layers);
    expect(r.game!.mapOrder).toEqual(['ground']);
    expect(r.game!.settings).toEqual(convertSettings(null));
    expect(r.game!.maps.ground!.disc.visible).toBe(false);
  });

  test('a game whose maps all failed is not made', () => {
    const r = convertSession({ ...session(), mapId: 'lost', mapIds: ['lost'] }, maps, layers);
    expect(r.game).toBeNull();
  });

  test('a fogOfWar-off game shows no fog on any map', () => {
    const s = session();
    s.settings = { ...s.settings, fogOfWar: false };
    const r = convertSession(s, maps, layers);
    expect(Object.values(r.game!.maps).every((m) => !m.fog.on)).toBe(true);
  });
});

describe('v1 value helpers', () => {
  test('colours', () => {
    expect(argbHex('ffe53935', '#000000')).toBe('#e53935');
    expect(argbHex('#1E88E5', '#000000')).toBe('#1e88e5');
    expect(argbHex('nope', '#123456')).toBe('#123456');
    expect(argbIntHex(0xff1f4fb8, '#000000')).toBe('#1f4fb8');
    expect(argbIntHex(undefined, '#000000')).toBe('#000000');
  });

  test('a missing disc is the classic one; a view without a known mode is the table', () => {
    expect(convertDisc(null).rings.sizes).toEqual([5, 10, 15, 20]);
    expect(convertView({ tvCameraMode: 'weird', cameraAngle: -Math.PI / 2 }, 64)).toEqual({ mode: 'table', col: null, row: null, quarterTurns: 3, free: null });
  });
});
