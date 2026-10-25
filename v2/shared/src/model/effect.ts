/**
 * Effects in the game state — the hook points the effects runtime (`app/src/lib/effects/`)
 * draws from. What an effect looks like is the effects catalogue's business (`assets/`); the
 * state only says which catalogue entry, where, and with which parameters.
 *
 * @see ../../../docs/architecture.md "effects runtime"
 */
import * as v from 'valibot';
import { Id, Num, Point } from './basics.ts';

/** Where an effect sits. */
export const EffectAnchor = v.variant('kind', [
  /** The whole table or screen (weather, a flash, fade to black). */
  v.object({ kind: v.literal('global') }),
  /** An area of the map (a pool, a burning room): a polygon in squares. */
  v.object({ kind: v.literal('region'), points: v.pipe(v.array(Point), v.minLength(3), v.maxLength(256)) }),
  /** A spot of the map (a torch, an explosion), in squares. */
  v.object({ kind: v.literal('point'), x: Num, y: Num }),
  /** Follows a token (and hides with it). */
  v.object({ kind: v.literal('token'), tokenId: Id }),
]);
/** An effect's anchor; see the schema of the same name. */
export type EffectAnchor = v.InferOutput<typeof EffectAnchor>;

/** Parameters of an effect: plain numbers, texts and switches, by name. */
export const EffectParams = v.record(
  v.pipe(v.string(), v.maxLength(40)),
  v.union([v.pipe(v.number(), v.finite()), v.pipe(v.string(), v.maxLength(200)), v.boolean()]),
);
/** Effect parameters; see the schema of the same name. */
export type EffectParams = v.InferOutput<typeof EffectParams>;

/** A lasting effect placed on a map (weather, a torch, a water area); saved with the map. */
export const PlacedEffect = v.object({
  /** Made by the companion that placed it. */
  id: Id,
  /** The catalogue entry (an `assets/` manifest id, e.g. `weather.rain`). */
  effect: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  /** Where it sits. */
  anchor: EffectAnchor,
  /** Its settings (intensity, colour, …), as the catalogue entry defines them. */
  params: EffectParams,
  /** Paused effects stay in the list but don't render. */
  on: v.boolean(),
});
/** A placed effect; see the schema of the same name. */
export type PlacedEffect = v.InferOutput<typeof PlacedEffect>;

/**
 * A one-shot effect (an explosion, lightning, screen shake). Not saved; the state keeps the
 * last `MAX_SHOTS` so every screen plays each id once.
 */
export const OneShot = v.object({
  /** Made by the companion that triggered it — screens play each id once. */
  id: Id,
  /** The catalogue entry. */
  effect: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  /** Where it plays. */
  anchor: EffectAnchor,
  /** Its settings. */
  params: EffectParams,
  /** When it was triggered (sender's clock, epoch ms) — screens skip shots already over. */
  at: Num,
});
/** A one-shot effect; see the schema of the same name. */
export type OneShot = v.InferOutput<typeof OneShot>;

/** How many recent one-shots the live state keeps. */
export const MAX_SHOTS = 8;
