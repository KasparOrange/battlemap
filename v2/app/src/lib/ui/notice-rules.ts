/**
 * The notice rules that are plain arithmetic (no Svelte), so they can be unit-tested:
 * the kinds and how long each notice stays. The state and `notify` live in
 * notice.svelte.ts; the old app's reasons are written up there.
 */

/** What kind of message — sets the icon and its colour. */
export type NoticeKind = 'info' | 'success' | 'warning' | 'error';

/** The optional button of a notice (Undo, Reconnect) — runs, then the notice closes. */
export interface NoticeAction {
    /** The button's text. */
    label: string;
    /** What it does. */
    run: () => void;
}

/** Options of {@link notify}. */
export interface NoticeOptions {
    /** Kind (default info). */
    kind?: NoticeKind;
    /** A button on the card. */
    action?: NoticeAction;
    /** Overrides the computed show time, in ms. */
    ms?: number;
}

/** The notice on screen. */
export interface ActiveNotice {
    /** Unique per {@link notify} call. */
    id: number;
    /** Kind. */
    kind: NoticeKind;
    /** The message. */
    text: string;
    /** The optional button. */
    action?: NoticeAction;
    /** How long it stays, in ms. */
    ms: number;
}

const BASE_MS: Record<NoticeKind, number> = { info: 3000, success: 3000, warning: 4000, error: 5000 };

/**
 * How long a notice stays on screen (the old app's table).
 * @param kind - the notice's kind
 * @param text - the message (longer text stays longer)
 * @param hasAction - a button needs time to be reached
 * @returns milliseconds, 3000–10000
 */
export function noticeMs(kind: NoticeKind, text: string, hasAction: boolean): number {
    let ms = BASE_MS[kind];

    if (hasAction) ms = Math.max(ms, 6000);

    ms += Math.floor(text.length / 40) * 1000;

    return Math.min(ms, 10000);
}
