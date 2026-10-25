<!--
  Menu — a list of choices that grows out of its activator (a Plane with menu rows). Opened by
  a Button's long press (its second action), by an IconButton such as "⋯", or by any element.

  Rows: icon · label · optional explanation line · a check on the current choice; rows sit
  half THE GAP apart so two highlights never touch (tafel guideline 20a, at touch row height). A row with `divider`
  starts a new group. ↑ ↓ walk the rows, Enter picks, Escape closes. When the menu was opened
  by holding a finger on the activator (`held`), lifting the finger over a row picks it.

  Props:
  - anchor: HTMLElement — the activator
  - open: boolean (bindable)
  - items: MenuItem[] — the rows
  - label: string — accessible name
  - held: boolean — opened by a press-and-hold: release over a row picks it
  - focus: boolean — move the keyboard focus into the menu on open (keyboard / D-pad opens)
  - onpick: (id: string) => void — a row was chosen (the menu closes itself)
-->
<script lang="ts" module>
    import type { IconName } from './icons';

    /** One row of a {@link Menu}. */
    export interface MenuItem {
        /** Returned by `onpick`. */
        id: string;
        /** The row's text. */
        label: string;
        /** Leading icon. */
        icon?: IconName;
        /** A line of explanation under the label (what this choice does). */
        description?: string;
        /** The current choice — shows a check. */
        checked?: boolean;
        /** A destructive choice — rose ink. */
        danger?: boolean;
        /** Shown but not choosable. */
        disabled?: boolean;
        /** Starts a new group (a hairline above). */
        divider?: boolean;
        /** A key that shortcuts this row, shown as a cap (desktop). */
        kbd?: string;
    }
</script>

<script lang="ts">
    import { tick } from 'svelte';
    import Plane from './Plane.svelte';
    import Icon from './Icon.svelte';

    interface Props {
        /** The activator. */
        anchor: HTMLElement | undefined;
        /** Shown or not. */
        open: boolean;
        /** The rows. */
        items: MenuItem[];
        /** Accessible name. */
        label: string;
        /** Opened by a press-and-hold: lifting the finger over a row picks it. */
        held?: boolean;
        /** Move the keyboard focus into the menu when it opens. */
        focus?: boolean;
        /** A row was chosen. */
        onpick: (id: string) => void;
    }

    let { anchor, open = $bindable(), items, label, held = false, focus = false, onpick }: Props = $props();

    let el = $state<HTMLElement>();
    let picked = false;

    $effect(() => {
        if (!open) return;

        picked = false;

        if (focus) void tick().then(() => rows()[0]?.focus({ preventScroll: true }));
    });

    function rows(): HTMLButtonElement[] {
        return el ? [...el.querySelectorAll<HTMLButtonElement>('button.row:not(:disabled)')] : [];
    }

    function pick(item: MenuItem) {
        if (picked || item.disabled) return;

        picked = true;
        open = false;
        onpick(item.id);
        anchor?.focus({ preventScroll: true });
    }

    function onKey(e: KeyboardEvent) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

        e.preventDefault();
        e.stopPropagation();

        const list = rows();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length;

        list[next]?.focus();
    }
</script>

<Plane {anchor} bind:open bind:el {label} role="menu">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="rows" onkeydown={onKey}>
        {#each items as item (item.id)}
            {#if item.divider}<div class="divider" role="separator"></div>{/if}
            <button
                type="button"
                class="row"
                class:danger={item.danger}
                class:checked={item.checked}
                role="menuitem"
                disabled={item.disabled}
                onclick={() => pick(item)}
                onpointerup={() => held && pick(item)}
            >
                <span class="lead">
                    {#if item.icon}<Icon name={item.icon} filled={item.checked} size="var(--icon-row)" />{/if}
                </span>
                <span class="text">
                    <span class="label">{item.label}</span>
                    {#if item.description}<span class="desc">{item.description}</span>{/if}
                </span>
                {#if item.kbd}<span class="bm-kbd">{item.kbd}</span>{/if}
                <span class="check" aria-hidden="true">
                    {#if item.checked}<Icon name="check" size="var(--icon-compact)" />{/if}
                </span>
            </button>
        {/each}
    </div>
</Plane>

<style>
    .rows {
        display: flex;
        flex-direction: column;
        gap: calc(var(--g) / 2);
        min-width: 13rem;
    }

    .row {
        display: flex;
        align-items: center;
        gap: var(--g);
        min-height: var(--sq-compact);
        padding: calc(var(--g) / 2) var(--g);
        border-radius: var(--r-ctl);
        color: var(--t);
        text-align: left;
        font-family: var(--font-body);
        font-size: var(--fs-body);
        transition: background-color var(--dur-tone) var(--ease-std);
        -webkit-touch-callout: none;
        user-select: none;
    }

    @media (hover: hover) {
        .row:not(:disabled):hover {
            background: var(--m4);
        }
    }

    .row:not(:disabled):active,
    .row:focus-visible {
        background: var(--m4);
    }

    .row:focus-visible {
        outline-offset: -2px;
    }

    .row.checked {
        background: color-mix(in srgb, var(--accent) 10%, transparent);
    }

    .row:disabled {
        opacity: 0.45;
        cursor: default;
    }

    .row.danger {
        color: var(--err);
    }

    .lead {
        display: grid;
        place-items: center;
        width: var(--icon-row);
        color: var(--t2);
        flex: none;
    }

    .danger .lead {
        color: inherit;
    }

    .checked .lead {
        color: var(--accent-text);
    }

    .text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
        gap: 1px;
    }

    .label {
        font-weight: var(--fw-label);
        line-height: 1.25;
    }

    .desc {
        font-size: var(--fs-small);
        color: var(--t2);
        line-height: 1.3;
    }

    .check {
        width: var(--icon-compact);
        color: var(--accent-text);
        flex: none;
    }

    .divider {
        height: 1px;
        margin: calc(var(--g) / 2) var(--g);
        background: var(--hair);
    }
</style>
