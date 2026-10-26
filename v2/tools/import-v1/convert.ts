/**
 * v1 game → v2 `Game`: the pure half of the v1 import (no IO). The maps are converted first
 * (`maps.ts`: files uploaded, `MapInfo` made); this module turns a v1 session's state into the
 * v2 model on top of them and says, per game, what it could not carry over.
 *
 * Units: v1 keeps tokens, the ruler and the disc in squares (as v2), but drawings and the camera
 * in *world pixels* — square k starts at k × the map's pixels per square (`ppg`: the `.dd2vtt`'s
 * `pixels_per_grid`, a picture map's rounded square width; the session's `mapFit.cellPx` when it
 * has one). Fog cells are `row × cols + col` in both.
 *
 * @see ./v1.ts for the v1 shapes
 * @see ../../docs/features.md "v1 import"
 */
import {
  check, classicDisc, defaultCurtain, defaultSettings, Game, maskFromCells, newId, newMapPlay,
  type Color, type DiscShapeSet, type DmLayer, type FileRef, type GameSettings, type MapInfo, type MapPlay,
  type MapView, type Stroke, type TemplateDisc, type Token,
} from '../../shared/src/index.ts';
import { mapIdsOf, mapStateOf, type V1Disc, type V1DiscShapeSet, type V1MapState, type V1Session, type V1Settings, type V1Stroke, type V1Token } from './v1.ts';

/** A v1 map after its files went up to the v2 server. */
export interface ConvertedMap {
  /** The v2 map (its `id` is the shared library id when it has one, else v1's map id). */
  info: MapInfo;
  /** v1's world pixels per square for this map (strokes and the camera are in world pixels). */
  ppg: number;
}

/** What converting one game gave. */
export interface ConvertedGame {
  /** The game, checked against the shared schema, or null when nothing of it could be kept. */
  game: Game | null;
  /** What was dropped or changed, in words for the report. */
  issues: string[];
}

/** Longest id the shared schema takes. */
const MAX_ID = 64;

/**
 * An ARGB or RGB hex colour of v1 (`ffe53935`, `e53935`, with or without `#`) as `#rrggbb`.
 *
 * @param c - v1's colour text
 * @param fallback - what to use when it can't be read
 * @returns the colour
 */
export function argbHex(c: unknown, fallback: Color): Color {
  const hex = String(c ?? '').replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return fallback;
}

/**
 * An ARGB int of v1 (the template disc's colours) as `#rrggbb`.
 *
 * @param c - the int
 * @param fallback - what to use when it isn't a number
 * @returns the colour
 */
