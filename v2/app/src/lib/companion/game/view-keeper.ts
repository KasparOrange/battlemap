/**
 * One table view (and so one WebGL context) per companion page, kept across game screens.
 *
 * Closing a game on the TV unmounts the game screen; opening it again mounts a new one. A new
 * table view each time meant a new WebGL context, its extensions and every shader compiled
 * again — on a software GL (and on weak tablets) that blocked the page's main thread for 8–11 s
 * after each reopen (the game-night fixme "the companion page hangs after game.close +
 * game.open"), and contexts that browsers free late pile up towards their limit. So the first
 * game screen creates the view in a host element of its own; when the screen goes, the host is
 * parked off-screen (same size, so nothing refits) and the next game screen adopts it — the
 * canvas moves, the context stays, an unchanged map is even still on its textures.
 *
 * The view's callbacks go through the screen that holds it now (`handlers`), so a parked view
 * never calls into a closed screen.
 */
import type { TableView, TableViewEvent } from '../../render/index.ts';

/** What the screen holding the view answers. */
export interface ViewHandlers {
  /** The view's load / failure events. */
  onEvent(e: TableViewEvent): void;
  /** The clock one-shots are aged by (the server's). */
  now(): number;
}

/** The DOM the keeper needs (the document's, or a test's fakes). */
export interface KeeperDom {
  /** A fresh host element that fills its parent. */
  makeHost(): HTMLElement;
  /** Puts a host out of sight, keeping its size. */
  park(host: HTMLElement): void;
}

/** Makes a view in a host, with the handlers it should call. */
export type ViewFactory = (host: HTMLElement, handlers: ViewHandlers) => Promise<TableView>;

interface Kept {
  host: HTMLElement;
  view: Promise<TableView>;
  holder: ViewHandlers | null;
}

/** The page's document. */
const documentDom: KeeperDom = {
  makeHost() {
    const el = document.createElement('div');
    el.className = 'bm-kept-map';
    el.style.cssText = 'position:absolute;inset:0;';
    return el;
  },
  park(host) {
    const w = host.clientWidth;
    const h = host.clientHeight;
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;visibility:hidden;pointer-events:none;`;
    document.body.appendChild(host);
  },
};

/** Keeps one view for whoever shows the map now. */
export class ViewKeeper {
  private kept: Kept | null = null;

  /** @param dom - how hosts are made and parked (default: the document) */
  constructor(private readonly dom: KeeperDom = documentDom) {}

  /**
   * Puts the kept view into `container` (making it on first use) and routes its callbacks to
   * `handlers` until {@link ViewKeeper.release}.
   *
   * @param container - where the map shows (the canvas' host goes in here)
   * @param handlers - this screen's callbacks
   * @param create - makes the view the first time (or after a failed start)
   * @returns the view, once it runs; rejects when it can't start (the next borrow tries again)
   */
  borrow(container: HTMLElement, handlers: ViewHandlers, create: ViewFactory): Promise<TableView> {
    let kept = this.kept;
    if (!kept) {
      const host = this.dom.makeHost();
      const proxy: ViewHandlers = {
        onEvent: (e) => this.kept?.holder?.onEvent(e),
        now: () => this.kept?.holder?.now() ?? Date.now(),
      };
      const made: Kept = { host, holder: null, view: null as unknown as Promise<TableView> };
      made.view = (async () => {
        const v = await create(host, proxy);
        try {
          await v.ready;
        } catch (e) {
          v.destroy();
          throw e;
        }
        return v;
      })();
      made.view.catch(() => {
        if (this.kept === made) this.kept = null;
        host.remove();
      });
      this.kept = kept = made;
    }
    kept.host.style.cssText = 'position:absolute;inset:0;';
    container.appendChild(kept.host);
    kept.holder = handlers;
    return kept.view;
  }

  /**
   * The screen goes: its callbacks stop, the view's host is parked for the next screen.
   *
   * @param handlers - the handlers given to `borrow` (a later borrower's stay)
   */
  release(handlers: ViewHandlers): void {
    const kept = this.kept;
    if (!kept || kept.holder !== handlers) return;
    kept.holder = null;
    this.dom.park(kept.host);
  }

  /** Whether a view is kept (made or being made). */
  get holding(): boolean {
    return this.kept !== null;
  }
}

/** The page's keeper. */
export const viewKeeper = new ViewKeeper();
