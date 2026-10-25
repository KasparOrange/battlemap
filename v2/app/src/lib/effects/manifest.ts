/**
 * The shape of the effects library on disk: `index.json` (every effect, one row each) and
 * `<id>/effect.json` (one effect's manifest). Read-only types plus small pure helpers that
 * answer questions from a manifest (how long it plays, whether it loops, which files it needs,
 * which other effects it is made of). No Pixi, no IO — the registry loads, the instances draw.
 *
 * @see ../../../../docs/effects.md "The manifest"
 */

/** One row of `index.json`. */
export interface EffectIndexEntry {
  /** Stable id (the folder name). */
  id: string;
  /** Human name for the picker. */
  name: string;
  /** `global` · `regional` · `point` · `aura` · `map-loop`. */
  category: EffectCategory;
  /** How it is drawn. */
  technique: EffectTechnique;
  /** Search words. */
  tags: string[];
  /** D&D damage types it fits. */
  damage: string[];
  /** Spell names it fits. */
  spells: string[];
  /** Pixi blend mode. */
  blend: EffectBlend;
  /** Licence name. */
  licence: string;
  /** Whether it may ship in a paid product. */
  commercial: boolean;
  /** Path of its manifest, relative to the library root. */
  manifest: string;
  /** Path of its 128 px thumbnail, relative to the library root. */
  thumb: string;
  /** Bytes on disk. */
  bytes: number;
  /** GPU bytes of its own textures when loaded (RGBA8). */
  gpuBytes: number;
}

/** `index.json`. */
export interface EffectIndex {
  /** Format version (1). */
  version: number;
  /** Number of effects. */
  count: number;
  /** Every effect. */
  effects: EffectIndexEntry[];
}

/** What an effect is for. */
export type EffectCategory = 'global' | 'regional' | 'point' | 'aura' | 'map-loop';
/** How an effect is drawn. */
export type EffectTechnique = 'sheet' | 'set' | 'layers' | 'texture' | 'particles' | 'shader' | 'composite';
/** Blend modes the library uses. */
export type EffectBlend = 'normal' | 'add' | 'screen' | 'multiply';

/** One atlas picture of a frame sheet. */
export interface AtlasFile {
  /** File name inside the effect's folder. */
  file: string;
  /** Width px. */
  w: number;
  /** Height px. */
  h: number;
}

/** A frame animation (or a variant set when `variants`). */
export interface SheetSpec {
  /** The atlas pictures. */
  atlases: AtlasFile[];
  /** Frame width px (all frames share it). */
  frameW: number;
  /** Frame height px. */
  frameH: number;
  /** Frames as `[atlas index, x, y]`. */
  frames: [number, number, number][];
  /** Frames per second. */
  fps?: number;
  /** Whether it loops. */
  loop?: boolean;
  /** Slow loops: draw frame i and i+1 with alpha = the fraction between them. */
  crossfade?: boolean;
  /** A set of variants, not an animation. */
  variants?: boolean;
}

/** The motion recipe of a texture effect. */
export interface MotionSpec {
  /** Degrees per second. */
  rotate?: number;
  /** Breathing: alpha dips by `alpha`, scale swings by `scale`. */
  pulse?: { period: number; alpha?: number; scale?: number };
  /** Firelight: alpha and scale wander inside their ranges at about `hz`. */
  flicker?: { hz: number; alpha: [number, number]; scale: [number, number] };
  /** Grows from `from` × size to full size over `duration` s. */
  grow?: { from: number; duration: number };
  /** Fades in over this many seconds. */
  fadeIn?: number;
  /** One-shots: fades out over the last this many seconds. */
  fadeOut?: number;
  /** A one-shot that lasts this many seconds. */
  once?: number;
  /** Swings by `angle` degrees over `period` s. */
  sway?: { angle: number; period: number };
  /** Alpha breathes by `amount` over `period` s. */
  glow?: { period: number; amount: number };
  /** Tint colour (`#rrggbb`). */
  color?: string;
  /** A filter to put on the sprite (`magic-circle.frag`). */
  shader?: string;
}

/** A single picture of a texture effect. */
export interface TextureSpec {
  /** File name inside the effect's folder. */
  file: string;
  /** Width px. */
  w: number;
  /** Height px. */
  h: number;
  /** `clamp` or `repeat`. */
  wrap?: string;
}

