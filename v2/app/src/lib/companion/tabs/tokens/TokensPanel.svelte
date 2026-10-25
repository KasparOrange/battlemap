<!--
  TokensPanel — the Tokens tab's panel (design.md "the tool tabs", parity §7): a name field that
  adds a token not on the map yet (and arms it: the next tap on the map places it), the list
  "On this map" (dot + number, name, where; jump · eye · delete in one tap with Undo; a tap on the
  row selects it and opens its quick settings — name, colour, take off the map), the list "Not on
  the map yet" with Place, and Clear all tokens (Undo notice). The token selected on the map is
  the selected row.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import type { Token } from '@battlemap/shared';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import { withUndo } from '../../game/undo.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import ColorPicker from '../../../ui/ColorPicker.svelte';
  import Field from '../../../ui/Field.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import Plane from '../../../ui/Plane.svelte';
  import Section from '../../../ui/Section.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { makeToken, tokenName, tokenStatus, TOKEN_COLORS } from './logic.ts';
  import { tokensLocal } from './local.svelte.ts';
  import { armToken } from './tool.ts';

  let { ctx }: TabPanelProps = $props();

  let newName = $state('');
  let editing = $state<string | null>(null);
  let editName = $state('');
  let planeOpen = $state(false);
  let anchors: Record<string, HTMLElement> = {};

  const tokens = $derived(ctx.map.tokens);
  const placed = $derived(tokens.filter((t) => t.placed));
  const waiting = $derived(tokens.filter((t) => !t.placed));
  const armed = $derived(tokensLocal.armed ? tokens.find((t) => t.id === tokensLocal.armed) ?? null : null);
  const edited = $derived(editing ? tokens.find((t) => t.id === editing) ?? null : null);

  function add(): void {
    const token = makeToken(tokens, newName, null);
    if (!ctx.dispatch({ type: 'token.add', token })) return;
    log.info('companion', 'Token created off the map', { id: token.id, label: token.label });
    newName = '';
    armToken(ctx, token.id);
  }

  function select(t: Token): void {
    ctx.selectedToken = t.id;
    editing = t.id;
    editName = t.name;
    planeOpen = true;
  }

  function jump(t: Token): void {
    ctx.selectedToken = t.id;
    ctx.camera.jumpTo({ x: t.col + 0.5, y: t.row + 0.5 });
  }

  function setHidden(t: Token, hidden: boolean): void {
    if (ctx.dispatch({ type: 'token.update', id: t.id, hidden })) {
      log.info('companion', hidden ? 'Token hidden' : 'Token shown', { id: t.id });
      notify(hidden ? `${tokenName(t)} is hidden from the players` : `The players see ${tokenName(t)} again`);
    }
  }

  function remove(t: Token): void {
    if (tokensLocal.armed === t.id) tokensLocal.armed = null;
    const r = withUndo(() => ctx.session.view, (c) => ctx.dispatch(c), { type: 'token.remove', id: t.id }, (s) => notify(s));
    if (!r.sent) return;
    log.info('companion', 'Token deleted', { id: t.id });
    notify(`${tokenName(t)} deleted`, r.options);
  }

  function clearAll(): void {
    tokensLocal.armed = null;
    const r = withUndo(() => ctx.session.view, (c) => ctx.dispatch(c), { type: 'token.clear' }, (s) => notify(s));
    if (!r.sent) return;
    log.info('companion', 'Tokens cleared', { count: tokens.length });
    notify(r.changed ? 'All tokens cleared' : 'No tokens to clear', r.options);
  }

  function saveName(): void {
    if (!edited || editName.trim() === edited.name) return;
    if (ctx.dispatch({ type: 'token.update', id: edited.id, name: editName.trim() })) log.info('companion', 'Token renamed', { id: edited.id });
  }

  function closePlane(): void {
    saveName();
    planeOpen = false;
  }

  function takeOff(t: Token): void {
    planeOpen = false;
    if (ctx.dispatch({ type: 'token.update', id: t.id, placed: false })) notify(`${tokenName(t)} is off the map — Place puts it back.`);
  }

  /** Svelte action: remembers a row's element as the plane's anchor. */
  function anchor(node: HTMLElement, id: string) {
    anchors[id] = node;
    return { destroy: () => delete anchors[id] };
  }
</script>

