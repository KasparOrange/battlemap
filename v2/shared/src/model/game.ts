/**
 * A game (the old app's "session"): its maps, and for each map everything that happened on it
 * — fog, doors, tokens, drawings, layers, tools, effects and how the TV frames it.
 */
import * as v from 'valibot';
import { Count, Id, IsoTime, Mask, Name, Num, Positive } from './basics.ts';
import { classicDisc, TemplateDisc } from './disc.ts';
import { PlacedEffect } from './effect.ts';
import { MapInfo } from './map.ts';
import { DmLayer, Ruler, Stroke, Token } from './pieces.ts';
import { emptyMask } from '../geometry/mask.ts';

/** The fog of one map. */
export const FogState = v.object({
  /** Whether fog is shown at all. */
  on: v.boolean(),
  /** Revealed squares (a set bit = the players see the square). */
  revealed: Mask,
  /** Changes waiting in the preview ("Players see changes: Preview first"), else null. */
  staged: v.nullable(v.object({
    /** Squares that will be revealed. */
    reveal: Mask,
    /** Squares that will be hidden. */
    hide: Mask,
  })),
  /** The last circle placed in the preview, kept so a radius change can redraw it. */
  live: v.nullable(v.object({
    /** The gesture that placed it. */
    gesture: Id,
    /** The preview's reveal squares before that circle. */
    baseReveal: Mask,
    /** The preview's hide squares before that circle. */
    baseHide: Mask,
  })),
});
/** One map's fog; see the schema of the same name. */
export type FogState = v.InferOutput<typeof FogState>;

/** How the TV frames a map. */
export const TvMode = v.picklist(['table', 'fit', 'free']);
/** `table`: one square = one inch (default); `fit`: the whole map; `free`: a camera of its own. */
export type TvMode = v.InferOutput<typeof TvMode>;

/** The TV's view of one map. */
export const MapView = v.object({
  /** How the TV frames the map. */
  mode: TvMode,
  /** First column of the table window; null = centred. */
  col: v.nullable(v.pipe(v.number(), v.integer())),
  /** First row of the table window; null = centred. */
  row: v.nullable(v.pipe(v.number(), v.integer())),
  /** Quarter turns clockwise (0–3). */
  quarterTurns: v.picklist([0, 1, 2, 3]),
  /** The free camera: centre in squares and zoom in screen px per square; null = fit. */
  free: v.nullable(v.object({ x: Num, y: Num, zoom: Positive })),
});
/** The TV's view of a map; see the schema of the same name. */
export type MapView = v.InferOutput<typeof MapView>;

/** Everything about one map in a game. */
export const MapPlay = v.object({
  /** The map itself. */
  info: MapInfo,
  /** Its fog. */
  fog: FogState,
  /** Indices of open doors, ascending. */
  doorsOpen: v.array(Count),
  /** Tokens, on the map or waiting in the list. */
  tokens: v.array(Token),
  /** Drawings, oldest first (drawn in this order). */
  strokes: v.array(Stroke),
  /** DM-only picture layers, bottom first. */
  layers: v.array(DmLayer),
  /** The L-ruler. */
  ruler: Ruler,
  /** The template disc. */
  disc: TemplateDisc,
  /** Lasting effects. */
  effects: v.array(PlacedEffect),
  /** How the TV frames it. */
  view: MapView,
  /** Whether battlemap's grid lines are shown (starts as `info.drawGrid`). */
  showGrid: v.boolean(),
});
/** One map's play state; see the schema of the same name. */
export type MapPlay = v.InferOutput<typeof MapPlay>;

/** Longest line of text on the curtain's plate. */
export const MAX_CURTAIN_TEXT = 120;

/** A game's settings (the session settings dialog). */
export const GameSettings = v.object({
  /** How fog is drawn. */
  fogStyle: v.picklist(['standard', 'soft', 'cloud', 'atmospheric']),
  /** Pull the rim of revealed areas in by this percent of a square (0–45). */
  fogEdgeInset: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(45)),
  /** Fade squares in when they are revealed. */
  fogFade: v.boolean(),
  /** Whether effects play at all. */
  effects: v.boolean(),
  /**
   * Torch glow from the `.dd2vtt` file's lights (the renderer reads it). Off by default; games
   * stored before the field existed read as off.
   */
  mapLights: v.optional(v.boolean(), false),
  /** Whether the companion shows the Draw tab (a session-settings preset hides it). Default on. */
  drawTools: v.optional(v.boolean(), true),
  /** Whether the companion shows the Measure tab (ruler, line, template disc). Default on. */
  measureTools: v.optional(v.boolean(), true),
});
/** A game's settings; see the schema of the same name. */
export type GameSettings = v.InferOutput<typeof GameSettings>;

/**
 * The curtain (roadmap N8): while `down`, the TV holds black — or, with `plate`, a calm "next
 * scene…" plate with the game's name and `text` — over everything, so the DM can switch maps,
 * reveal fog and place things unseen; lifting it shows the new state in one fade. Saved with the
 * game, so a TV that reloads mid-setup comes back behind the curtain.
 */
