/**
 * Every command the reducer understands — the only way the replicated state changes. A
 * command carries explicit values (never "toggle"), and everything the reducer can't make
 * itself (ids, names, times) is inside it. The catalogue with the old protocol's names is in
 * `docs/protocol.md` "commands".
 */
import * as v from 'valibot';
import { Cell, Id, Int, Name, Num, Positive } from '../model/basics.ts';
import { TemplateDisc } from '../model/disc.ts';
import { OneShot, PlacedEffect } from '../model/effect.ts';
import { GameSettings, TvMode } from '../model/game.ts';
import { MapInfo, RasterGrid } from '../model/map.ts';
import { DmLayer, MeasureLine, Ruler, Stroke, Token } from '../model/pieces.ts';
import { CalibrationPivot } from '../model/table.ts';

/** Reveal (the players see it) or hide (fog back on). */
export const FogValue = v.picklist(['reveal', 'hide']);

/** Most squares one fog command may name. */
const MAX_CELLS = 250_000;

// ── fog ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Reveals or hides squares on the map on the table — the brush, a room fill, a circle, a tap.
 * The companion works out the squares (`circleCells`, `floodFill`, `floodFillWithin`). With the
 * game's preview on they are staged instead. `live: 'start'` keeps the preview as it was before
 * this circle so a later `live: 'replace'` with the same gesture can swap the circle (radius
 * − / +); any other fog command ends that.
 */
export const FogApply = v.object({
  type: v.literal('fog.apply'),
  /** The squares. */
  cells: v.pipe(v.array(Cell), v.maxLength(MAX_CELLS)),
  /** Reveal or hide them. */
  value: FogValue,
  /** The stroke or tap this belongs to (one undo step per gesture). */
  gesture: Id,
  /** Circle preview handling, see above. */
  live: v.optional(v.picklist(['start', 'replace'])),
});

/** Reveals or hides the whole map (staged with the preview on). */
export const FogAll = v.object({
  type: v.literal('fog.all'),
  /** Reveal or hide everything. */
  value: FogValue,
});

/** Turns the fog of the map on the table on or off. */
export const FogEnable = v.object({
  type: v.literal('fog.enable'),
  /** On or off. */
  on: v.boolean(),
});

/** "Players see changes: Preview first" on or off; off discards what is staged on every map. */
export const FogPreview = v.object({
  type: v.literal('fog.preview'),
  /** Preview first (true) or instantly (false). */
  on: v.boolean(),
});

/** Applies the staged preview of the map on the table (one undo step). */
export const FogCommit = v.object({ type: v.literal('fog.commit') });

/** Throws the staged preview away. */
export const FogDiscard = v.object({ type: v.literal('fog.discard') });

// ── doors ───────────────────────────────────────────────────────────────────────────────────

/** Opens or closes a door of the map on the table. */
export const DoorSet = v.object({
  type: v.literal('door.set'),
  /** The door's index in the map's geometry. */
  index: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /** Open (true) or closed. */
  open: v.boolean(),
});

// ── tokens ──────────────────────────────────────────────────────────────────────────────────

/** Adds a token (placed on a square, or waiting in the list with `placed: false`). */
export const TokenAdd = v.object({
  type: v.literal('token.add'),
  /** The new token (a new id). */
  token: Token,
});

/** Moves a token to a square, placing it if it was off the map. A drag is one gesture. */
export const TokenMove = v.object({
  type: v.literal('token.move'),
  /** The token. */
  id: Id,
  /** Target column (clamped to the map). */
  col: Int,
  /** Target row (clamped to the map). */
  row: Int,
  /** The drag this belongs to (one undo step). */
  gesture: v.optional(Id),
});

/** Renames, recolours, relabels, hides or shows a token. */
export const TokenUpdate = v.object({
  type: v.literal('token.update'),
  /** The token. */
  id: Id,
  /** New name. */
  name: v.optional(Name),
  /** New label. */
  label: v.optional(v.pipe(v.string(), v.maxLength(8))),
  /** New colour. */
  color: v.optional(Token.entries.color),
  /** Hidden from the players or not. */
  hidden: v.optional(v.boolean()),
  /** Off the map again (false) — the token stays in the list. */
  placed: v.optional(v.literal(false)),
});

/** Removes a token. */
export const TokenRemove = v.object({
  type: v.literal('token.remove'),
  /** The token. */
  id: Id,
});

/** Removes every token of the map on the table. */
export const TokenClear = v.object({ type: v.literal('token.clear') });

// ── drawing ─────────────────────────────────────────────────────────────────────────────────

