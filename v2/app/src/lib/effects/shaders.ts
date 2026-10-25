/**
 * Pixi filters from the library's GLSL files (`assets/effects/shaders/`). Every filter gets
 * battlemap's uniforms — `uTime` (s), `uSquarePx` (screen px per square), `uMapOrigin`
 * (screen px of square 0,0), so weather sticks to the map when the camera moves — plus the
 * manifest's own uniforms, overridable by params of the same name. Pixi supplies its filter
 * uniforms (`uInputSize`, `uOutputFrame`, …) itself; all of them are in CSS px.
 *
 * @see ../../../../docs/effects.md "Shader uniforms"
 */
import { Filter, GlProgram, UniformGroup, type Texture } from 'pixi.js';
import type { EffectParams } from '@battlemap/shared';
import type { ShaderSources } from './registry.ts';

/** Uniform types the library uses. */
type UniformType = 'f32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>';

/** A filter and the handles to drive it every frame. */
export interface EffectFilter {
  /** The Pixi filter. */
  readonly filter: Filter;
  /**
   * Writes the per-frame uniforms.
   *
   * @param time - seconds
   * @param squarePx - screen px per square
   * @param originX - screen px of square (0, 0)
   * @param originY - screen px of square (0, 0)
   */
  tick(time: number, squarePx: number, originX: number, originY: number): void;
  /**
   * Sets one of the effect's uniforms (a param of the same name).
   *
   * @param name - e.g. `uDensity`
   * @param value - a number or a vector of the uniform's length
   */
  set(name: string, value: number | ArrayLike<number>): void;
  /** Frees the filter (not the textures). */
  destroy(): void;
}

const programs = new Map<string, GlProgram>();

/** Extra uniforms some fragments read that no manifest lists (with their defaults). */
const KNOWN_DEFAULTS: Record<string, number | number[]> = {
  // magic-circle.frag: band radii (0..1), degrees per second per band, glow breath.
  uBands: [0.35, 0.62, 0.8, 1],
  uSpeeds: [-8, 5, -4, 3],
  uPulse: 0.3,
  uPeriod: 3,
};

function typeOf(v: number | readonly number[]): UniformType {
  if (typeof v === 'number') return 'f32';
  return v.length === 2 ? 'vec2<f32>' : v.length === 3 ? 'vec3<f32>' : 'vec4<f32>';
}

/**
 * Makes a filter from library sources.
 *
 * @param src - the GLSL sources
 * @param uniforms - the manifest's uniforms
 * @param textures - extra textures by sampler name (`uFlowTex`)
 * @param params - the placed effect's params; a number or a list of numbers named like a
 *   uniform overrides it
 * @returns the filter and its handles
 */
export function createEffectFilter(src: ShaderSources, uniforms: Record<string, number | number[]>, textures: Record<string, Texture>, params: EffectParams): EffectFilter {
  const key = `${src.name}\n${src.fragment.length}`;
  let program = programs.get(key);
  if (!program) {
    program = GlProgram.from({ vertex: src.vertex, fragment: src.fragment, name: `fx-${src.name}` });
    programs.set(key, program);
  }
  const def: Record<string, { value: number | Float32Array; type: UniformType; size?: number }> = {
    uTime: { value: 0, type: 'f32' },
    uSquarePx: { value: 56, type: 'f32' },
    uMapOrigin: { value: new Float32Array(2), type: 'vec2<f32>' },
  };
  const all: Record<string, number | number[]> = { ...KNOWN_DEFAULTS, ...uniforms };
  for (const [name, v] of Object.entries(all)) {
    if (!src.fragment.includes(name)) continue;
    def[name] = { value: typeof v === 'number' ? v : new Float32Array(v), type: typeOf(v) };
  }
  if (src.fragment.includes('uLights')) {
    def.uLights = { value: new Float32Array(32), type: 'vec4<f32>', size: 8 };
    def.uLightCount = { value: typeof all.uLightCount === 'number' ? all.uLightCount : 0, type: 'f32' };
  }
  const group = new UniformGroup(def);
  const resources: Record<string, unknown> = { fxUniforms: group };
  for (const [name, tex] of Object.entries(textures)) resources[name] = tex.source;
  const filter = new Filter({ glProgram: program, resources, padding: 0, antialias: 'off' });
  const u = group.uniforms as Record<string, number | Float32Array>;
  const handle: EffectFilter = {
    filter,
    tick(time, squarePx, originX, originY) {
      u.uTime = time % 3600;
      u.uSquarePx = squarePx;
      const o = u.uMapOrigin as Float32Array;
      o[0] = originX;
      o[1] = originY;
    },
    set(name, value) {
      const cur = u[name];
      if (cur === undefined) return;
      if (typeof cur === 'number' && typeof value === 'number') u[name] = value;
      else if (cur instanceof Float32Array && typeof value !== 'number') {
        const n = Math.min(cur.length, value.length);
        for (let i = 0; i < n; i++) cur[i] = value[i]!;
      }
    },
    destroy() {
      filter.destroy();
    },
  };
  applyParams(handle, params);
  return handle;
}

/**
 * Applies params named like uniforms (`uDensity: 0.8`, `uColor: "0.7,0.8,0.9"`).
 *
 * @param f - the filter
 * @param params - the placed effect's params
 */
export function applyParams(f: EffectFilter, params: EffectParams): void {
  for (const [k, v] of Object.entries(params)) {
    if (!k.startsWith('u')) continue;
    if (typeof v === 'number') f.set(k, v);
    else if (typeof v === 'string' && /^[-\d.,\s]+$/.test(v)) f.set(k, v.split(',').map(Number));
  }
}