export const Curtain = v.object({
  /** Whether the curtain is down. */
  down: v.boolean(),
  /** The "next scene…" plate (true) or plain black (false). */
  plate: v.boolean(),
  /** An optional line on the plate under the game's name ("" = none). */
  text: v.pipe(v.string(), v.maxLength(MAX_CURTAIN_TEXT)),
});
/** The curtain; see the schema of the same name. */
export type Curtain = v.InferOutput<typeof Curtain>;

/**
 * A scene preset (roadmap S2): which map of the game, how the TV frames it, its lasting effects
 * without the token-bound ones (weather, global moods, map loops), the map lights switch and the
 * fog look. Made by the companion from what is on the table (`captureScene`); `scene.apply`
 * puts it back with one tap. Fog, doors, tokens and drawings are never part of a scene — they
 * are the story so far.
 */
export const Scene = v.object({
  /** Made by the companion that saved it. */
  id: Id,
  /** "Crypt — storm" (shown in the list). */
  name: Name,
  /** The map of the game it puts on the table. */
  mapId: Id,
  /** How the TV frames that map. */
  view: MapView,
  /** The map's lasting effects that are not bound to a token. */
  effects: v.pipe(v.array(PlacedEffect), v.maxLength(64)),
  /** The game's map lights switch (`GameSettings.mapLights`). */
  mapLights: v.boolean(),
  /** The fog look (`GameSettings` fogStyle, fogEdgeInset, fogFade). */
  fog: v.object({
    /** How fog is drawn. */
    style: GameSettings.entries.fogStyle,
    /** Trim revealed edges, percent of a square. */
    edgeInset: GameSettings.entries.fogEdgeInset,
    /** Fade squares in when revealed. */
    fade: v.boolean(),
  }),
});
/** A scene preset; see the schema of the same name. */
export type Scene = v.InferOutput<typeof Scene>;

/** Most scenes one game keeps. */
export const MAX_SCENES = 24;

/**
 * The curtain of a game that never lowered it: up, plain black, no text.
 *
 * @returns a new curtain
 */
export function defaultCurtain(): Curtain {
  return { down: false, plate: false, text: '' };
}

/** A game: its maps (one on the table) and its settings. */
export const Game = v.object({
  /** Made by the companion that started it. */
  id: Id,
  /** "Session 3 · Sat 10 Oct". */
  name: Name,
  /** When it was started. */
  createdAt: IsoTime,
  /** Its settings. */
  settings: GameSettings,
  /** Whether fog changes wait in a preview until the DM applies them. */
  previewFirst: v.boolean(),
  /** The game's maps in the order they joined (never empty). */
  mapOrder: v.pipe(v.array(Id), v.minLength(1)),
  /** The map on the table (one of `mapOrder`). */
  activeMapId: Id,
  /** Play state per map id. */
  maps: v.record(Id, MapPlay),
  /** The curtain over the TV (games stored before it existed read as up). */
  curtain: v.optional(Curtain, defaultCurtain),
  /** Scene presets in the DM's order (games stored before they existed read as none). */
  scenes: v.optional(v.pipe(v.array(Scene), v.maxLength(MAX_SCENES)), () => []),
});
/** A game; see the schema of the same name. */
export type Game = v.InferOutput<typeof Game>;

/**
 * Settings of a new game: the tabletop defaults.
 *
 * @returns a new settings object
 */
export function defaultSettings(): GameSettings {
  return { fogStyle: 'standard', fogEdgeInset: 0, fogFade: true, effects: true, mapLights: false, drawTools: true, measureTools: true };
}

/**
 * A map's play state before anything happened: fully fogged, doors closed, nothing on it, the
 * TV on the one-inch table with the window centred.
 *
 * @param info - the map
 * @returns a new play state
 */
export function newMapPlay(info: MapInfo): MapPlay {
  const cells = info.grid.cols * info.grid.rows;
  return {
    info,
    fog: { on: true, revealed: emptyMask(cells), staged: null, live: null },
    doorsOpen: [],
    tokens: [],
    strokes: [],
    layers: [],
    ruler: { visible: false, x: 0, y: 0, rotation: 0 },
    disc: classicDisc(),
    effects: [],
    view: { mode: 'table', col: null, row: null, quarterTurns: 0, free: null },
    showGrid: info.drawGrid,
  };
}

/** What it takes to start a game; the companion sends this in `game.new`. */
export interface NewGameInput {
  /** The new game's id. */
  id: Id;
  /** Its name. */
  name: string;
  /** When it starts (ISO time). */
  createdAt: string;
  /** Its first map. */
  map: MapInfo;
  /** Settings, the defaults where missing. */
  settings?: Partial<GameSettings> | undefined;
}

/**
 * A new game on one map.
 *
 * @param input - id, name, time, first map and optional settings
 * @returns the game
 */
export function newGame(input: NewGameInput): Game {
  return {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    settings: { ...defaultSettings(), ...input.settings },
    previewFirst: false,
    mapOrder: [input.map.id],
    activeMapId: input.map.id,
    maps: { [input.map.id]: newMapPlay(input.map) },
    curtain: defaultCurtain(),
    scenes: [],
  };
}