/** A particle emitter recipe. */
export interface ParticleSpec {
  /** Sprite pictures; a particle picks one. */
  textures: TextureSpec[];
  /** Where particles are born. */
  emitter: 'screen' | 'area' | 'point' | 'ring';
  /** `area`: width in squares. */
  w?: number;
  /** `area`: height in squares. */
  h?: number;
  /** `point` / `ring`: radius in squares. */
  radius?: number;
  /** Births per second (`screen`: per 100 visible square²). */
  rate?: number;
  /** All at once (a one-shot). */
  burst?: number;
  /** Most alive at once (`screen`: per 100 visible square²). */
  max: number;
  /** Life range, seconds. */
  life: [number, number];
  /** Speed range, squares per second. */
  speed: [number, number];
  /** Direction range, degrees (0 = right, 90 = down). */
  angle: [number, number];
  /** Constant acceleration, squares per second². */
  gravity: [number, number];
  /** Size range, squares. */
  size: [number, number];
  /** Size factor at death. */
  grow?: number;
  /** Alpha at birth, mid-life, death. */
  alpha: [number, number, number];
  /** Colour at birth and at death (`#rrggbb`). */
  colors: [string, string];
  /** Spin range, degrees per second. */
  spin?: [number, number];
  /** Sideways wobble: amplitude in squares, frequency in Hz. */
  wobble?: [number, number];
  /** Alpha flicker frequency, Hz. */
  flicker?: number;
  /** Mirror half of the particles. */
  flip?: boolean;
  /** Turn each particle along its velocity. */
  alignToVelocity?: boolean;
}

/** A procedural effect. */
export interface ShaderSpec {
  /** Fragment file, relative to the effect's folder. */
  fragment: string;
  /** Vertex file, relative to the effect's folder. */
  vertex: string;
  /** `filter` = on the map; `mask` = on a filled shape whose alpha is kept. */
  apply: 'filter' | 'mask';
  /** The effect's own uniforms: numbers or vectors. */
  uniforms: Record<string, number | number[]>;
  /** Extra textures by uniform name. */
  textures: Record<string, TextureSpec>;
}

/** One part of a composite. */
export interface CompositePart {
  /** The part's effect id. */
  id: string;
  /** Offset from the anchor, squares. */
  x: number;
  /** Offset from the anchor, squares. */
  y: number;
  /** Size factor. */
  scale?: number;
  /** Time offset, seconds. */
  phase?: number;
}

/** One layer of a `layers` effect. */
export interface LayerSpec {
  /** Frame index in the sheet. */
  frame: number;
  /** Name (for people). */
  name?: string;
  /** Degrees per second. */
  rotate?: number;
  /** Breathing scale between two factors over `period` s. */
  pulse?: { period: number; scale: [number, number] };
}

/** One effect's `effect.json`. */
export interface EffectManifest {
  /** Stable id. */
  id: string;
  /** Human name. */
  name: string;
  /** What it is for. */
  category: EffectCategory;
  /** How it is drawn. */
  technique: EffectTechnique;
  /** `ground` (under the fog) or `air` (above it). */
  layer: 'ground' | 'air';
  /** Blend mode. */
  blend: EffectBlend;
  /** White art meant to be coloured by the runtime. */
  tint: boolean;
  /** Nominal size: the source frame's width in squares (null for map-wide effects). */
  squares: number | null;
  /** Drawn size in squares. */
  size?: { w: number; h: number };
  /** The point of the picture (0..1) that sits on the anchor. */
  anchor?: [number, number];
  /** Line effects: where the beam starts and ends along x (0..1). */
  beam?: { start: number; end: number };
  /** GPU bytes of its own textures. */
  gpuBytes: number;
  /** Seconds (sheets). */
  duration?: number;
  /** Frames (sheet, set, layers). */
  sheet?: SheetSpec;
  /** Texture effects. */
  texture?: TextureSpec;
  /** Texture effects' motion; also on others. */
  motion?: MotionSpec;
  /** Particle effects. */
  particles?: ParticleSpec;
  /** Shader effects. */
  shader?: ShaderSpec;
  /** Composite effects. */
  parts?: CompositePart[];
  /** Layered effects. */
  layers?: LayerSpec[];
  /** Credit line to show. */
  attribution?: string;
  /** Licence. */
  licence?: { id: string; url?: string; commercial: boolean; shareAlike?: boolean };
}

