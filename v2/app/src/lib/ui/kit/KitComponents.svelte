<!--
  KitComponents — every kit component in its states, one specimen card each (the gallery's
  "Components" page). Rendered once per theme column by Kit.svelte.

  Props:
  - theme: string — the column's theme (only for ids and labels)
-->
<script lang="ts">
    import Button from '../Button.svelte';
    import IconButton from '../IconButton.svelte';
    import ToggleSwitch from '../ToggleSwitch.svelte';
    import Segmented from '../Segmented.svelte';
    import NumberStepper from '../NumberStepper.svelte';
    import Slider from '../Slider.svelte';
    import Tabs, { type TabItem } from '../Tabs.svelte';
    import Section from '../Section.svelte';
    import Panel from '../Panel.svelte';
    import ListRow from '../ListRow.svelte';
    import Field from '../Field.svelte';
    import Card from '../Card.svelte';
    import Dialog from '../Dialog.svelte';
    import Sheet from '../Sheet.svelte';
    import Spinner from '../Spinner.svelte';
    import ProgressBar from '../ProgressBar.svelte';
    import Badge from '../Badge.svelte';
    import Icon from '../Icon.svelte';
    import Tooltip from '../Tooltip.svelte';
    import KitMap from './KitMap.svelte';
    import { icons, type IconName } from '../icons';
    import { notify } from '../notice.svelte';
    import type { MenuItem } from '../Menu.svelte';

    interface Props {
        /** The column's theme. */
        theme: string;
    }

    let { theme }: Props = $props();

    let latched = $state(true);
    let busy = $state(false);
    let toggleA = $state(true);
    let toggleB = $state(false);
    let seg1 = $state('reveal');
    let seg2 = $state('room');
    let seg3 = $state('90');
    let radius = $state(4);
    let trim = $state(12);
    let cell = $state(31.75);
    let brush = $state(3);
    let opacity = $state(70);
    let railTab = $state('fog');
    let barTab = $state('tokens');
    let name = $state('Goblin chief');
    let link = $state('');
    let search = $state('');
    let notes = $state('');
    let dialogOpen = $state(false);
    let uploadOpen = $state(false);
    let sheetOpen = $state(false);
    let across = $state(40);
    let down = $state(30);
    let store = $state('webp');
    let ownGrid = $state(true);
    let progress = $state(0.42);

    const holdMenu: MenuItem[] = [
        { id: 'reveal-all', label: 'Reveal all', icon: 'reveal', description: 'The default — the whole map, at once', checked: true },
        { id: 'reveal-room', label: 'Reveal this room', icon: 'room', description: 'Only where the last tap was' },
        { id: 'reveal-seen', label: 'Reveal what tokens see', icon: 'token', description: 'Lines of sight from every token' },
    ];

    const moreMenu: MenuItem[] = [
        { id: 'rename', label: 'Rename', icon: 'edit' },
        { id: 'copy', label: 'Duplicate', icon: 'copy' },
        { id: 'hide', label: 'Hide from players', icon: 'hide' },
        { id: 'delete', label: 'Delete', icon: 'delete', danger: true, divider: true },
    ];

    const TABS: TabItem[] = [
        { id: 'tokens', label: 'Tokens', icon: 'token', group: 'modes' },
        { id: 'fog', label: 'Fog', icon: 'fog', group: 'modes', badge: 12 },
        { id: 'draw', label: 'Draw', icon: 'draw', group: 'modes' },
        { id: 'measure', label: 'Measure', icon: 'measure', group: 'modes' },
        { id: 'view', label: 'View', icon: 'view', group: 'panels' },
        { id: 'game', label: 'Game', icon: 'game', group: 'panels' },
    ];

    const iconNames = Object.keys(icons) as IconName[];

    function load() {
        busy = true;
        setTimeout(() => (busy = false), 1800);
    }
</script>

