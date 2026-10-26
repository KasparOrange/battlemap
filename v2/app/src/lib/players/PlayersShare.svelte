<!--
  PlayersShare — the companion's way to hand out the players' view (S12): a row in Settings ▸
  The table that opens a dialog with the players' link as a QR code (drawn by the server,
  `/api/qr.svg`), the link itself and Copy. Players scan it with their phones, or open it on a
  second screen; what they see is read-only and only what the TV shows.

  Props:
  - serverUrl: string — the table's server · room: string — the table's room id
-->
<script lang="ts">
  import { log } from '../log.ts';
  import Button from '../ui/Button.svelte';
  import Dialog from '../ui/Dialog.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import { notify } from '../ui/notice.svelte.ts';
  import { playersLink } from './players-logic.ts';

  interface Props {
    /** The table's server, no trailing slash. */
    serverUrl: string;
    /** The table's room id. */
    room: string;
  }

  let { serverUrl, room }: Props = $props();
  let open = $state(false);

  /** The app's address: this page's when it is served over http(s), else the server's copy. */
  const appUrl = $derived(/^https?:$/.test(location.protocol) ? `${location.origin}${location.pathname}` : `${serverUrl}/app/`);
  const link = $derived(playersLink(appUrl, room, serverUrl));
  const qr = $derived(`${serverUrl}/api/qr.svg?text=${encodeURIComponent(link)}`);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      notify('Link copied — send it to the players', { kind: 'success' });
    } catch (e) {
      log.warn('players', 'Link not copied', { error: String(e) });
      notify('Could not copy — long-press the link to copy it.', { kind: 'warning' });
    }
  }
</script>

<ListRow title="Players' view" sub="What the TV shows, on the players' phones" icon="players" chevron onclick={() => {
  open = true;
  log.info('players', 'Players\' link shown', { room });
}} />

<Dialog {open} title="Players' view" description="Scan it with a phone — read-only, only what the TV shows" icon="players" size="sm" onclose={() => (open = false)}>
  <div class="share">
    <img class="qr" src={qr} alt="QR code of the players' link" width="240" height="240" />
    <a class="link" href={link} target="_blank" rel="noopener" data-testid="players-link">{link}</a>
  </div>
  {#snippet footer()}
    <Button label="Close" variant="flat" onclick={() => (open = false)} />
    <Button label="Copy the link" icon="copy" variant="primary" onclick={() => void copy()} />
  {/snippet}
</Dialog>

<style>
  .share {
    display: grid;
    gap: var(--g);
    justify-items: center;
  }

  .qr {
    width: 240px;
    height: 240px;
    background: #fff;
    border-radius: var(--r-sm);
  }

  .link {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: var(--fs-small);
    color: var(--accent-text);
  }
</style>
