<!--
  Sheet — a surface that slides in from an edge of its container.

  - side="bottom" — the phone's tool panel above the tab bar, and any modal list on a phone
    (the shared library). Two resting heights (`detent`: half | full); drag the handle or
    the header to move it, it settles on the nearer one (a flick goes on in its direction).
    In the half position the list's end can still be scrolled into view.
  - side="right" / "left" — the tablet's tool panel docked beside the rail, a side list on the
    desktop. Slides by its width.

  Non-modal by default: the map behind stays live (the DM panel). `modal` adds the scrim,
  closes on a tap outside and on Escape. All motion is one transform (composited); a sheet
  never animates its height. The sheet fills its positioned container — the layout places it.

  Props:
  - side: 'bottom' | 'right' | 'left' · open: boolean (bindable)
  - detent: 'half' | 'full' (bindable, bottom only) · detents: allowed resting heights
  - modal: boolean · title · eyebrow · actions: Snippet · footer: Snippet · children: Snippet
  - closable: boolean — a × in the header (default: modal) · onclose: () => void
  - label: string — accessible name (default the title)
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import IconButton from './IconButton.svelte';
    import { scrollFade } from './scroll-fade';

    type Detent = 'half' | 'full';

    interface Props {
        /** The edge it comes from. */
        side?: 'bottom' | 'right' | 'left';
        /** Shown or not. */
        open: boolean;
        /** Resting height of a bottom sheet. */
        detent?: Detent;
        /** The resting heights the user can drag to. */
        detents?: Detent[];
        /** Scrim behind, closes on outside tap and Escape. */
        modal?: boolean;
        /** Header title. */
        title?: string;
        /** Small uppercase line over the title. */
        eyebrow?: string;
        /** Header end: actions. */
        actions?: Snippet;
        /** Pinned under the body. */
        footer?: Snippet;
        /** A close × in the header. */
        closable?: boolean;
        /** Asked to close (×, scrim, Escape, dragged down). */
        onclose?: () => void;
        /** Accessible name. */
        label?: string;
        /** The body. */
        children: Snippet;
    }

    let {
        side = 'bottom',
        open = $bindable(),
        detent = $bindable('half'),
        detents = ['half', 'full'],
        modal = false,
        title,
        eyebrow,
        actions,
        footer,
        closable = modal,
        onclose,
        label,
        children,
    }: Props = $props();

    /** how much of a bottom sheet's height a detent hides */
    const HIDDEN: Record<Detent, number> = { half: 0.45, full: 0 };

    let sheet = $state<HTMLElement>();
    let height = $state(0);
    let dragY = $state<number | null>(null);

    const restY = $derived(side === 'bottom' ? height * HIDDEN[detent] : 0);
    const y = $derived(dragY ?? restY);

    function close() {
        if (onclose) onclose();
        else open = false;
    }

    $effect(() => {
        if (!sheet || side !== 'bottom') return;

        const el = sheet;
        const observer = new ResizeObserver(() => {
            if (el.offsetHeight !== height) height = el.offsetHeight;
        });

        observer.observe(el);

        return () => observer.disconnect();
    });

    $effect(() => {
        if (!open || !modal) return;

        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };

        window.addEventListener('keydown', key);

        return () => window.removeEventListener('keydown', key);
    });

    // ── dragging a bottom sheet by its handle / header
    let startY = 0;
    let startOffset = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;

    function dragStart(e: PointerEvent) {
        if (side !== 'bottom' || e.button !== 0) return;

        if ((e.target as HTMLElement).closest('button, a, input')) return;

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        startY = e.clientY;
        startOffset = restY;
        lastY = e.clientY;
        lastT = e.timeStamp;
        velocity = 0;
        dragY = restY;
    }

    function dragMove(e: PointerEvent) {
        if (dragY === null) return;

        const dt = Math.max(1, e.timeStamp - lastT);

        velocity = (e.clientY - lastY) / dt;
        lastY = e.clientY;
        lastT = e.timeStamp;
        dragY = Math.max(0, startOffset + e.clientY - startY);
    }

    function dragEnd() {
        if (dragY === null) return;

        const at = dragY;
        const options = detents.map((d) => ({ d, y: height * HIDDEN[d] }));

        dragY = null;

        // dragged well below the lowest rest, or flicked down from it → close
        const lowest = Math.max(...options.map((o) => o.y));

        if (at > lowest + height * 0.2 || (velocity > 0.6 && at > lowest)) {
            close();
            return;
        }

        if (!options.length) return;

        let pick = options.reduce((a, b) => (Math.abs(b.y - at) < Math.abs(a.y - at) ? b : a));

        if (Math.abs(velocity) > 0.5) {
            const sorted = [...options].sort((a, b) => a.y - b.y);
            const ahead = velocity < 0 ? sorted.filter((o) => o.y < at) : sorted.filter((o) => o.y > at);

            const next = velocity < 0 ? ahead[ahead.length - 1] : ahead[0];

            if (next) pick = next;
        }

        detent = pick.d;
    }
