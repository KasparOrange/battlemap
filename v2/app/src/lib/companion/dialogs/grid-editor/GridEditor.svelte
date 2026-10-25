<!--
  GridEditor — "Fit the grid": a full-screen editor that lays battlemap's squares exactly onto
  a picture map (parity §18). The picture with the grid over it fills the canvas (outside the
  grid dimmed); the side panel (below the canvas on narrow screens) holds the tools:

  - Look (only moves the view) · Move (slide the grid) · Stretch (top-left stays, the grabbed
    line follows) · 2 corners (mark two grid corners, counts guessed, least squares) · Known
    length (a line over a door or a scale bar, in squares or feet — for maps with no grid);
  - square size to 0.01 px (½ and × 2, square squares), position nudges by 1 / 0.1 px,
    squares across, edge squares, corner jumps to check the fit, start over, line colour;
  - undo / redo (200 steps, a drag is one), a magnifier above the finger while dragging.

  Fingers: a one-finger touch edits; a second finger reverts what the first did and the touch
  pans / pinches the view. Wheel zooms at the cursor. Keys: arrows nudge (Shift ×10), + / −
  change the size by 0.01 (Shift 0.1). Leaving with changes asks first.

  Props:
  - open: boolean (bindable) · src: string — the picture · start: RasterGrid — the grid to edit
  - detected: RasterGrid | null — "Start over from" the found grid · tool: 'fit' | 'length'
  - table: {cols, rows} | null · applyLabel: string · onapply: (grid) => void · onclose: () => void
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    acrossWidth, gridCorner, hasPartialEdges, isSquareGrid, recountGrid, stretched, withCell, wholeGrid,
    type Point, type RasterGrid,
  } from '@battlemap/shared';
  import { log } from '../../../log.ts';
  import Button from '../../../ui/Button.svelte';
  import Dialog from '../../../ui/Dialog.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import NumberStepper from '../../../ui/NumberStepper.svelte';
  import Section from '../../../ui/Section.svelte';
  import Segmented from '../../../ui/Segmented.svelte';
  import ToggleSwitch from '../../../ui/ToggleSwitch.svelte';
  import { notify } from '../../../ui/notice.svelte.ts';
  import {
    fitView, fromCorners, fromLength, GridHistory, jumpView, moved, positionText, readout, toPicture, toScreen, zoomAt,
    type EditorTool, type EditorView, type Jump, type LengthUnitKind,
  } from './editor-logic.ts';

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

  const LINE_COLOURS = ['#00e5ff', '#ff2bd6', '#ffea00', '#76ff03'];
  const TOOL_HINTS: Record<EditorTool, string> = {
    look: 'Drag to move the view, pinch or scroll to zoom. Nothing changes.',
    move: 'Drag anywhere to slide the grid over the picture.',
    stretch: 'The top-left corner stays. Grab a line far from it and drag it onto the picture’s line.',
    corners: 'Tap a grid corner, then one far away. The counts between them are guessed — check them.',
    length: 'Drag a line over something of known size: a door is one square, or a scale bar.',
  };

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
  let lengthAmount = $state(1);
  let lengthUnit = $state<LengthUnitKind>('squares');
  let askLeave = $state(false);
  let magnifier = $state.raw<{ at: Point; pic: Point } | null>(null);

  let canvas: HTMLCanvasElement | undefined = $state();
  let lens: HTMLCanvasElement | undefined = $state();
  let stage: HTMLDivElement | undefined = $state();
  let image: HTMLImageElement | null = null;
  let imageReady = $state(false);

  const changed = $derived(undoable || redoable ? !sameGrid(grid, start) : false);
  const info = $derived(readout(grid, table));
  const cornerResult = $derived(markA && markB ? fromCorners(grid, markA, markB, square, partial) : null);
  const lengthResult = $derived(
    markA && markB ? fromLength(markA, markB, lengthAmount, lengthUnit, grid.pictureW, grid.pictureH, table, partial) : null,
  );
  const linePx = $derived(markA && markB ? Math.hypot(markB.x - markA.x, markB.y - markA.y) : 0);

  function sameGrid(a: RasterGrid, b: RasterGrid): boolean {
    return a.cols === b.cols && a.rows === b.rows && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 &&
      Math.abs(a.cellW - b.cellW) < 1e-6 && Math.abs(a.cellH - b.cellH) < 1e-6;
  }

  /** Makes a grid current as one undo step. */
  function commit(next: RasterGrid): void {
    if (history.push(next)) {
      grid = history.current;
      undoable = history.canUndo;
      redoable = history.canRedo;
    }
  }

  /** Shows a grid during a drag without making a step. */
  function preview(next: RasterGrid): void {
    grid = next;
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

  // ── drawing ──────────────────────────────────────────────────────────────

  let frame = 0;
  /** Asks for one redraw on the next frame. */
  function invalidate(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
      drawLens();
    });
  }

  $effect(() => {
    // Redraw whenever what is drawn changes.
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
    img.onerror = () => notify("Couldn't show the picture.", { kind: 'error' });
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

  /** Draws picture, dim outside, lines and marks. */
  function draw(): void {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const dpr = canvas.width / Math.max(1, cssSize().w);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, view, cssSize().w, cssSize().h, false);
  }

  /** Paints the scene with a view onto a context of `w × h` CSS px. */
  function paint(ctx: CanvasRenderingContext2D, v: EditorView, w: number, h: number, inLens: boolean): void {
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.scale, v.scale);
    ctx.imageSmoothingEnabled = v.scale < 2;
    if (image) ctx.drawImage(image, 0, 0, grid.pictureW, grid.pictureH);
    ctx.restore();

    // dim outside the grid
    const tl = toScreen(v, { x: grid.x, y: grid.y });
    const br = toScreen(v, gridCorner(grid, grid.cols, grid.rows));
    ctx.fillStyle = 'rgba(0,0,0,0.67)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(tl.x, br.y, br.x - tl.x, tl.y - br.y);
    ctx.fill('evenodd');

    // lines, only those on screen
    const cw = grid.cellW * v.scale;
    const ch = grid.cellH * v.scale;
    const sx = cw < 3 ? Math.ceil(3 / cw) : 1;
    const sy = ch < 3 ? Math.ceil(3 / ch) : 1;
    const c0 = Math.max(0, Math.floor(-tl.x / cw));
    const c1 = Math.min(grid.cols, Math.ceil((w - tl.x) / cw));
    const r0 = Math.max(0, Math.floor(-tl.y / ch));
    const r1 = Math.min(grid.rows, Math.ceil((h - tl.y) / ch));
    ctx.beginPath();
    for (let c = c0 - (c0 % sx); c <= c1; c += sx) {
      const x = Math.round(tl.x + c * cw) + 0.5;
      ctx.moveTo(x, Math.max(0, tl.y));
      ctx.lineTo(x, Math.min(h, br.y));
    }
    for (let r = r0 - (r0 % sy); r <= r1; r += sy) {
      const y = Math.round(tl.y + r * ch) + 0.5;
      ctx.moveTo(Math.max(0, tl.x), y);
      ctx.lineTo(Math.min(w, br.x), y);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = bold ? 4 : 3;
    ctx.stroke();
    ctx.strokeStyle = LINE_COLOURS[colour]!;
    ctx.lineWidth = bold ? 2 : 1;
    ctx.stroke();

    // marks and the measured line
    if (!inLens || tool === 'corners' || tool === 'length') {
      const marks = [markA, markB].filter((m): m is Point => m !== null);
      if (tool === 'length' && markA && markB) {
        const a = toScreen(v, markA);
        const b = toScreen(v, markB);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#e3b45e';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (tool === 'corners' || tool === 'length') {
        for (const m of marks) {
          const p = toScreen(v, m);
          ctx.beginPath();
          ctx.arc(p.x, p.y, inLens ? 6 : 9, 0, Math.PI * 2);
          ctx.strokeStyle = '#1a1306';
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.strokeStyle = '#e3b45e';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }

  /** The magnifier: ~1.5 squares around the finger, crosshair. */
  function drawLens(): void {
    const ctx = lens?.getContext('2d');
    if (!ctx || !lens || !magnifier) return;
    const size = 170;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (lens.width !== size * dpr) {
      lens.width = size * dpr;
      lens.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const scale = size / (3 * Math.max(grid.cellW, grid.cellH));
    const v: EditorView = { scale, ox: size / 2 - magnifier.pic.x * scale, oy: size / 2 - magnifier.pic.y * scale };
    paint(ctx, v, size, size, true);
    ctx.strokeStyle = '#e3b45e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2 - 12);
    ctx.lineTo(size / 2, size / 2 + 12);
    ctx.moveTo(size / 2 - 12, size / 2);
    ctx.lineTo(size / 2 + 12, size / 2);
    ctx.stroke();
  }

  // ── fingers ──────────────────────────────────────────────────────────────

  const pointers = new Map<number, Point>();
  /** The gesture in progress. */
  let gesture: {
    kind: 'tool' | 'view';
    startGrid: RasterGrid;
    startPic: Point;
    startScreen: Point;
    moved: boolean;
    dragMark: 'a' | 'b' | 'new' | null;
    startView: EditorView;
    pinch: { d: number; mid: Point } | null;
  } | null = null;

  function local(e: PointerEvent): Point {
    const r = canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function twoFinger(): { d: number; mid: Point } {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(b!.x - a!.x, b!.y - a!.y), mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 } };
  }

  function nearMark(p: Point): 'a' | 'b' | null {
    for (const [id, m] of [['a', markA], ['b', markB]] as const) {
      if (!m) continue;
      const s = toScreen(view, m);
      if (Math.hypot(s.x - p.x, s.y - p.y) <= 36) return id;
    }
    return null;
  }

  function onpointerdown(e: PointerEvent): void {
    canvas?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      const pic = toPicture(view, p);
      gesture = {
        kind: tool === 'look' || e.button === 1 || e.button === 2 ? 'view' : 'tool',
        startGrid: grid, startPic: pic, startScreen: p, moved: false, startView: view, pinch: null,
        dragMark: tool === 'corners' || tool === 'length' ? nearMark(p) ?? 'new' : null,
      };
    } else if (gesture) {
      // A second finger: undo what the first did, the touch now moves the view.
      if (gesture.kind === 'tool') {
        preview(gesture.startGrid);
        magnifier = null;
      }
      gesture = { ...gesture, kind: 'view', startView: view, pinch: twoFinger() };
    }
  }

  function onpointermove(e: PointerEvent): void {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (!gesture.moved && Math.hypot(p.x - gesture.startScreen.x, p.y - gesture.startScreen.y) < 4) return;
    gesture.moved = true;
    if (gesture.kind === 'view') {
      if (gesture.pinch && pointers.size >= 2) {
        const now = twoFinger();
        let v = zoomAt(gesture.startView, now.d / Math.max(1, gesture.pinch.d), gesture.pinch.mid);
        v = { ...v, ox: v.ox + now.mid.x - gesture.pinch.mid.x, oy: v.oy + now.mid.y - gesture.pinch.mid.y };
        view = v;
      } else {
        view = { ...gesture.startView, ox: gesture.startView.ox + p.x - gesture.startScreen.x, oy: gesture.startView.oy + p.y - gesture.startScreen.y };
      }
      return;
    }
    const pic = toPicture(view, p);
    magnifier = { at: p, pic };
    switch (tool) {
      case 'move':
        preview(moved(gesture.startGrid, pic.x - gesture.startPic.x, pic.y - gesture.startPic.y));
        break;
      case 'stretch':
        preview(stretched(gesture.startGrid, gesture.startPic, pic, square));
        break;
      case 'corners':
      case 'length':
        if (gesture.dragMark === 'a') markA = pic;
        else if (gesture.dragMark === 'b') markB = pic;
        else if (tool === 'length') {
          markA = gesture.startPic;
          markB = pic;
        }
        break;
    }
  }

  function onpointerup(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId) || !gesture) return;
    if (pointers.size > 0) return;
    const g = gesture;
    gesture = null;
    magnifier = null;
    if (g.kind !== 'tool') return;
    if (tool === 'move' || tool === 'stretch') {
      if (tool === 'stretch' && g.moved && sameGrid(grid, g.startGrid)) {
        notify('Start the stretch on a line farther from the top-left corner.', { kind: 'info' });
      }
      const result = grid;
      grid = g.startGrid;
      commit(result);
      return;
    }
    if (!g.moved && (tool === 'corners' || tool === 'length')) {
      // A tap places marks: first, second, then starts over.
      if (g.dragMark === 'a' || g.dragMark === 'b') return;
      if (!markA || (markA && markB)) {
        markA = g.startPic;
        markB = null;
      } else markB = g.startPic;
    }
  }

  function onwheel(e: WheelEvent): void {
    e.preventDefault();
    const r = canvas!.getBoundingClientRect();
    view = zoomAt(view, e.deltaY > 0 ? 0.9 : 1.1, { x: e.clientX - r.left, y: e.clientY - r.top });
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

  // ── panel actions ────────────────────────────────────────────────────────

  function setSize(w: number, h: number): void {
    commit(withCell(grid, w, square ? w : h));
  }

  function useCorners(): void {
    if (!cornerResult?.grid) return;
    commit(cornerResult.grid);
    notify(`Grid: ${cornerResult.grid.cols} × ${cornerResult.grid.rows} squares of ${cornerResult.grid.cellW.toFixed(2)} px`, { kind: 'success' });
    markA = markB = null;
  }

  function useLength(): void {
    if (!lengthResult?.grid) return;
    commit(lengthResult.grid);
    square = true;
    notify(`Squares of ${lengthResult.grid.cellW.toFixed(2)} px — ${lengthResult.grid.cols} × ${lengthResult.grid.rows} on the table.`, { kind: 'success' });
    markA = markB = null;
  }

  function setPartial(on: boolean): void {
    partial = on;
    commit(recountGrid(grid, on));
  }

  function apply(): void {
    log.info('companion', 'Grid fitted', { cols: grid.cols, rows: grid.rows, cellW: grid.cellW, cellH: grid.cellH, x: grid.x, y: grid.y });
    onapply(grid);
  }

  function requestClose(): void {
    if (changed) askLeave = true;
    else onclose();
  }

  const toolOptions = [
    { id: 'look', label: 'Look', icon: 'view' as const },
    { id: 'move', label: 'Move', icon: 'pan' as const },
    { id: 'stretch', label: 'Stretch', icon: 'fullscreen' as const },
    { id: 'corners', label: '2 corners', icon: 'grid' as const },
    { id: 'length', label: 'Known length', icon: 'measure' as const },
  ];
</script>

<Dialog {open} title="Fit the grid" icon="grid" size="full" onclose={requestClose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="editor" {onkeydown}>
    <div class="stage" bind:this={stage}>
      <canvas
        bind:this={canvas}
        aria-label="The picture with the grid. {TOOL_HINTS[tool]}"
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        onpointercancel={onpointerup}
        {onwheel}
        oncontextmenu={(e) => e.preventDefault()}
      ></canvas>
      {#if magnifier}
        <canvas
          class="lens"
          bind:this={lens}
          style:left="{magnifier.at.x - 85}px"
          style:top="{Math.max(0, magnifier.at.y - 40 - 170)}px"
          aria-hidden="true"
        ></canvas>
      {/if}
      <div class="chrome" data-ctl="toolbar">
        <IconButton icon="undo" label="Undo" disabled={!undoable} onclick={undo} />
        <IconButton icon="redo" label="Redo" disabled={!redoable} onclick={redo} />
        <span class="gap"></span>
        <IconButton icon="minus" label="Zoom out" onclick={() => (view = zoomAt(view, 1 / 1.5, { x: cssSize().w / 2, y: cssSize().h / 2 }))} />
        <IconButton icon="add" label="Zoom in" onclick={() => (view = zoomAt(view, 1.5, { x: cssSize().w / 2, y: cssSize().h / 2 }))} />
        <IconButton icon="fit" label="Whole picture" onclick={fitWhole} />
      </div>
      <div class="readout" aria-live="polite">
        <span>{info.squares}</span><span>{info.size}</span>
      </div>
    </div>

    <aside class="panel bm-scroll">
      <Section title="Tool" description={TOOL_HINTS[tool]}>
        <Segmented label="Tool" options={toolOptions} bind:value={tool as string} layout="tile" block onchange={() => (markA = markB = null)} />
      </Section>

      {#if tool === 'corners'}
        <Section title="Two corners">
          <p class="note" class:warn={cornerResult?.warn}>{cornerResult ? cornerResult.text : markA ? 'Now tap a corner far away.' : 'Tap a grid corner on the picture.'}</p>
          <div class="row">
            <Button label="Clear marks" icon="close" variant="flat" disabled={!markA} onclick={() => (markA = markB = null)} />
            <Button label="Use these corners" icon="check" disabled={!cornerResult?.grid} onclick={useCorners} />
          </div>
        </Section>
      {:else if tool === 'length'}
        <Section title="Known length">
          <p class="note">{markA && markB ? `The line is ${linePx.toFixed(1)} px long. It is:` : 'Drag a line on the picture.'}</p>
          <div class="row">
            <NumberStepper
              label="Length"
              hideLabel
              bind:value={lengthAmount}
              min={lengthUnit === 'feet' ? 2.5 : 0.5}
              max={lengthUnit === 'feet' ? 2000 : 400}
              steps={lengthUnit === 'feet' ? [5, 10, 25, 50] : [0.5, 1, 5, 10]}
              decimals={1}
            />
          </div>
          <Segmented
            label="Unit"
            block
            bind:value={lengthUnit as string}
            options={[{ id: 'squares', label: 'Squares' }, { id: 'feet', label: 'Feet', hint: '5 per square' }]}
            onchange={(id) => (lengthAmount = id === 'feet' ? 5 : 1)}
          />
          {#if lengthResult}<p class="note" class:warn={lengthResult.warn}>{lengthResult.text}</p>{/if}
          <Button label="Use this length" icon="check" block disabled={!lengthResult?.grid} onclick={useLength} />
        </Section>
      {/if}

      <Section title="Square size">
        {#if square}
          <NumberStepper label="Side" value={grid.cellW} min={4} max={2000} steps={[0.01, 0.1, 1, 5]} decimals={2} unit="px" onchange={(v) => setSize(v, v)} />
        {:else}
          <NumberStepper label="Width" value={grid.cellW} min={4} max={2000} steps={[0.01, 0.1, 1, 5]} decimals={2} unit="px" onchange={(v) => setSize(v, grid.cellH)} />
          <NumberStepper label="Height" value={grid.cellH} min={4} max={2000} steps={[0.01, 0.1, 1, 5]} decimals={2} unit="px" onchange={(v) => commit(withCell(grid, grid.cellW, v))} />
        {/if}
        <div class="row">
          <Button label="½ size" variant="flat" onclick={() => commit(withCell(grid, grid.cellW / 2, grid.cellH / 2))} />
          <Button label="× 2 size" variant="flat" onclick={() => commit(withCell(grid, grid.cellW * 2, grid.cellH * 2))} />
        </div>
        <ToggleSwitch
          label="Square squares"
          bind:checked={square}
          onchange={(on) => on && commit(withCell(grid, (grid.cellW + grid.cellH) / 2, (grid.cellW + grid.cellH) / 2))}
        />
      </Section>

      <Section title="Position" description={positionText(grid)}>
        <div class="nudge" data-ctl="compact">
          <IconButton icon="arrow-left" label="Left 1 px" onclick={() => commit(moved(grid, -1, 0))} />
          <IconButton icon="arrow-up" label="Up 1 px" onclick={() => commit(moved(grid, 0, -1))} />
          <IconButton icon="arrow-down" label="Down 1 px" onclick={() => commit(moved(grid, 0, 1))} />
          <IconButton icon="arrow-right" label="Right 1 px" onclick={() => commit(moved(grid, 1, 0))} />
          <span class="sep"></span>
          <Button label="−0.1 x" variant="flat" size="compact" onclick={() => commit(moved(grid, -0.1, 0))} />
          <Button label="+0.1 x" variant="flat" size="compact" onclick={() => commit(moved(grid, 0.1, 0))} />
          <Button label="−0.1 y" variant="flat" size="compact" onclick={() => commit(moved(grid, 0, -0.1))} />
          <Button label="+0.1 y" variant="flat" size="compact" onclick={() => commit(moved(grid, 0, 0.1))} />
        </div>
        <Button label="Lines on the picture edge" icon="fit" variant="flat" onclick={() => commit({ ...grid, x: 0, y: 0 })} />
      </Section>

      <Section title="Squares">
        <NumberStepper label="Across the whole width" value={grid.cols} min={1} max={400} onchange={(n) => commit(acrossWidth(grid, n, square, partial))} />
        <Segmented
          label="Edge squares"
          block
          value={partial ? 'partial' : 'whole'}
          onchange={(id) => setPartial(id === 'partial')}
          options={[{ id: 'whole', label: 'Whole only' }, { id: 'partial', label: 'Include partial' }]}
        />
      </Section>

      <Section title="Check the fit" description="Jump to a corner: the lines must sit on the picture’s lines there too.">
        <div class="jumps">
          <Button label="Top left" variant="flat" size="compact" onclick={() => jump('topLeft')} />
          <Button label="Top right" variant="flat" size="compact" onclick={() => jump('topRight')} />
          <Button label="Centre" variant="flat" size="compact" onclick={() => jump('center')} />
          <Button label="Bottom left" variant="flat" size="compact" onclick={() => jump('bottomLeft')} />
          <Button label="Bottom right" variant="flat" size="compact" onclick={() => jump('bottomRight')} />
          <Button label="Whole" variant="flat" size="compact" onclick={() => jump('whole')} />
        </div>
      </Section>

      <Section title="On the table" description={info.table}>
        {#if info.skew}<p class="note warn">{info.skew}</p>{/if}
      </Section>

      <Section title="More" collapsible open={false}>
        <div class="row">
          <Button label="Line colour" icon="color" variant="flat" onclick={() => (colour = (colour + 1) % LINE_COLOURS.length)}>
            <span class="swatch" style:background={LINE_COLOURS[colour]}></span>
          </Button>
          <Button label="Bold lines" variant="flat" on={bold} onclick={() => (bold = !bold)} />
        </div>
        {#if detected}
          <Button label="Start over: detected {detected.cols} × {detected.rows}" icon="sync" variant="flat" onclick={() => commit(detected)} />
        {/if}
        <Button
          label="Start over: whole picture, {grid.cols} across"
          icon="sync"
          variant="flat"
          onclick={() => commit(wholeGrid(grid.cols, Math.max(1, Math.round((grid.pictureH * grid.cols) / grid.pictureW)), grid.pictureW, grid.pictureH))}
        />
      </Section>
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

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--g);
  }

  .row > :global(*) {
    flex: 1;
  }

  .nudge {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--g) / 2);
    align-items: center;
  }

  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--hair);
    margin: 0 calc(var(--g) / 2);
  }

  .jumps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: calc(var(--g) / 2);
  }

  .note {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--t2);
  }

  .note.warn {
    color: var(--warn);
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--hair-strong);
  }
</style>