/** Seconds a one-shot is assumed to last when its manifest says nothing. */
export const DEFAULT_SHOT_SECONDS = 3;

/**
 * Whether an effect plays once (a burst) rather than until removed.
 *
 * @param m - the manifest
 * @param parts - manifests of a composite's parts (by id), if known
 * @returns true for one-shots
 */
export function isOneShot(m: EffectManifest, parts?: ReadonlyMap<string, EffectManifest>): boolean {
  switch (m.technique) {
    case 'sheet':
      return !m.sheet?.loop;
    case 'texture':
      return Boolean(m.motion?.once);
    case 'particles':
      return Boolean(m.particles?.burst) && !m.particles?.rate;
    case 'composite':
      return (m.parts ?? []).every((p) => {
        const pm = parts?.get(p.id);
        return pm ? isOneShot(pm, parts) : false;
      });
    default:
      return false;
  }
}

/**
 * How long an effect plays once, in seconds: a sheet's frames ÷ fps, a texture's `once`, a
 * particle burst's longest life, a composite's longest part (plus its phase). Loops report the
 * length of one cycle, or {@link DEFAULT_SHOT_SECONDS} when they have none.
 *
 * @param m - the manifest
 * @param parts - manifests of a composite's parts (by id), if known
 * @returns seconds
 */
export function playSeconds(m: EffectManifest, parts?: ReadonlyMap<string, EffectManifest>): number {
  switch (m.technique) {
    case 'sheet': {
      const s = m.sheet;
      if (s && s.fps && s.frames.length) return s.frames.length / s.fps;
      return m.duration ?? DEFAULT_SHOT_SECONDS;
    }
    case 'texture':
      return m.motion?.once ?? DEFAULT_SHOT_SECONDS;
    case 'particles':
      return m.particles ? m.particles.life[1] : DEFAULT_SHOT_SECONDS;
    case 'composite': {
      let longest = 0;
      for (const p of m.parts ?? []) {
        const pm = parts?.get(p.id);
        longest = Math.max(longest, (pm ? playSeconds(pm, parts) : DEFAULT_SHOT_SECONDS) - (p.phase ?? 0));
      }
      return longest || DEFAULT_SHOT_SECONDS;
    }
    default:
      return DEFAULT_SHOT_SECONDS;
  }
}

/**
 * The texture files an effect needs, relative to the library root (not its parts' — those are
 * effects of their own). Shader sources are not textures and are not listed.
 *
 * @param m - the manifest
 * @returns paths like `fireball/atlas-0.webp`
 */
export function textureFiles(m: EffectManifest): string[] {
  const dir = `${m.id}/`;
  const files: string[] = [];
  if (m.sheet) for (const a of m.sheet.atlases) files.push(dir + a.file);
  if (m.texture) files.push(dir + m.texture.file);
  if (m.particles) for (const t of m.particles.textures) files.push(dir + t.file);
  if (m.shader) for (const t of Object.values(m.shader.textures)) files.push(dir + t.file);
  return files;
}

/**
 * The GPU bytes of one texture file (RGBA8, no mipmaps), from the manifest's sizes.
 *
 * @param m - the manifest
 * @param path - one of {@link textureFiles}
 * @returns bytes, or 0 when the file is not the manifest's
 */
export function textureBytes(m: EffectManifest, path: string): number {
  const name = path.slice(m.id.length + 1);
  const all: { file: string; w: number; h: number }[] = [
    ...(m.sheet?.atlases ?? []),
    ...(m.texture ? [m.texture] : []),
    ...(m.particles?.textures ?? []),
    ...Object.values(m.shader?.textures ?? {}),
  ];
  const hit = all.find((t) => t.file === name);
  return hit ? hit.w * hit.h * 4 : 0;
}

/**
 * The ids of other effects a composite is made of (deduplicated).
 *
 * @param m - the manifest
 * @returns part ids, empty for everything but composites
 */
export function partIds(m: EffectManifest): string[] {
  return [...new Set((m.parts ?? []).map((p) => p.id))];
}