/** Adds a finished stroke (and ends the live one). */
export const DrawAdd = v.object({
  type: v.literal('draw.add'),
  /** The stroke (a new id). */
  stroke: Stroke,
});

/** Removes one stroke. */
export const DrawRemove = v.object({
  type: v.literal('draw.remove'),
  /** The stroke. */
  id: Id,
});

/** Removes every stroke of the map on the table. */
export const DrawClear = v.object({ type: v.literal('draw.clear') });

/** The stroke being drawn right now (shown live on the TV), or null when it ended. */
export const DrawLive = v.object({
  type: v.literal('draw.live'),
  /** The stroke so far, or null. */
  stroke: v.nullable(Stroke),
});

// ── tools ───────────────────────────────────────────────────────────────────────────────────

/** The measure line being dragged, or null to clear it. */
export const MeasureSet = v.object({
  type: v.literal('measure.set'),
  /** The line, or null. */
  line: v.nullable(MeasureLine),
});

/** Shows, hides, moves or turns the ruler (the whole new value). */
export const RulerSet = v.object({
  type: v.literal('ruler.set'),
  /** The ruler. */
  ruler: Ruler,
});

/** Shows, hides, moves, turns or reshapes the template disc (the whole new value). */
export const DiscSet = v.object({
  type: v.literal('disc.set'),
  /** The disc. */
  disc: TemplateDisc,
});

/** Replaces the DM layers of the map on the table (the whole list, bottom first). */
export const LayersSet = v.object({
  type: v.literal('layers.set'),
  /** The layers. */
  layers: v.pipe(v.array(DmLayer), v.maxLength(50)),
});

// ── the TV's view of the map on the table ───────────────────────────────────────────────────

/** One inch per square, whole map, or free camera. */
export const ViewMode = v.object({
  type: v.literal('view.mode'),
  /** The mode. */
  mode: TvMode,
});

/** Puts the table window's first square here (null = centred on that axis). */
export const ViewWindow = v.object({
  type: v.literal('view.window'),
  /** First column, or null. */
  col: v.nullable(Int),
  /** First row, or null. */
  row: v.nullable(Int),
});

/** Moves the table window by whole squares. */
export const ViewPan = v.object({
  type: v.literal('view.pan'),
  /** Squares right (negative = left). */
  dx: Int,
  /** Squares down (negative = up). */
  dy: Int,
});

/** Turns the TV's view (the table window keeps its centre). */
export const ViewRotate = v.object({
  type: v.literal('view.rotate'),
  /** Quarter turns clockwise, 0–3. */
  quarterTurns: v.picklist([0, 1, 2, 3]),
});

/** A free TV camera (leaves the table view). */
export const ViewFree = v.object({
  type: v.literal('view.free'),
  /** Centre x in squares. */
  x: Num,
  /** Centre y in squares. */
  y: Num,
  /** Screen px per square. */
  zoom: Positive,
});

/** battlemap's grid lines on or off for the map on the table. */
export const ViewGrid = v.object({
  type: v.literal('view.grid'),
  /** On or off. */
  on: v.boolean(),
});

// ── the table (the TV itself) ───────────────────────────────────────────────────────────────

/** The TV's picture is this wide (clamped to 10–90 in). */
export const TableCalibrate = v.object({
  type: v.literal('table.calibrate'),
  /** Width in inches. */
  widthInches: Positive,
});

/** The TV set cuts this much off each edge (clamped to 0–12 %). */
export const TableOverscan = v.object({
  type: v.literal('table.overscan'),
  /** Percent per edge. */
  percent: v.pipe(v.number(), v.finite()),
});

/** Back to auto: 34.5 in, no overscan. */
export const TableReset = v.object({ type: v.literal('table.reset') });

/** Shows or hides the calibration pattern. */
export const TablePattern = v.object({
  type: v.literal('table.pattern'),
  /** On or off. */
  on: v.boolean(),
  /** Where the measuring bar starts (kept when missing). */
  pivot: v.optional(CalibrationPivot),
});

/** The TV reports its viewport (CSS px). Sent by the TV itself. */
export const TableViewport = v.object({
  type: v.literal('table.viewport'),
  /** Width in px. */
  width: Positive,
  /** Height in px. */
  height: Positive,
});

// ── maps in the game ────────────────────────────────────────────────────────────────────────

/** A map joins the game (and goes on the table with `activate`). */
export const MapAdd = v.object({
  type: v.literal('map.add'),
  /** The map (an id new to the game). */
  map: MapInfo,
  /** Put it on the table now. */
  activate: v.boolean(),
});

/** Puts another of the game's maps on the table. */
export const MapSwitch = v.object({
  type: v.literal('map.switch'),
  /** The map. */
  mapId: Id,
});

