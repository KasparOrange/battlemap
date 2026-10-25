/**
 * The whole replicated state: the table, the open game, what is shown but not saved, and the
 * undo history. The TV owns it; companions hold a confirmed copy plus their prediction.
 *
 * @see ../../../docs/architecture.md "state"
 */
import * as v from 'valibot';
import { Id, Mask } from './basics.ts';
import { OneShot, PlacedEffect } from './effect.ts';
import { Game } from './game.ts';
import { DmNote } from './moments.ts';
import { MeasureLine, Stroke, Token } from './pieces.ts';
import { SoundShot } from './sound.ts';
import { defaultTable, TableState } from './table.ts';

/** Shown on the screens but never saved. */
export const LiveState = v.object({
  /** The measure line being dragged, or null. */
  measure: v.nullable(MeasureLine),
  /** The stroke being drawn, or null. */
  stroke: v.nullable(Stroke),
  /** The most recent one-shot effects (`MAX_SHOTS`), oldest first. */
  shots: v.array(OneShot),
  /** The most recent one-shot sounds (`MAX_SOUND_SHOTS`), oldest first (missing = none). */
  sounds: v.optional(v.array(SoundShot), () => []),
});
/** The unsaved live state; see the schema of the same name. */
export type LiveState = v.InferOutput<typeof LiveState>;

/**
 * One undo step. Applying a step *swaps* what it holds with what the state has now, and the
 * swapped-out value becomes the step on the other stack — so undo and redo are the same
 * operation. `gesture` groups the commands of one stroke or drag into one step.
 */
export const UndoEntry = v.variant('kind', [
  /** The revealed fog mask of a map. */
  v.object({ kind: v.literal('fog'), mapId: Id, gesture: v.nullable(Id), revealed: Mask }),
  /** Whether a door was open. */
  v.object({ kind: v.literal('door'), mapId: Id, gesture: v.nullable(Id), index: v.pipe(v.number(), v.integer(), v.minValue(0)), open: v.boolean() }),
  /** One token as it was (null = it did not exist). */
  v.object({ kind: v.literal('token'), mapId: Id, gesture: v.nullable(Id), id: Id, token: v.nullable(Token) }),
  /** The whole token list as it was (clear all). */
  v.object({ kind: v.literal('tokens'), mapId: Id, gesture: v.nullable(Id), tokens: v.array(Token) }),
  /** Strokes to take away (by id) and strokes to put back. */
  v.object({ kind: v.literal('strokes'), mapId: Id, gesture: v.nullable(Id), remove: v.array(Id), restore: v.array(Stroke) }),
  /** The map's lasting effects as they were (`fx.place` / `fx.remove`; a clear sends its removes under one gesture). */
  v.object({ kind: v.literal('effects'), mapId: Id, gesture: v.nullable(Id), effects: v.array(PlacedEffect) }),
  /** The map's DM notes as they were (`note.set` / `note.remove`; a drag is one gesture). */
  v.object({ kind: v.literal('notes'), mapId: Id, gesture: v.nullable(Id), notes: v.array(DmNote) }),
]);
/** One undo step; see the schema of the same name. */
export type UndoEntry = v.InferOutput<typeof UndoEntry>;

/** Undo and redo stacks, newest last. */
export const History = v.object({
  /** Steps undo takes back, newest last. */
  undo: v.array(UndoEntry),
  /** Steps redo puts back, newest last. */
  redo: v.array(UndoEntry),
});
/** The undo history; see the schema of the same name. */
export type History = v.InferOutput<typeof History>;

/** Most undo steps kept (the old app's 50). */
export const MAX_UNDO = 50;

/** The whole replicated state. */
export const RootState = v.object({
  /** The TV's own facts. */
  table: TableState,
  /** The open game; null while the TV shows the library. */
  game: v.nullable(Game),
  /** Shown, not saved. */
  live: LiveState,
  /** Undo / redo (memory only, cleared when another game opens). */
  history: History,
});
/** The whole replicated state; see the schema of the same name. */
export type RootState = v.InferOutput<typeof RootState>;

/**
 * The state of a TV that just started: default table, no game.
 *
 * @returns a new root state
 */
export function initialRoot(): RootState {
  return {
    table: defaultTable(),
    game: null,
    live: emptyLive(),
    history: { undo: [], redo: [] },
  };
}

/**
 * Live state with nothing in it.
 *
 * @returns a new live state
 */
export function emptyLive(): LiveState {
  return { measure: null, stroke: null, shots: [], sounds: [] };
}
