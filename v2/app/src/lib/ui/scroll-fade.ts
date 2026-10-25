/**
 * Svelte action: a scrollport's edges melt into the surface only while content is hidden on
 * that side (tafel guideline 27 — a mask on the scrollport itself, never a painted overlay;
 * the native scrollbar stays hidden). Sets `data-fade` = none | top | bottom | both on the
 * node; base.css `.bm-scroll[data-fade]` draws the mask.
 *
 * Writes the attribute only when the answer changes (ui-performance rule 1), so a scroll
 * through a long list costs one comparison per event and no DOM write.
 *
 * @example `<div class="bm-scroll" use:scrollFade>…</div>`
 * @param node - the scrolling element
 * @returns the action's destroy hook
 */
export function scrollFade(node: HTMLElement) {
    let last = '';

    const update = () => {
        const top = node.scrollTop > 1;
        const bottom = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
        const fade = top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none';

        if (fade === last) return;

        last = fade;
        node.dataset.fade = fade;
    };

    const resize = new ResizeObserver(update);

    resize.observe(node);

    // content growing inside (rows added) changes scrollHeight without resizing the port
    const mutate = new MutationObserver(update);

    mutate.observe(node, { childList: true, subtree: true });
    node.addEventListener('scroll', update, { passive: true });
    update();

    return {
        destroy() {
            resize.disconnect();
            mutate.disconnect();
            node.removeEventListener('scroll', update);
        },
    };
}