/** Takes a map out of the game (not the last one). */
export const MapRemove = v.object({
  type: v.literal('map.remove'),
  /** The map. */
  mapId: Id,
});

/** Renames a map in this game. */
export const MapRename = v.object({
  type: v.literal('map.rename'),
  /** The map. */
  mapId: Id,
  /** Its new name. */
  name: Name,
});

/**
 * Lays a new picture grid on the picture map on the table: the same counts keep the fog and
 * the window; new counts start the fog over.
 */
export const MapRegrid = v.object({
  type: v.literal('map.regrid'),
  /** The new grid. */
  grid: RasterGrid,
  /** Whether battlemap draws grid lines (kept when missing). */
  drawGrid: v.optional(v.boolean()),
});

// ── effects ─────────────────────────────────────────────────────────────────────────────────

/** Adds a lasting effect to the map on the table, or replaces the one with its id. */
export const FxPlace = v.object({
  type: v.literal('fx.place'),
  /** The effect. */
  effect: PlacedEffect,
});

/** Removes a lasting effect. */
export const FxRemove = v.object({
  type: v.literal('fx.remove'),
  /** The effect. */
  id: Id,
});

/** Plays a one-shot effect on every screen. */
export const FxTrigger = v.object({
  type: v.literal('fx.trigger'),
  /** The shot. */
  shot: OneShot,
});

// ── the game ────────────────────────────────────────────────────────────────────────────────

/** Renames the open game. */
export const GameRename = v.object({
  type: v.literal('game.rename'),
  /** The new name. */
  name: Name,
});

/** Changes some of the open game's settings. */
export const GameSettingsSet = v.object({
  type: v.literal('game.settings'),
  /** The settings to change. */
  settings: v.partial(GameSettings),
});

// ── history ─────────────────────────────────────────────────────────────────────────────────

/** Takes the last step back. */
export const HistoryUndo = v.object({ type: v.literal('history.undo') });

/** Puts the last undone step back. */
export const HistoryRedo = v.object({ type: v.literal('history.redo') });

/** Any command. */
export const Command = v.variant('type', [
  FogApply, FogAll, FogEnable, FogPreview, FogCommit, FogDiscard,
  DoorSet,
  TokenAdd, TokenMove, TokenUpdate, TokenRemove, TokenClear,
  DrawAdd, DrawRemove, DrawClear, DrawLive,
  MeasureSet, RulerSet, DiscSet, LayersSet,
  ViewMode, ViewWindow, ViewPan, ViewRotate, ViewFree, ViewGrid,
  TableCalibrate, TableOverscan, TableReset, TablePattern, TableViewport,
  MapAdd, MapSwitch, MapRemove, MapRename, MapRegrid,
  FxPlace, FxRemove, FxTrigger,
  GameRename, GameSettingsSet,
  HistoryUndo, HistoryRedo,
]);
/** Any command; see the schema of the same name. */
export type Command = v.InferOutput<typeof Command>;

/** The name of a command (`fog.apply`, …). */
export type CommandType = Command['type'];

/** The command of one type. */
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;


/**
 * Commands that act on "the map on the table" implicitly (rv#28). A `sync.cmd` may say which map
 * its sender saw there (`onMap`); the TV refuses such a command when another map is on the table
 * by then, so fog cells or a token meant for one map never land on the next (two companions, one
 * switching maps while the other paints). Table, game and map-list commands are not in the list.
 */
export const MAP_SCOPED_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  'fog.apply', 'fog.all', 'fog.enable', 'fog.preview', 'fog.commit', 'fog.discard',
  'door.set',
  'token.add', 'token.move', 'token.update', 'token.remove', 'token.clear',
  'draw.add', 'draw.remove', 'draw.clear', 'draw.live',
  'measure.set', 'ruler.set', 'disc.set', 'layers.set',
  'view.mode', 'view.window', 'view.pan', 'view.rotate', 'view.free', 'view.grid',
  'map.regrid',
  'fx.place', 'fx.remove',
]);

/**
 * Why the TV refuses a map-scoped command sent for another map, or null when it applies.
 *
 * @param activeMapId - the map on the table now (null: no game)
 * @param cmd - the command
 * @param onMap - the map its sender saw on the table, if it said
 * @returns the reason, or null
 */
export function staleMapReason(activeMapId: string | null, cmd: Command, onMap: string | undefined): string | null {
  if (onMap === undefined || activeMapId === null || onMap === activeMapId) return null;
  if (!MAP_SCOPED_COMMANDS.has(cmd.type)) return null;
  return 'The map on the table changed — that wasn’t applied.';
}
