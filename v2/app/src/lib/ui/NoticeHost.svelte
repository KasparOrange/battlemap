<!--
  NoticeHost — shows the app's one notice (notice.svelte.ts): a floating card centred near the
  bottom, over every screen, sheet and dialog. Kind icon (info gold, success green, warning
  orange, error red), the text, an optional button (Undo — runs and closes), a close ×, and a
  hairline along the bottom that shrinks to the middle while the time runs out. A held finger
  (or mouse button) on the card pauses it. A new notice cross-fades over the old one.

  The countdown IS the hairline's CSS animation: the notice closes on its `animationend`, so a
  paused animation pauses the close for free and no timer can drift from what is drawn.

  Mount ONCE at the app's root. Uses the top layer (popover) where the browser has it, so a
  notice raised while a dialog is open shows above the dialog.

  Where it sits: centred over the area between `--notice-left` and `--notice-right`, raised by
  `--notice-bottom` (CSS custom properties a layout sets on an ancestor: the tablet layout
  keeps the notice over the map, clear of the tool panel; the phone layout lifts it above the
  tab bar). The `bottom` prop overrides `--notice-bottom`.

  While a modal dialog is open everything outside it is inert, so each `Dialog` holds its own
  host (`scope` = the dialog's id) and the notice shows in the topmost dialog's host instead
  (`dialog-stack.svelte.ts`) — an Undo raised from a dialog can be pressed.

  Props:
  - bottom: string — CSS length from the bottom edge (default THE GAP × 2)
  - scope: string — the dialog this host lives in (none = the app's root host)
-->
<script lang="ts">
    import Icon from './Icon.svelte';
    import IconButton from './IconButton.svelte';
    import { dialogStack } from './dialog-stack.svelte';
    import { dismiss, notices, type NoticeKind } from './notice.svelte';
    import { rise } from './fluent';
    import type { IconName } from './icons';

    interface Props {
        /** Distance from the bottom edge (CSS length). */
        bottom?: string;
        /** The dialog this host lives in; none for the root host. */
        scope?: string;
    }

    let { bottom, scope }: Props = $props();

    const ICONS: Record<NoticeKind, IconName> = { info: 'info', success: 'success', warning: 'warning', error: 'error' };

    let host = $state<HTMLElement>();
    let held = $state(false);

    // only the host of the topmost dialog (or the root host without one) draws the notice
    const current = $derived((scope ?? null) === dialogStack.top ? notices.current : null);
    const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

    // re-enter the top layer on every new notice, so it lands above a dialog opened since
    $effect(() => {
        const el = host;
        const id = current?.id;

        if (!el || !supportsPopover) return;

        if (id === undefined) {
            if (el.matches(':popover-open')) el.hidePopover();
            return;
        }

        if (el.matches(':popover-open')) el.hidePopover();

        el.showPopover();
    });

    function act() {
        const n = current;

        if (!n?.action) return;

        n.action.run();
        dismiss(n.id);
    }
</script>

<div
    bind:this={host}
    class="bm-notice-host"
    popover={supportsPopover ? 'manual' : undefined}
    style:--notice-bottom={bottom}
    aria-live="polite"
>
    {#if current}
        {#key current.id}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="card {current.kind}"
                role={current.kind === 'error' ? 'alert' : 'status'}
                in:rise={{ ms: 220, y: 10 }}
                out:rise={{ ms: 160, y: 4 }}
                onpointerdown={() => (held = true)}
                onpointerup={() => (held = false)}
                onpointercancel={() => (held = false)}
                onpointerleave={() => (held = false)}
            >
                <span class="kind"><Icon name={ICONS[current.kind]} filled /></span>
                <span class="text">{current.text}</span>
                {#if current.action}
                    <button type="button" class="action" onclick={act}>{current.action.label}</button>
                {/if}
                <span data-ctl="compact">
                    <IconButton icon="close" label="Close" variant="quiet" tooltip={false} onclick={() => dismiss(current.id)} />
                </span>
                <span
                    class="timer"
                    class:held
                    style:animation-duration="{current.ms}ms"
                    onanimationend={() => dismiss(current.id)}
                ></span>
            </div>
        {/key}
    {/if}
</div>

<style>
    .bm-notice-host {
        position: fixed;
        inset: auto var(--notice-right, 0px) calc(var(--notice-bottom, var(--g2)) + env(safe-area-inset-bottom))
            var(--notice-left, 0px);
        z-index: var(--z-notice);
        display: grid;
        justify-items: center;
        width: auto;
        height: auto;
        margin: 0;
        padding: 0 var(--g);
        border: 0;
        background: transparent;
        color: var(--t);
        overflow: visible;
        pointer-events: none;
    }

    .card {
        grid-area: 1 / 1;
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--g);
        min-height: var(--sq-toolbar);
        max-width: min(34rem, 100%);
        padding: calc(var(--g) / 2) calc(var(--g) / 2) calc(var(--g) / 2) var(--g2);
        overflow: hidden;
        border: 1.5px solid var(--hair);
        border-radius: var(--r);
        background: var(--m3);
        box-shadow: var(--elev-open);
        pointer-events: auto;
        --kind: var(--info);
    }

    .success {
        --kind: var(--ok);
    }

    .warning {
        --kind: var(--warn);
    }

    .error {
        --kind: var(--err);
    }

    .kind {
        display: flex;
        color: var(--kind);
    }

    .text {
        flex: 1;
        min-width: 0;
        font-size: var(--fs-body);
        line-height: 1.35;
        padding: calc(var(--g) / 2) 0;
    }

    .action {
        flex: none;
        min-height: var(--sq-compact);
        padding: 0 var(--g);
        border-radius: var(--r-ctl);
        color: var(--accent-text);
        font-family: var(--font-button);
        font-weight: var(--fw-button);
        font-size: var(--fs-body);
        transition: background-color var(--dur-tone) var(--ease-std);
    }

    @media (hover: hover) {
        .action:hover {
            background: var(--m4);
        }
    }

    .action:active {
        background: var(--m4);
    }

    /* the countdown: shrinks to the middle; its end closes the notice */
    .timer {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
        background: var(--kind);
        opacity: 0.7;
        transform-origin: center;
        animation-name: bm-notice-time;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
    }

    .timer.held {
        animation-play-state: paused;
    }

    @keyframes bm-notice-time {
        from {
            transform: scaleX(1);
        }

        to {
            transform: scaleX(0);
        }
    }
</style>
