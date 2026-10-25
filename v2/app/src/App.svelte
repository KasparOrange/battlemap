<!--
  App — the root of index.html: the start screen (TV or companion) when no mode is known, else
  that mode's screen. Hosts the one notice of the app.
  Props:
  - config: AppConfig — the page's configuration (lib/config.ts)
-->
<script lang="ts">
  import type { AppConfig, Mode } from './lib/config.ts';
  import { rememberMode } from './lib/config.ts';
  import { log } from './lib/log.ts';
  import Button from './lib/ui/Button.svelte';
  import NoticeHost from './lib/ui/NoticeHost.svelte';
  import TvApp from './lib/tv/TvApp.svelte';
  import CompanionApp from './lib/companion/CompanionApp.svelte';

  interface Props {
    /** The page's configuration. */
    config: AppConfig;
  }

  let { config }: Props = $props();

  /** Starts a mode: remembered, then the page reloads with `?mode=` so the config is fixed. */
  function pick(mode: Mode): void {
    log.info('start', 'Mode picked', { mode });
    rememberMode(mode);
    const url = new URL(location.href);
    url.searchParams.set('mode', mode);
    location.href = url.toString();
  }
</script>

{#if config.mode === 'tv'}
  <TvApp />
{:else if config.mode === 'companion'}
  <CompanionApp />
{:else}
  <main class="start">
    <h1>battlemap</h1>
    <div class="choices">
      <Button label="TV mode" icon="tv" variant="primary" autofocus onclick={() => pick('tv')} />
      <Button label="Companion" icon="tablet" onclick={() => pick('companion')} />
    </div>
  </main>
{/if}

<NoticeHost />

<style>
  .start { min-height: 100vh; display: grid; place-content: center; gap: 24px; text-align: center; }
  h1 { margin: 0; font-weight: 600; letter-spacing: 0.02em; }
  .choices { display: flex; gap: 16px; justify-content: center; }
</style>
