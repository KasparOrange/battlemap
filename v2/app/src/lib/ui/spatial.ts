/**
 * D-pad navigation — the TV remote fallback (root CLAUDE.md "TV Remote Fallback Policy"):
 * every control on a TV screen must be reachable with the arrow keys and activatable with OK.
 *
 * The arrows move the focus GEOMETRICALLY: to the nearest focusable control in the pressed
 * direction, preferring controls in the same row (or column), with a penalty for sideways
 * distance (the tafel demo's focus map). Text fields keep ← → for their caret until the caret
 * reaches an end; range inputs and selects keep their own arrows. A scope (an open modal
 * dialog, an element with `data-nav-scope`) keeps the focus inside it while focus is there.
 * Back (Escape, the remote's Back) is offered to the focused element first as a `bm-back`
 * event that bubbles, then to `onBack`.
 *
 * The focus ring itself is CSS (base.css `:focus-visible`; thicker on the TV, and
 * `[data-focus-grow]` tiles grow a little).
 *
 * @example
 *   setSurface('tv');
 *   const stop = installDpad({ onBack: () => router.back() });
 *   focusFirst();
 */

/** A direction of the D-pad. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Options of {@link installDpad}. */
export interface DpadOptions {
    /** Called on Back when no element handled the `bm-back` event; return true if handled. */
    onBack?: () => boolean | void;
}

const FOCUSABLE = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const KEYS: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
};

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack']);

/**
 * Marks the page as the TV (10-foot sizes, thick focus ring — tokens.css) or the companion.
 * @param surface - 'tv' or 'companion'
 */
export function setSurface(surface: 'tv' | 'companion'): void {
    if (surface === 'tv') document.documentElement.dataset.surface = 'tv';
    else delete document.documentElement.dataset.surface;
}

/**
 * The element the D-pad is confined to right now: the open modal dialog, else the nearest
 * `[data-nav-scope]` around the focus, else the body.
 * @returns the scope element
 */
export function activeScope(): Element {
    const dialogs = document.querySelectorAll('dialog[open]');

    const top = dialogs[dialogs.length - 1];

    if (top) return top;

    const active = document.activeElement;

    return active?.closest('[data-nav-scope]') ?? document.body;
}

/**
 * The focusable, visible controls inside a scope.
 * @param scope - the element to search
 * @returns the controls, in document order
 */
export function focusables(scope: Element = activeScope()): HTMLElement[] {
    return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0 && !el.closest('[inert], [aria-hidden="true"]'),
    );
}

/**
 * Focuses the scope's starting control: one marked `data-autofocus`, else the first one.
 * @param scope - where to look (default: the active scope)
 * @returns true when something got the focus
 */
export function focusFirst(scope: Element = activeScope()): boolean {
    const list = focusables(scope);
    const target = list.find((el) => el.hasAttribute('data-autofocus')) ?? list[0];

    target?.focus();

    return !!target;
}

/**
 * Picks the control the D-pad lands on from `from` in `dir` — pure geometry, exported for tests.
 * @param from - the focused control's rect
 * @param candidates - the other controls and their rects
 * @param dir - the direction pressed
 * @returns the chosen candidate, or null when nothing lies that way
 */
export function pickInDirection<T>(from: DOMRect, candidates: { item: T; rect: DOMRect }[], dir: Direction): T | null {
    const horizontal = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    let best: T | null = null;
    let bestScore = Infinity;

    for (const { item, rect } of candidates) {
        // how far ahead the candidate starts (edge to edge), must be ahead at all
        const ahead = horizontal
            ? sign > 0
                ? rect.left - from.right
                : from.left - rect.right
            : sign > 0
              ? rect.top - from.bottom
              : from.top - rect.bottom;
        const centreAhead = horizontal
            ? (rect.left + rect.width / 2 - (from.left + from.width / 2)) * sign
            : (rect.top + rect.height / 2 - (from.top + from.height / 2)) * sign;

        if (centreAhead <= 1 || ahead < -Math.min(from.width, from.height) / 2) continue;

        // sideways gap: 0 when the two overlap across the direction (same row / column)
        const lateral = horizontal
            ? Math.max(0, rect.top - from.bottom, from.top - rect.bottom)
            : Math.max(0, rect.left - from.right, from.left - rect.right);
        const score = Math.max(0, ahead) + lateral * 3;

        if (score < bestScore) {
            bestScore = score;
            best = item;
        }
    }

    return best;
}

/**
 * Moves the focus one step in a direction.
 * @param dir - the direction pressed
 * @param from - the control to start from (default: the focused element)
 * @returns true when the focus moved
 */
export function moveFocus(dir: Direction, from: HTMLElement | null = document.activeElement as HTMLElement | null): boolean {
    const scope = activeScope();

    if (!from || from === document.body || !scope.contains(from)) return focusFirst(scope);

    const fromRect = from.getBoundingClientRect();
    const candidates = focusables(scope)
        .filter((el) => el !== from && !from.contains(el))
        .map((el) => ({ item: el, rect: el.getBoundingClientRect() }));
    const next = pickInDirection(fromRect, candidates, dir);

    if (!next) return false;

    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

    return true;
}

/** Whether a key's arrow belongs to the focused element itself (caret, slider, select). */
function ownsArrow(el: Element | null, dir: Direction): boolean {
    if (!el) return false;

    if (el instanceof HTMLSelectElement) return true;

    if (el instanceof HTMLTextAreaElement) return true;

    if (el instanceof HTMLInputElement) {
        if (el.type === 'range') return dir === 'left' || dir === 'right';

        if (['checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes(el.type)) return false;

        if (dir === 'up' || dir === 'down') return false;

        // text-like: the caret moves until it reaches the end it is heading for
        const at = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;

        if (at !== end) return true;

        return dir === 'left' ? at > 0 : at < el.value.length;
    }

    return false;
}

/**
 * Installs the D-pad on the page: arrows move the focus, Back goes back.
 * @param options - see {@link DpadOptions}
 * @returns a function that removes it again
 */
export function installDpad(options: DpadOptions = {}): () => void {
    const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;

        const dir = KEYS[e.key];

        if (dir) {
            if (ownsArrow(document.activeElement, dir)) return;

            if (moveFocus(dir)) e.preventDefault();

            return;
        }

        if (BACK_KEYS.has(e.key)) {
            const target = (document.activeElement as HTMLElement | null) ?? document.body;
            const back = new CustomEvent('bm-back', { bubbles: true, cancelable: true });

            target.dispatchEvent(back);

            if (back.defaultPrevented) {
                e.preventDefault();
                return;
            }

            if (options.onBack?.()) e.preventDefault();
        }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
}

/**
 * Svelte action: confines the D-pad to this element while the focus is inside it (an open
 * plane, a TV overlay).
 * @param node - the scope element
 * @returns the action's destroy hook
 */
export function navScope(node: HTMLElement) {
    node.dataset.navScope = '';

    return {
        destroy() {
            delete node.dataset.navScope;
        },
    };
}
