/**
 * The game screen's context ({@link GameContext}) as Svelte runes: the predicted state, the map
 * on the table and its walls, the chosen tab, the selected token and the companion's handle on
 * the DM camera. One instance per game screen; tab panels, footers and tools read it.
 *
 * The DM camera and the hit tests belong to the table view (`render/`, rv#8, rv#32): the view
 * fits each new map, clamps, refits on a resize and reports every change; this context only
 * passes gestures on and keeps the last reported camera as a reactive copy for the panels.
 * The walls and doors come from the view too (it loads the map's geometry file once, rv#19).
 */
import { newId, tvView, type Camera, type Command, type FileRef, type Game, type MapGeometry, type MapPlay, type Point, type RootState } from '@battlemap/shared';
import type { AppConfig } from '../../config.ts';
import { log } from '../../log.ts';
import type { Hit } from '../../render/hit.ts';
import type { Insets, TableView } from '../../render/index.ts';
import type { CompanionSession } from '../../state/sessions.svelte.ts';
import { notify } from '../../ui/notice.svelte.ts';
import { DEFAULT_TAB, type DmCameraControl, type GameContext } from './tabs.ts';

/** The URL of a file on the server. */
export function fileUrlFor(serverUrl: string, ref: FileRef): string {
  return `${serverUrl}/files/${ref.hash}.${ref.ext}`;
}

/** What the context uses of the table view (the real one, or a test's fake). */
export type MapViewPort = Pick<
  TableView,
  'update' | 'dmCamera' | 'setDmCamera' | 'fitDmCamera' | 'setDmInsets' | 'onCameraChange' | 'viewport' | 'screenToSquares'
  | 'squaresToScreen' | 'hits' | 'zoomAt' | 'geometry' | 'setSelectedToken' | 'setDmLayersShown'
>;

/** The game screen's live context. */
export class GameScreenContext implements GameContext {
  /** The page's configuration. */
  readonly config: AppConfig;
  /** The session. */
  readonly session: CompanionSession;
  /** The DM camera control. */
  readonly camera: DmCameraControl;

  /** The map's walls and doors (null for picture maps or while loading). */
  geometry = $state.raw<MapGeometry | null>(null);
  /** Phone layout. */
  phone = $state(false);
  /** The chosen tab. */
  tab = $state(DEFAULT_TAB);
  /** The token selected on the map or in the list. */
  selectedToken = $state<string | null>(null);
  /** Whether this device draws the DM layers. */
  showDmLayers = $state(true);
  /** The name of the map the view is loading, null when it shows (a spinner on the map). */
  mapLoading = $state<string | null>(null);

  /** The camera the view reported last (a copy for reactivity — the view owns the camera). */
  private seen = $state.raw<Camera | null>(null);
  private view: MapViewPort | null = null;
  private readonly listeners = new Set<(c: Camera) => void>();
  private readonly disposers: (() => void)[] = [];
  private shownMap: string | null = null;

  /**
   * @param config - the page's configuration
   * @param session - the joined table's session
   */
  constructor(config: AppConfig, session: CompanionSession) {
    this.config = config;
    this.session = session;
    this.camera = {
      get: () => this.seen,
      set: (c) => this.view?.setDmCamera(c),
      jumpTo: (at) => {
        const cam = this.view?.dmCamera();
        if (cam) this.view!.setDmCamera({ ...cam, centerX: at.x, centerY: at.y });
      },
      fit: () => this.view?.fitDmCamera(),
      showTv: () => this.showTv(),
      onChange: (fn) => {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      },
    };
  }

  /** The predicted state (only read while a game is open). */
  get state(): RootState {
    return this.session.view!;
  }

  /** The open game. */
  get game(): Game {
    return this.state.game!;
  }

  /** The map on the table. */
  get map(): MapPlay {
    const g = this.game;
    return g.maps[g.activeMapId]!;
  }

  /**
   * Sends a command.
   *
   * @param cmd - the command
   * @returns false when not sent (a notice says why)
   */
  dispatch(cmd: Command): boolean {
    return this.session.dispatch(cmd);
  }

  /** @returns a new gesture id */
  newGesture(): string {
    return newId();
  }

  /** @param id - the tab to choose */
  selectTab(id: string): void {
    if (this.tab === id) return;
    log.info('companion', 'Tab', { from: this.tab, to: id });
    this.tab = id;
  }

  /** @param ref - a file @returns its URL on the server */
  fileUrl(ref: FileRef): string {
    return fileUrlFor(this.config.serverUrl, ref);
  }

  /** @inheritdoc */
  hitsAt(at: Point): Hit[] {
    const p = this.view?.squaresToScreen(at);
    return p ? this.view!.hits(p) : [];
  }

  /** @inheritdoc */
  onDispose(fn: () => void): void {
    this.disposers.push(fn);
  }

  /**
   * The map view is running: listen to its camera, draw the state it missed.
   *
   * @param view - the table view (DM profile)
   */
  attach(view: MapViewPort): void {
    this.view = view;
    this.seen = view.dmCamera();
    this.disposers.push(view.onCameraChange((c) => this.cameraChanged(c)));
    if (this.session.view) this.draw(this.session.view);
  }

  /** The table view the screen draws into, null before it runs (the input layer's seam). */
  get mapView(): MapViewPort | null {
    return this.view;
  }

  /**
   * Draws a state on the view and picks up what follows from it: the map's walls, a token
   * selection that vanished, the loading spinner of a new map.
   *
   * @param state - the predicted state
   */
  draw(state: RootState): void {
    const view = this.view;
    if (!view) return;
    view.update(state);
    const game = state.game;
    const map = game ? game.maps[game.activeMapId] ?? null : null;
    if (!map) return;
    if (map.info.id !== this.shownMap) {
      this.shownMap = map.info.id;
      log.info('companion', 'Map on the table', { id: map.info.id, name: map.info.name });
    }
    this.geometry = view.geometry();
    if (this.selectedToken && !map.tokens.some((t) => t.id === this.selectedToken)) this.selectedToken = null;
  }

  /**
   * The phone's sheet (or any panel) covers part of the map: the view fits into the rest.
   *
   * @param insets - covered CSS px per side
   */
  setInsets(insets: Insets): void {
    this.view?.setDmInsets(insets);
  }

  /** Centres the companion on what the TV shows, zoomed so all of it fits. */
  showTv(): void {
    const view = tvView(this.state.table, this.map);
    const port = this.view;
    if (!view || !port) {
      notify("The TV hasn't reported its screen yet.", { kind: 'warning' });
      return;
    }
    const vp = port.viewport();
    const tvW = view.grid.width / view.camera.zoom;
    const tvH = view.grid.height / view.camera.zoom;
    const sideways = view.camera.quarterTurns % 2 !== 0;
    const w = sideways ? tvH : tvW;
    const h = sideways ? tvW : tvH;
    const zoom = 0.92 * Math.min(vp.width / w, vp.height / h);
    port.setDmCamera({ centerX: view.camera.centerX, centerY: view.camera.centerY, zoom, quarterTurns: 0 });
    log.info('companion', 'Jumped to the TV view');
  }

  /** Closes the screen: stops every listener, timer and following that hangs on it. */
  dispose(): void {
    for (const fn of this.disposers.splice(0)) {
      try {
        fn();
      } catch (e) {
        log.warn('companion', 'Clean-up failed', { error: String(e) });
      }
    }
    this.listeners.clear();
    this.view = null;
  }

  private cameraChanged(c: Camera): void {
    this.seen = c;
    for (const fn of this.listeners) fn(c);
  }
}
