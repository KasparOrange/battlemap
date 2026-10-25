<!--
  Field — a text input with its label. Machine text by default (token and map names, links,
  searches, numbers): the OS completion / correction / capitalisation / spell check are off,
  because their bubbles swallow ↓ ↑ Enter and such text never wants a correction (fleet rule,
  fields.ts). `kind="prose"` keeps them for sentences (session notes). The text is 16 px so
  iOS Safari does not zoom in on focus.

  A leading icon, a clear ×, and a `trailing` snippet (the link field's paste button) sit
  inside the field's box; helper text or an error line sits under it. Enter calls `onenter`
  (add the token, fetch the link).

  Props:
  - value: string (bindable) · label · placeholder · icon: IconName
  - kind: 'machine' | 'prose' (default machine) · multiline: boolean (a textarea, for prose)
  - type: 'text' | 'search' | 'url' | 'email' | 'number' · inputmode · enterkeyhint
  - helper: string · error: string (replaces helper, red) · clearable: boolean
  - trailing: Snippet · onenter: (value) => void · oninput: (value) => void
  - disabled · el (bindable — the input) · id
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLInputAttributes } from 'svelte/elements';
    import Icon from './Icon.svelte';
    import IconButton from './IconButton.svelte';
    import { plain, prose, type FieldKind } from './fields';
    import type { IconName } from './icons';

    interface Props {
        /** The text. */
        value: string;
        /** The visible label above the field. */
        label?: string;
        /** Hint inside the empty field. */
        placeholder?: string;
        /** Leading icon. */
        icon?: IconName;
        /** Machine text (helpers off) or prose (helpers on). */
        kind?: FieldKind;
        /** A multi-line textarea (prose). */
        multiline?: boolean;
        /** Input type. */
        type?: 'text' | 'search' | 'url' | 'email' | 'number';
        /** Which on-screen keyboard. */
        inputmode?: HTMLInputAttributes['inputmode'];
        /** The label of the on-screen keyboard's Enter key. */
        enterkeyhint?: HTMLInputAttributes['enterkeyhint'];
        /** A line of help under the field. */
        helper?: string;
        /** An error line under the field (replaces the helper). */
        error?: string;
        /** Shows a × that empties the field. */
        clearable?: boolean;
        /** Controls inside the field's end. */
        trailing?: Snippet;
        /** Enter was pressed. */
        onenter?: (value: string) => void;
        /** Every edit. */
        oninput?: (value: string) => void;
        /** Not editable right now. */
        disabled?: boolean;
        /** The input element. */
        el?: HTMLInputElement | HTMLTextAreaElement;
        /** Element id (default generated). */
        id?: string;
    }

    let {
        value = $bindable(),
        label,
        placeholder,
        icon,
        kind = 'machine',
        multiline = false,
        type = 'text',
        inputmode,
        enterkeyhint,
        helper,
        error,
        clearable = false,
        trailing,
        onenter,
        oninput,
        disabled = false,
        el = $bindable(),
        id = `bm-field-${Math.random().toString(36).slice(2, 9)}`,
    }: Props = $props();

    const helpers = $derived(kind === 'prose' ? prose : plain);
    const noteId = $derived(`${id}-note`);

    function onKey(e: KeyboardEvent) {
        if (e.key === 'Enter' && !multiline && onenter) {
            e.preventDefault();
            onenter(value);
        }
    }

    function clear() {
        value = '';
        oninput?.('');
        el?.focus();
    }
</script>

<div class="bm-field" class:has-error={!!error} class:disabled class:multiline>
    {#if label}<label class="label" for={id}>{label}</label>{/if}
    <div class="box">
        {#if icon}<span class="lead"><Icon name={icon} /></span>{/if}
        {#if multiline}
            <textarea
                bind:this={el}
                {id}
                bind:value
                {placeholder}
                {disabled}
                rows="3"
                aria-invalid={!!error || undefined}
                aria-describedby={error || helper ? noteId : undefined}
                {...helpers}
                oninput={() => oninput?.(value)}
            ></textarea>
        {:else}
            <input
                bind:this={el}
                {id}
                {type}
                bind:value
                {placeholder}
                {disabled}
                {inputmode}
                {enterkeyhint}
                aria-invalid={!!error || undefined}
                aria-describedby={error || helper ? noteId : undefined}
                {...helpers}
                onkeydown={onKey}
                oninput={() => oninput?.(value)}
            />
        {/if}
        {#if clearable && value}
            <IconButton icon="close" label="Clear" variant="quiet" size="compact" onclick={clear} />
        {/if}
        {#if trailing}<span class="trail" data-ctl="compact">{@render trailing()}</span>{/if}
    </div>
    {#if error}
        <p class="note error" id={noteId}><Icon name="error" size="var(--icon-compact)" />{error}</p>
    {:else if helper}
        <p class="note" id={noteId}>{helper}</p>
    {/if}
</div>

<style>
    .bm-field {
        display: flex;
        flex-direction: column;
        gap: calc(var(--g) / 2);
        width: 100%;
        min-width: 0;
    }

    .label {
        font-size: var(--fs-small);
        font-weight: var(--fw-label);
        color: var(--t2);
    }

    .box {
        display: flex;
        align-items: center;
        gap: calc(var(--g) / 2);
        min-height: var(--ctl-sq, var(--sq-row));
        padding: 0 calc(var(--g) / 2) 0 var(--g);
        border: var(--glow-w) solid var(--hair-strong);
        border-radius: var(--r-ctl);
        background: color-mix(in srgb, var(--bg) 45%, var(--m0));
        transition:
            border-color var(--dur-tone) ease,
            box-shadow var(--dur-glow) ease;
    }

    .box:focus-within {
        border-color: color-mix(in srgb, var(--accent) 75%, transparent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
    }

    .has-error .box {
        border-color: color-mix(in srgb, var(--err) 75%, transparent);
    }

    .multiline .box {
        align-items: flex-start;
        padding-top: calc(var(--g) * 0.75);
        padding-bottom: calc(var(--g) * 0.75);
    }

    .lead {
        display: flex;
        color: var(--t3);
    }

    input,
    textarea {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: transparent;
        color: var(--t);
        font-family: var(--font-body);
        font-size: var(--fs-field);
        line-height: 1.35;
        padding: 0 calc(var(--g) / 2) 0 0;
    }

    input {
        height: calc(var(--ctl-sq, var(--sq-row)) - 3px);
    }

    textarea {
        resize: vertical;
        min-height: 4.5rem;
    }

    input::placeholder,
    textarea::placeholder {
        color: var(--t3);
    }

    input:focus-visible,
    textarea:focus-visible {
        outline: none;
    }

    input[type='search']::-webkit-search-cancel-button {
        display: none;
    }

    .trail {
        display: flex;
        align-items: center;
    }

    .note {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: var(--fs-small);
        color: var(--t2);
        line-height: 1.35;
    }

    .note.error {
        color: var(--err);
    }

    .disabled {
        opacity: 0.5;
    }
</style>