</script>

{#if modal}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="scrim" class:open onclick={close}></div>
{/if}

<div
    bind:this={sheet}
    class="bm-sheet {side}"
    class:open
    class:dragging={dragY !== null}
    class:modal
    style:--y="{y}px"
    role={modal ? 'dialog' : 'region'}
    aria-modal={modal || undefined}
    aria-label={label ?? title}
    aria-hidden={!open || undefined}
    inert={!open}
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="grab" onpointerdown={dragStart} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd}>
        {#if side === 'bottom'}<span class="handle" aria-hidden="true"></span>{/if}
        {#if title || eyebrow || actions || closable}
            <header>
                <div class="titles">
                    {#if eyebrow}<span class="bm-eyebrow">{eyebrow}</span>{/if}
                    {#if title}<h2>{title}</h2>{/if}
                </div>
                <div class="actions" data-ctl="compact">
                    {#if actions}{@render actions()}{/if}
                    {#if closable}<IconButton icon="close" label="Close" variant="quiet" onclick={close} />{/if}
                </div>
            </header>
        {/if}
    </div>
    <div class="body bm-scroll" use:scrollFade>
        {@render children()}
    </div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
    <!-- the part a detent hides below the edge: body and footer end above it (changes per
         detent, not per drag move — no layout while a finger drags) -->
    {#if side === 'bottom'}<div class="lift" style:height="{restY}px" aria-hidden="true"></div>{/if}
</div>

<style>
    .scrim {
        position: absolute;
        inset: 0;
        z-index: var(--z-sheet);
        background: var(--scrim);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--dur-sheet-close) var(--ease-std);
    }

    .scrim.open {
        opacity: 1;
        pointer-events: auto;
        transition-duration: var(--dur-sheet-open);
    }

    .bm-sheet {
        position: absolute;
        z-index: var(--z-sheet);
        display: flex;
        flex-direction: column;
        background: var(--m0);
        border: 1.5px solid var(--hair);
        border-radius: var(--r);
        box-shadow: var(--elev-float);
        color: var(--t);
        overflow: hidden;
        visibility: hidden;
        transition:
            transform var(--dur-sheet-close) var(--ease-close),
            visibility 0s linear var(--dur-sheet-close);
    }

    .bm-sheet.open {
        visibility: visible;
        transition:
            transform var(--dur-sheet-open) var(--ease-close),
            visibility 0s;
    }

    .bm-sheet.dragging {
        transition: none;
    }

    .modal {
        box-shadow: var(--elev-open);
    }

    /* bottom: the full height, moved down by the detent */
    .bottom {
        left: 0;
        right: 0;
        bottom: 0;
        height: var(--sheet-h, 88%);
        border-bottom-left-radius: var(--sheet-foot-r, var(--r));
        border-bottom-right-radius: var(--sheet-foot-r, var(--r));
        transform: translateY(calc(100% + 2rem));
    }

    .bottom.open {
        transform: translateY(var(--y));
    }

    .right,
    .left {
        top: 0;
        bottom: 0;
        width: var(--sheet-w, var(--panel-w));
        max-width: 100%;
    }

    .right {
        right: 0;
        transform: translateX(calc(100% + 2rem));
    }

    .left {
        left: 0;
        transform: translateX(calc(-100% - 2rem));
    }

    .right.open,
    .left.open {
        transform: none;
    }

    .grab {
        flex: none;
        touch-action: none;
    }

    .left .grab,
    .right .grab {
        touch-action: auto;
    }

    .bottom header {
        min-height: 0;
        padding-top: 0;
    }

    .handle {
        display: block;
        width: 2.5rem;
        height: 4px;
        margin: calc(var(--g) * 0.75) auto 0;
        border-radius: 999px;
        background: var(--hair-strong);
    }

    header {
        display: flex;
        align-items: center;
        gap: var(--g);
        min-height: var(--sq-toolbar);
        padding: calc(var(--g) / 2) var(--g) calc(var(--g) / 2) var(--g2);
    }

    .titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
    }

    h2 {
        font-family: var(--font-title);
        font-weight: var(--fw-title);
        font-size: var(--fs-title);
        line-height: var(--lh-tight);
        letter-spacing: -0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .actions {
        display: flex;
        align-items: center;
        gap: calc(var(--g) / 2);
    }

    .body {
        display: flex;
        flex-direction: column;
        gap: var(--g2);
        flex: 1;
        min-height: 0;
        padding: var(--g) var(--g2) var(--g2);
    }

    footer {
        display: flex;
        gap: var(--g);
        padding: var(--g) var(--g2) var(--g2);
        border-top: 1px solid var(--hair);
    }

    .lift {
        flex: none;
    }
</style>
