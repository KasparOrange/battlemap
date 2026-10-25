<!--
  ColorPicker — choose a colour: a grid of preset swatches (radio group) and a last "own colour"
  swatch whose Plane grows out of it with a hue and a shade slider (fluent: the plane is the
  swatch expanded). Applies at once. The chosen swatch gets a ring; an own colour shows in the
  last swatch. Two rows of five on a 360 px panel; swatches stay ≥ 40 px.

  Props:
  - value: string (bindable) — `#rrggbb`
  - colors: string[] — the presets (`#rrggbb`), in order
  - label: string — accessible name of the group
  - custom: boolean — offer the own-colour swatch (default true)
  - onchange: (color: string) => void — called on every change
-->
<script lang="ts">
    import Icon from './Icon.svelte';
    import Plane from './Plane.svelte';
    import { hexToHsl, hslToHex, sameColor } from './color';

    interface Props {
        /** The chosen colour, `#rrggbb`. */
        value: string;
        /** The preset colours. */
        colors: string[];
        /** Accessible name of the group. */
        label: string;
        /** Offer an own colour. */
        custom?: boolean;
        /** Called on every change. */
        onchange?: (color: string) => void;
    }

    let { value = $bindable(), colors, label, custom = true, onchange }: Props = $props();

    let ownEl = $state<HTMLButtonElement>();
    let planeOpen = $state(false);
    let hue = $state(0);
    let shade = $state(55);

    const isPreset = $derived(colors.some((c) => sameColor(c, value)));
    const own = $derived(hslToHex({ h: hue, s: 78, l: shade }));

    function pick(color: string): void {
        if (sameColor(color, value)) return;
        value = color;
        onchange?.(color);
    }

    function openOwn(): void {
        const hsl = hexToHsl(value);
        hue = hsl.h;
        shade = Math.min(85, Math.max(25, hsl.l));
        planeOpen = !planeOpen;
        if (planeOpen && isPreset) pick(hslToHex({ h: hue, s: 78, l: shade }));
    }

    /** Arrow keys walk the swatches (radio group). */
    function keys(e: KeyboardEvent, i: number): void {
        const n = colors.length;
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = (i + step + n) % n;
        pick(colors[next]!);
        (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    }
</script>

<div class="bm-colors" role="radiogroup" aria-label={label}>
    {#each colors as c, i (c)}
        {@const chosen = sameColor(c, value)}
        <button
            type="button"
            class="sw"
            class:chosen
            style:--sw={c}
            role="radio"
            aria-checked={chosen}
            aria-label="Colour {i + 1}"
            tabindex={chosen || (i === 0 && !isPreset) ? 0 : -1}
            onclick={() => pick(c)}
            onkeydown={(e) => keys(e, i)}
        ></button>
    {/each}
    {#if custom}
        <button
            bind:this={ownEl}
            type="button"
            class="sw own"
            class:chosen={!isPreset}
            class:set={!isPreset}
            style:--sw={isPreset ? 'transparent' : value}
            aria-label="Own colour"
            aria-expanded={planeOpen}
            aria-haspopup="dialog"
            onclick={openOwn}
        >
            {#if isPreset}<Icon name="color" />{/if}
        </button>
    {/if}
</div>

{#if custom}
    <Plane anchor={ownEl} bind:open={planeOpen} label="Own colour">
        <div class="own-plane">
            <div class="preview" style:--sw={own}>
                <span class="dot"></span>
                <output>{own}</output>
            </div>
            <label class="range">
                <span>Hue</span>
                <input
                    type="range"
                    min="0"
                    max="359"
                    bind:value={hue}
                    class="hue"
                    oninput={() => pick(own)}
                />
            </label>
            <label class="range">
                <span>Shade</span>
                <input
                    type="range"
                    min="25"
                    max="85"
                    bind:value={shade}
                    class="shade"
                    style:--h={hue}
                    oninput={() => pick(own)}
                />
            </label>
        </div>
    </Plane>
{/if}

<style>
    .bm-colors {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: var(--g);
        justify-items: center;
    }

    .sw {
        width: 100%;
        max-width: var(--sq-toolbar);
        min-width: var(--sq-compact);
        aspect-ratio: 1;
        border-radius: 50%;
        background: var(--sw);
        box-shadow:
            inset 0 0 0 2px var(--shadow-sm),
            0 0 0 0 var(--m0),
            0 0 0 0 var(--t);
        transition: box-shadow var(--dur-tone) var(--ease-std), transform var(--dur-tone) var(--ease-std);
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
    }

    .sw:active {
        transform: scale(0.94);
    }

    .sw.chosen {
        box-shadow:
            inset 0 0 0 2px var(--shadow-sm),
            0 0 0 3px var(--m0),
            0 0 0 5px var(--t);
    }

    .own {
        display: grid;
        place-items: center;
        color: var(--t2);
        background: var(--m2);
        box-shadow: inset 0 0 0 1.5px var(--hair-strong);
    }

    .own.set {
        background: var(--sw);
    }

    .own.chosen {
        box-shadow:
            inset 0 0 0 2px var(--shadow-sm),
            0 0 0 3px var(--m0),
            0 0 0 5px var(--t);
    }

    .own-plane {
        display: flex;
        flex-direction: column;
        gap: var(--g);
        width: min(17rem, 80vw);
    }

    .preview {
        display: flex;
        align-items: center;
        gap: var(--g);
    }

    .dot {
        width: var(--sq-compact);
        height: var(--sq-compact);
        border-radius: 50%;
        background: var(--sw);
        box-shadow: inset 0 0 0 2px var(--shadow-sm);
    }

    output {
        font-family: var(--font-value);
        font-size: var(--fs-small);
        color: var(--t2);
        text-transform: uppercase;
    }

    .range {
        display: flex;
        flex-direction: column;
        font-size: var(--fs-small);
        color: var(--t2);
    }

    input {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: var(--sq-row);
        margin: 0;
        background: transparent;
        cursor: pointer;
    }

    input::-webkit-slider-runnable-track {
        height: 12px;
        border-radius: 999px;
        background: var(--track);
    }

    input::-moz-range-track {
        height: 12px;
        border-radius: 999px;
        background: var(--track);
    }

    .hue {
        --track: linear-gradient(to right, hsl(0 78% 55%), hsl(60 78% 55%), hsl(120 78% 55%), hsl(180 78% 55%), hsl(240 78% 55%), hsl(300 78% 55%), hsl(359 78% 55%));
    }

    .shade {
        --track: linear-gradient(to right, hsl(var(--h) 78% 25%), hsl(var(--h) 78% 55%), hsl(var(--h) 78% 85%));
    }

    input::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 1.5rem;
        height: 1.5rem;
        margin-top: calc((12px - 1.5rem) / 2);
        border-radius: 50%;
        background: transparent;
        border: 3px solid var(--t);
        box-shadow: 0 1px 4px var(--shadow-sm);
    }

    input::-moz-range-thumb {
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        background: transparent;
        border: 3px solid var(--t);
    }
</style>
