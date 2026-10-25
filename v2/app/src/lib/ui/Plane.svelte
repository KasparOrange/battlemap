<!--
  Plane — an activator's surface grown out into a floating panel (fluent expansion rules 1–7).
  The building block of Menu and of NumberStepper's numpad; use it directly for any small
  anchored panel (a colour picker, a token's quick settings).

  Opens below the activator when there is room, else above; the activator takes the open
  tone and squares its joined corners, so both read as ONE surface. The height is measured
  and grows on the fluent clock (bloom on open, quicker fold on close), content fades on the
  same clock. Closes on Escape (focus returns to the activator), a press outside, a scroll of
  the page under it, or `open = false`. Only one plane is open at a time.

  Props:
  - anchor: HTMLElement — the activator it grows from
  - open: boolean (bindable) — shown or not
  - label: string — accessible name of the plane
  - role: 'menu' | 'dialog' | 'listbox' — ARIA role (default 'dialog')
  - pad: boolean — inner padding of THE GAP (default true)
  - onclose: () => void — called when the plane asks to close (Escape, outside press)
  - children: Snippet — the content
-->
<script lang="ts">
    import { tick, type Snippet } from 'svelte';
    import { claimPlane, placePlane, portal, type PlanePlacement } from './plane';
    import { closeMs, EASE_CLOSE, EASE_OPEN, openMs, still } from './fluent';
    import { scrollFade } from './scroll-fade';

    interface Props {
        /** The activator the plane grows from. */
        anchor: HTMLElement | undefined;
        /** Shown or not. */
        open: boolean;
        /** Accessible name of the plane. */
        label: string;
        /** ARIA role of the plane. */
        role?: 'menu' | 'dialog' | 'listbox';
        /** Inner padding of THE GAP. */
        pad?: boolean;
        /** Called when the plane asks to close. */
        onclose?: () => void;
        /** The content. */
        children: Snippet;
        /** The plane element, for focus management by the owner. */
        el?: HTMLElement;
    }

    let {
        anchor,
        open = $bindable(),
        label,
        role = 'dialog',
        pad = true,
        onclose,
        children,
        el = $bindable(),
    }: Props = $props();

    /** the plane's DOM exists (also while it folds away) */
    let rendered = $state(false);
    let phase: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
    let place = $state<PlanePlacement | null>(null);
    /** the plane is exactly as wide as its activator (both joined corners square) */
    let flush = $state(false);
    let animation: Animation | null = null;
    let release: (() => void) | null = null;

    /** THE GAP in px, read from the root (the TV scales it) */
    const margin = () => parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.5625;

    function requestClose() {
        if (onclose) onclose();
        else open = false;
    }

    /** measures the content and places the plane at its activator */
    function measureAndPlace(): number {
        if (!el || !anchor) return 0;

        const rect = anchor.getBoundingClientRect();
        const naturalW = el.offsetWidth;
        const naturalH = el.scrollHeight;

        place = placePlane(rect, naturalW, naturalH, margin());
        flush = naturalW <= rect.width + 1;
        anchor.dataset.joint = place.joint;

        return Math.min(naturalH, place.maxHeight);
    }

    async function show() {
        const from = phase === 'closing' && el ? el.offsetHeight : 0;

        phase = 'opening';
        rendered = true;
        await tick();

        if (!el || !anchor || phase !== 'opening') return;

        release ??= claimPlane(requestClose);
        animation?.cancel();
        el.style.height = 'auto';
        anchor.classList.add('open');
        measureAndPlace();
        await tick();

        const h = Math.min(el.scrollHeight, place?.maxHeight ?? el.scrollHeight);

        animation = el.animate(
            [
                { height: `${from}px`, opacity: from ? 1 : 0.4 },
                { height: `${h}px`, opacity: 1 },
            ],
            { duration: still() ? 0 : openMs(h - from), easing: EASE_OPEN },
        );
        await animation.finished.catch(() => undefined);

        if (phase === 'opening') phase = 'open';
    }

    async function hide() {
        phase = 'closing';
        anchor?.classList.remove('open');

        if (!el) {
            rendered = false;
            phase = 'closed';
            return;
        }

        const h = el.offsetHeight;

        animation?.cancel();
        animation = el.animate(
            [
                { height: `${h}px`, opacity: 1 },
                { height: '0px', opacity: 0 },
            ],
            { duration: still() ? 0 : closeMs(h), easing: EASE_CLOSE, fill: 'forwards' },
        );
        await animation.finished.catch(() => undefined);

        if (phase !== 'closing') return;

        if (anchor) delete anchor.dataset.joint;

        phase = 'closed';
        rendered = false;
        place = null;
        release?.();
        release = null;
    }

    $effect(() => {
        if (open && (phase === 'closed' || phase === 'closing')) void show();
        else if (!open && (phase === 'open' || phase === 'opening')) void hide();
    });

    // close on a press outside, Escape, or the page scrolling under the plane
    $effect(() => {
        if (!rendered) return;

        const outside = (e: PointerEvent) => {
            const target = e.target as Node;

            if (el?.contains(target) || anchor?.contains(target)) return;

            requestClose();
        };
        const key = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;

            e.stopPropagation();
            requestClose();
            anchor?.focus({ preventScroll: true });
        };
        const scroll = (e: Event) => {
            if (el?.contains(e.target as Node)) return;

            requestClose();
        };
        // a resize (rotation, the iOS toolbar folding) moves the plane, it does not close it
        const resize = () => {
            if (phase === 'open') measureAndPlace();
        };

        window.addEventListener('pointerdown', outside, true);
        window.addEventListener('keydown', key, true);
        window.addEventListener('scroll', scroll, true);
        window.addEventListener('resize', resize);

        return () => {
            window.removeEventListener('pointerdown', outside, true);
            window.removeEventListener('keydown', key, true);
            window.removeEventListener('scroll', scroll, true);
            window.removeEventListener('resize', resize);
        };
    });
