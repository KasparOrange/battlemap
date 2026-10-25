<!--
  OverviewMap — the whole map small, with what the players see on it (parity CF-03): in table
  mode the one-inch window (gold box, the rest dimmed) that a tap or a drag moves — whole
  squares, at most one command per 80 ms, the last at once; in fit / free mode the TV's
  screen as an outline, not draggable. The picture is the map's table copy (or the picture),
  cropped to the squares. At most 220 px high.

  Props:
  - ctx: GameContext
-->
<script lang="ts">
  import type { Point } from '@battlemap/shared';
  import type { GameContext } from '../../game/tabs.ts';
  import { throttle } from '../../input/throttle.ts';
  import { tvQuad, viewOf, windowAt } from './view-logic.ts';

  interface Props {
    /** The game context. */
    ctx: GameContext;
  }

  let { ctx }: Props = $props();

  const map = $derived(ctx.map);
  const grid = $derived(map.info.grid);
  const view = $derived(viewOf(ctx.state.table, map));
  const quad = $derived(view ? tvQuad(view) : null);
  const draggable = $derived(!!view?.layout && (view.layout.pansX || view.layout.pansY));
  const src = $derived(ctx.fileUrl(map.info.tableCopy ?? map.info.picture));
  // The picture placed so that the grid's rectangle fills the box.
  const imgStyle = $derived.by(() => {
    const w = grid.cols * grid.cellW;
    const h = grid.rows * grid.cellH;
    return `left:${(-grid.x / w) * 100}%;top:${(-grid.y / h) * 100}%;width:${(grid.pictureW / w) * 100}%;height:${(grid.pictureH / h) * 100}%`;
  });
  const points = $derived(quad ? quad.map((p) => `${p.x},${p.y}`).join(' ') : '');

  let box: HTMLDivElement | undefined = $state();
  const send = throttle(80, (w: { col: number; row: number }) => ctx.dispatch({ type: 'view.window', col: w.col, row: w.row }));

  function squaresAt(e: PointerEvent): Point {
    const r = box!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * grid.cols, y: ((e.clientY - r.top) / r.height) * grid.rows };
  }

  function moveTo(e: PointerEvent): void {
    const w = windowAt(view, map, squaresAt(e));
    if (w && (w.col !== view?.layout?.col || w.row !== view?.layout?.row)) send.push(w);
  }

  function onpointerdown(e: PointerEvent): void {
    if (!draggable) return;
    e.preventDefault();
    box?.setPointerCapture(e.pointerId);
    moveTo(e);
  }

  function onpointermove(e: PointerEvent): void {
    if (draggable && box?.hasPointerCapture(e.pointerId)) moveTo(e);
  }

  function onpointerup(e: PointerEvent): void {
    if (box?.hasPointerCapture(e.pointerId)) send.flush();
  }
</script>

<div
  class="overview"
  class:draggable
  bind:this={box}
  style:aspect-ratio="{grid.cols} / {grid.rows}"
  style:width="min(100%, calc(220px * {grid.cols} / {grid.rows}))"
  role="img"
  aria-label="The whole map with what the TV shows"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
>
  <img {src} alt="" style={imgStyle} draggable="false" />
  {#if quad}
    <svg viewBox="0 0 {grid.cols} {grid.rows}" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-1000 -1000H1000V1000H-1000Z M{points.replaceAll(' ', ' L')}Z" fill="rgb(0 0 0 / 0.6)" fill-rule="evenodd" />
      <polygon {points} class="frame" />
    </svg>
  {/if}
</div>

<style>
  .overview {
    position: relative;
    margin: 0 auto;
    border-radius: var(--r-ctl);
    overflow: hidden;
    background: var(--map-ground, var(--m0));
    box-shadow: 0 0 0 1px var(--hair);
    touch-action: none;
    user-select: none;
  }

  .draggable {
    cursor: grab;
  }

  img {
    position: absolute;
    max-width: none;
    pointer-events: none;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .frame {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 7 4;
  }
</style>