export function argbIntHex(c: unknown, fallback: Color): Color {
  if (typeof c !== 'number' || !Number.isFinite(c)) return fallback;
  return `#${(Math.trunc(c) & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** A number clamped into a range, `fallback` when it isn't a finite number. */
function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** A finite number, or `fallback`. */
function num(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * A v1 game's settings as v2's. Tool settings and the dormant digital-mode switches have no
 * place in v2 and are left out (`droppedSettings` names the ones that were on).
 *
 * @param s - v1's settings (missing = v1's tabletop defaults)
 * @returns the v2 settings
 */
export function convertSettings(s: V1Settings | null | undefined): GameSettings {
  const base = defaultSettings();
  if (!s) return base;
  const styles = ['standard', 'soft', 'cloud', 'atmospheric'] as const;
  const style = styles.find((x) => x === s.fogMode) ?? base.fogStyle;
  return {
    fogStyle: style,
    fogEdgeInset: Math.round(clamp(s.fogEdgeInset, 0, 45, base.fogEdgeInset)),
    fogFade: s.fogAnimation ?? base.fogFade,
    effects: s.globalEffects ?? base.effects,
    mapLights: s.lightAnimations ?? false,
    drawTools: s.drawingTools ?? true,
    measureTools: s.measureTool ?? true,
  };
}

/**
 * The v1 settings that were switched on but don't exist in v2 (digital mode, features v1 never
 * built), for the report.
 *
 * @param s - v1's settings
 * @returns their names
 */
export function droppedSettings(s: V1Settings | null | undefined): string[] {
  if (!s) return [];
  const gone: (keyof V1Settings)[] = ['hpBars', 'conditions', 'aoeTemplates', 'initiativeTracker', 'ambientSound', 'weatherEffects'];
  return gone.filter((k) => s[k] === true);
}

/** One family of v1's disc as v2's. */
function shapeSet(v1: V1DiscShapeSet | undefined, base: DiscShapeSet): DiscShapeSet {
  if (!v1) return base;
  const sizes = [...new Set((v1.sizes ?? base.sizes).filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0))].sort((a, b) => a - b).slice(0, 12);
  return {
    visible: v1.visible ?? base.visible,
    sizes,
    color: argbIntHex(v1.color, base.color),
    line: v1.line === 'solid' || v1.line === 'dotted' ? v1.line : base.line,
    labels: v1.labels ?? base.labels,
  };
}

/**
 * v1's template disc as v2's (same fields; colours from ARGB ints, ranges clamped to v2's).
 *
 * @param d - v1's disc, or null for a game that never touched it
 * @returns the disc
 */
export function convertDisc(d: V1Disc | null | undefined): TemplateDisc {
  const base = classicDisc();
  if (!d) return base;
  const anchors = ['sharedBase', 'center'] as const;
  const snaps = ['none', 'squareCenters', 'squareCorners'] as const;
  return {
    visible: d.visible ?? false,
    x: num(d.x, 0),
    y: num(d.y, 0),
    rotation: ((num(d.rotation, 0) % 360) + 360) % 360,
    rings: shapeSet(d.rings, base.rings),
    cubes: shapeSet(d.cubes, base.cubes),
    cones: shapeSet(d.cones, base.cones),
    coneAnchor: anchors.find((a) => a === d.coneAnchor) ?? base.coneAnchor,
    coneDegrees: clamp(d.coneDegrees, 10, 180, base.coneDegrees),
    centerMark: d.centerMark ?? base.centerMark,
    markers: Math.round(clamp(d.markers, 0, 24, base.markers)),
    rim: d.rim ?? base.rim,
    tint: clamp(d.tint, 0, 0.8, base.tint),
    lineWidth: clamp(d.lineWidth, 0.01, 0.5, base.lineWidth),
    labelSize: clamp(d.labelSize, 0.05, 1, base.labelSize),
    snap: snaps.find((s) => s === d.snap) ?? base.snap,
  };
}

/**
 * v1's tokens as v2's. HP and conditions (the dormant digital mode) are dropped.
 *
 * @param tokens - v1's tokens
 * @param issues - gets a line when something was dropped
 * @returns the tokens
 */
export function convertTokens(tokens: V1Token[] | undefined, issues: string[]): Token[] {
  const out: Token[] = [];
  const seen = new Set<string>();
  let digital = 0;
  for (const t of tokens ?? []) {
    if ((t.maxHp ?? 0) > 0 || (t.currentHp ?? 0) > 0 || (t.conditions?.length ?? 0) > 0) digital++;
    let id = String(t.id || newId()).slice(0, MAX_ID);
    if (seen.has(id)) id = newId();
    seen.add(id);
    out.push({
      id,
      label: String(t.label ?? '').slice(0, 8),
      name: String(t.name ?? '').slice(0, 200),
      color: argbHex(t.color, '#e53935'),
      col: Math.round(num(t.gridX, 0)),
      row: Math.round(num(t.gridY, 0)),
      placed: t.placed ?? true,
      hidden: t.hidden ?? false,
    });
  }
  if (digital > 0) issues.push(`${digital} token(s): HP and conditions dropped (digital mode)`);
  return out;
}

/**
 * v1's drawings (world pixels) as v2's (squares).
 *
 * @param strokes - v1's strokes
 * @param ppg - world pixels per square
 * @param issues - gets a line for strokes that had to be dropped or shortened
 * @returns the strokes
 */
export function convertStrokes(strokes: V1Stroke[] | undefined, ppg: number, issues: string[]): Stroke[] {
  const out: Stroke[] = [];
  let empty = 0;
  let cut = 0;
  for (const s of strokes ?? []) {
    const flat: number[] = [];
    for (const p of s.points ?? []) {
      const x = p?.[0];
      const y = p?.[1];
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) flat.push(x / ppg, y / ppg);
    }
    if (flat.length < 2) {
      empty++;
      continue;
    }
    if (flat.length > 20_000) {
      flat.length = 20_000;
      cut++;
    }
    out.push({ id: newId(), points: flat, color: argbHex(s.color, '#e53935'), width: Math.max(0.01, num(s.width, 3) / ppg) });
  }
  if (empty > 0) issues.push(`${empty} drawing(s) without points dropped`);
  if (cut > 0) issues.push(`${cut} very long drawing(s) shortened to 10 000 points`);
  return out;
}

/**
 * v1's DM layers as v2's, with their pictures already uploaded.
 *
 * @param layers - v1's layers
 * @param files - uploaded pictures by v1 URL (missing = the picture couldn't be fetched)
 * @param issues - gets a line per layer whose picture is missing
 * @returns the layers that could be kept
 */
export function convertLayers(layers: V1MapState['dmOverlayData'], files: ReadonlyMap<string, FileRef>, issues: string[]): DmLayer[] {
  const out: DmLayer[] = [];
  for (const l of layers ?? []) {
    const file = files.get(l.url);
    if (!file) {
      issues.push(`DM layer "${l.name ?? l.id}": picture not found (${l.url})`);
      continue;
    }
    out.push({
      id: String(l.id || newId()).slice(0, MAX_ID),
      name: String(l.name ?? 'Layer').slice(0, 200),
      file,
      visible: l.visible ?? true,
      opacity: clamp(l.opacity, 0, 1, 0.6),
    });
  }
  return out;
}

/**
 * How v1's TV framed a map, as v2's view. The camera (free mode) goes from world pixels to
 * squares; v1's angle in radians becomes quarter turns.
 *
 * @param st - the map's v1 state
 * @param ppg - world pixels per square
 * @returns the view
 */
export function convertView(st: V1MapState, ppg: number): MapView {
  const modes = ['table', 'fit', 'free'] as const;
  const mode = modes.find((m) => m === st.tvCameraMode) ?? 'table';
  const q = ((Math.round(num(st.cameraAngle, 0) / (Math.PI / 2)) % 4) + 4) % 4;
  const int = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
  const zoom = num(st.cameraZoom, 0) * ppg;
  const free = mode === 'free' && zoom > 0 ? { x: num(st.cameraX, 0) / ppg, y: num(st.cameraY, 0) / ppg, zoom } : null;
  return { mode, col: int(st.tableCol), row: int(st.tableRow), quarterTurns: q as 0 | 1 | 2 | 3, free };
}

/**
 * One map's v1 state as a v2 `MapPlay`. A map the session lists but never played (no state)
 * starts fresh, as v1 would start it.
 *
 * @param map - the converted map
 * @param st - its v1 state, or null
 * @param files - uploaded DM layer pictures by v1 URL
 * @param issues - gets what was dropped
 * @returns the play state
 */
export function convertMapPlay(map: ConvertedMap, st: V1MapState | null, files: ReadonlyMap<string, FileRef>, issues: string[]): MapPlay {
  const play = newMapPlay(map.info);
  if (!st) return play;
  const { cols, rows } = map.info.grid;
  const cells = cols * rows;
  const ppg = st.mapFit?.cellPx && st.mapFit.cellPx > 0 ? st.mapFit.cellPx : map.ppg;
  const name = map.info.name;

  const revealed = (st.revealedCells ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < cells);
  const outside = (st.revealedCells?.length ?? 0) - revealed.length;
  if (outside > 0) issues.push(`${name}: ${outside} revealed square(s) outside the map dropped`);
  const doors = [...new Set((st.openPortals ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d < map.info.doorCount))].sort((a, b) => a - b);
  if ((st.openPortals?.length ?? 0) > doors.length) issues.push(`${name}: ${(st.openPortals?.length ?? 0) - doors.length} open door(s) the map doesn't have dropped`);

  const local: string[] = [];
  const out: MapPlay = {
    ...play,
    fog: { on: st.fogEnabled ?? true, revealed: maskFromCells(cells, revealed), staged: null, live: null },
    doorsOpen: doors,
    tokens: convertTokens(st.tokenData, local),
    strokes: convertStrokes(st.strokeData, ppg, local),
    layers: convertLayers(st.dmOverlayData, files, local),
    ruler: {
      visible: st.rulerVisible ?? false,
      x: num(st.rulerX, 0),
      y: num(st.rulerY, 0),
      rotation: ((((Math.round(num(st.rulerRotation, 0) / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270,
    },
    disc: convertDisc(st.templateDisc),
    view: convertView(st, ppg),
    showGrid: st.showGrid ?? map.info.drawGrid,
  };
  for (const l of local) issues.push(`${name}: ${l}`);
  return out;
}

/**
 * A v1 session as a v2 game. Maps that couldn't be converted are left out (and said so); a game
 * without any map left is not made.
 *
 * @param s - the v1 session (`lib.listing`)
 * @param maps - converted maps by v1 map id
 * @param files - uploaded DM layer pictures by v1 URL
 * @returns the game (checked against the shared schema) or null, and what was dropped
 */
export function convertSession(s: V1Session, maps: ReadonlyMap<string, ConvertedMap>, files: ReadonlyMap<string, FileRef>): ConvertedGame {
  const issues: string[] = [];
  const v1Ids = mapIdsOf(s);
  const plays: Record<string, MapPlay> = {};
  const order: string[] = [];
  let active: string | null = null;
  for (const v1Id of v1Ids) {
    const map = maps.get(v1Id);
    if (!map) {
      issues.push(`map ${v1Id}: not converted (its file could not be fetched) — left out`);
      continue;
    }
    let info = map.info;
    if (plays[info.id]) info = { ...info, id: `${info.id.slice(0, MAX_ID - 13)}-${newId()}` }; // the same file twice in one game
    plays[info.id] = convertMapPlay({ ...map, info }, mapStateOf(s, v1Id), files, issues);
    order.push(info.id);
    if (v1Id === s.mapId) active = info.id;
  }
  if (order.length === 0) return { game: null, issues: [...issues, 'no map of this game could be converted — game not imported'] };
  if (!active) issues.push('the map on the table was not converted — the game opens on its first map');
  const dropped = droppedSettings(s.settings);
  if (dropped.length > 0) issues.push(`settings without a v2 counterpart dropped: ${dropped.join(', ')}`);
  if (s.settings?.fogOfWar === false) {
    for (const id of order) plays[id] = { ...plays[id]!, fog: { ...plays[id]!.fog, on: false } };
  }
  const created = Number.isNaN(Date.parse(s.createdAt)) ? new Date().toISOString() : new Date(s.createdAt).toISOString();
  const game = {
    id: String(s.id).slice(0, MAX_ID),
    name: String(s.name || 'Imported game').slice(0, 200),
    createdAt: created,
    settings: convertSettings(s.settings),
    previewFirst: s.settings?.shadowMode ?? false,
    mapOrder: order,
    activeMapId: active ?? order[0]!,
    maps: plays,
    curtain: defaultCurtain(),
    scenes: [],
  };
  const r = check(Game, game);
  if (!r.ok) return { game: null, issues: [...issues, `the converted game failed the check: ${r.error}`] };
  return { game: r.value, issues };
}