</script>

{#if rendered}
    <div
        bind:this={el}
        use:portal={anchor}
        class="bm-plane"
        class:pad
        class:up={place?.joint === 'up'}
        class:end={place?.align === 'end'}
        class:flush
        {role}
        aria-label={label}
        tabindex="-1"
        style:left={place ? `${place.left}px` : '-9999px'}
        style:top={place?.top !== undefined ? `${place.top}px` : undefined}
        style:bottom={place?.bottom !== undefined ? `${place.bottom}px` : undefined}
        style:min-width={place ? `${place.minWidth}px` : undefined}
        style:max-height={place ? `${place.maxHeight}px` : undefined}
        style:--jx={place ? `${place.jointX}px` : '0px'}
        style:--jw={place ? `${place.jointW}px` : '0px'}
    >
        <div class="inner bm-scroll" use:scrollFade>
            {@render children()}
        </div>
    </div>
{/if}

<style>
    .bm-plane {
        position: fixed;
        z-index: var(--z-plane);
        display: flex;
        flex-direction: column;
        overflow: visible;
        background: var(--m3);
        color: var(--t);
        border: var(--glow-w) solid var(--hair);
        border-radius: var(--r);
        border-top-left-radius: 0;
        box-shadow: var(--elev-open);
        outline: none;
    }

    .bm-plane.end {
        border-top-left-radius: var(--r);
        border-top-right-radius: 0;
    }

    .bm-plane.flush {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }

    .bm-plane.up {
        border-radius: var(--r);
        border-bottom-left-radius: 0;
    }

    .bm-plane.up.end {
        border-bottom-left-radius: var(--r);
        border-bottom-right-radius: 0;
    }

    .bm-plane.up.flush {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    /* the joint: one strip of the open tone over both hairlines where the
       activator meets the plane (and under the fillet beside it) — the two
       read as one surface. Coordinates are the plane's padding box. */
    .bm-plane::before {
        content: '';
        position: absolute;
        left: var(--jx);
        width: calc(var(--jw) - 2 * var(--glow-w) + var(--r-ctl));
        top: calc(-2 * var(--glow-w) - 0.5px);
        height: calc(2 * var(--glow-w) + 1px);
        background: var(--m3);
    }

    .bm-plane.end::before {
        left: calc(var(--jx) - var(--r-ctl));
    }

    .bm-plane.flush::before {
        width: calc(var(--jw) - 2 * var(--glow-w));
    }

    .bm-plane.flush.end::before {
        left: var(--jx);
    }

    .bm-plane.up::before {
        top: auto;
        bottom: calc(-2 * var(--glow-w) - 0.5px);
    }

    /* the concave fillet where a wider plane meets the activator's side —
       no sharp inner corner (tafel guideline 16b) */
    .bm-plane::after {
        content: '';
        position: absolute;
        width: var(--r-ctl);
        height: var(--r-ctl);
        left: calc(var(--jx) + var(--jw) - var(--glow-w));
        top: calc(-1 * var(--r-ctl) - var(--glow-w));
        background: radial-gradient(circle at 100% 0, transparent calc(var(--r-ctl) - 0.5px), var(--m3) var(--r-ctl));
        pointer-events: none;
    }

    .bm-plane.end::after {
        left: calc(var(--jx) - var(--glow-w) - var(--r-ctl));
        background: radial-gradient(circle at 0 0, transparent calc(var(--r-ctl) - 0.5px), var(--m3) var(--r-ctl));
    }

    .bm-plane.up::after {
        top: auto;
        bottom: calc(-1 * var(--r-ctl) - var(--glow-w));
        background: radial-gradient(circle at 100% 100%, transparent calc(var(--r-ctl) - 0.5px), var(--m3) var(--r-ctl));
    }

    .bm-plane.up.end::after {
        background: radial-gradient(circle at 0 100%, transparent calc(var(--r-ctl) - 0.5px), var(--m3) var(--r-ctl));
    }

    .bm-plane.flush::after {
        display: none;
    }

    .inner {
        min-height: 0;
        flex: 1;
        border-radius: inherit;
    }

    .pad .inner {
        padding: calc(var(--g) / 2);
    }
</style>
