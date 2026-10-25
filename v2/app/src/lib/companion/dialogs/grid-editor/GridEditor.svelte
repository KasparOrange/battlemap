<!--
  GridEditor — "Fit the grid": a full-screen editor that lays battlemap's squares exactly onto
  a picture map (parity §18). The picture with the grid over it fills the canvas (outside the
  grid dimmed); the tools sit in the side panel (below the canvas on narrow screens):
  Look · Move · Stretch · 2 corners · Known length, square size to 0.01 px, position nudges,
  squares across, edge squares, corner jumps, start over, line colour (`EditorPanel.svelte`).
  Undo / redo (200 steps, a drag is one) and a magnifier above the finger while dragging.

  Fingers (`gestures.ts`): one finger edits; a second finger takes back what the first did and
  the touch pans / pinches the view. Wheel zooms at the cursor. Keys: arrows nudge (Shift ×10),
  + / − change the size by 0.01 (Shift 0.1), Ctrl Z / Ctrl Shift Z. Leaving with changes asks.
  Drawing is `paint.ts`, the maths `editor-logic.ts`; this file holds the state and the stage.

  Props:
  - open: boolean (bindable) · src: string — the picture · start: RasterGrid — the grid to edit
  - detected: RasterGrid | null — "Start over from" the found grid · tool: 'fit' | 'length'
  - table: {cols, rows} | null · applyLabel: string · onapply: (grid) => void · onclose: () => void
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { hasPartialEdges, isSquareGrid, withCell, type Point, type RasterGrid } from '@battlemap/shared';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import Dialog from '../../../ui/Dialog.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import EditorPanel from './EditorPanel.svelte';
  import { fitView, GridHistory, jumpView, moved, readout, TOOL_HINTS, zoomAt, type EditorTool, type EditorView, type Jump } from './editor-logic.ts';
  import { EditorGestures, sameGrid } from './gestures.ts';
  import { LENS_PX, paintLens, paintScene, type EditorScene } from './paint.ts';

  interface Props {
    /** Shown or not. */
    open: boolean;
    /** The picture's URL. */
    src: string;
    /** The grid to start from. */
    start: RasterGrid;
    /** The grid the importer found, for "Start over from". */
    detected?: RasterGrid | null;
    /** Which tool to start with. */
    tool?: 'fit' | 'length';
    /** Squares the table holds. */
    table?: { cols: number; rows: number } | null;
    /** The commit button's text. */
    applyLabel?: string;
    /** The DM applied the grid. */
    onapply: (grid: RasterGrid) => void;
    /** Closed without applying. */
    onclose: () => void;
  }

  let { open = $bindable(), src, start, detected = null, tool: startTool = 'fit', table = null, applyLabel = 'Apply', onapply, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  const history = new GridHistory(start);
  // svelte-ignore state_referenced_locally
  let grid = $state.raw<RasterGrid>(start);
  let undoable = $state(false);
  let redoable = $state(false);
  // svelte-ignore state_referenced_locally
  let tool = $state<EditorTool>(startTool === 'length' ? 'length' : 'move');
  // svelte-ignore state_referenced_locally
  let square = $state(isSquareGrid(start));
  // svelte-ignore state_referenced_locally
  let partial = $state(hasPartialEdges(start));
  let colour = $state(0);
  let bold = $state(false);
  let view = $state.raw<EditorView>({ scale: 1, ox: 0, oy: 0 });
  let markA = $state.raw<Point | null>(null);
  let markB = $state.raw<Point | null>(null);
  let magnifier = $state.raw<{ at: Point; pic: Point } | null>(null);
  let askLeave = $state(false);

  let canvas: HTMLCanvasElement | undefined = $state();
  let lens: HTMLCanvasElement | undefined = $state();
  let stage: HTMLDivElement | undefined = $state();
  let image: HTMLImageElement | null = null;
  let imageReady = $state(false);

  const changed = $derived(undoable || redoable ? !sameGrid(grid, start) : false);
  const info = $derived(readout(grid, table));

  // ── history ──────────────────────────────────────────────────────────────

  /** Makes a grid current as one undo step. */
  function commit(next: RasterGrid): void {
    if (history.push(next)) {
      grid = history.current;
      undoable = history.canUndo;
      redoable = history.canRedo;
    }
  }

  function undo(): void {
    grid = history.undo();
    undoable = history.canUndo;
    redoable = history.canRedo;
  }

  function redo(): void {
    grid = history.redo();
    undoable = history.canUndo;
    redoable = history.canRedo;
  }

  const clearMarks = () => (markA = markB = null);

  // ── fingers: the gestures read and write the editor's state through this host ──

  const gestures = new EditorGestures({
    get tool() { return tool; },
    get grid() { return grid; },
    get view() { return view; },
    set view(v) { view = v; },
    get square() { return square; },
    get markA() { return markA; },
    set markA(p) { markA = p; },
    get markB() { return markB; },
    set markB(p) { markB = p; },
    get magnifier() { return magnifier; },
    set magnifier(m) { magnifier = m; },
    preview: (g) => (grid = g),
    settle: (before) => {
      const result = grid;
      grid = before;
      commit(result);
    },
    hint: (text) => notify(text, { kind: 'info' }),
  });

  /** A pointer's position in canvas CSS px. */
  function local(e: PointerEvent | WheelEvent): Point {
    const r = canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onwheel(e: WheelEvent): void {
    e.preventDefault();
    view = zoomAt(view, e.deltaY > 0 ? 0.9 : 1.1, local(e));
  }

  function onkeydown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    const k = e.shiftKey ? 10 : 1;
    const nudge: Record<string, [number, number]> = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] };
    if (nudge[e.key] && !t.closest('[role="radiogroup"], [role="slider"]')) {
      e.preventDefault();
      const [dx, dy] = nudge[e.key]!;
      commit(moved(grid, dx, dy));
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      const d = (e.key === '-' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01);
      commit(withCell(grid, grid.cellW + d, grid.cellH + d));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  let frame = 0;
  /** Asks for one redraw on the next frame. */
  function invalidate(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  /** Draws the canvas and, while dragging, the magnifier. */
  function draw(): void {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const { w, h } = cssSize();
    const scene: EditorScene = { image, grid, tool, markA, markB, colour, bold };
    const dpr = canvas.width / Math.max(1, w);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintScene(ctx, scene, view, w, h, false);
    if (lens && magnifier) paintLens(lens, scene, magnifier.pic);
  }

  $effect(() => {
    // redraw whenever what is drawn changes
    void [grid, view, markA, markB, colour, bold, tool, imageReady, magnifier];
    invalidate();
  });

  $effect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      image = img;
      imageReady = true;
      untrack(() => fitWhole());
    };
    img.onerror = () => {
      log.warn('companion', 'Grid editor picture not shown', { src });
      notify("Couldn't show the picture.", { kind: 'error' });
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  });

  $effect(() => {
    if (!stage) return;
    const ro = new ResizeObserver(() => {
      if (!canvas || !stage) return;
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        const first = canvas.width === 300 && canvas.height === 150;
        canvas.width = w;
        canvas.height = h;
        if (first) fitWhole();
        invalidate();
      }
    });
    ro.observe(stage);
    return () => ro.disconnect();
  });

  /** Canvas size in CSS px. */
  function cssSize(): { w: number; h: number } {
    const r = stage?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1 };
  }

  function fitWhole(): void {
    const { w, h } = cssSize();
    view = fitView(grid.pictureW, grid.pictureH, w, h);
  }

  function jump(j: Jump): void {
    const { w, h } = cssSize();
    view = jumpView(grid, j, w, h);
  }

  function zoomBy(f: number): void {
    const { w, h } = cssSize();
    view = zoomAt(view, f, { x: w / 2, y: h / 2 });
  }

  // ── leaving ──────────────────────────────────────────────────────────────

  function apply(): void {
    log.info('companion', 'Grid fitted', { cols: grid.cols, rows: grid.rows, cellW: grid.cellW, cellH: grid.cellH, x: grid.x, y: grid.y });
    onapply(grid);
  }

  function requestClose(): void {
    if (changed) askLeave = true;
    else onclose();
  }
