<!--
  SearchField — the omnibar (fluent expansion rule 11): a square with a magnifier that widens
  into the search field when tapped (or when `/` is pressed anywhere outside a field), on the
  opening curve; the results are the screen's own content, filtered live as the DM types.
  ↓ hands the focus to the results (`ondown`), Enter commits the first hit (`onenter`), Escape
  empties the field, a second Escape (or leaving it empty) folds it back into the square.
  Machine text: the OS helpers are off (fields.ts). With `expanded` it stays open (a wide
  toolbar has the room).

  Props:
  - value: string (bindable) · label: string (accessible name, the placeholder by default)
  - placeholder: string · expanded: boolean — always open
  - width: string — CSS width when open (default 100 %, capped by the parent)
  - onenter: (value) => void · ondown: () => void · oninput: (value) => void
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import Icon from './Icon.svelte';
    import { plain } from './fields';
    import { openMs, closeMs } from './fluent';

    interface Props {
        /** The query. */
        value: string;
        /** Accessible name. */
        label?: string;
        /** Hint inside the empty field. */
        placeholder?: string;
        /** Always open. */
        expanded?: boolean;
        /** CSS width when open. */
        width?: string;
        /** Enter was pressed. */
        onenter?: (value: string) => void;
        /** ↓ was pressed: move into the results. */
        ondown?: () => void;
        /** Every edit. */
        oninput?: (value: string) => void;
    }

    let {
        value = $bindable(''),
        label = 'Search',
        placeholder = 'Search',
        expanded = false,
        width = '100%',
        onenter,
        ondown,
        oninput,
    }: Props = $props();

    let wanted = $state(false);
    let input: HTMLInputElement | undefined = $state();
    const open = $derived(expanded || wanted || value !== '');

    /** Widens and focuses the field. */
    function unfold(): void {
        wanted = true;
        queueMicrotask(() => input?.focus());
    }

    function onkeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            e.stopPropagation();
            if (value) {
                value = '';
                oninput?.('');
            } else {
                wanted = false;
                input?.blur();
            }
        } else if (e.key === 'Enter') {
            onenter?.(value);
        } else if (e.key === 'ArrowDown' && ondown) {
            e.preventDefault();
            ondown();
        }
    }

    onMount(() => {
        const slash = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (e.key !== '/' || t?.closest('input, textarea, [contenteditable="true"]')) return;
            e.preventDefault();
            unfold();
        };
        document.addEventListener('keydown', slash);
        return () => document.removeEventListener('keydown', slash);
    });
</script>

<div
    class="search bm-sf"
    class:open
    role="search"
    style:--open-w={width}
    style:--t-open="{openMs(240)}ms"
    style:--t-close="{closeMs(240)}ms"
>
    <button type="button" class="glass" aria-label={open ? label : `Open ${label.toLowerCase()}`} tabindex={open ? -1 : 0} onclick={unfold}>
        <Icon name="search" />
    </button>
    <input
        bind:this={input}
        bind:value
        {...plain}
        type="search"
        enterkeyhint="search"
        aria-label={label}
        {placeholder}
        tabindex={open ? 0 : -1}
        oninput={() => oninput?.(value)}
        onblur={() => {
            if (!value) wanted = false;
        }}
        {onkeydown}
    />
    {#if value}
        <button
            type="button"
            class="clear"
            aria-label="Clear the search"
            onclick={() => {
                value = '';
                oninput?.('');
                input?.focus();
            }}
        >
            <Icon name="close" size="16px" />
        </button>
    {/if}
</div>

<style>
    .search {
        --sq: var(--ctl-sq, var(--sq-row));
        position: relative;
        display: flex;
        align-items: center;
        height: var(--sq);
        width: var(--sq);
        max-width: 100%;
        border-radius: var(--r-ctl);
        overflow: hidden;
        transition: width var(--t-close) var(--ease-close);
    }

    .search.open {
        width: var(--open-w);
        transition: width var(--t-open) var(--ease-open);
    }

    .glass {
        flex: none;
        width: var(--sq);
        height: var(--sq);
        display: grid;
        place-items: center;
        border: 0;
        background: none;
        color: var(--t2);
        cursor: pointer;
    }

    .open .glass {
        cursor: text;
    }

    input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: 0;
        outline: 0;
        background: none;
        color: var(--t);
        font: var(--fw-body) var(--fs-field) / 1 var(--font-body);
        padding: 0 var(--g) 0 0;
        opacity: 0;
        transition: opacity var(--t-close) var(--ease-close);
    }

    .open input {
        opacity: 1;
        transition: opacity var(--t-open) var(--ease-std);
    }

    input::placeholder {
        color: var(--t3);
    }

    input::-webkit-search-cancel-button {
        display: none;
    }

    .search:focus-within {
        outline: var(--focus-w) solid var(--accent);
        outline-offset: var(--focus-offset);
    }

    .clear {
        flex: none;
        width: var(--sq-compact);
        height: var(--sq-compact);
        margin-right: calc(var(--g) / 2);
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 50%;
        background: none;
        color: var(--t3);
        cursor: pointer;
    }

    @media (hover: hover) {
        .clear:hover {
            color: var(--t);
        }
    }
</style>
