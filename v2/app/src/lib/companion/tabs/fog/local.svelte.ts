/**
 * The Fog tab's device-local settings (never synced, remembered on this device): the tool, reveal
 * or hide, the brush and circle radii — and the last circle placed in the preview, so the radius
 * stepper can redraw it in place (parity FG-07).
 */
import { BRUSH_RADII, CIRCLE_DEFAULT, CIRCLE_MAX, CIRCLE_MIN } from './cells.ts';

/** The fog tools. */
export type FogTool = 'brush' | 'room' | 'circle';
/** Reveal or hide. */
export type FogValue = 'reveal' | 'hide';

const KEY = 'battlemap.companion.fog';

/** What is remembered. */
interface Saved {
  tool: FogTool;
  value: FogValue;
  brush: number;
  circle: number;
}

function load(): Saved {
  const fallback: Saved = { tool: 'brush', value: 'reveal', brush: 1, circle: CIRCLE_DEFAULT };
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!raw) return fallback;
    return {
      tool: raw.tool === 'room' || raw.tool === 'circle' ? raw.tool : 'brush',
      value: raw.value === 'hide' ? 'hide' : 'reveal',
      brush: BRUSH_RADII.includes(raw.brush as never) ? raw.brush! : 1,
      circle: Math.min(CIRCLE_MAX, Math.max(CIRCLE_MIN, Math.round(raw.circle ?? CIRCLE_DEFAULT))),
    };
  } catch {
    return fallback;
  }
}

/** The tablet-local Fog tab state. */
class FogLocal {
  /** Brush, Room or Circle. */
  tool = $state<FogTool>('brush');
  /** Reveal or hide. */
  value = $state<FogValue>('reveal');
  /** Brush radius in squares (0 = one square). */
  brush = $state(1);
  /** Circle radius in squares. */
  circle = $state(CIRCLE_DEFAULT);
  /** The circle waiting in the preview: its gesture, centre and value. */
  lastCircle = $state.raw<{ gesture: string; cell: number; value: FogValue } | null>(null);

  constructor() {
    const s = load();
    this.tool = s.tool;
    this.value = s.value;
    this.brush = s.brush;
    this.circle = s.circle;
  }

  /** Remembers the settings on this device. */
  save(): void {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ tool: this.tool, value: this.value, brush: this.brush, circle: this.circle }));
    } catch {
      // private mode: not remembered, no harm
    }
  }
}

/** The one instance. */
export const fogLocal = new FogLocal();
