<!--
  ScenesPanel — the Scenes tab (roadmap S2; docs/features.md "scene presets"): the game's saved
  scenes, each a row with a thumbnail of what the TV will show (the map's picture cropped to the
  scene's window), its name and a line (map · weather · map loops · lights · fog look). A tap
  puts the scene on the table — under the curtain by default (lower, switch, lift). The row's
  "⋯" holds Update from now, Rename, Move up / down and Delete (Undo in the notice). The scene
  on the table right now is marked. Saving is the footer's primary button (`ScenesFooter`).

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { defaultCurtain, sceneShown, type Scene } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Badge from '../../../ui/Badge.svelte';
  import Button from '../../../ui/Button.svelte';
  import Dialog from '../../../ui/Dialog.svelte';
  import Field from '../../../ui/Field.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import ListRow from '../../../ui/ListRow.svelte';
  import Section from '../../../ui/Section.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { scenesLocal } from './local.svelte.ts';
  import { updateScene } from './save.ts';
  import { moveScene, sceneFrame, sceneSummary, switchScene, thumbStyle } from './scenes-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const THUMB = { width: 72, height: 44 };
  const scenes = $derived(ctx.game.scenes ?? []);

  let renaming = $state<Scene | null>(null);
  let renameOpen = $state(false);
  let draft = $state('');

  /** The thumbnail's inline style for a scene ('' when its map is gone). */
  function thumb(scene: Scene): string {
    const map = ctx.game.maps[scene.mapId];
    if (!map) return '';
    const t = thumbStyle(map, sceneFrame(ctx.state.table, map, scene), THUMB);
    const url = ctx.fileUrl(map.info.tableCopy ?? map.info.picture);
    return `background-image:url("${url}");background-size:${t.size};background-position:${t.position}`;
  }

  /** Puts a scene on the table (under the curtain when that is on). */
  async function show(scene: Scene): Promise<void> {
    if (scenesLocal.switching) return; // one switch at a time (debounce)
    if (!ctx.game.maps[scene.mapId]) {
      notify('That scene’s map left the game.', { kind: 'warning' });
      return;
    }
    scenesLocal.switching = scene.id;
    const under = scenesLocal.underCurtain;
    log.info('companion', 'Scene switch', { scene: scene.id, underCurtain: under });
    notify(under ? `Switching to “${scene.name}” behind the curtain…` : `“${scene.name}” on the table`, { kind: 'info' });
    try {
      const ok = await switchScene(scene.id, under, {
        dispatch: (c) => ctx.dispatch(c),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        curtain: () => ctx.session.view?.game?.curtain ?? null,
      });
      if (ok && under) notify(`“${scene.name}” on the table`, { kind: 'success' });
    } finally {
      scenesLocal.switching = null;
    }
  }

  function remove(scene: Scene): void {
    const index = scenes.findIndex((s) => s.id === scene.id);
    if (!ctx.dispatch({ type: 'scene.remove', id: scene.id })) return;
    log.info('companion', 'Scene deleted', { scene: scene.id });
    notify(`Deleted “${scene.name}”`, {
      kind: 'success',
      action: { label: 'Undo', run: () => void ctx.dispatch({ type: 'scene.save', scene, index: Math.max(0, index) }) },
    });
  }

  function saveName(): void {
    const s = renaming;
    const name = draft.trim().slice(0, 80);
    renaming = null;
    renameOpen = false;
    if (!s || !name || name === s.name) return;
    if (ctx.dispatch({ type: 'scene.rename', id: s.id, name })) log.info('companion', 'Scene renamed', { scene: s.id });
  }

  function onMenu(scene: Scene, id: string): void {
    if (id === 'update') {
      if (updateScene(ctx, scene)) notify(`“${scene.name}” now holds what the table shows`, { kind: 'success' });
    } else if (id === 'rename') {
      draft = scene.name;
      renaming = scene;
      renameOpen = true;
    } else if (id === 'up' || id === 'down') {
      const ids = moveScene(scenes, scene.id, id);
      if (ids) ctx.dispatch({ type: 'scene.order', ids });
    } else if (id === 'delete') {
      remove(scene);
    }
  }
</script>

<Section title="Scenes" description="A tap puts one on the table: its map, window, weather, map loops, lights and fog look. Fog, tokens and drawings stay as they are.">
  {#if scenes.length === 0}
    <p class="empty" data-testid="scenes-empty">No scenes yet. Set the table up — map, window, weather, torches — then save it below; one tap brings it back later.</p>
  {:else}
    <ul class="rows" data-testid="scene-list">
      {#each scenes as s, i (s.id)}
        {@const shown = sceneShown(ctx.game, s)}
        {@const gone = !ctx.game.maps[s.mapId]}
        <li data-testid="scene-row" data-scene={s.id}>
          <ListRow
            title={s.name}
            sub={sceneSummary(ctx.game, s)}
            selected={shown}
            dim={gone}
            disabled={gone || scenesLocal.switching !== null}
            onclick={() => void show(s)}
          >
            {#snippet leading()}<span class="th" style={thumb(s)} aria-hidden="true"></span>{/snippet}
            {#snippet trailing()}
              {#if scenesLocal.switching === s.id}
                <Badge text="Switching…" tone="accent" />
              {:else if shown}
                <Badge text="On the table" tone="ok" />
              {/if}
              <IconButton
                icon="more"
                label="More for {s.name}"
                variant="quiet"
                menu={[
                  { id: 'update', label: 'Update from now', icon: 'sync', description: 'Keep the name, take what the table shows', disabled: gone },
                  { id: 'rename', label: 'Rename…', icon: 'edit' },
                  { id: 'up', label: 'Move up', icon: 'arrow-up', disabled: i === 0, divider: true },
                  { id: 'down', label: 'Move down', icon: 'arrow-down', disabled: i === scenes.length - 1 },
                  { id: 'delete', label: 'Delete scene', icon: 'delete', danger: true, divider: true },
                ]}
                onmenu={(id) => onMenu(s, id)}
              />
            {/snippet}
          </ListRow>
        </li>
      {/each}
    </ul>
  {/if}
</Section>

<Section title="Switching">
  <ToggleSwitch
    label="Switch under the curtain"
    description={(ctx.game.curtain ?? defaultCurtain()).down
      ? 'The curtain is down: the scene changes behind it, you lift it'
      : 'Lower, switch, lift — the players only see the new scene fade in'}
    checked={scenesLocal.underCurtain}
    onchange={(on) => {
      scenesLocal.underCurtain = on;
      scenesLocal.save();
    }}
  />
</Section>

<Dialog bind:open={renameOpen} title="Rename scene" icon="edit" size="sm" onclose={() => (renaming = null)}>
  <Field bind:value={draft} label="Name" kind="prose" enterkeyhint="done" onenter={saveName} />
  {#snippet footer()}
    <Button label="Cancel" variant="flat" onclick={() => (renameOpen = false)} />
    <Button label="Rename" icon="check" variant="primary" onclick={saveName} />
  {/snippet}
</Dialog>

<style>
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

  .th {
    display: block;
    width: 72px;
    height: 44px;
    border-radius: var(--r-sm);
    background-color: var(--map-ground);
    background-repeat: no-repeat;
    box-shadow: inset 0 0 0 1px var(--hair);
  }
</style>
