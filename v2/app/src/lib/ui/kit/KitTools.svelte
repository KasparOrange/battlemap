<!--
  KitTools — the companion's six tool tabs filled with kit components, as the gallery's
  proposal for how each tab is grouped mid-game (v2/docs/design.md "the tool tabs"). Static
  demo state only; the real panels live in lib/companion and take this as their sketch.

  Props:
  - tab: 'tokens' | 'fog' | 'draw' | 'measure' | 'view' | 'game'
-->
<script lang="ts">
    import Section from '../Section.svelte';
    import Segmented from '../Segmented.svelte';
    import NumberStepper from '../NumberStepper.svelte';
    import Slider from '../Slider.svelte';
    import Button from '../Button.svelte';
    import IconButton from '../IconButton.svelte';
    import ToggleSwitch from '../ToggleSwitch.svelte';
    import ListRow from '../ListRow.svelte';
    import Field from '../Field.svelte';
    import Badge from '../Badge.svelte';
    import KitMap from './KitMap.svelte';
    import { notify } from '../notice.svelte';

    interface Props {
        /** Which tab's content. */
        tab: string;
    }

    let { tab }: Props = $props();

    // fog
    let tool = $state('room');
    let reveal = $state('reveal');
    let brush = $state(2);
    let radius = $state(4);
    let preview = $state('preview');
    let trim = $state(12);
    let fogLookOpen = $state(true);
    // tokens
    let tokenName = $state('');
    // draw
    let ink = $state(2);
    let width = $state(4);
    let pen = $state('pen');
    // measure
    let ruler = $state(true);
    let disc = $state(false);
    let rings = $state(true);
    let cones = $state(true);
    // view
    let seen = $state('table');
    let follow = $state(false);
    let layers = $state(true);
    let layerOpacity = $state(70);
    // game
    let across = $state(44);
    let fullscreen = $state(true);
    let theme = $state('dark');
</script>

