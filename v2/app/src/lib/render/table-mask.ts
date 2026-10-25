/**
 * Screen-space layers of the TV: the table mask (in table mode with a map, everything outside
 * the window of whole one-inch squares is painted #111111 — never a cut square at the edge) and
 * the calibration pattern (drawn in any view, also without a game): the window dimmed, the
 * overscan strips red with a blue line round what the set shows, the inch grid, a gold window
 * outline, the measuring bar from its fixed pivot, and two caption lines on a dark plate.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { barInches, barRunsRight, pivotPoint, type TableGrid, type TableState } from '@battlemap/shared';

/** The TV's mask and calibration pattern. */
export class TableMask {
  /** The container (the scene's tableMask slot, screen space). */
  readonly container = new Container({ label: 'table-mask' });
  private readonly mask = new Graphics({ label: 'mask' });
  private readonly pattern = new Graphics({ label: 'calibration' });
  private readonly caption: Text;
  private readonly plate = new Graphics({ label: 'caption-plate' });
  private key = '';

  /** @param parent - the scene's tableMask slot */
  constructor(parent: Container) {
    this.caption = new Text({
      text: '',
      style: { fontFamily: 'Outfit, system-ui, sans-serif', fontSize: 22, fill: '#ffffff', align: 'center', lineHeight: 30, wordWrap: true, wordWrapWidth: 1200 },
      anchor: { x: 0.5, y: 0 },
    });
    this.container.addChild(this.mask, this.pattern, this.plate, this.caption);
    parent.addChild(this.container);
  }

  /**
   * Draws the mask and the pattern.
   *
   * @param grid - the table (null: nothing to draw)
   * @param table - the TV's state (pattern on, pivot)
   * @param masked - whether the window mask shows (table mode with a map)
   * @param offset - where the TV's viewport sits in the host (host bigger than the viewport)
   * @returns whether anything changed
   */
  set(grid: TableGrid | null, table: TableState, masked: boolean, offset: { x: number; y: number }): boolean {
    const key = grid ? `${grid.width}x${grid.height}|${grid.ppi}|${grid.overscanPercent}|${masked}|${table.pattern.on}|${table.pattern.pivot}|${offset.x},${offset.y}` : '';
    if (key === this.key) return false;
    this.key = key;
    this.mask.clear();
    this.pattern.clear();
    this.plate.clear();
    this.caption.visible = false;
    if (!grid) return true;
    this.container.position.set(offset.x, offset.y);
    const win = grid.window;
    if (masked || table.pattern.on) {
      const c = 0x111111;
      const m = this.mask;
      m.rect(-offset.x, -offset.y, grid.width + 2 * offset.x, win.y + offset.y).fill(c);
      m.rect(-offset.x, win.y + win.height, grid.width + 2 * offset.x, grid.height - win.y - win.height + offset.y).fill(c);
      m.rect(-offset.x, win.y, win.x + offset.x, win.height).fill(c);
      m.rect(win.x + win.width, win.y, grid.width - win.x - win.width + offset.x, win.height).fill(c);
    }
    if (table.pattern.on) this.drawPattern(grid, table);
    return true;
  }

  private drawPattern(grid: TableGrid, table: TableState): void {
    const g = this.pattern;
    const win = grid.window;
    const vis = grid.visible;
    const ppi = grid.ppi;
    g.rect(win.x, win.y, win.width, win.height).fill({ color: 0x000000, alpha: 0.7 });
    // overscan strips
    const red = { color: 0xb3261e, alpha: 0.85 };
    g.rect(0, 0, grid.width, vis.y).fill(red);
    g.rect(0, vis.y + vis.height, grid.width, grid.height - vis.y - vis.height).fill(red);
    g.rect(0, vis.y, vis.x, vis.height).fill(red);
    g.rect(vis.x + vis.width, vis.y, grid.width - vis.x - vis.width, vis.height).fill(red);
    g.rect(vis.x + 2, vis.y + 2, vis.width - 4, vis.height - 4).stroke({ width: 4, color: 0x4fc3f7 });
    // inch grid
    for (let i = 0; i <= grid.cols; i++) {
      const x = win.x + i * ppi;
      g.moveTo(x, win.y).lineTo(x, win.y + win.height).stroke(i % 5 === 0 ? { width: 1.5, color: 0xffffff, alpha: 0.65 } : { width: 1, color: 0xffffff, alpha: 0.35 });
    }
    for (let j = 0; j <= grid.rows; j++) {
      const y = win.y + j * ppi;
      g.moveTo(win.x, y).lineTo(win.x + win.width, y).stroke(j % 5 === 0 ? { width: 1.5, color: 0xffffff, alpha: 0.65 } : { width: 1, color: 0xffffff, alpha: 0.35 });
    }
    g.rect(win.x, win.y, win.width, win.height).stroke({ width: 3, color: 0xd4a24a });
    // the measuring bar from its pivot
    const pivot = table.pattern.pivot;
    const p = pivotPoint(grid, pivot);
    const heightIn = grid.height / ppi;
    const inches = barInches(grid.widthInches, heightIn, pivot, grid.overscanPercent);
    const dir = barRunsRight(pivot) ? 1 : -1;
    const len = inches * ppi;
    g.rect(dir > 0 ? p.x : p.x - len, p.y - 4, len, 8).fill(0xffffff);
    for (let i = 0; i <= inches; i++) {
      const x = p.x + dir * i * ppi;
      const h = (i === 0 || i === inches ? 0.9 : i % 5 === 0 ? 0.6 : 0.35) * ppi;
      g.moveTo(x, p.y - h).lineTo(x, p.y).stroke({ width: 2, color: 0xffffff });
    }
    g.circle(p.x, p.y, 0.3 * ppi).stroke({ width: 3, color: 0xd4a24a });
    g.moveTo(p.x, p.y - 0.45 * ppi).lineTo(p.x, p.y + 0.45 * ppi).stroke({ width: 2, color: 0xd4a24a });
    // captions
    const cm = (inches * 2.54).toFixed(1);
    const cut = grid.overscanPercent > 0 ? ` · ${round1(grid.overscanPercent)} % cut off each edge` : '';
    this.caption.text =
      `Ruler's zero on the gold ring — it stays put. The bar should be exactly ${inches} in (${cm} cm). Type what you measure into the tablet.\n` +
      `${grid.cols} × ${grid.rows} squares of 1 inch · picture ${round1(grid.widthInches)} × ${round1(heightIn)} in${cut} · the blue line should show on all four edges`;
    this.caption.style.wordWrapWidth = Math.max(300, win.width - 40);
    const top = pivot === 'topLeft' || pivot === 'topRight';
    const y = top ? win.y + win.height - this.caption.height - 24 : win.y + 24;
    this.caption.position.set(win.x + win.width / 2, y);
    this.caption.visible = true;
    const w = this.caption.width + 32;
    this.plate.roundRect(win.x + win.width / 2 - w / 2, y - 10, w, this.caption.height + 20, 10).fill({ color: 0x000000, alpha: 0.8 });
  }

  /** Frees everything. */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}

function round1(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}
