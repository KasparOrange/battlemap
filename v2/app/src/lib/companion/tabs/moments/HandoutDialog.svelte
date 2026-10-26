<!--
  HandoutDialog — writes a letter handout, or edits a handout's name and text (a letter's body,
  a picture's caption). Save sends `handout.save` (adds or replaces by id); a letter without a
  name takes its first line.

  Props:
  - open: boolean (bindable)
  - handout: Handout — what to edit (a new letter has an empty text and a new id)
  - isNew: boolean — the dialog says "Write a letter" and Save adds it
  - onsave: (h: Handout) => void — the edited handout
-->
<script lang="ts">
  import { MAX_HANDOUT_TEXT, type Handout } from '@battlemap/shared';
  import Button from '../../../ui/Button.svelte';
  import Dialog from '../../../ui/Dialog.svelte';
  import Field from '../../../ui/Field.svelte';
  import { letterName } from './moments-logic.ts';

  interface Props {
    /** Whether the dialog shows. */
    open: boolean;
    /** The handout being written or edited. */
    handout: Handout;
    /** A new letter (Save adds it). */
    isNew: boolean;
    /** Gets the saved handout. */
    onsave: (h: Handout) => void;
  }

  let { open = $bindable(), handout, isNew, onsave }: Props = $props();

  let name = $state('');
  let text = $state('');

  $effect(() => {
    if (!open) return;
    name = handout.name;
    text = handout.text;
  });

  const letter = $derived(handout.kind === 'letter');
  const tooLong = $derived(text.length > MAX_HANDOUT_TEXT);
  const empty = $derived(letter && !text.trim());

  function save(): void {
    if (tooLong || empty) return;
    const n = letter ? letterName(name, text) : name.trim().slice(0, 120) || handout.name;
    onsave({ ...handout, name: n, text: text.trim() });
    open = false;
  }
</script>

<Dialog bind:open title={isNew ? 'Write a letter' : letter ? 'Edit the letter' : 'Edit the picture'} icon="edit" size="md">
  <div class="fields" data-testid="handout-dialog">
    <Field bind:value={name} label="Name" placeholder={letter ? 'From the first line' : 'Picture'} kind="prose" />
    <Field
      bind:value={text}
      label={letter ? 'Letter' : 'Caption (optional)'}
      placeholder={letter ? 'My dear Elrin, the vault opens at moonrise…' : 'Found in the crypt'}
      kind="prose"
      multiline
      helper="{text.length} / {MAX_HANDOUT_TEXT}"
      error={tooLong ? `At most ${MAX_HANDOUT_TEXT} characters` : undefined}
    />
  </div>
  {#snippet footer()}
    <Button label="Cancel" variant="flat" onclick={() => (open = false)} />
    <Button label={isNew ? 'Add the letter' : 'Save'} icon="check" variant="primary" disabled={tooLong || empty} onclick={save} />
  {/snippet}
</Dialog>

<style>
  .fields {
    display: grid;
    gap: var(--g2);
  }
</style>
