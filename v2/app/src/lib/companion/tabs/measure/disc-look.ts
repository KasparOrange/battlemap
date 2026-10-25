/**
 * The template disc's look (everything but where it lies) and its editing rules: the look
 * remembered on this tablet and laid on every disc it shows, sizes in feet (5–120, unique,
 * "+" adds the largest + 5), the option lists of the editor. Pure, tested (`disc-look.test.ts`).
 *
 * @see ../../../../../../docs/parity.md §10 "template disc panel" (DS-01 … DS-10)
 */
import { classicDisc, DND_CONE_DEGREES, normalizeDisc, type DiscShapeSet, type TemplateDisc } from '@battlemap/shared';

/** The disc without its place: what "the look" is. */
export type DiscLook = Omit<TemplateDisc, 'visible' | 'x' | 'y' | 'rotation'>;

/** The three families of outlines. */
export type DiscFamily = 'rings' | 'cubes' | 'cones';

/** Smallest and largest size in feet. */
export const MIN_FEET = 5;
/** Largest size in feet. */
export const MAX_FEET = 120;

/**
 * The look of a disc.
 *
 * @param d - the disc
 * @returns its look
 */
export function lookOf(d: TemplateDisc): DiscLook {
  const { visible: _v, x: _x, y: _y, rotation: _r, ...look } = d;
  return look;
}

/**
 * A disc with another look, its place kept.
 *
 * @param d - the disc
 * @param look - the look
 * @returns the new disc (normalised)
 */
export function withLook(d: TemplateDisc, look: DiscLook): TemplateDisc {
  return normalizeDisc({ ...d, ...look, visible: d.visible, x: d.x, y: d.y, rotation: d.rotation });
}

/**
 * Whether two discs look the same.
 *
 * @param a - one disc or look
 * @param b - the other
 * @returns true when every look field is equal
 */
export function sameLook(a: DiscLook, b: DiscLook): boolean {
  return JSON.stringify(lookOf({ ...classicDisc(), ...a })) === JSON.stringify(lookOf({ ...classicDisc(), ...b }));
}

/**
 * Reads a remembered look, filling what is missing from the classic disc (DS-10).
 *
 * @param raw - what storage held
 * @returns a valid look
 */
export function readLook(raw: unknown): DiscLook {
  const base = classicDisc();
  if (!raw || typeof raw !== 'object') return lookOf(base);
  const r = raw as Partial<TemplateDisc>;
  const set = (k: DiscFamily): DiscShapeSet => ({ ...base[k], ...(typeof r[k] === 'object' ? r[k] : {}) });
  return lookOf(normalizeDisc({ ...base, ...r, rings: set('rings'), cubes: set('cubes'), cones: set('cones'), visible: false, x: 0, y: 0, rotation: 0 }));
}

/**
 * Adds a size: the largest + 5 ft (5 ft on an empty set), at most `MAX_FEET`.
 *
 * @param set - the family
 * @returns the new family and the added size (null when full)
 */
export function addSize(set: DiscShapeSet): { set: DiscShapeSet; added: number | null } {
  const top = set.sizes.length ? Math.max(...set.sizes) : 0;
  const next = Math.min(MAX_FEET, top + 5);
  if (set.sizes.includes(next) || set.sizes.length >= 12) return { set, added: null };
  return { set: { ...set, sizes: [...set.sizes, next].sort((a, b) => a - b) }, added: next };
}

/**
 * Changes one size by `delta` feet, refusing to leave 5–120 ft or to make a duplicate.
 *
 * @param set - the family
 * @param size - the size to change
 * @param delta - feet (±5)
 * @returns the new family and the size's new value (unchanged when refused)
 */
export function stepSize(set: DiscShapeSet, size: number, delta: number): { set: DiscShapeSet; size: number } {
  const next = size + delta;
  if (next < MIN_FEET || next > MAX_FEET || set.sizes.includes(next) || !set.sizes.includes(size)) return { set, size };
  return { set: { ...set, sizes: set.sizes.map((s) => (s === size ? next : s)).sort((a, b) => a - b) }, size: next };
}

/**
 * Removes a size.
 *
 * @param set - the family
 * @param size - the size
 * @returns the new family
 */
export function removeSize(set: DiscShapeSet, size: number): DiscShapeSet {
  return { ...set, sizes: set.sizes.filter((s) => s !== size) };
}

/** The editor's option lists (DS-07, DS-08). */
export const DISC_OPTIONS = {
  coneDegrees: [
    { id: String(DND_CONE_DEGREES), label: '5e · 53°', value: DND_CONE_DEGREES },
    { id: '60', label: '60°', value: 60 },
    { id: '90', label: '90°', value: 90 },
  ],
  markers: [0, 4, 8, 12],
  tint: [
    { id: '0', label: 'Clear', value: 0 },
    { id: '0.1', label: 'Light', value: 0.1 },
    { id: '0.25', label: 'Half', value: 0.25 },
    { id: '0.4', label: 'Strong', value: 0.4 },
  ],
  lineWidth: [
    { id: '0.035', label: 'Thin', value: 0.035 },
    { id: '0.05', label: 'Normal', value: 0.05 },
    { id: '0.08', label: 'Bold', value: 0.08 },
  ],
  labelSize: [
    { id: '0.15', label: 'Small', value: 0.15 },
    { id: '0.2', label: 'Normal', value: 0.2 },
    { id: '0.28', label: 'Large', value: 0.28 },
  ],
} as const;

/**
 * The option id closest to a value (a segmented control needs one chosen id).
 *
 * @param options - the options
 * @param value - the current value
 * @returns the nearest option's id
 */
export function nearestOption(options: readonly { id: string; value: number }[], value: number): string {
  let best = options[0]!;
  for (const o of options) if (Math.abs(o.value - value) < Math.abs(best.value - value)) best = o;
  return best.id;
}

/** Turns the disc by `deg` degrees, kept in 0 ≤ r < 360. */
export function turned(d: TemplateDisc, deg: number): TemplateDisc {
  return { ...d, rotation: (((d.rotation + deg) % 360) + 360) % 360 };
}
