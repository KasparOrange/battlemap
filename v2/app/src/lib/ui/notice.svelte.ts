/**
 * Notices — every short message of the app ("Map deleted", "Whole map revealed · Undo",
 * "Upload failed") goes through {@link notify}; {@link NoticeHost} shows it. Port of the old
 * app's `Notice.show` (docs/architecture.md "notices"), whose rules were learned the hard way:
 *
 * - every notice closes by itself (Material snackbars with an action never did): info and
 *   success 3 s, warning 4 s, error 5 s, at least 6 s with a button, +1 s per 40 characters,
 *   at most 10 s — see {@link noticeMs};
 * - a new notice REPLACES the one on screen (cross-fade), there is no queue (a burst of taps
 *   used to trickle messages in for half a minute);
 * - a finger on the card pauses the countdown (the host does that);
 * - {@link notify} returns an id; {@link dismiss} with that id closes only that notice, never a
 *   newer one ("Another phone took over" closing on reconnect must not kill a fresh Undo).
 */

import { noticeMs, type NoticeAction, type NoticeKind, type NoticeOptions, type ActiveNotice } from './notice-rules';

export { noticeMs };
export type { ActiveNotice, NoticeAction, NoticeKind, NoticeOptions };

class NoticeState {
    /** The notice on screen, or null. */
    current = $state<ActiveNotice | null>(null);
}

/** The one notice slot of the app — read by {@link NoticeHost}. */
export const notices = new NoticeState();

let nextId = 1;

/**
 * Shows a notice, replacing the one on screen.
 * @param text - the message, one short sentence
 * @param options - kind, button, show time
 * @returns the notice's id, for {@link dismiss}
 */
export function notify(text: string, options: NoticeOptions = {}): number {
    const kind = options.kind ?? 'info';
    const id = nextId++;

    notices.current = {
        id,
        kind,
        text,
        action: options.action,
        ms: options.ms ?? noticeMs(kind, text, !!options.action),
    };

    return id;
}

/**
 * Closes the notice on screen.
 * @param id - close only this notice (a newer one stays); omit to close whatever is shown
 */
export function dismiss(id?: number): void {
    if (!notices.current) return;

    if (id !== undefined && notices.current.id !== id) return;

    notices.current = null;
}
