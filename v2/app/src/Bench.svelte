<!--
  Bench — the renderer bench page (stub): starts the Pixi renderer full screen, draws one
  frame, then counts frames for 3 s while nothing changes (must stay at 1: render on demand)
  and shows the result. No props.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { log } from './lib/log.ts';
  import { createRenderer, type TableRenderer } from './lib/render/pixi.ts';

  let host: HTMLDivElement | undefined = $state();
  let result = $state('starting the renderer…');

  onMount(() => {
    let renderer: TableRenderer | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    createRenderer(host!, { log, maxRenderHeight: 1080 })
      .then((r) => {
        renderer = r;
        const start = r.scheduler.frames;
        result = 'idle check: 3 s…';
        timer = setTimeout(() => {
          const idleFrames = r.scheduler.frames - start;
          result = `idle frames in 3 s: ${idleFrames} (budget 0–1)`;
          log.info('bench', 'Idle check', { idleFrames, lastRenderMs: r.scheduler.lastRenderMs });
        }, 3000);
      })
      .catch((e: unknown) => {
        result = `renderer failed: ${String(e)}`;
        log.error('bench', 'Renderer failed', { error: String(e) });
      });
    return () => {
      clearTimeout(timer);
      renderer?.destroy();
    };
  });
</script>

<div class="stage" bind:this={host}></div>
<p class="result" data-testid="bench-result">{result}</p>

<style>
  .stage { position: fixed; inset: 0; background: #000; }
  .result { position: fixed; left: 16px; bottom: 16px; margin: 0; font: 14px system-ui, sans-serif; color: #ddd; }
</style>
