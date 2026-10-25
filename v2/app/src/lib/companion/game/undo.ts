/**
 * Undo and redo on the companion. The stacks live in the replicated state (the TV's reducer
 * keeps them, 50 steps, one step per gesture — `shared/src/reducer/history.ts`); this module
 * reads them, sends `history.undo` / `history.redo`, maps the desk keys, and makes the Undo
 * button of a bulk action's notice (Reveal all, Clear drawings, Delete token — design.md "bulk
 * actions act at once and offer Undo"). Tested under `bun test`.
 */
import type { Command, RootState, UndoEntry } from '@battlemap/shared';
import type { NoticeOptions } from '../../ui/notice-rules.ts';

/** Where a command goes (the game context's `dispatch`). */
export type Dispatch = (cmd: Command) => boolean;

/**
 * Whether undo has something to take back.
 *
 * @param state - the predicted state
 * @returns true when the undo stack is not empty
 */
export function canUndo(state: RootState | null): boolean {
  return !!state?.game && state.history.undo.length > 0;
}

/**
 * Whether redo has something to put back.
 *
 * @param state - the predicted state
 * @returns true when the redo stack is not empty
 */
export function canRedo(state: RootState | null): boolean {
  return !!state?.game && state.history.redo.length > 0;
}

/**
 * The newest undo step, or null.
 *
 * @param state - the predicted state
 * @returns the step on top of the undo stack
 */
export function topUndo(state: RootState | null): UndoEntry | null {
  return state?.history.undo[state.history.undo.length - 1] ?? null;
}

/** A keyboard event as far as undo cares. */
export interface UndoKey {
  /** `KeyboardEvent.key`. */
  key: string;
  /** Ctrl held. */
  ctrlKey: boolean;
  /** Cmd held (macOS). */
  metaKey: boolean;
  /** Shift held. */
  shiftKey: boolean;
}

/**
 * The desk keys (design.md "keys"): Ctrl/Cmd Z undo, Ctrl/Cmd Shift Z and Ctrl Y redo.
 *
 * @param e - the key event
 * @returns what to do, or null
 */
export function undoKey(e: UndoKey): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}

/**
 * Runs a bulk action and, when it made a new undo step, returns the notice options with an Undo
 * button that takes back exactly that step — and refuses (with a word) if another step was made
 * on top since, so the button can never undo something else.
 *
 * @param getState - the predicted state now (read again when Undo is pressed)
 * @param dispatch - sends commands
 * @param cmd - the bulk command
 * @param say - shows a short notice (for "something changed since")
 * @returns `{ sent, options }` — `options.action` set only when there is a step to undo
 */
export function withUndo(
  getState: () => RootState | null,
  dispatch: Dispatch,
  cmd: Command,
  say: (text: string) => void,
): { sent: boolean; changed: boolean; options: NoticeOptions } {
  const before = topUndo(getState());
  const sent = dispatch(cmd);
  const after = topUndo(getState());
  if (!sent || !after || after === before) return { sent, changed: false, options: {} };
  return {
    sent,
    changed: true,
    options: {
      kind: 'success',
      action: {
        label: 'Undo',
        run: () => {
          if (topUndo(getState()) !== after) {
            say('Something changed since — use the undo button instead.');
            return;
          }
          dispatch({ type: 'history.undo' });
        },
      },
    },
  };
}
