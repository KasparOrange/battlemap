/**
 * The reveal areas' device-local state (never synced): the area selected in the list (gold on
 * the map) and the area being drawn or edited — the draft. Nothing is sent while drawing; Save
 * sends one `area.save` (docs/features.md "Prepared reveal areas").
 */
import type { Point } from '@battlemap/shared';

/** What a finger on the map does while an area is being edited. */
export type AreaEditTool = 'paint' | 'room' | 'outline';

/** An area being drawn (new) or edited (an existing one's copy). */
export interface AreaDraft {
  /** The area's id (a new one for a new area). */
  id: string;
  /** The map it belongs to (a map switch while editing drops the draft). */
  mapId: string;
  /** Whether it is a new area (Save appends it) or an existing one (Save replaces it). */
  isNew: boolean;
  /** The name typed so far. */
  name: string;
  /** Its squares so far (cell indices). */
  cells: ReadonlySet<number>;
  /** The outline in progress: corners in squares (snapped to square corners). */
  poly: readonly Point[];
}

/** The tablet-local reveal-area state. */
class AreasLocal {
  /** The area selected in the list (drawn gold on the map), or null. */
  selected = $state<string | null>(null);
  /** The area being drawn or edited, or null (the Fog tab works on the fog). */
  draft = $state.raw<AreaDraft | null>(null);
  /** Paint squares, fill a room, or outline. */
  tool = $state<AreaEditTool>('paint');
  /** Whether the finger adds squares to the area (true) or takes them out. */
  add = $state(true);

  /**
   * Changes the draft (a new object, so everything reading it follows).
   *
   * @param patch - the fields to change
   */
  patch(patch: Partial<AreaDraft>): void {
    if (this.draft) this.draft = { ...this.draft, ...patch };
  }

  /** Ends editing without saving. */
  cancel(): void {
    this.draft = null;
  }
}

/** The one instance. */
export const areasLocal = new AreasLocal();
