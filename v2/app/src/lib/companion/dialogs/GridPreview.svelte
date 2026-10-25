<!--
  GridPreview — a picture with battlemap's squares drawn over it (the squares dialog's look at
  the grid). The lines are one SVG in picture pixels, hairline-thin at any size; outside the
  grid is dimmed. At most 200 lines per axis are drawn (a denser grid is a grey veil anyway).

  Props:
  - src: string — picture URL · grid: RasterGrid — where the squares lie
  - badge: Snippet — laid over the picture's bottom (the detection result)
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RasterGrid } from '@battlemap/shared';

  interface Props {
    /** The picture. */
    src: string;
    /** The squares. */
    grid: RasterGrid;
    /** Content over the picture's foot. */
    badge?: Snippet;
  }

  let { src, grid, badge }: Props = $props();

  /** Every `step`-th line so no more than 200 are drawn per axis. */
  const lines = $derived.by(() => {
    const out: string[] = [];
    const sx = Math.max(1, Math.ceil(grid.cols / 200));
    const sy = Math.max(1, Math.ceil(grid.rows / 200));
    const x1 = grid.x + grid.cols * grid.cellW;
    const y1 = grid.y + grid.rows * grid.cellH;
    for (let c = 0; c <= grid.cols; c += sx) {
      const x = grid.x + c * grid.cellW;
      out.push(`M${x} ${grid.y}V${y1}`);
    }
    for (let r = 0; r <= grid.rows; r += sy) {
      const y = grid.y + r * grid.cellH;
      out.push(`M${grid.x} ${y}H${x1}`);
    }
    return out.join('');
  });

  const outside = $derived(
    `M0 0H${grid.pictureW}V${grid.pictureH}H0Z M${grid.x} ${grid.y}v${grid.rows * grid.cellH}h${grid.cols * grid.cellW}v${-grid.rows * grid.cellH}Z`,
  );
</script>

<div class="preview" style:aspect-ratio="{grid.pictureW} / {grid.pictureH}" style:width="min(100%, calc(34dvh * {grid.pictureW} / {grid.pictureH}))">
  <img {src} alt="" draggable="false" />
  <svg viewBox="0 0 {grid.pictureW} {grid.pictureH}" preserveAspectRatio="none" aria-hidden="true">
    <path d={outside} fill="rgb(0 0 0 / 0.55)" fill-rule="evenodd" />
    <path d={lines} class="dark" />
    <path d={lines} class="light" />
  </svg>
  {#if badge}<div class="badge">{@render badge()}</div>{/if}
</div>

<style>
  .preview {
    position: relative;
    margin: 0 auto;
    border-radius: var(--r-ctl);
    overflow: hidden;
    background: var(--map-ground, var(--m0));
    box-shadow: 0 0 0 1px var(--hair);
  }

  img,
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    user-select: none;
  }

  path.dark {
    fill: none;
    stroke: rgb(0 0 0 / 0.55);
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  path.light {
    fill: none;
    stroke: #00e5ff;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .badge {
    position: absolute;
    left: var(--g);
    right: var(--g);
    bottom: var(--g);
    display: flex;
    justify-content: center;
  }
</style>
