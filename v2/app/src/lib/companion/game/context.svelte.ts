/**
 * The game screen's context ({@link GameContext}) as Svelte runes: the predicted state, the map
 * on the table and its walls, the chosen tab, the selected token and the DM's own camera. One
 * instance per game screen; tab panels, footers and tools read it.
 */
import { check, MapGeometry, newId, tvView, type Camera, type Command, type FileRef, type Game, type MapPlay, type Point, type RootState } from '@battlemap/shared';
import type { AppConfig } from '../../config.ts';
import { log } from '../../log.ts';
import type { CompanionSession } from '../../state/sessions.svelte.ts';
import { notify } from '../../ui/notice.svelte.ts';
import { clampCamera, fitCamera, sameCamera, type Viewport } from '../input/camera.ts';
import { DEFAULT_TAB, type DmCameraControl, type GameContext } from './tabs.ts';

/** The URL of a file on the server. */
export function fileUrlFor(serverUrl: string, ref: FileRef): string {
  return `${serverUrl}/files/${ref.hash}.${ref.ext}`;
}

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
  /** The DM camera as drawn now. */
  cam = $state.raw<Camera>({ centerX: 0, centerY: 0, zoom: 32, quarterTurns: 0 });
  /** The map view's size in CSS px. */
  viewport = $state.raw<Viewport>({ width: 1, height: 1 });

  /** Px at the view's bottom covered by the phone's sheet: fitting keeps the map above it. */
  private fitBottom = 0;
  /** The camera the last fit produced (a refit only replaces it while the DM hasn't moved). */
  private fittedCam: Camera | null = null;
  private geometryRef: string | null = null;
  private fittedMap: string | null = null;

  /**
   * @param config - the page's configuration
   * @param session - the joined table's session
   */
  constructor(config: AppConfig, session: CompanionSession) {
    this.config = config;
    this.session = session;
    this.camera = {
      get: () => this.cam,
      set: (c) => this.setCamera(c),
      jumpTo: (at) => this.setCamera({ ...this.cam, centerX: at.x, centerY: at.y }),
      fit: () => this.fit(),
      showTv: () => this.showTv(),
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

  /**
   * The view was measured: keep the camera clamped, fit a map seen for the first time.
   *
   * @param vp - the view's size in CSS px
   */
  setViewport(vp: Viewport): void {
    if (vp.width === this.viewport.width && vp.height === this.viewport.height) return;
    this.viewport = vp;
    if (!this.session.view?.game) return;
    if (this.fittedMap !== this.map.info.id) this.fit();
    else this.setCamera(this.cam);
  }

  /** Called when the state changed: fits a new map, loads its walls, drops a vanished selection. */
  follow(): void {
    if (!this.session.view?.game) return;
    const map = this.map;
    if (this.fittedMap !== map.info.id && this.viewport.width > 1) this.fit();
    if (this.selectedToken && !map.tokens.some((t) => t.id === this.selectedToken)) this.selectedToken = null;
    const ref = map.info.geometry;
    const key = ref ? `${ref.hash}.${ref.ext}` : null;
    if (key !== this.geometryRef) {
      this.geometryRef = key;
      this.geometry = null;
      if (ref) void this.loadGeometry(ref, key!);
    }
  }

  /** Fits the whole map on the companion's screen. */
  fit(): void {
    if (!this.session.view?.game) return;
    const { cols, rows } = this.map.info.grid;
    this.fittedMap = this.map.info.id;
    const free = { width: this.viewport.width, height: Math.max(80, this.viewport.height - this.fitBottom) };
    const cam = fitCamera(cols, rows, free);
    // centre the map in the free part: shift the centre down by half the covered strip
    this.setCamera({ ...cam, centerY: cam.centerY + (this.viewport.height - free.height) / 2 / cam.zoom });
    this.fittedCam = this.cam;
  }

  /**
   * The phone's sheet covers this many px of the view's bottom; a map still as fitted is refitted
   * into the part above it.
   *
   * @param px - covered px (0 when the sheet is closed)
   */
  setFitBottom(px: number): void {
    const v = Math.max(0, Math.round(px));
    if (v === this.fitBottom) return;
    this.fitBottom = v;
    if (this.fittedCam && this.fittedCam === this.cam) this.fit();
  }

  /** Centres the companion on what the TV shows, zoomed so all of it fits. */
  showTv(): void {
    const view = tvView(this.state.table, this.map);
    if (!view) {
      notify("The TV hasn't reported its screen yet.", { kind: 'warning' });
      return;
    }
    const tvW = view.grid.width / view.camera.zoom;
    const tvH = view.grid.height / view.camera.zoom;
    const sideways = view.camera.quarterTurns % 2 !== 0;
    const w = sideways ? tvH : tvW;
    const h = sideways ? tvW : tvH;
    const zoom = 0.92 * Math.min(this.viewport.width / w, this.viewport.height / h);
    this.setCamera({ centerX: view.camera.centerX, centerY: view.camera.centerY, zoom, quarterTurns: 0 });
  }

  /**
   * Sets the camera, clamped to the map.
   *
   * @param c - the camera asked for
   */
  setCamera(c: Camera): void {
    if (!this.session.view?.game) return;
    const { cols, rows } = this.map.info.grid;
    const next = clampCamera(c, cols, rows, this.viewport);
    if (!sameCamera(next, this.cam)) this.cam = next;
  }

  /**
   * A point in squares on the map's centre (for "jump to").
   *
   * @param col - column
   * @param row - row
   * @returns the square's centre
   */
  squareCentre(col: number, row: number): Point {
    return { x: col + 0.5, y: row + 0.5 };
  }

  private async loadGeometry(ref: FileRef, key: string): Promise<void> {
    const url = this.fileUrl(ref);
    const t0 = performance.now();
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const parsed = check(MapGeometry, await r.json());
      if (!parsed.ok) throw new Error(parsed.error);
      if (this.geometryRef !== key) return; // another map came meanwhile
      this.geometry = parsed.value;
      log.info('companion', 'Walls and doors loaded', { walls: parsed.value.walls.length, doors: parsed.value.doors.length, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      log.warn('companion', 'Walls and doors not loaded', { url, error: String(e) });
      if (this.geometryRef === key) notify("Couldn't load this map's walls and doors — Room and Circle ignore walls for now.", { kind: 'error' });
    }
  }
}
