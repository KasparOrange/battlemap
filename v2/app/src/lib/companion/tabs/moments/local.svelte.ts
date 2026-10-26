/**
 * The Moments tab's device-local choices (never synced, remembered on this tablet): how much the
 * spotlight dims the rest of the table, the timer's custom length and end effect, the side
 * handouts read upright for — and the note being written or edited right now (the note dialog
 * reads it; a long press on the map in any tab opens it).
 */
import { newId, type DmNote, type TableSide, type TimerEndEffect } from '@battlemap/shared';

const KEY = 'battlemap.companion.moments';

/** The note in the dialog: a new one (not on the map yet) or one of the map's. */
export interface NoteDraft {
  /** The note as it will be saved (its id is new for a new note). */
  note: DmNote;
  /** Whether it is new (Save adds it; the dialog has no Delete). */
  isNew: boolean;
}

/** The tablet-local Moments state. */
class MomentsLocal {
  /** How much the spotlight dims the rest of the table (0, 0.3, 0.5). */
  dim = $state(0.3);
  /** The custom timer length, seconds. */
  customSeconds = $state(90);
  /** What the TV does when a new timer runs out. */
  endEffect = $state<TimerEndEffect>('glow');
  /** The side handouts read upright for. */
  side = $state<TableSide>('bottom');
  /** The note in the dialog, or null when it is closed. */
  draft = $state<NoteDraft | null>(null);

  constructor() {
    try {
      const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Record<string, unknown> | null;
      if (typeof raw?.dim === 'number' && raw.dim >= 0 && raw.dim <= 0.6) this.dim = raw.dim;
      if (typeof raw?.customSeconds === 'number' && raw.customSeconds >= 1) this.customSeconds = Math.round(raw.customSeconds);
      if (raw?.endEffect === 'none' || raw?.endEffect === 'glow' || raw?.endEffect === 'flash') this.endEffect = raw.endEffect;
      if (raw?.side === 'bottom' || raw?.side === 'top' || raw?.side === 'left' || raw?.side === 'right') this.side = raw.side;
    } catch {
      // nothing remembered
    }
  }

  /** Remembers the choices on this device. */
  save(): void {
    try {
      const { dim, customSeconds, endEffect, side } = this;
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ dim, customSeconds, endEffect, side }));
    } catch {
      // private mode
    }
  }

  /**
   * Opens the dialog for a new note at a map point.
   *
   * @param x - squares from the map's left edge
   * @param y - squares from the map's top edge
   */
  newNote(x: number, y: number): void {
    this.draft = { note: { id: newId(), x, y, text: '' }, isNew: true };
  }

  /**
   * Opens the dialog for one of the map's notes.
   *
   * @param note - the note
   */
  editNote(note: DmNote): void {
    this.draft = { note, isNew: false };
  }
}

/** The one instance. */
export const momentsLocal = new MomentsLocal();

/**
 * Tabs in which a long press on the map does not pin a note: there a still finger is the start
 * of a stroke (Draw) or of fog painting (Fog), and a hesitating DM must not get a dialog.
 */
export const NO_NOTE_HOLD_TABS: ReadonlySet<string> = new Set(['draw', 'fog']);