{#if tab === 'fog'}
    <Section title="Tool">
        <Segmented
            label="Fog tool"
            layout="tile"
            block
            bind:value={tool}
            options={[
                { id: 'brush', label: 'Brush', icon: 'brush', hint: 'Drag to paint' },
                { id: 'room', label: 'Room', icon: 'room', hint: 'Tap a room' },
                { id: 'circle', label: 'Circle', icon: 'circle', hint: 'Tap a spot' },
            ]}
        />
        <Segmented
            label="Reveal or hide"
            block
            bind:value={reveal}
            options={[
                { id: 'reveal', label: 'Reveal', icon: 'reveal', tone: 'reveal' },
                { id: 'hide', label: 'Hide', icon: 'hide', tone: 'hide' },
            ]}
        />
        {#if tool === 'brush'}
            <Slider label="Brush size" min={1} max={6} bind:value={brush} format={(v) => `${v} sq`} tone={reveal === 'hide' ? 'hide' : 'reveal'} />
        {:else if tool === 'circle'}
            <NumberStepper label="Radius" bind:value={radius} min={1} max={30} unit="sq" />
        {/if}
    </Section>

    <Section title="Players see changes">
        <Segmented
            label="Players see changes"
            block
            bind:value={preview}
            options={[
                { id: 'now', label: 'Instantly', icon: 'play' },
                { id: 'preview', label: 'Preview first', icon: 'reveal' },
            ]}
        />
        {#if preview === 'preview'}
            <div class="staged">
                <Badge text="12 squares staged" tone="reveal" icon="reveal" />
                <span>Blue shows on the table after Apply.</span>
            </div>
        {/if}
    </Section>

    <Section title="Whole map">
        <div class="two">
            <Button
                icon="reveal"
                label="Reveal all"
                onclick={() => notify('Whole map revealed', { action: { label: 'Undo', run: () => notify('Fog back as it was') } })}
            />
            <Button
                icon="hide"
                label="Hide all"
                onclick={() => notify('Whole map hidden', { action: { label: 'Undo', run: () => notify('Fog back as it was') } })}
            />
        </div>
    </Section>

    <Section title="Look" collapsible bind:open={fogLookOpen}>
        <NumberStepper label="Trim revealed edges" bind:value={trim} min={0} max={45} unit="%" />
    </Section>
{:else if tab === 'tokens'}
    <Field
        bind:value={tokenName}
        placeholder="Name a new token"
        icon="token"
        enterkeyhint="done"
        onenter={() => (tokenName = '')}
    >
        {#snippet trailing()}
            <IconButton icon="add" label="Add the token" variant="flat" onclick={() => (tokenName = '')} />
        {/snippet}
    </Field>
    <Section title="On this map">
        <div class="list">
            <ListRow title="Thorin" sub="On the map" color="var(--mark-1)" mark="1">
                {#snippet trailing()}
                    <IconButton icon="jump" label="Show on my screen" variant="quiet" />
                    <IconButton icon="reveal" label="Hide from the players" variant="quiet" />
                {/snippet}
            </ListRow>
            <ListRow title="Elira" sub="On the map" color="var(--mark-3)" mark="2">
                {#snippet trailing()}
                    <IconButton icon="jump" label="Show on my screen" variant="quiet" />
                    <IconButton icon="reveal" label="Hide from the players" variant="quiet" />
                {/snippet}
            </ListRow>
            <ListRow title="Brother Maddox" sub="On the map" color="var(--mark-4)" mark="3">
                {#snippet trailing()}
                    <IconButton icon="jump" label="Show on my screen" variant="quiet" />
                    <IconButton icon="reveal" label="Hide from the players" variant="quiet" />
                {/snippet}
            </ListRow>
            <ListRow title="Dire wolf" sub="Hidden from the players" color="var(--mark-5)" mark="4" dim>
                {#snippet trailing()}
                    <IconButton icon="jump" label="Show on my screen" variant="quiet" />
                    <IconButton icon="hide" label="Show to the players" variant="quiet" />
                {/snippet}
            </ListRow>
            <ListRow title="Goblin chief" sub="Not on the map yet" color="var(--mark-2)" mark="G">
                {#snippet trailing()}
                    <Button icon="pin" label="Place" variant="flat" size="compact" />
                {/snippet}
            </ListRow>
        </div>
    </Section>
{:else if tab === 'draw'}
    <Section title="Ink">
        <div class="swatches" role="radiogroup" aria-label="Ink colour">
            {#each [1, 2, 3, 4, 5, 6, 7, 8] as n (n)}
                <button
                    type="button"
                    class="swatch"
                    class:chosen={ink === n}
                    style:--sw="var(--mark-{n})"
                    role="radio"
                    aria-checked={ink === n}
                    aria-label="Colour {n}"
                    onclick={() => (ink = n)}
                ></button>
            {/each}
        </div>
        <Slider label="Line width" min={1} max={12} bind:value={width} format={(v) => `${v} px`} />
        <Segmented
            label="Pen or eraser"
            block
            bind:value={pen}
            options={[
                { id: 'pen', label: 'Pen', icon: 'draw' },
                { id: 'eraser', label: 'Eraser', icon: 'eraser' },
            ]}
        />
    </Section>
    <Section title="Whole map">
        <Button icon="delete" label="Clear all drawings" tone="danger" onclick={() => notify('Drawings cleared', { action: { label: 'Undo', run: () => {} } })} />
    </Section>
{:else if tab === 'measure'}
    <Section title="Ruler">
        <ToggleSwitch label="Ruler on the table" description="The L-shaped inch ruler, upright on every screen" bind:checked={ruler} />
        <Button icon="rotate" label="Turn it" disabled={!ruler} />
    </Section>
    <Section title="Template disc">
        <ToggleSwitch label="Template disc" description="Rings, cubes and cones in feet — one square is 5 ft" bind:checked={disc} />
    </Section>
    <Section title="Radius rings" collapsible open={false}>
        {#snippet trailing()}<ToggleSwitch ariaLabel="Radius rings" bind:checked={rings} />{/snippet}
        <p class="note">5 · 10 · 15 · 20 ft</p>
    </Section>
    <Section title="Cones" collapsible open={false}>
        {#snippet trailing()}<ToggleSwitch ariaLabel="Cones" bind:checked={cones} />{/snippet}
        <p class="note">15 · 30 ft, tips on one base</p>
    </Section>
{:else if tab === 'view'}
    <Section title="Players see">
        <Segmented
            label="What the TV shows"
            block
            bind:value={seen}
            options={[
                { id: 'table', label: '1-inch table', icon: 'grid' },
                { id: 'whole', label: 'Whole map', icon: 'fit' },
            ]}
        />
        <div class="overview">
            <div class="mini"><KitMap tokens={false} grid={false} /></div>
            <div class="pad" data-ctl="compact">
                <span></span><IconButton icon="arrow-up" label="Window up a square" variant="flat" /><span></span>
                <IconButton icon="arrow-left" label="Window left a square" variant="flat" />
                <span class="pad-mid">34 × 19</span>
                <IconButton icon="arrow-right" label="Window right a square" variant="flat" />
                <span></span><IconButton icon="arrow-down" label="Window down a square" variant="flat" /><span></span>
            </div>
        </div>
    </Section>
    <Section title="On the TV">
        <ToggleSwitch label="TV follows the tablet" description="The table pans with my view" bind:checked={follow} />
        <Button icon="tv" label="Show my view on the TV" block iconEnd="chevron-right" />
    </Section>
    <Section title="DM layers · only you see them">
        {#snippet trailing()}<ToggleSwitch ariaLabel="Show DM layers" bind:checked={layers} />{/snippet}
        <ListRow title="Secret doors" sub="Juri's dungeon · {layerOpacity} %" dim={!layers}>
            {#snippet leading()}<KitMap fog={false} tokens={false} frame={false} grid={false} />{/snippet}
            {#snippet trailing()}
                <IconButton icon="reveal" label="Hide this layer" variant="quiet" on={layers} />
                <IconButton icon="more" label="Layer options" variant="quiet" menu={[
                    { id: 'up', label: 'Move up', icon: 'arrow-up' },
                    { id: 'down', label: 'Move down', icon: 'arrow-down' },
                    { id: 'delete', label: 'Delete layer', icon: 'delete', danger: true, divider: true },
                ]} />
            {/snippet}
        </ListRow>
        <Slider label="Opacity" min={0} max={100} bind:value={layerOpacity} format={(v) => `${v} %`} />
        <Button icon="image-add" label="Add a picture" variant="flat" />
    </Section>
{:else if tab === 'game'}
    <Section title="Maps in this game">
        <div class="list">
            <ListRow title="Cave level" sub="44 × 28 squares" selected onclick={() => {}}>
                {#snippet leading()}<KitMap fog={false} tokens={false} frame={false} grid={false} />{/snippet}
                {#snippet trailing()}<Badge text="On the table" tone="accent" />{/snippet}
            </ListRow>
            <ListRow title="Tower, floor 2" sub="30 × 30 squares" onclick={() => notify('Loading Tower, floor 2…')}>
                {#snippet leading()}<KitMap fog={false} tokens={false} frame={false} grid={false} />{/snippet}
            </ListRow>
        </div>
        <div class="two">
            <Button icon="upload" label="From device" variant="flat" />
            <Button icon="library" label="Shared library" variant="flat" />
        </div>
    </Section>
    <Section title="This map's squares">
        <NumberStepper label="Squares across" bind:value={across} min={4} max={200} />
        <Button icon="grid" label="Fit the grid on the picture" block iconEnd="chevron-right" />
    </Section>
    <Section title="The table">
        <ListRow title="Measure the TV" sub="One square = one inch" value="34 × 19" icon="tv" chevron onclick={() => {}} />
    </Section>
    <Section title="This tablet">
        <ToggleSwitch label="Full screen" description="Hide Android's bars during a game" bind:checked={fullscreen} />
        <Segmented
            label="Theme"
            block
            bind:value={theme}
            options={[
                { id: 'dark', label: 'Dark', icon: 'moon' },
                { id: 'light', label: 'Light', icon: 'sun' },
            ]}
        />
    </Section>
    <Button icon="back" label="Leave the game" variant="flat" />
{/if}

<style>
    .two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--g);
    }

    .staged {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--g);
        font-size: var(--fs-small);
        color: var(--t2);
    }

    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0 calc(var(--g) * -1);
    }

    .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: calc(var(--g) / 2);
    }

    .swatch {
        width: var(--sq-row);
        height: var(--sq-row);
        border-radius: 50%;
        background: var(--sw);
        box-shadow:
            inset 0 0 0 2px var(--shadow-sm),
            0 0 0 0 var(--accent);
        transition: box-shadow var(--dur-tone) var(--ease-std);
    }

    .swatch.chosen {
        box-shadow:
            inset 0 0 0 2px var(--shadow-sm),
            0 0 0 3px var(--m0),
            0 0 0 5px var(--t);
    }

    .overview {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--g);
        align-items: center;
    }

    .mini {
        aspect-ratio: 44 / 28;
        border-radius: var(--r-ctl);
        overflow: hidden;
        box-shadow: 0 0 0 1px var(--hair);
    }

    .pad {
        display: grid;
        grid-template-columns: repeat(3, auto);
        gap: 2px;
        align-items: center;
        justify-items: center;
    }

    .pad-mid {
        font: var(--fw-meta) var(--fs-meta) / 1 var(--font-meta);
        color: var(--t3);
        white-space: nowrap;
    }

    .note {
        font-size: var(--fs-small);
        color: var(--t2);
    }
</style>