</script>

<Dialog {open} title="Fit the grid" icon="grid" size="full" onclose={requestClose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="editor" {onkeydown}>
    <div class="stage" bind:this={stage}>
      <canvas
        bind:this={canvas}
        aria-label="The picture with the grid. {TOOL_HINTS[tool]}"
        onpointerdown={(e) => {
          canvas?.setPointerCapture(e.pointerId);
          gestures.down(e.pointerId, local(e), e.button);
        }}
        onpointermove={(e) => gestures.move(e.pointerId, local(e))}
        onpointerup={(e) => gestures.up(e.pointerId)}
        onpointercancel={(e) => gestures.up(e.pointerId)}
        {onwheel}
        oncontextmenu={(e) => e.preventDefault()}
      ></canvas>
      {#if magnifier}
        <canvas
          class="lens"
          bind:this={lens}
          style:left="{magnifier.at.x - LENS_PX / 2}px"
          style:top="{Math.max(0, magnifier.at.y - 40 - LENS_PX)}px"
          aria-hidden="true"
        ></canvas>
      {/if}
      <div class="chrome" data-ctl="toolbar">
        <IconButton icon="undo" label="Undo" disabled={!undoable} onclick={undo} />
        <IconButton icon="redo" label="Redo" disabled={!redoable} onclick={redo} />
        <span class="gap"></span>
        <IconButton icon="minus" label="Zoom out" onclick={() => zoomBy(1 / 1.5)} />
        <IconButton icon="add" label="Zoom in" onclick={() => zoomBy(1.5)} />
        <IconButton icon="fit" label="Whole picture" onclick={fitWhole} />
      </div>
      <div class="readout" aria-live="polite">
        <span>{info.squares}</span><span>{info.size}</span>
      </div>
    </div>

    <aside class="panel bm-scroll">
      <EditorPanel
        {grid}
        {table}
        {detected}
        bind:tool
        bind:square
        bind:partial
        bind:colour
        bind:bold
        {markA}
        {markB}
        oncommit={commit}
        onjump={jump}
        onclearmarks={clearMarks}
      />
    </aside>
  </div>

  {#snippet footer()}
    <Button label="Back to the start" icon="undo" variant="flat" disabled={!changed} onclick={() => commit(start)} />
    <Button label={applyLabel} icon="check" variant="primary" onclick={apply} />
  {/snippet}
</Dialog>

<Dialog open={askLeave} title="Leave without applying?" description="The grid goes back to how it was." icon="warning" size="sm" onclose={() => (askLeave = false)}>
  {#snippet footer()}
    <Button label="Keep editing" variant="flat" onclick={() => (askLeave = false)} />
    <Button label="Leave" icon="close" variant="primary" onclick={() => { askLeave = false; onclose(); }} />
  {/snippet}
</Dialog>

<style>
  .editor {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr var(--panel-w);
    gap: var(--g2);
    margin: calc(var(--g) * -1) calc(var(--g2) * -1) calc(var(--g2) * -1);
    padding: 0 var(--g2) var(--g2);
  }

  @media (max-width: 900px) {
    .editor {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(240px, 55%) 1fr;
    }
  }

  .stage {
    position: relative;
    min-height: 0;
    border-radius: var(--r-ctl);
    overflow: hidden;
    background: var(--map-ground, #000);
    box-shadow: 0 0 0 1px var(--hair);
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
  }

  .lens {
    position: absolute;
    inset: auto;
    width: 170px;
    height: 170px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--accent), var(--elev-float);
    pointer-events: none;
  }

  .chrome {
    position: absolute;
    top: var(--g);
    left: var(--g);
    right: var(--g);
    display: flex;
    gap: calc(var(--g) / 2);
    pointer-events: none;
  }

  .chrome > :global(*) {
    pointer-events: auto;
  }

  .gap {
    flex: 1;
  }

  .readout {
    position: absolute;
    left: var(--g);
    bottom: var(--g);
    display: flex;
    gap: var(--g);
    padding: calc(var(--g) / 2) var(--g);
    border-radius: var(--r-ctl);
    background: color-mix(in srgb, var(--m0) 82%, transparent);
    font: var(--fs-small) / 1.2 var(--font-value);
    color: var(--t);
    pointer-events: none;
  }

  .panel {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: var(--g2);
    padding-right: calc(var(--g) / 2);
  }
</style>
