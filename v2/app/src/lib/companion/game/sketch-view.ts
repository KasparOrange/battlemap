/**
 * A Canvas 2D sketch of the DM's view of the table — the stand-in until the PixiJS renderer
 * publishes `createTableView` (see `table-view.ts`). It draws, in the renderer's layer order:
 * the map picture on its raster grid, the grid lines, drawings and the live stroke, tokens
 * (hidden ones faded, the selected one ringed), the fog at 70 % with the preview tinted blue /
 * rose, door markers, the ruler and the template disc as outlines, the measure line and the
 * players' window (dashed gold). Renders on demand: one frame per change, none while idle.
 */
import { maskToBytes, bitIsSet, RULER_ARM_SQUARES, rimRadius, tvView, windowSquares, type Camera, type FileRef, type MapPlay, type RootState, type Stroke } from '@battlemap/shared';
import { toScreen, type Viewport } from '../input/camera.ts';
import type { DmOverlay, TableViewHandle } from './table-view.ts';

/** Colours read from the kit's tokens once. */
interface Palette {
  ground: string;
  accent: string;
  reveal: string;
  hide: string;
  ok: string;
  ink: string;
  markInk: string;
}

function palette(el: HTMLElement): Palette {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    ground: v('--map-ground', '#15120f'),
    accent: v('--accent', '#e3b45e'),
    reveal: v('--reveal', '#6cb4e6'),
    hide: v('--hide', '#f08890'),
    ok: v('--ok', '#72cf98'),
    ink: v('--t', '#f0e8dc'),
    markInk: v('--mark-ink', '#15110c'),
  };
}

/**
 * Creates the sketch view inside a host element.
 *
 * @param host - the element to fill
 * @param fileUrl - where a file can be fetched
 * @returns the view
 */