<div class="specs">
    <article class="spec wide">
        <h3 class="bm-eyebrow">Button</h3>
        <p class="note">Raised by default; <b>on</b> = the edge glow; <b>primary</b> once per surface; hold a button with the corner mark for its menu.</p>
        <div class="demo row">
            <Button icon="reveal" label="Reveal all" menu={holdMenu} onmenu={(id) => notify(`Picked: ${id}`)} onclick={() => notify('Whole map revealed', { action: { label: 'Undo', run: () => {} } })} />
            <Button icon="grid" label="Grid" on={latched} onclick={() => (latched = !latched)} />
            <Button icon="check" label="Apply" variant="primary" />
            <Button icon="upload" label="Upload" variant="flat" />
            <Button icon="delete" label="Delete map" tone="danger" />
            <Button icon="download" label={busy ? 'Loading…' : 'Load game'} loading={busy} onclick={load} />
            <Button icon="play" label="Disabled" disabled />
        </div>
        <div class="demo row">
            <span data-ctl="compact"><Button icon="pin" label="Compact" /></span>
            <Button icon="pin" label="Row (default)" />
            <span data-ctl="toolbar"><Button icon="pin" label="Toolbar" /></span>
            <span data-ctl="standalone"><Button icon="pin" label="Standalone" /></span>
        </div>
        <div class="demo">
            <Button icon="library" label="Shared library" hint="38 maps" iconEnd="chevron-right" block />
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">IconButton</h3>
        <p class="note">The label is the tooltip (hover, D-pad focus). "⋯" opens on a press.</p>
        <div class="demo row" data-ctl="standalone">
            <IconButton icon="menu" label="Game menu" />
            <IconButton icon="tv" label="The table" badge={true} />
            <IconButton icon="fullscreen" label="Full screen" />
        </div>
        <div class="demo row">
            <IconButton icon="undo" label="Undo" />
            <IconButton icon="redo" label="Redo" disabled />
            <IconButton icon="grid" label="Grid" on />
            <IconButton icon="layers" label="Layers" badge={3} />
            <IconButton icon="more" label="More" variant="flat" menu={moreMenu} onmenu={(id) => notify(`Picked: ${id}`)} />
            <IconButton icon="close" label="Close" variant="quiet" />
            <IconButton icon="delete" label="Delete" variant="quiet" />
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Segmented</h3>
        <p class="note">Tiles: icon + text. The chosen look glides and takes the option's tone.</p>
        <div class="demo col">
            <Segmented
                label="Fog tool"
                layout="tile"
                block
                bind:value={seg2}
                options={[
                    { id: 'brush', label: 'Brush', icon: 'brush', hint: 'Drag to paint' },
                    { id: 'room', label: 'Room', icon: 'room', hint: 'Tap a room' },
                    { id: 'circle', label: 'Circle', icon: 'circle', hint: 'Tap a spot' },
                ]}
            />
            <Segmented
                label="Reveal or hide"
                block
                bind:value={seg1}
                options={[
                    { id: 'reveal', label: 'Reveal', icon: 'reveal', tone: 'reveal' },
                    { id: 'hide', label: 'Hide', icon: 'hide', tone: 'hide' },
                ]}
            />
            <Segmented
                label="Turn the table"
                bind:value={seg3}
                options={[
                    { id: '0', label: '0°' },
                    { id: '90', label: '90°' },
                    { id: '180', label: '180°' },
                    { id: '270', label: '270°' },
                ]}
            />
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">NumberStepper</h3>
        <p class="note">Tap the number for the numpad. Narrow rows drop the big steps.</p>
        <div class="demo col">
            <NumberStepper label="Radius" bind:value={radius} min={1} max={30} unit="sq" />
            <NumberStepper label="Trim revealed edges" bind:value={trim} min={0} max={45} unit="%" />
            <NumberStepper label="Square size" bind:value={cell} min={4} max={400} decimals={2} steps={[0.01, 0.1, 1, 5]} unit="px" />
            <div class="narrow"><NumberStepper label="Squares across" bind:value={across} min={4} max={200} /></div>
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">ToggleSwitch · Slider</h3>
        <p class="note">Settings apply at once. Sliders preview while dragging, send on release.</p>
        <div class="demo col">
            <ToggleSwitch label="TV follows the tablet" description="The table pans with my view" bind:checked={toggleA} />
            <ToggleSwitch label="Players see changes at once" bind:checked={toggleB} />
            <div class="row"><ToggleSwitch ariaLabel="Bare on" checked={true} /><ToggleSwitch ariaLabel="Bare off" checked={false} /><ToggleSwitch ariaLabel="Disabled" checked={true} disabled /></div>
            <Slider label="Brush size" min={1} max={6} bind:value={brush} format={(v) => `${v} sq`} tone="reveal" />
            <Slider label="Layer opacity" min={0} max={100} bind:value={opacity} format={(v) => `${v} %`} />
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Tabs — tabs are modes</h3>
        <p class="note">Rail on the tablet, bar on the phone. Tap the chosen tab again to fold.</p>
        <div class="demo tabs-demo">
            <div class="rail">
                <Tabs items={TABS} bind:value={railTab} label="Tools ({theme})">
                    {#snippet footer()}
                        <IconButton icon="undo" label="Undo" variant="flat" />
                        <IconButton icon="redo" label="Redo" variant="flat" disabled />
                    {/snippet}
                </Tabs>
            </div>
            <div class="bar-col">
                <div class="bar"><Tabs items={TABS.slice(0, 4)} bind:value={barTab} orientation="horizontal" label="Tools bar ({theme})" /></div>
                <p class="note">The rail splits <b>modes</b> (what a finger on the map does) from <b>panels</b> (View, Game), undo / redo at its foot.</p>
            </div>
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Panel · Section</h3>
        <p class="note">Sections group what belongs together; a rare one folds.</p>
        <div class="demo">
            <div class="panel-demo">
                <Panel title="Fog of war" eyebrow="Tool">
                    {#snippet actions()}<IconButton icon="help" label="Help" variant="quiet" />{/snippet}
                    <Section title="Whole map">
                        <div class="two">
                            <Button icon="reveal" label="Reveal all" />
                            <Button icon="hide" label="Hide all" />
                        </div>
                    </Section>
                    <Section title="Look" collapsible>
                        <NumberStepper label="Trim" bind:value={trim} min={0} max={45} unit="%" />
                    </Section>
                    {#snippet footer()}
                        <Button icon="close" label="Discard" variant="flat" />
                        <Button icon="check" label="Apply 12" variant="primary" block />
                    {/snippet}
                </Panel>
            </div>
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">ListRow</h3>
        <p class="note">Token dot, icon tile or thumbnail; trailing tools stay their own buttons.</p>
        <div class="demo list">
            <ListRow title="Thorin" sub="On the map" color="var(--mark-1)" mark="1">
                {#snippet trailing()}
                    <IconButton icon="jump" label="Show on my screen" variant="quiet" />
                    <IconButton icon="reveal" label="Hide from the players" variant="quiet" />
                    <IconButton icon="more" label="Token options" variant="quiet" menu={moreMenu} />
                {/snippet}
            </ListRow>
            <ListRow title="Dire wolf" sub="Hidden from the players" color="var(--mark-5)" mark="4" dim>
                {#snippet trailing()}<IconButton icon="hide" label="Show to the players" variant="quiet" />{/snippet}
            </ListRow>
            <ListRow title="Cave level" sub="44 × 28 squares" selected onclick={() => {}}>
                {#snippet leading()}<KitMap tokens={false} frame={false} grid={false} fog={false} />{/snippet}
                {#snippet trailing()}<Badge text="On the table" tone="accent" />{/snippet}
            </ListRow>
            <ListRow title="Measure the TV" sub="One square = one inch" value="34 × 19" icon="tv" chevron onclick={() => {}} />
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Field</h3>
        <p class="note">Machine text by default: no autocorrect, no capitals, no spell check.</p>
        <div class="demo col">
            <Field label="Token name" bind:value={name} icon="token" clearable enterkeyhint="done" onenter={() => notify(`Added ${name}`)} />
            <Field label="Map from a link" bind:value={link} icon="link" type="url" inputmode="url" placeholder="https://…" helper="A picture, PDF, .dd2vtt or a Drive / Dropbox share">
                {#snippet trailing()}<IconButton icon="paste" label="Paste" variant="flat" />{/snippet}
            </Field>
            <Field bind:value={search} icon="search" type="search" placeholder="Search maps" error={search === 'x' ? 'Nothing found' : undefined} />
            <Field label="Session notes" bind:value={notes} kind="prose" multiline placeholder="What happened tonight…" />
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Card</h3>
        <p class="note">Library entries. Name in the story face; selected and prominent glow.</p>
        <div class="demo cards">
            <Card title="The Sunless Citadel" meta="Cave level · 2 h ago" prominent onclick={() => {}}>
                {#snippet media()}<KitMap tokens={false} frame={false} />{/snippet}
                {#snippet badges()}<Badge text="Continue" icon="play" tone="accent" />{/snippet}
            </Card>
            <Card title="Tower of the Moon" meta="30 × 30 · WebP" onclick={() => {}}>
                {#snippet media()}<KitMap tokens={false} frame={false} grid={false} fog={false} />{/snippet}
                {#snippet badges()}<Badge text="Shared" />{/snippet}
            </Card>
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Dialog · Sheet · Notice</h3>
        <p class="note">Dialogs for a decision; sheets slide from an edge; notices close by themselves.</p>
        <div class="demo row">
            <Button icon="delete" label="Delete map…" tone="danger" onclick={() => (dialogOpen = true)} />
            <Button icon="upload" label="Upload dialog" onclick={() => (uploadOpen = true)} />
            <Button icon="library" label="Bottom sheet" onclick={() => (sheetOpen = true)} />
        </div>
        <div class="demo row">
            <Button icon="info" label="Info" variant="flat" onclick={() => notify('Map saved')} />
            <Button icon="success" label="Success" variant="flat" onclick={() => notify('12 squares revealed', { kind: 'success' })} />
            <Button icon="warning" label="Warning" variant="flat" onclick={() => notify('The TV is still loading the map', { kind: 'warning' })} />
            <Button icon="error" label="Error" variant="flat" onclick={() => notify('Upload failed — the server did not answer', { kind: 'error', action: { label: 'Retry', run: () => {} } })} />
        </div>
        <div class="sheet-frame">
            <KitMap tokens={false} />
            <Sheet side="bottom" modal bind:open={sheetOpen} title="Shared library" eyebrow="38 maps">
                <ListRow title="Juri's cave" sub="40 × 30 · 2.1 MB" onclick={() => {}}>
                    {#snippet leading()}<KitMap tokens={false} frame={false} grid={false} fog={false} />{/snippet}
                </ListRow>
                <ListRow title="AI keep" sub="34 × 19 · 1.4 MB" onclick={() => {}}>
                    {#snippet leading()}<KitMap tokens={false} frame={false} grid={false} fog={false} />{/snippet}
                </ListRow>
            </Sheet>
            {#if !sheetOpen}<span class="frame-hint">a modal bottom sheet opens in here</span>{/if}
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Spinner · ProgressBar · Badge · Tooltip</h3>
        <p class="note">No IO without feedback. Badges carry no dot; the colour is the state.</p>
        <div class="demo col">
            <div class="row"><Spinner label="Loading the map…" /><Spinner tone="ink" /></div>
            <ProgressBar label="Uploading Juri's cave" value={progress} detail="{(progress * 38).toFixed(1)} of 38 MB" />
            <ProgressBar label="The TV is downloading" />
            <div class="row">
                <Badge text="Shared" />
                <Badge text="On the table" tone="accent" />
                <Badge text="12 staged" tone="reveal" icon="reveal" />
                <Badge text="Hidden" tone="hide" />
                <Badge text="Saved" tone="ok" icon="success" />
                <Badge text="Old version" tone="warn" />
                <Badge text="Failed" tone="danger" icon="error" />
            </div>
            <div class="row">
                <Badge text="Tablet not connected" icon="disconnected" tone="warn" size="tv" />
            </div>
            <div class="row tip-row">
                <Tooltip text="Undo — Ctrl Z"><Button icon="undo" label="Hover me" variant="flat" /></Tooltip>
                <span class="bm-tooltip static" data-show>Jump to what the TV shows</span>
            </div>
            <div class="row"><Button icon="sync" label="Progress +10 %" variant="flat" onclick={() => (progress = progress >= 1 ? 0 : Math.min(1, progress + 0.1))} /></div>
        </div>
    </article>

    <article class="spec">
        <h3 class="bm-eyebrow">Focus — keyboard and D-pad</h3>
        <p class="note">Tab here, then walk with the arrows. On the TV the ring is thicker and tiles grow.</p>
        <div class="demo dpad">
            {#each ['Library', 'Continue', 'Measure', 'Settings', 'Update', 'About'] as t, i (t)}
                <button type="button" class="dtile" class:fake-focus={i === 1} data-focus-grow>{t}</button>
            {/each}
        </div>
    </article>

    <article class="spec wide">
        <h3 class="bm-eyebrow">Icons — Fluent UI System Icons (MIT), {iconNames.length} used</h3>
        <div class="icons">
            {#each iconNames as n (n)}
                <span class="ic" title={n}><Icon name={n} /><small>{n}</small></span>
            {/each}
        </div>
    </article>

    <article class="spec wide">
        <h3 class="bm-eyebrow">Tokens — surfaces, ink, accents, type</h3>
        <div class="swatches">
            {#each ['bg', 'm0', 'm1', 'm2', 'm3', 'm4'] as s (s)}
                <span class="sw" style:background="var(--{s})"><small>--{s}</small></span>
            {/each}
            {#each ['accent', 'reveal', 'hide', 'ok', 'warn', 'err'] as s (s)}
                <span class="sw" style:background="var(--{s})"><small class="ink">--{s}</small></span>
            {/each}
            {#each [1, 2, 3, 4, 5, 6, 7, 8] as n (n)}
                <span class="dot" style:background="var(--mark-{n})">{n}</span>
            {/each}
        </div>
        <div class="type">
            <span class="bm-headline">The Sunless Citadel</span>
            <span class="t-title">Fog of war — panel title</span>
            <span class="t-body">Tap a room to reveal it. Body text, 15 px, for rows and controls.</span>
            <span class="t-small">A sub line or helper text — 13 px, the secondary ink.</span>
            <span class="bm-eyebrow">Eyebrow · section label</span>
            <span class="t-value">34 × 19 · 31.75 px · 12 %</span>
        </div>
    </article>
</div>

<Dialog bind:open={dialogOpen} title="Delete Juri's cave?" description="It leaves the shared library. TVs keep their copies; games that use it are not touched." icon="delete">
    {#snippet footer()}
        <Button label="Keep it" variant="flat" onclick={() => (dialogOpen = false)} />
        <Button icon="delete" label="Delete" tone="danger" onclick={() => { dialogOpen = false; notify('Map deleted', { action: { label: 'Undo', run: () => {} } }); }} />
    {/snippet}
</Dialog>

<Dialog bind:open={uploadOpen} title="Squares on this picture" description="cave_40x30.webp · 1280 × 960 px" icon="grid" size="md">
    <div class="upload-pic">
        <KitMap tokens={false} frame={false} fog={false} />
        <span class="found"><Badge text="Found a drawn grid: 40 × 30 squares of 32 px" tone="ok" icon="success" /></span>
    </div>
    <Section title="Squares">
        <div class="two">
            <NumberStepper label="Across" bind:value={across} min={4} max={200} />
            <NumberStepper label="Down" bind:value={down} min={4} max={200} />
        </div>
        <ToggleSwitch label="The picture has its own grid lines" description="battlemap then draws none" bind:checked={ownGrid} />
    </Section>
    <Section title="Store as">
        <Segmented
            label="Store as"
            block
            bind:value={store}
            options={[
                { id: 'webp', label: 'WebP', hint: 'best' },
                { id: 'jpeg', label: 'JPEG' },
                { id: 'png', label: 'PNG' },
                { id: 'asis', label: 'As is' },
            ]}
        />
    </Section>
    {#snippet footer()}
        <Button icon="grid" label="Fit on the picture" variant="flat" />
        <Button icon="play" label="Upload and play" variant="primary" onclick={() => (uploadOpen = false)} />
    {/snippet}
</Dialog>

<style>
    .specs {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 21rem), 1fr));
        gap: var(--g2);
        align-items: start;
    }

    .spec {
        display: flex;
        flex-direction: column;
        gap: var(--g);
        min-width: 0;
        padding: var(--g2);
        border-radius: var(--r);
        background: var(--m0);
        border: 1.5px solid var(--hair);
    }

    .spec.wide {
        grid-column: 1 / -1;
    }

    .note {
        font-size: var(--fs-small);
        color: var(--t2);
        line-height: 1.4;
        margin-bottom: calc(var(--g) / 2);
    }

    .note b {
        color: var(--t);
        font-weight: 600;
    }

    .demo {
        min-width: 0;
    }

    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--g);
    }

    .col {
        display: flex;
        flex-direction: column;
        gap: var(--g2);
    }

    .narrow {
        width: 15rem;
        max-width: 100%;
    }

    .two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--g);
    }

    .tabs-demo {
        display: flex;
        gap: var(--g2);
    }

    .rail {
        width: var(--rail-w);
        padding: calc(var(--g) / 2);
        border-radius: var(--r);
        background: var(--m1);
        flex: none;
    }

    .bar-col {
        display: flex;
        flex-direction: column;
        gap: var(--g);
        flex: 1;
        min-width: 0;
    }

    .bar {
        padding: calc(var(--g) / 2);
        border-radius: var(--r);
        background: var(--m1);
    }

    .panel-demo {
        height: 25rem;
        display: flex;
        flex-direction: column;
    }

    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0 calc(var(--g) * -1);
    }

    .cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--g);
    }

    .sheet-frame {
        position: relative;
        height: 15rem;
        border-radius: var(--r-ctl);
        overflow: hidden;
        box-shadow: inset 0 0 0 1px var(--hair);
    }

    .sheet-frame > :global(svg) {
        position: absolute;
        inset: 0;
    }

    .frame-hint {
        position: absolute;
        left: 50%;
        bottom: var(--g);
        transform: translateX(-50%);
        padding: 0.25rem 0.5rem;
        border-radius: var(--r-sm);
        background: var(--m0);
        font-size: var(--fs-small);
        color: var(--t2);
        white-space: nowrap;
    }

    .tip-row {
        min-height: 3rem;
    }

    .bm-tooltip.static {
        position: static;
    }

    .dpad {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--g);
    }

    .dtile {
        min-height: 3.5rem;
        border-radius: var(--r-ctl);
        background: var(--m1);
        color: var(--t);
        font-family: var(--font-button);
        font-weight: var(--fw-button);
        box-shadow: var(--elev-rest);
    }

    .dtile.fake-focus {
        outline: var(--focus-w) solid var(--accent);
        outline-offset: var(--focus-offset);
        background: var(--m3);
    }

    .icons {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
        gap: 2px;
    }

    .ic {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: var(--g) 2px;
        border-radius: var(--r-ctl);
        color: var(--t2);
    }

    .ic small {
        font: 400 var(--fs-meta) / 1.1 var(--font-meta);
        color: var(--t3);
        text-align: center;
        overflow-wrap: anywhere;
    }

    .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: var(--g);
        align-items: center;
    }

    .sw {
        display: flex;
        align-items: flex-end;
        width: 5.5rem;
        height: 3.5rem;
        padding: 0.375rem;
        border-radius: var(--r-ctl);
        box-shadow: inset 0 0 0 1px var(--hair-strong);
    }

    .sw small {
        font: var(--fs-meta) / 1 var(--font-meta);
        color: var(--t2);
    }

    .sw small.ink {
        color: var(--accent-ink);
    }

    .dot {
        display: grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 50%;
        color: var(--mark-ink);
        font: 700 var(--fs-small) / 1 var(--font-value);
    }

    .type {
        display: flex;
        flex-direction: column;
        gap: var(--g);
        margin-top: var(--g);
    }

    .t-title {
        font-family: var(--font-title);
        font-weight: var(--fw-title);
        font-size: var(--fs-title);
    }

    .t-body {
        font-size: var(--fs-body);
    }

    .t-small {
        font-size: var(--fs-small);
        color: var(--t2);
    }

    .t-value {
        font-family: var(--font-value);
        font-weight: var(--fw-value);
        font-size: var(--fs-value);
    }

    .upload-pic {
        position: relative;
        aspect-ratio: 4 / 3;
        max-height: 14rem;
        width: 100%;
        border-radius: var(--r-ctl);
        overflow: hidden;
        box-shadow: inset 0 0 0 1px var(--hair);
    }

    .upload-pic > :global(svg) {
        position: absolute;
        inset: 0;
    }

    .found {
        position: absolute;
        left: var(--g);
        bottom: var(--g);
    }

    .found :global(.bm-badge) {
        background: var(--m0);
    }
</style>