<Field
  bind:value={newName}
  placeholder="Name a new token — e.g. Thorin, Goblin 2"
  icon="token"
  enterkeyhint="done"
  onenter={add}
>
  {#snippet trailing()}
    <IconButton icon="add" label="Add the token" variant="flat" onclick={add} />
  {/snippet}
</Field>

{#if armed}
  <div class="armed bm-glow" role="status">
    <span class="dot" style:--c={armed.color}>{armed.label}</span>
    <span class="text">Tap the map where <b>{tokenName(armed)}</b> stands.</span>
    <Button label="Later" variant="flat" size="compact" onclick={() => (tokensLocal.armed = null)} />
  </div>
{/if}

<Section title={placed.length ? `On this map · ${placed.length}` : 'On this map'}>
  {#if placed.length === 0}
    <p class="note">Tap an empty square to place a new token, drag a token to move it. Tap a door to open or close it.</p>
  {:else}
    <div class="list" data-testid="tokens-on-map">
      {#each placed as t (t.id)}
        <div use:anchor={t.id}>
          <ListRow title={tokenName(t)} sub={tokenStatus(t, false)} color={t.color} mark={t.label} dim={t.hidden} selected={ctx.selectedToken === t.id} onclick={() => select(t)}>
            {#snippet trailing()}
              <IconButton icon="jump" label="Show {tokenName(t)} on my screen" variant="quiet" onclick={() => jump(t)} />
              <IconButton icon={t.hidden ? 'hide' : 'reveal'} label={t.hidden ? `Show ${tokenName(t)} to the players` : `Hide ${tokenName(t)} from the players`} variant="quiet" on={t.hidden} onclick={() => setHidden(t, !t.hidden)} />
              <IconButton icon="delete" label="Delete {tokenName(t)}" variant="quiet" onclick={() => remove(t)} />
            {/snippet}
          </ListRow>
        </div>
      {/each}
    </div>
  {/if}
</Section>

{#if waiting.length}
  <Section title="Not on the map yet">
    <div class="list">
      {#each waiting as t (t.id)}
        <div use:anchor={t.id}>
          <ListRow title={tokenName(t)} sub={tokenStatus(t, armed?.id === t.id)} color={t.color} mark={t.label} dim={t.hidden} onclick={() => select(t)}>
            {#snippet trailing()}
              <Button icon="pin" label="Place" variant="flat" size="compact" on={armed?.id === t.id} onclick={() => armToken(ctx, t.id)} />
              <IconButton icon="delete" label="Delete {tokenName(t)}" variant="quiet" onclick={() => remove(t)} />
            {/snippet}
          </ListRow>
        </div>
      {/each}
    </div>
  </Section>
{/if}

{#if tokens.length}
  <Section title="Whole map">
    <Button icon="delete" label="Clear all tokens" tone="danger" onclick={clearAll} />
  </Section>
{/if}

<Plane anchor={editing ? anchors[editing] : undefined} bind:open={planeOpen} label="Token settings" onclose={saveName}>
  {#if edited}
    <div class="edit">
      <Field bind:value={editName} label="Name" placeholder="Token {edited.label}" enterkeyhint="done" onenter={closePlane} />
      <ColorPicker label="Token colour" colors={[...TOKEN_COLORS]} value={edited.color} custom={false} onchange={(color) => ctx.dispatch({ type: 'token.update', id: edited.id, color })} />
      {#if edited.placed}
        <Button icon="arrow-up" label="Take off the map" variant="flat" onclick={() => takeOff(edited)} />
      {/if}
    </div>
  {/if}
</Plane>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: calc(var(--g) / 2);
  }

  .note {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t3);
    line-height: 1.45;
  }

  .armed {
    display: flex;
    align-items: center;
    gap: var(--g);
    padding: var(--g);
    border-radius: var(--r-ctl);
    background: var(--m2);
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .armed .text {
    flex: 1;
  }

  .armed b {
    color: var(--t);
    font-weight: var(--fw-label);
  }

  .dot {
    display: grid;
    place-items: center;
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--c);
    color: var(--mark-ink);
    font-family: var(--font-value);
    font-size: var(--fs-meta);
    font-weight: 700;
  }

  .edit {
    display: flex;
    flex-direction: column;
    gap: var(--g2);
    width: min(19rem, 80vw);
  }
</style>
