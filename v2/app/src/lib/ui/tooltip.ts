/**
 * Svelte action: a tooltip — one short line naming a control. Shown on a mouse hover (after
 * 500 ms) and on keyboard / D-pad focus (`:focus-visible`, after 250 ms; on the TV this is how
 * an icon-only control says what it is). Never on touch: a finger has no hover, and a long
 * press belongs to the button's menu. One bubble element serves the whole page; it is placed
 * once when shown (no work per frame) above the control, or below when there is no room.
 *
 * @example `<button use:tooltip={'Undo'}>…</button>` — pass null to switch it off
 */

let bubble: HTMLDivElement | null = null;

function getBubble(near: HTMLElement): HTMLDivElement {
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'bm-tooltip';
        bubble.setAttribute('role', 'tooltip');
        bubble.id = 'bm-tooltip';
    }

    // live inside the open dialog (top layer) or the themed wrapper, so it inherits the theme
    const host = near.closest('dialog[open]') ?? near.closest('[data-theme]') ?? document.body;

    if (bubble.parentElement !== host) host.appendChild(bubble);

    return bubble;
}

function place(node: HTMLElement, el: HTMLDivElement) {
    const r = node.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const gap = 8;
    const above = r.top - b.height - gap;
    const top = above > gap ? above : r.bottom + gap;
    const left = Math.max(gap, Math.min(window.innerWidth - b.width - gap, r.left + r.width / 2 - b.width / 2));

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
}

/**
 * @param node - the control
 * @param text - the tooltip line, or null for none
 * @returns the action's update and destroy hooks
 */
export function tooltip(node: HTMLElement, text: string | null) {
    let current = text;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = false;

    const hide = () => {
        if (timer) clearTimeout(timer);

        timer = null;

        if (!shown || !bubble) return;

        shown = false;
        delete bubble.dataset.show;
        node.removeAttribute('aria-describedby');
    };

    const show = (delay: number) => {
        if (!current) return;

        if (timer) clearTimeout(timer);

        timer = setTimeout(() => {
            if (!current || !node.isConnected) return;

            const el = getBubble(node);

            el.textContent = current;
            el.dataset.show = '';
            place(node, el);
            shown = true;
            node.setAttribute('aria-describedby', el.id);
        }, delay);
    };

    const onEnter = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') show(500);
    };

    const onFocus = (e: FocusEvent) => {
        if ((e.target as HTMLElement).matches(':focus-visible')) show(250);
    };

    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', hide);
    node.addEventListener('pointerdown', hide);
    node.addEventListener('focusin', onFocus);
    node.addEventListener('focusout', hide);
    node.addEventListener('keydown', hide);

    return {
        update(next: string | null) {
            current = next;

            if (!next) hide();
        },
        destroy() {
            hide();
            node.removeEventListener('pointerenter', onEnter);
            node.removeEventListener('pointerleave', hide);
            node.removeEventListener('pointerdown', hide);
            node.removeEventListener('focusin', onFocus);
            node.removeEventListener('focusout', hide);
            node.removeEventListener('keydown', hide);
        },
    };
}
