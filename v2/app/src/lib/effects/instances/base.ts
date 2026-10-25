/**
 * What every effect instance shares: the contract the runtime drives, the per-frame context,
 * the creation context, and the placement of a root container in squares.
 *
 * An instance owns one `root` container. The runtime parents it (a slot or a token's
 * container) and calls `update` once per frame while the instance animates; the instance
 * moves only its own children and allocates nothing per frame.
 *
 * @see ../runtime.ts
 */
import { Container, type Texture } from 'pixi.js';
import type { EffectAnchor, EffectParams } from '@battlemap/shared';
import type { Placement } from '../anchors.ts';
import type { CostEstimate, Degrade } from '../budget.ts';
import type { EffectBlend } from '../manifest.ts';
import type { ViewRect } from '../particle-sim.ts';
import type { EffectBundle } from '../registry.ts';

/** What the runtime measures once per frame and hands to every instance. */
export interface FrameContext {
  /** The current savings. */
  degrade: Degrade;
  /** The visible part of the map, squares. */
  view: ViewRect;
  /** Screen px per square. */
  squarePx: number;
  /** Screen px of square (0, 0). */
  originX: number;
  /** Screen px of square (0, 0). */
  originY: number;
  /** Screen size, CSS px. */
  screenW: number;
  /** Screen size, CSS px. */
  screenH: number;
  /** The renderer's resolution multiplier. */
  resolution: number;
}

/** What an instance is made with. */
export interface CreateContext {
  /** The effect's files. */
  bundle: EffectBundle<Texture>;
  /** Where it sits. */
  anchor: EffectAnchor;
  /** Its params. */
  params: EffectParams;
  /** A stable seed (hash of the placed / shot id) — every screen draws it alike. */
  seed: number;
  /** World units per square of the container it will be put in. */
  unitsPerSquare: number;
  /** Where global shader filters go (the map's container), if the renderer has one. */
  filterTarget: Container | null;
  /** Seconds added to its clock (composite parts). */
  phase: number;
}

/** A running effect. */
export interface EffectInstance {
  /** What it draws into (the runtime parents it). Global filters keep it empty. */
  readonly root: Container;
  /** Its estimated cost. */
  readonly cost: CostEstimate;
  /** Whether it needs frames (false for a still decal). */
  readonly animates: boolean;
  /**
   * Advances to time `t`.
   *
   * @param t - seconds since it started (scaled by `params.speed`)
   * @param dt - seconds since the last frame
   * @param ctx - this frame's measurements
   * @returns false when it has finished (a one-shot that played out)
   */
  update(t: number, dt: number, ctx: FrameContext): boolean;
  /**
   * Moves it or changes its params in place.
   *
   * @param anchor - where it sits now
   * @param params - its params now
   */
  setParams(anchor: EffectAnchor, params: EffectParams): void;
  /** Removes what it drew and frees what it made (not the registry's textures). */
  destroy(): void;
}

/**
 * Applies a placement to a root container whose content is drawn in squares.
 *
 * @param root - the container
 * @param p - the placement
 * @param unitsPerSquare - world units per square of the root's parent
 * @param extraScale - a factor on top (a flicker, a pulse)
 * @param extraRot - radians on top
 */
export function applyPlacement(root: Container, p: Placement, unitsPerSquare: number, extraScale = 1, extraRot = 0): void {
  root.position.set(p.x * unitsPerSquare, p.y * unitsPerSquare);
  root.rotation = p.angle + extraRot;
  root.scale.set(p.sx * unitsPerSquare * extraScale, p.sy * unitsPerSquare * extraScale);
}

/**
 * The Pixi blend mode of a manifest blend.
 *
 * @param b - the manifest's blend
 * @returns Pixi's name
 */
export function pixiBlend(b: EffectBlend): 'normal' | 'add' | 'screen' | 'multiply' {
  return b === 'add' || b === 'screen' || b === 'multiply' ? b : 'normal';
}

/**
 * A number param, or a fallback.
 *
 * @param params - the params
 * @param key - the name
 * @param fallback - when missing or not a number
 * @returns the number
 */
export function numParam(params: EffectParams, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** A new labelled root container. */
export function makeRoot(label: string): Container {
  return new Container({ label: `fx:${label}` });
}
