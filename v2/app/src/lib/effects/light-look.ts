/**
 * How a map light's pool looks and flickers — pure maths for `map-lights.ts`, tested under
 * `bun test`.
 */
import type { Light } from '@battlemap/shared';

/** Pool alpha at intensity 1 (additive: brighter washes the map out). */
export const BASE_ALPHA = 0.5;

/** How a light looks when still. */
export interface LightLook {
  /** Centre in world units. */
  readonly x: number;
  /** Centre in world units. */
  readonly y: number;
  /** Radius of the pool in world units. */
  readonly radius: number;
  /** Colour as 0xRRGGBB. */
  readonly tint: number;
  /** Alpha when still. */
  readonly alpha: number;
  /** Flicker strength: 0.16 for warm (fire) light, 0.05 for cold. */
  readonly flicker: number;
  /** Phase in seconds, so pools don't flicker in step. */
  readonly phase: number;
}

/**
 * A file light → how its pool looks.
 *
 * @param l - the light (squares, range in squares, intensity 0–1, `#rrggbb`)
 * @param unitsPerSquare - world units per square
 * @param index - its index (spreads the flicker phases)
 * @returns the look, or null for a light that gives none (no range or no intensity)
 */
export function lightLook(l: Light, unitsPerSquare: number, index: number): LightLook | null {
  const intensity = Math.min(1, l.intensity);
  if (!(l.range > 0) || !(intensity > 0)) return null;
  const tint = parseInt(l.color.slice(1), 16);
  const r = (tint >> 16) & 255;
  const b = tint & 255;
  return {
    x: l.x * unitsPerSquare,
    y: l.y * unitsPerSquare,
    radius: Math.min(l.range, 30) * unitsPerSquare,
    tint,
    alpha: BASE_ALPHA * (0.35 + 0.65 * intensity),
    flicker: r > b ? 0.16 : 0.05,
    phase: (index * 2.399963) % 10,
  };
}

/**
 * The flicker factor at a time: around 1, within `1 ± strength`, smooth (three detuned sines —
 * no noise tables, no allocation).
 *
 * @param t - seconds on the shared clock
 * @param phase - the light's phase in seconds
 * @param strength - flicker strength
 * @returns the factor
 */
export function flicker(t: number, phase: number, strength: number): number {
  const u = t + phase;
  const n = 0.5 * Math.sin(u * 7.3) + 0.3 * Math.sin(u * 13.1 + 1.7) + 0.2 * Math.sin(u * 2.1 + 0.4);
  return 1 + strength * n;
}