export function createSketchView(host: HTMLElement, fileUrl: (ref: FileRef) => string): TableViewHandle {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  canvas.dataset.testid = 'table-canvas';
  host.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const colors = palette(host);

  let state: RootState | null = null;
  let camera: Camera = { centerX: 0, centerY: 0, zoom: 32, quarterTurns: 0 };
  let overlay: DmOverlay = { geometry: null, selectedToken: null };
  let vp: Viewport = { width: 1, height: 1 };
  let frame = 0;
  let picture: { key: string; img: HTMLImageElement; ready: boolean } | null = null;

  const invalidate = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  };

  const measure = () => {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    vp = { width: Math.max(1, r.width), height: Math.max(1, r.height) };
    const w = Math.round(vp.width * dpr);
    const h = Math.round(vp.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    invalidate();
  };
  const observer = new ResizeObserver(measure);
  observer.observe(host);

  function ensurePicture(map: MapPlay): HTMLImageElement | null {
    const ref = map.info.tableCopy ?? map.info.picture;
    const key = `${ref.hash}.${ref.ext}`;
    if (picture?.key !== key) {
      const img = new Image();
      img.decoding = 'async';
      const entry = { key, img, ready: false };
      img.onload = () => {
        entry.ready = true;
        invalidate();
      };
      img.src = fileUrl(ref);
      picture = entry;
    }
    return picture.ready ? picture.img : null;
  }

  function draw(): void {
    const dpr = canvas.width / vp.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const map = state?.game ? state.game.maps[state.game.activeMapId] : undefined;
    if (!state || !map) return;
    const { cols, rows } = map.info.grid;
    const z = camera.zoom;
    const o = toScreen(camera, vp, { x: 0, y: 0 });
    // world transform: squares → device px (DM camera never turns)
    g.setTransform(z * dpr, 0, 0, z * dpr, o.x * dpr, o.y * dpr);
    const px = 1 / z; // one CSS px in squares

    // 1 map
    g.fillStyle = '#2a241d';
    g.fillRect(0, 0, cols, rows);
    const img = ensurePicture(map);
    if (img) {
      const grid = map.info.grid;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, -grid.x / grid.cellW, -grid.y / grid.cellH, grid.pictureW / grid.cellW, grid.pictureH / grid.cellH);
    }

    // 3 grid
    if (map.showGrid) {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = px;
      g.beginPath();
      for (let c = 0; c <= cols; c++) {
        g.moveTo(c, 0);
        g.lineTo(c, rows);
      }
      for (let r = 0; r <= rows; r++) {
        g.moveTo(0, r);
        g.lineTo(cols, r);
      }
      g.stroke();
    }

    // 4 drawings
    for (const s of map.strokes) strokeLine(s);
    if (state.live.stroke) strokeLine(state.live.stroke);

    // 5 tokens
    for (const t of map.tokens) {
      if (!t.placed) continue;
      const cx = t.col + 0.5;
      const cy = t.row + 0.5;
      g.globalAlpha = t.hidden ? 0.45 : 1;
      g.beginPath();
      g.arc(cx, cy, 0.42, 0, Math.PI * 2);
      g.fillStyle = t.color;
      g.fill();
      g.lineWidth = 2 * px;
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.stroke();
      g.fillStyle = colors.markInk;
      g.font = `600 ${0.46}px "Space Grotesk", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t.label, cx, cy + 0.02);
      g.globalAlpha = 1;
      if (t.id === overlay.selectedToken) {
        g.beginPath();
        g.arc(cx, cy, 0.42 + 5 * px, 0, Math.PI * 2);
        g.lineWidth = 2.5 * px;
        g.strokeStyle = colors.accent;
        g.stroke();
      }
    }

    // 6 fog (DM: 70 %), preview tinted
    if (map.fog.on) {
      const n = cols * rows;
      const revealed = bytesOf(map.fog.revealed, n);
      const reveal = map.fog.staged ? bytesOf(map.fog.staged.reveal, n) : null;
      const hide = map.fog.staged ? bytesOf(map.fog.staged.hide, n) : null;
      g.fillStyle = 'rgba(8,7,6,0.7)';
      for (let r = 0; r < rows; r++) {
        let run = -1;
        for (let c = 0; c <= cols; c++) {
          const fogged = c < cols && !bitIsSet(revealed, r * cols + c);
          if (fogged && run < 0) run = c;
          if (!fogged && run >= 0) {
            g.fillRect(run, r, c - run, 1);
            run = -1;
          }
        }
      }
      if (reveal && hide) {
        for (let i = 0; i < n; i++) {
          const a = bitIsSet(reveal, i);
          const b = bitIsSet(hide, i);
          if (!a && !b) continue;
          g.fillStyle = a ? colors.reveal : colors.hide;
          g.globalAlpha = 0.38;
          g.fillRect(i % cols, Math.floor(i / cols), 1, 1);
        }
        g.globalAlpha = 1;
      }
    }

    // 7 door markers
    if (overlay.geometry) {
      overlay.geometry.doors.forEach((d, i) => {
        const open = map.doorsOpen.includes(i);
        g.beginPath();
        g.moveTo(d.a.x, d.a.y);
        g.lineTo(d.b.x, d.b.y);
        g.lineCap = 'round';
        g.lineWidth = 0.22;
        g.strokeStyle = open ? colors.ok : colors.accent;
        g.globalAlpha = 0.9;
        g.stroke();
        g.globalAlpha = 1;
      });
    }

    // 10 tools
    if (map.ruler.visible) {
      const a = (map.ruler.rotation * Math.PI) / 180;
      g.beginPath();
      g.moveTo(map.ruler.x + RULER_ARM_SQUARES * Math.cos(a), map.ruler.y + RULER_ARM_SQUARES * Math.sin(a));
      g.lineTo(map.ruler.x, map.ruler.y);
      g.lineTo(map.ruler.x + RULER_ARM_SQUARES * Math.sin(a), map.ruler.y - RULER_ARM_SQUARES * Math.cos(a));
      g.lineWidth = 0.5;
      g.strokeStyle = 'rgba(240,232,220,0.55)';
      g.stroke();
    }
    if (map.disc.visible) {
      g.beginPath();
      g.arc(map.disc.x, map.disc.y, rimRadius(map.disc), 0, Math.PI * 2);
      g.fillStyle = 'rgba(227,180,94,0.12)';
      g.fill();
      g.lineWidth = 2 * px;
      g.strokeStyle = colors.accent;
      g.stroke();
    }
    if (state.live.measure) {
      const { a, b } = state.live.measure;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineWidth = 3 * px;
      g.strokeStyle = colors.accent;
      g.stroke();
    }

    // 11 the players' window
    const tv = tvView(state.table, map);
    if (tv?.layout) {
      const w = windowSquares(tv.layout);
      g.setLineDash([14 * px, 8 * px]);
      g.lineWidth = 2.5 * px;
      g.strokeStyle = colors.accent;
      g.strokeRect(w.x, w.y, w.width, w.height);
      g.setLineDash([]);
    }
  }

  /** Masks decoded once per (immutable) mask string. */
  const decoded = new Map<string, Uint8Array>();
  function bytesOf(mask: string, n: number): Uint8Array {
    let b = decoded.get(mask);
    if (!b) {
      if (decoded.size > 8) decoded.clear();
      b = maskToBytes(mask, n);
      decoded.set(mask, b);
    }
    return b;
  }

  function strokeLine(s: Stroke): void {
    const p = s.points;
    g.beginPath();
    g.moveTo(p[0]!, p[1]!);
    if (p.length === 2) g.lineTo(p[0]! + 0.001, p[1]!);
    for (let i = 2; i + 1 < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = s.width;
    g.strokeStyle = s.color;
    g.stroke();
  }

  measure();

  return {
    update(next) {
      if (next === state) return;
      state = next;
      invalidate();
    },
    setDmCamera(c) {
      if (c === camera) return;
      camera = c;
      invalidate();
    },
    setOverlay(next) {
      if (next.geometry === overlay.geometry && next.selectedToken === overlay.selectedToken) return;
      overlay = next;
      invalidate();
    },
    resize: measure,
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.remove();
      picture = null;
    },
  };
}
