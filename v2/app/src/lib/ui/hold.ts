/**
 * Svelte action: press and hold (cross-project rule — "a button's second action is a long
 * press opening its fluent menu"; bridge `ui/src/Select.svelte` `onpress` is the reference).
 *
 * A click runs the button's default as usual. Holding it for `ms` (420 by default) calls
 * `onhold` instead, and the click that ends the press is swallowed. While the press waits the
 * node carries `data-holding`, so CSS can fill the face (Button does). Works with a finger, a
 * mouse, and the keyboard / TV remote: holding Enter or OK opens the same menu, a short press
 * clicks. A finger that moves more than 10 px is a scroll or a drag, not a hold.
 *
 * The finger's implicit pointer capture is released at once, so lifting it over a row of the
 * menu that just opened lands on that row (a menu bar's press-drag-release).
 *
 * @example `<button use:hold={{ onhold: () => (open = true) }}>…</button>`
 */

/** Options of the {@link hold} action. */
export interface HoldOptions {
    /** Called when the press has been held long enough. `pointer` = a finger or mouse (not a key). */
    onhold: (via: { pointer: boolean }) => void;
    /** How long a press waits before it becomes a hold, in ms (default 420). */
    ms?: number;
    /** Off = the node behaves like a plain button (default on). */
    enabled?: boolean;
}

const SLOP_PX = 10;

/**
 * @param node - the pressable element (a button)
 * @param options - see {@link HoldOptions}
 * @returns the action's update and destroy hooks
 */
export function hold(node: HTMLElement, options: HoldOptions) {
    let opts = options;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let swallow = false;
    let startX = 0;
    let startY = 0;
    let keyDown = false;

    const enabled = () => opts.enabled !== false;

    const start = (pointer: boolean) => {
        node.dataset.holding = '';
        timer = setTimeout(() => {
            timer = null;
            swallow = pointer;
            delete node.dataset.holding;
            opts.onhold({ pointer });
        }, opts.ms ?? 420);
    };

    const cancel = () => {
        if (timer) clearTimeout(timer);

        timer = null;
        delete node.dataset.holding;
    };

    const onPointerDown = (e: PointerEvent) => {
        swallow = false;

        if (!enabled() || e.button !== 0 || (node as HTMLButtonElement).disabled) return;

        startX = e.clientX;
        startY = e.clientY;

        if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);

        start(true);
    };

    const onPointerMove = (e: PointerEvent) => {
        if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > SLOP_PX) cancel();
    };

    const onClick = (e: MouseEvent) => {
        if (!swallow) return;

        swallow = false;
        e.preventDefault();
        e.stopImmediatePropagation();
    };

    const onContextMenu = (e: Event) => {
        if (enabled()) e.preventDefault();
    };

    const isPressKey = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';

    const onKeyDown = (e: KeyboardEvent) => {
        if (!enabled() || !isPressKey(e)) return;

        e.preventDefault();

        if (e.repeat || keyDown) return;

        keyDown = true;
        start(false);
    };

    const onKeyUp = (e: KeyboardEvent) => {
        if (!enabled() || !isPressKey(e) || !keyDown) return;

        e.preventDefault();
        keyDown = false;

        if (timer) {
            cancel();
            node.click();
        }
    };

    const onBlur = () => {
        keyDown = false;
        cancel();
    };

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointerleave', cancel);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('click', onClick, true);
    node.addEventListener('contextmenu', onContextMenu);
    node.addEventListener('keydown', onKeyDown);
    node.addEventListener('keyup', onKeyUp);
    node.addEventListener('blur', onBlur);

    return {
        update(next: HoldOptions) {
            opts = next;
        },
        destroy() {
            cancel();
            node.removeEventListener('pointerdown', onPointerDown);
            node.removeEventListener('pointermove', onPointerMove);
            node.removeEventListener('pointerup', cancel);
            node.removeEventListener('pointerleave', cancel);
            node.removeEventListener('pointercancel', cancel);
            node.removeEventListener('click', onClick, true);
            node.removeEventListener('contextmenu', onContextMenu);
            node.removeEventListener('keydown', onKeyDown);
            node.removeEventListener('keyup', onKeyUp);
            node.removeEventListener('blur', onBlur);
        },
    };
}
