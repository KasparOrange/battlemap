<!--
  SecretsPanel — the Secrets tab's panel (roadmap S9), top to bottom:
  Place (Trap · Mark · Secret door — what a tap on the map places), the selected secret's editor
  (name, note for the DM, the effect it plays, a drawn door's direction, its one-tap button,
  Delete), then the lists: "Hidden from the players" with one-tap Found / Spring, and "Found"
  with Hide again. Every one-tap action plays at once and offers Undo in its notice.

  Props:
  - ctx: GameContext — the game screen's context
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Secret, SecretKind } from '@battlemap/shared';
  import type { TabPanelProps } from '../../game/tabs.ts';
  import Button from '../../../ui/Button.svelte';
  import Field from '../../../ui/Field.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import Menu from '../../../ui/Menu.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import type { IconName } from '../../../ui/icons.ts';
  import { deleteSecret, toggleFound, updateSecret } from './actions.ts';
  import { secretsLocal } from './local.svelte.ts';
  import { foundVerb, KIND_WORDS, SECRET_EFFECTS, secretEffect, secretGroups, secretLabel, secretSub } from './logic.ts';

  let { ctx }: TabPanelProps = $props();

  const NONE: readonly Secret[] = [];
  const ICON: Record<SecretKind, IconName> = { trap: 'warning', mark: 'star', door: 'door' };
  const HINT: Record<SecretKind, string> = {
    trap: 'Tap a square to hide a trap there.',
    mark: 'Tap a square to hide a mark there — a lever, loot, a clue.',
    door: 'Tap one of the map’s doors to make it secret, or a square to draw a secret door there.',
  };

  // slices, so a token drag elsewhere doesn't re-run the panel (rv#37)
  const secrets = $derived(ctx.map.secrets ?? NONE);
  const groups = $derived(secretGroups(secrets));
  const selected = $derived(secrets.find((s) => s.id === secretsLocal.selected) ?? null);

  // name and note: typed locally, sent after a short pause (not a command per key)
  let name = $state('');
  let note = $state('');
  let editing: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const s = selected;
    untrack(() => {
      if (s && s.id !== editing) {
        flush();
        editing = s.id;
        name = s.name;
        note = s.note;
      } else if (!s && editing) {
        flush();
        editing = null;
      }
    });
  });

  function flush(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    const s = editing ? secrets.find((x) => x.id === editing) : null;
    if (s) updateSecret(ctx, s, { name: name.trim().slice(0, 80), note: note.slice(0, 500) });
  }

  function typed(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 500);
  }

  $effect(() => () => flush()); // the panel closes: keep what was typed

  let fxButton = $state<HTMLButtonElement>();
  let fxOpen = $state(false);
  const fxItems = $derived(
    selected
      ? [
          ...SECRET_EFFECTS[selected.kind].map((e) => ({ id: e.id, label: e.label, icon: 'sparkle' as const, checked: selected.effect === e.id })),
          { id: '', label: 'No effect', icon: 'close' as const, checked: !selected.effect, divider: true },
        ]
      : [],
  );

  function select(s: Secret): void {
    secretsLocal.selected = secretsLocal.selected === s.id ? null : s.id;
    if (secretsLocal.selected) ctx.camera.jumpTo({ x: s.col + 0.5, y: s.row + 0.5 });
  }
</script>

<Section title="Place" description={HINT[secretsLocal.place]}>
  <Segmented
    label="What a tap places"
    layout="tile"
    block
    value={secretsLocal.place}
    onchange={(id) => {
      secretsLocal.place = id as SecretKind;
      secretsLocal.save();
    }}
    options={[
      { id: 'trap', label: 'Trap', icon: 'warning', hint: 'Springs' },
      { id: 'mark', label: 'Mark', icon: 'star', hint: 'Is found' },
      { id: 'door', label: 'Secret door', icon: 'door', hint: 'Is found' },
    ]}
  />
</Section>

