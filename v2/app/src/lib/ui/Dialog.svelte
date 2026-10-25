<!--
  Dialog — a modal step that needs the DM's attention before the game goes on: the upload's
  squares dialog, measuring the TV, "Delete this map from the shared library?". Built on the
  native <dialog> (the browser's top layer: above every sheet and transform, focus kept inside,
  Escape for free). Centred on tablet and desktop; on a phone it rises from the bottom edge as
  a full-width sheet with the actions in thumb reach.

  Commit and cancel live in the `footer`, the commit last and as the one `primary` Button.
  Settings that only adjust something apply at once and need no dialog (fluent rule 8).

  Props:
  - open: boolean (bindable) · title · description (a line under the title) · icon: IconName
  - size: 'sm' (420) | 'md' (480) | 'lg' (720) | 'full' (the grid editor)
  - dismissible: boolean — Escape and a tap on the backdrop close it (default true)
  - onclose: () => void · footer: Snippet · children: Snippet
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';
    import IconButton from './IconButton.svelte';
    import { scrollFade } from './scroll-fade';
    import type { IconName } from './icons';

    interface Props {
        /** Shown or not. */
        open: boolean;
        /** The question or task. */
        title: string;
        /** A line under the title. */
        description?: string;
        /** An icon before the title. */
        icon?: IconName;
        /** Width class. */
        size?: 'sm' | 'md' | 'lg' | 'full';
        /** Escape and a backdrop tap close it. */
        dismissible?: boolean;
        /** Closed by the user (Escape, backdrop, ×). */
        onclose?: () => void;
        /** The actions row. */
        footer?: Snippet;
        /** The content. */
        children?: Snippet;
    }

    let {
        open = $bindable(),
        title,
        description,
        icon,
        size = 'md',
        dismissible = true,
        onclose,
        footer,
        children,
    }: Props = $props();

    let dialog = $state<HTMLDialogElement>();
    const titleId = `bm-dialog-${Math.random().toString(36).slice(2, 9)}`;
    let closing = $state(false);

    function requestClose() {
        if (onclose) onclose();
        else open = false;
    }

    $effect(() => {
        if (!dialog) return;

        if (open && !dialog.open) {
            closing = false;
            dialog.showModal();
            focusStart(dialog);
        } else if (!open && dialog.open && !closing) {
            // let the leave animation run, then really close
            closing = true;

            const el = dialog;
            const done = () => {
                el.close();
                closing = false;
            };
            const ms = parseFloat(getComputedStyle(el).animationDuration) * 1000;

            if (!ms) done();
            else el.addEventListener('animationend', done, { once: true });
        }
    });

    /**
     * Where the focus starts: a control marked `data-autofocus` / `autofocus` inside, else the
     * dialog itself — never the × (the browser's pick), which then showed its "Close" tooltip
     * over the title (qa#22). The D-pad's first press moves on from the dialog (`spatial.ts`).
     */
    function focusStart(el: HTMLDialogElement) {
        const start = el.querySelector<HTMLElement>('.body [data-autofocus], .body [autofocus], footer [data-autofocus], footer [autofocus]');

        (start ?? el).focus({ preventScroll: true });
    }

    function onCancel(e: Event) {
        e.preventDefault();

        if (dismissible) requestClose();
    }

    function onBackdrop(e: MouseEvent) {
        if (dismissible && e.target === dialog) requestClose();
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
    bind:this={dialog}
    class="bm-dialog {size}"
    class:closing
    aria-labelledby={titleId}
    tabindex="-1"
    oncancel={onCancel}
    onclick={onBackdrop}
>
    <div class="card">
        <header>
            {#if icon}<span class="ico"><Icon name={icon} /></span>{/if}
            <div class="titles">
                <h2 id={titleId}>{title}</h2>
                {#if description}<p>{description}</p>{/if}
            </div>
            {#if dismissible}
                <span data-ctl="compact"><IconButton icon="close" label="Close" variant="quiet" onclick={requestClose} /></span>
            {/if}
        </header>
        {#if children}
            <div class="body bm-scroll" use:scrollFade>{@render children()}</div>
        {/if}
        {#if footer}<footer>{@render footer()}</footer>{/if}
    </div>
</dialog>

<style>
    .bm-dialog {
        margin: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--t);
        max-width: calc(100vw - 2 * var(--g2));
        max-height: calc(100dvh - 2 * var(--g2));
        overflow: visible;
    }

    .sm {
        width: 26.25rem;
    }

    .md {
        width: var(--dialog-w);
    }

    .lg {
        width: 45rem;
    }

    .full {
        width: calc(100vw - 2 * var(--g2));
        height: calc(100dvh - 2 * var(--g2));
    }

    .bm-dialog:focus {
        outline: none;
    }

    .bm-dialog::backdrop {
        background: var(--scrim);
        animation: bm-fade var(--dur-fade) var(--ease-std);
    }

    .bm-dialog[open] {
        animation: bm-dialog-in var(--dur-open) var(--ease-close);
    }

    .bm-dialog.closing {
        animation: bm-dialog-out var(--dur-close) var(--ease-close) forwards;
    }

    .card {
        display: flex;
        flex-direction: column;
        max-height: calc(100dvh - 2 * var(--g2));
        height: 100%;
        background: var(--m0);
        border: 1.5px solid var(--hair);
        border-radius: var(--r);
        box-shadow: var(--elev-open);
        overflow: hidden;
    }

    header {
        display: flex;
        align-items: flex-start;
        gap: var(--g);
        padding: var(--g2) var(--g) var(--g) var(--g2);
    }

    .ico {
        display: grid;
        place-items: center;
        width: 2.25rem;
        height: 2.25rem;
        flex: none;
        border-radius: var(--r-ctl);
        background: color-mix(in srgb, var(--accent) 16%, var(--m1));
        color: var(--accent-text);
    }

    .titles {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
        min-width: 0;
        padding-top: 0.25rem;
    }

    h2 {
        font-family: var(--font-title);
        font-weight: var(--fw-title);
        font-size: var(--fs-title);
        line-height: var(--lh-tight);
        letter-spacing: -0.01em;
    }

    .titles p {
        font-size: var(--fs-body);
        color: var(--t2);
        line-height: var(--lh-body);
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
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: var(--g);
        padding: var(--g2);
        border-top: 1px solid var(--hair);
    }

    /* phone: a sheet rising from the bottom edge, actions in thumb reach */
    @media (max-width: 600px) {
        .bm-dialog:not(.full) {
            width: 100vw;
            max-width: 100vw;
            margin: auto 0 0;
        }

        .bm-dialog:not(.full) .card {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            border-bottom: 0;
        }

        .bm-dialog[open]:not(.full) {
            animation-name: bm-sheet-in;
        }

        .bm-dialog.closing:not(.full) {
            animation-name: bm-sheet-out;
        }

        footer {
            padding-bottom: calc(var(--g2) + env(safe-area-inset-bottom));
        }

        footer > :global(*) {
            flex: 1;
        }
    }

    @keyframes bm-fade {
        from {
            opacity: 0;
        }
    }

    @keyframes bm-dialog-in {
        from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
        }
    }

    @keyframes bm-dialog-out {
        to {
            opacity: 0;
            transform: translateY(6px) scale(0.98);
        }
    }

    @keyframes bm-sheet-in {
        from {
            transform: translateY(100%);
        }
    }

    @keyframes bm-sheet-out {
        to {
            transform: translateY(100%);
        }
    }
</style>
