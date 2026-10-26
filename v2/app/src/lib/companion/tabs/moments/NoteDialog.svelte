<!--
  NoteDialog — writes or edits one DM note pinned to the map ("trap here", "DC 15 lock"). Opens
  from a long press on the map (any tab but Draw and Fog), a tap on a pin in the Moments tab, or
  a note row's Edit. Save adds or replaces the note (`note.set`, one undo step); Delete takes it
  off with Undo in the notice. Notes are seen only on the tablet — the TV never draws them.
  Mounted once by the game screen; it shows while `momentsLocal.draft` is set.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import { MAX_NOTE_TEXT, type DmNote } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import Dialog from '../../../ui/Dialog.svelte';
  import Field from '../../../ui/Field.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import { momentsLocal } from './local.svelte.ts';
  import { notePlace, noteText } from './moments-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  let open = $state(false);
  let text = $state('');
  let field = $state<HTMLInputElement | HTMLTextAreaElement>();
  const draft = $derived(momentsLocal.draft);

  // a new draft opens the dialog with its text, and the keyboard comes up at once
  $effect(() => {
    const d = momentsLocal.draft;
    open = d !== null;
    if (!d) return;
    text = d.note.text;
    setTimeout(() => field?.focus(), 60);
  });

  function close(): void {
    momentsLocal.draft = null;
  }

  function save(): void {
    const d = momentsLocal.draft;
    if (!d) return;
    const t = noteText(text);
    if (!t) {
      if (!d.isNew) remove(d.note);
      close();
      return;
    }
    const note: DmNote = { ...d.note, text: t };
    if (ctx.dispatch({ type: 'note.set', note, gesture: ctx.newGesture() })) {
      log.info('companion', d.isNew ? 'Note pinned' : 'Note edited', { id: note.id, chars: t.length });
      if (d.isNew) notify('Note pinned — only you see it', { kind: 'success' });
    }
    close();
  }

  function remove(note: DmNote): void {
    if (!ctx.dispatch({ type: 'note.remove', id: note.id })) return;
    log.info('companion', 'Note deleted', { id: note.id });
    notify(`Deleted the note “${note.text.slice(0, 30)}”`, {
      action: { label: 'Undo', run: () => ctx.dispatch({ type: 'note.set', note, gesture: ctx.newGesture() }) },
    });
  }
</script>

<Dialog
  bind:open
  title={draft?.isNew ? 'New note' : 'Note'}
  description="{draft ? notePlace(draft.note) : ''} · only you see it, never the TV"
  icon="pin"
  size="sm"
  onclose={close}
>
  <div data-testid="note-dialog">
    <Field
      bind:value={text}
      bind:el={field}
      label="Note"
      placeholder="Trap here · DC 15 lock"
      kind="prose"
      multiline
      enterkeyhint="done"
      helper="{text.length} / {MAX_NOTE_TEXT}"
      error={text.length > MAX_NOTE_TEXT ? `At most ${MAX_NOTE_TEXT} characters` : undefined}
    />
  </div>
  {#snippet footer()}
    {#if draft && !draft.isNew}
      <Button label="Delete" icon="delete" variant="flat" tone="danger" onclick={() => (remove(draft.note), close())} />
    {/if}
    <Button label="Save" icon="check" variant="primary" disabled={!noteText(text) && !!draft?.isNew} onclick={save} />
  {/snippet}
</Dialog>