{#if selected}
  <Section title={secretLabel(selected, secrets)} description={selected.found ? 'The players see it.' : 'Hidden from the players.'}>
    {#snippet trailing()}
      <IconButton icon="close" label="Close" variant="quiet" onclick={() => (secretsLocal.selected = null)} />
    {/snippet}
    <div class="editor" data-testid="secret-editor">
      <Field bind:value={name} label="Name" kind="prose" placeholder={KIND_WORDS[selected.kind]} oninput={typed} />
      <Field bind:value={note} label="Note for you" kind="prose" multiline placeholder="DC 15 to spot · 2d6 piercing" helper="Never shown to the players." oninput={typed} />
      <Button
        icon="sparkle"
        iconEnd="chevron-down"
        label={`Effect: ${secretEffect(selected)?.label ?? 'none'}`}
        variant="flat"
        bind:el={fxButton}
        onclick={() => (fxOpen = !fxOpen)}
      />
      {#if fxButton}
        <Menu anchor={fxButton} bind:open={fxOpen} items={fxItems} label="Effect" onpick={(id) => updateSecret(ctx, selected!, { effect: id || null })} />
      {/if}
      {#if selected.kind === 'door' && selected.door === null}
        <Segmented
          label="Door runs"
          block
          value={selected.vertical ? 'down' : 'across'}
          onchange={(id) => updateSecret(ctx, selected!, { vertical: id === 'down' })}
          options={[
            { id: 'across', label: 'Across', icon: 'arrow-right' },
            { id: 'down', label: 'Down', icon: 'arrow-down' },
          ]}
        />
      {/if}
      <div class="two">
        <Button
          icon={selected.found ? 'hide' : selected.kind === 'trap' ? 'warning' : 'reveal'}
          label={foundVerb(selected)}
          tone={selected.found ? undefined : selected.kind === 'trap' ? 'danger' : 'accent'}
          onclick={() => toggleFound(ctx, selected!)}
        />
        <Button icon="delete" label="Delete" variant="flat" tone="danger" onclick={() => deleteSecret(ctx, selected!)} />
      </div>
    </div>
  </Section>
{/if}

{#snippet row(s: Secret)}
  <li data-testid="secret-row" data-secret={s.id} data-found={s.found}>
    <ListRow title={secretLabel(s, secrets)} sub={secretSub(s)} icon={ICON[s.kind]} selected={secretsLocal.selected === s.id} dim={s.found} onclick={() => select(s)}>
      {#snippet trailing()}
        <Button
          label={foundVerb(s)}
          icon={s.found ? 'hide' : s.kind === 'trap' ? 'warning' : 'reveal'}
          variant={s.found ? 'flat' : 'raised'}
          tone={s.found ? undefined : s.kind === 'trap' ? 'danger' : 'accent'}
          onclick={() => toggleFound(ctx, s)}
        />
      {/snippet}
    </ListRow>
  </li>
{/snippet}

<Section title="Hidden from the players">
  {#if secrets.length === 0}
    <p class="empty" data-testid="secrets-empty">Hide traps, marks and secret doors in prep; one tap at the table springs or reveals them.</p>
  {:else if groups.hidden.length === 0}
    <p class="empty">Everything was found.</p>
  {:else}
    <ul class="rows" data-testid="secrets-hidden">
      {#each groups.hidden as s (s.id)}{@render row(s)}{/each}
    </ul>
  {/if}
</Section>

{#if groups.found.length > 0}
  <Section title="Found">
    <ul class="rows" data-testid="secrets-found">
      {#each groups.found as s (s.id)}{@render row(s)}{/each}
    </ul>
  </Section>
{/if}

<style>
  .editor {
    display: grid;
    gap: var(--g);
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--g);
  }

  .two :global(button) {
    width: 100%;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--g);
  }

  .empty {
    margin: 0;
    color: var(--t2);
    font-size: var(--fs-small);
    line-height: 1.45;
  }
</style>
