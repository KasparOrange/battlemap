/**
 * The TV's games: the answers to the requests that need storage (open, start, close, delete,
 * rename, list), the autosave, the server backup and the start-up restore. Plain TypeScript
 * around the authoritative `SyncHost`, with storage, server and timers passed in (`ports.ts`),
 * so `bun test` runs it against fakes.
 *
 * - **Autosave:** 2 s after the last change to the game (live state doesn't count — the reducer
 *   keeps `game` the same object when only `live` changed), and at once (a *flush*) before
 *   another game opens, on close, before a deploy or reload, and when the page hides.
 * - **Backup:** after every local save the game goes to the server (latest wins). A failed
 *   upload is retried 30 s later, after the next save, and whenever `retryBackups()` is called
 *   (the TV calls it when its connection comes back).
 * - **Start:** the TV's calibration and the game it had open come back (`boot()`); a game that
 *   isn't on the device any more is fetched from the server's backup.
 * - **One thing at a time:** requests run one after another, so a second "open" waits for the
 *   first instead of racing it.
 *
 * @see ../../../../docs/architecture.md "persistence", "sync" (requests)
 * @see ./requests.ts for the routing of peer requests to these methods
 */
import {
  check, emptyLive, Game as GameSchema, newGame, newId, tableGrid,
  type Command, type Game, type GameSummary, type LibraryEntry, type MapInfo, type NewGameInput, type RootState,
} from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { TvPorts } from './ports.ts';

/** Settings key: the id of the game that was open (null after a close). */
export const KEY_LAST_GAME = 'tv.lastGame';
/** Settings key: the TV's calibration `{ widthInches, overscanPercent }`. */
export const KEY_TABLE = 'tv.table';

/** Default wait after the last change before the game is saved, ms. */
export const SAVE_DELAY_MS = 2000;
/** Wait before a failed backup is tried again, ms. */
export const BACKUP_RETRY_MS = 30_000;
/** How long the server's backup list may take before the listing goes out without it, ms. */
export const BACKUP_LIST_TIMEOUT_MS = 5000;

/** What `TvGames` needs from the sync host (`SyncHost` has all of it). */
export interface HostLike {
  /** The current state. */
  readonly state: RootState;
  /** The host's epoch. */
  readonly epoch: string;
  /** The host's revision. */
  readonly rev: number;
  /** Replaces the state under a new epoch and sends the snapshot to everyone. */
  replace(state: RootState, reason: string): void;
  /** Applies a command the TV makes itself. */
  applyLocal(cmd: Command): boolean;
  /** Sends the snapshot to one companion or all. */
  sendSnapshot(to?: string): void;
}

/** Sends a message to the room (false = not delivered). */
export type SendFn = (msg: { type: string } & Record<string, unknown>) => boolean;

/** Timer functions (tests pass fake ones). */
export interface Timers {
  /** Like `setTimeout`. */
  set(fn: () => void, ms: number): unknown;
  /** Like `clearTimeout`. */
  clear(handle: unknown): void;
}

/** Options of {@link TvGames}. */
export interface TvGamesOptions {
  /** The app build (for `diag.report`). */
  build: string;
  /** Wait after the last change before saving, ms (default `SAVE_DELAY_MS`). */
  saveDelayMs?: number;
  /** The clock (default `Date.now`). */
  now?: () => number;
  /** Timers (default the global ones). */
  timers?: Timers;
}

/** What the TV is busy with, shown on the TV and sent as `tv.status`. */
export interface BusyStatus {
  /** In words ("Opening “The tower”…"), or null when idle. */
  busy: string | null;
  /** 0–1, or null when unknown. */
  progress: number | null;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** The text of an error for logs and notices. */
function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A promise that rejects after `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, timers: Timers): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const h = timers.set(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then((v) => { timers.clear(h); resolve(v); }, (e: unknown) => { timers.clear(h); reject(e); });
  });
}

/**
 * The summary a library row shows for a game.
 *
 * @param game - the game
 * @param savedAt - when it was last saved (ISO)
 * @param where - where it is stored
 * @returns the summary (no thumbnail)
 */
export function summarize(game: Game, savedAt: string, where: GameSummary['where']): GameSummary {
  return {
    id: game.id, name: game.name, createdAt: game.createdAt, savedAt,
    mapNames: game.mapOrder.map((id) => game.maps[id]?.info.name ?? '?'),
    activeMapName: game.maps[game.activeMapId]?.info.name ?? '?',
    thumb: null, where,
  };
}

/**
 * Merges the device's games with the server's backups: one row per game, `both` when it is in
 * both places (the device's copy and the server's thumbnail), newest save first.
 *
 * @param local - summaries of the games on the device
 * @param remote - the server's backups, or null when the server couldn't be asked
 * @returns the merged list
 */
export function mergeListings(local: GameSummary[], remote: GameSummary[] | null): GameSummary[] {
  const byId = new Map<string, GameSummary>();
  for (const g of local) byId.set(g.id, g);
  for (const r of remote ?? []) {
    const l = byId.get(r.id);
    if (l) byId.set(r.id, { ...l, where: 'both', thumb: l.thumb ?? r.thumb });
    else byId.set(r.id, { ...r, where: 'server' });
  }
  return [...byId.values()].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}

/**
 * Puts the open game's live names into its row (qa#9): the stored copy lags up to one autosave
 * behind, so right after a map switch it still names the previous map. A game not stored yet is
 * added on top.
 *
 * @param rows - the merged listing
 * @param open - the game on the table, or null
 * @param nowIso - its `savedAt` when it isn't stored yet
 * @returns the listing with the open game current
 */
export function withOpenGame(rows: GameSummary[], open: Game | null, nowIso: string): GameSummary[] {
  if (!open) return rows;
  const i = rows.findIndex((r) => r.id === open.id);
  if (i < 0) return [summarize(open, nowIso, 'tv'), ...rows];
  const live = summarize(open, rows[i]!.savedAt, rows[i]!.where);
  const out = rows.slice();
  out[i] = { ...live, thumb: rows[i]!.thumb };
  return out;
}

/**
 * The name of a game the TV starts by itself from a shared map (the remote's fallback).
 *
 * @param map - the map
 * @param now - the time
 * @returns e.g. "Tower floor 2 · Sun 25 Oct"
 */
export function gameNameFor(map: MapInfo, now: Date): string {
  const day = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${map.name} · ${day}`.slice(0, 120);
}

/** The TV's games: requests, autosave, backup and restore. */
export class TvGames {
  /** What the TV is busy with right now. */
  status: BusyStatus = { busy: null, progress: null };
  /** Called whenever `status` changes. */
  onStatus: ((status: BusyStatus) => void) | null = null;
  /** Called with an error the TV should show (the problem badge, 8 s). */
  onProblem: ((text: string) => void) | null = null;
  /** Called after the TV closed its game by itself or opened one (for the screens). */
  onGameChanged: ((game: Game | null) => void) | null = null;

  /** The game object last saved or loaded — `state.game !== savedGame` means unsaved changes. */
  private savedGame: Game | null = null;
  /** The calibration last read or stored; `null` until `boot()` has read it (qa#3). */
  private savedTable: { widthInches: number; overscanPercent: number } | null = null;
  private saveTimer: unknown = null;
  private saving: Promise<void> = Promise.resolve();
  private work: Promise<void> = Promise.resolve();
  private readonly pendingBackups = new Map<string, Game>();
  private backingUp = false;
  private backupAgain = false;
  private backupTimer: unknown = null;
  private readonly startedAt: number;
  private readonly saveDelayMs: number;
  private readonly now: () => number;
  private readonly timers: Timers;

  /**
   * @param ports - storage, server and reload
   * @param host - the sync host (the authority)
   * @param send - sends to the room
   * @param log - the logger (area `tv`)
   * @param options - build, timings, clock and timers
   */
  constructor(
    private readonly ports: TvPorts,
    private readonly host: HostLike,
    private readonly send: SendFn,
    private readonly log: Logger,
    private readonly options: TvGamesOptions,
  ) {
    this.saveDelayMs = options.saveDelayMs ?? SAVE_DELAY_MS;
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? realTimers;
    this.startedAt = this.now();
  }

  // ── start ────────────────────────────────────────────────────────────────────────────────

  /**
   * Restores the TV after a start: its calibration and the game it had open. Never throws —
   * a broken store means a fresh table, logged.
   */
  async boot(): Promise<void> {
    const t0 = this.now();
    const start = this.host.state.table;
    let calibration = { widthInches: start.widthInches, overscanPercent: start.overscanPercent };
    try {
      const saved = await this.ports.settings.get<{ widthInches?: unknown; overscanPercent?: unknown }>(KEY_TABLE);
      if (saved && typeof saved.widthInches === 'number' && typeof saved.overscanPercent === 'number') {
        calibration = {
          widthInches: Math.min(90, Math.max(10, saved.widthInches)),
          overscanPercent: Math.min(12, Math.max(0, saved.overscanPercent)),
        };
      }
    } catch (e) {
      this.log.error('tv', 'Calibration could not be read', { error: errorText(e) });
    }

    let game: Game | null = null;
    let lastId: string | null = null;
    try {
      lastId = await this.ports.settings.get<string>(KEY_LAST_GAME);
      if (lastId) game = await this.load(lastId);
    } catch (e) {
      this.log.error('tv', 'Last game could not be reopened', { gameId: lastId, error: errorText(e) });
      this.problem('The last game could not be reopened.');
    }
    this.setStatus(null, null);
    this.savedGame = game;
    // The viewport may have changed while we waited (rv#24): take the current one.
    const table = { ...this.host.state.table, ...calibration };
    this.savedTable = calibration;
    this.host.replace({ ...this.host.state, table, game, live: emptyLive(), history: { undo: [], redo: [] } }, game ? 'reopened at start' : 'start');
    this.log.info('tv', 'Booted', {
      ms: this.now() - t0, gameId: game?.id ?? null, lastId, widthInches: table.widthInches, overscanPercent: table.overscanPercent,
    });
  }

  // ── autosave ─────────────────────────────────────────────────────────────────────────────

  /** Whether the open game has changes that aren't saved yet. */
  get dirty(): boolean {
    const g = this.host.state.game;
    return g !== null && g !== this.savedGame;
  }

  /**
   * Tells the autosave the state changed (the host's `onChange`): the save timer restarts when
   * the game changed, and a changed calibration is stored at once.
   *
   * @param state - the new state
   */
  changed(state: RootState): void {
    const t = state.table;
    // Before boot() read the stored calibration, the state holds the default: never store that.
    if (this.savedTable && (t.widthInches !== this.savedTable.widthInches || t.overscanPercent !== this.savedTable.overscanPercent)) {
      this.savedTable = { widthInches: t.widthInches, overscanPercent: t.overscanPercent };
      this.ports.settings.put(KEY_TABLE, { ...this.savedTable })
        .then(() => this.log.info('tv', 'Calibration saved', { ...this.savedTable }))
        .catch((e: unknown) => {
          this.log.error('tv', 'Calibration could not be saved', { error: errorText(e) });
          this.problem('The calibration could not be saved.');
        });
    }
    if (this.dirty) {
      if (this.saveTimer !== null) this.timers.clear(this.saveTimer);
      this.saveTimer = this.timers.set(() => {
        this.saveTimer = null;
        void this.saveIfDirty('autosave');
      }, this.saveDelayMs);
    }
  }

  /**
   * Saves the open game now if it has unsaved changes (before another game opens, a close, a
   * deploy, the page hiding).
   *
   * @param reason - for the log
   */
  async flush(reason: string): Promise<void> {
    if (this.saveTimer !== null) {
      this.timers.clear(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveIfDirty(reason);
  }

  /** Saves the open game when it changed; saves never overlap. */
  private saveIfDirty(reason: string): Promise<void> {
    this.saving = this.saving.then(async () => {
      const game = this.host.state.game;
      if (!game || game === this.savedGame) return;
      await this.store(game, reason);
    });
    return this.saving;
  }

  /** Writes one game to the device, then queues its backup. */
  private async store(game: Game, reason: string): Promise<void> {
    const t0 = this.now();
    try {
      await this.ports.games.put(game);
    } catch (e) {
      this.log.error('tv', 'Game could not be saved', { gameId: game.id, reason, error: errorText(e) });
      this.problem('The game could not be saved on the TV.');
      this.send({ type: 'tv.notice', level: 'error', text: 'The TV could not save the game — its storage may be full.' });
      return;
    }
    this.savedGame = game;
    this.log.info('tv', 'Game saved', { gameId: game.id, reason, ms: this.now() - t0 });
    this.backup(game);
  }

  // ── backup ───────────────────────────────────────────────────────────────────────────────

  /** Queues a game for the server backup (the newest version per game wins). */
  private backup(game: Game): void {
    this.pendingBackups.set(game.id, game);
    void this.pushBackups();
  }

  /** Uploads queued backups, then tries again later if something failed. */
  async retryBackups(): Promise<void> {
    await this.pushBackups();
  }

  /** How many games wait for their backup. */
  get backupsPending(): number {
    return this.pendingBackups.size;
  }

  private async pushBackups(): Promise<void> {
    if (this.backingUp) {
      this.backupAgain = true;
      return;
    }
    this.backingUp = true;
    try {
      do {
        this.backupAgain = false;
        for (const [id, game] of [...this.pendingBackups]) {
          const t0 = this.now();
          try {
            await this.ports.backups.put(game);
            if (this.pendingBackups.get(id) === game) this.pendingBackups.delete(id);
            this.log.info('tv', 'Game backed up', { gameId: id, ms: this.now() - t0 });
          } catch (e) {
            this.log.warn('tv', 'Backup failed, will retry', { gameId: id, error: errorText(e), retryS: BACKUP_RETRY_MS / 1000 });
            this.scheduleBackupRetry();
            return;
          }
        }
      } while (this.backupAgain);
    } finally {
      this.backingUp = false;
    }
  }

  private scheduleBackupRetry(): void {
    if (this.backupTimer !== null) return;
    this.backupTimer = this.timers.set(() => {
      this.backupTimer = null;
      void this.pushBackups();
    }, BACKUP_RETRY_MS);
  }

  // ── requests ─────────────────────────────────────────────────────────────────────────────

  /**
   * Runs a job after the ones before it; an error is logged, shown on the TV and sent to the
   * companion that asked.
   *
   * @param what - for the log ("game.open")
   * @param from - the companion that asked, or null for the TV itself
   * @param job - the work
   */
  run(what: string, from: string | null, job: () => Promise<void>): Promise<void> {
    this.work = this.work.then(job).catch((e: unknown) => {
      this.log.error('tv', 'Request failed', { what, from, error: errorText(e) });
      this.setStatus(null, null);
      this.problem(`${what} failed: ${errorText(e)}`);
      this.send({ type: 'tv.notice', ...(from ? { to: from } : {}), level: 'error', text: `The TV couldn't do that: ${errorText(e)}` });
    });
    return this.work;
  }

  /**
   * The games for a library: the device's and the server's backups.
   *
   * @returns the merged list, newest first
   */
  async listGames(): Promise<GameSummary[]> {
    const t0 = this.now();
    let local: GameSummary[] = [];
    try {
      local = await this.ports.games.list();
    } catch (e) {
      this.log.error('tv', 'Stored games could not be listed', { error: errorText(e) });
    }
    let remote: GameSummary[] | null = null;
    try {
      remote = await withTimeout(this.ports.backups.list(), BACKUP_LIST_TIMEOUT_MS, this.timers);
    } catch (e) {
      this.log.warn('tv', 'Server backups could not be listed', { error: errorText(e) });
    }
    const games = withOpenGame(mergeListings(local, remote), this.host.state.game, new Date(this.now()).toISOString());
    this.log.info('tv', 'Games listed', { local: local.length, remote: remote?.length ?? null, ms: this.now() - t0 });
    return games;
  }

  /**
   * Sends the game list to one companion (or all).
   *
   * @param to - the companion, or null for everyone
   */
  async sendListing(to: string | null): Promise<void> {
    const games = await this.listGames();
    this.send({ type: 'lib.listing', ...(to ? { to } : {}), games });
  }

  /**
   * Opens a stored game — from the device, else from the server's backup (then stored here).
   *
   * @param gameId - the game
   * @param from - who asked (null: the TV's remote)
   */
  async open(gameId: string, from: string | null): Promise<void> {
    const open = this.host.state.game;
    if (open?.id === gameId) {
      this.log.info('tv', 'Game already open', { gameId });
      this.host.sendSnapshot(from ?? undefined);
      return;
    }
    await this.flush('open another game');
    const game = await this.load(gameId);
    this.setStatus(null, null);
    if (!game) {
      this.log.warn('tv', 'Game not found', { gameId });
      this.problem('That game is neither on the TV nor on the server.');
      this.send({ type: 'tv.notice', ...(from ? { to: from } : {}), level: 'error', text: 'That game is neither on the TV nor on the server.' });
      return;
    }
    this.show(game, `opened ${gameId}`);
    await this.rememberLast(game.id);
  }

  /**
   * Starts a new game (saved at once, so it survives a reload right away).
   *
   * @param input - what `game.new` carries
   */
  async start(input: NewGameInput): Promise<void> {
    await this.flush('start a new game');
    const game = newGame(input);
    this.show(game, `new game ${game.id}`);
    this.savedGame = null; // not on the device yet
    await this.saveIfDirty('new game');
    await this.rememberLast(game.id);
  }

  /**
   * Starts a new game on a shared map — the remote's way in (the TV's library).
   *
   * @param entry - the shared map
   */
  async startFromMap(entry: LibraryEntry): Promise<void> {
    const now = new Date(this.now());
    await this.start({ id: newId(), name: gameNameFor(entry.map, now), createdAt: now.toISOString(), map: entry.map });
  }

  /** Saves and closes the open game; the TV shows its home again. */
  async close(): Promise<void> {
    const game = this.host.state.game;
    if (!game) return;
    await this.flush('close');
    this.show(null, `closed ${game.id}`);
    await this.rememberLast(null);
  }

  /**
   * Deletes a game on the device and its server backup; an open game is closed first.
   *
   * @param gameId - the game
   */
  async remove(gameId: string): Promise<void> {
    if (this.host.state.game?.id === gameId) await this.close();
    this.pendingBackups.delete(gameId);
    await this.ports.games.delete(gameId);
    this.log.info('tv', 'Game deleted', { gameId });
    if (this.ports.backups.delete) {
      try {
        await this.ports.backups.delete(gameId);
        this.log.info('tv', 'Backup deleted', { gameId });
      } catch (e) {
        this.log.warn('tv', 'Backup could not be deleted', { gameId, error: errorText(e) });
      }
    } else {
      this.log.warn('tv', 'Backup kept: the server API has no delete', { gameId });
    }
    if ((await this.ports.settings.get<string>(KEY_LAST_GAME).catch(() => null)) === gameId) await this.rememberLast(null);
  }

  /**
   * Renames a stored game. The open game is renamed through the reducer (`game.rename`), so the
   * companions see it at once; another one is changed in storage and backed up.
   *
   * @param gameId - the game
   * @param name - its new name
   */
  async rename(gameId: string, name: string): Promise<void> {
    if (this.host.state.game?.id === gameId) {
      this.host.applyLocal({ type: 'game.rename', name });
      return;
    }
    let game = await this.ports.games.get(gameId);
    if (!game) game = await this.ports.backups.get(gameId);
    if (!game) throw new Error('that game is not stored');
    await this.store({ ...game, name }, 'rename');
  }

  /** Saves now and answers `deploy.ready` (to `to`, or everyone). */
  async prepareDeploy(to: string | null): Promise<void> {
    await this.flush('deploy');
    this.send({ type: 'deploy.ready', ...(to ? { to } : {}), gameId: this.host.state.game?.id ?? null });
  }

  /** Saves, says so, and reloads the app (it reopens its game on start). */
  async reloadApp(): Promise<void> {
    await this.flush('reload');
    this.setStatus('Updating battlemap — back in a few seconds', null);
    this.log.info('tv', 'Reloading', { gameId: this.host.state.game?.id ?? null });
    this.timers.set(() => this.ports.reload(), 300);
  }

  /**
   * The answer to `diag.status`.
   *
   * @param to - the companion that asked
   */
  diagnose(to: string): void {
    const s = this.host.state;
    const v = s.table.viewport;
    const grid = v ? tableGrid(v, s.table.widthInches, s.table.overscanPercent) : null;
    const memory = (globalThis.performance as unknown as { memory?: { usedJSHeapSize: number } } | undefined)?.memory;
    this.send({
      type: 'diag.report', to, build: this.options.build, epoch: this.host.epoch, rev: this.host.rev,
      gameId: s.game?.id ?? null, activeMapId: s.game?.activeMapId ?? null, table: grid ? `${grid.cols}x${grid.rows}` : null,
      uptimeS: Math.round((this.now() - this.startedAt) / 1000), heapMb: memory ? Math.round(memory.usedJSHeapSize / 1e6) : null,
    });
  }

  /**
   * Shows what the TV is busy with outside a request (the renderer loading a map), here and on
   * the tablets (`tv.status`).
   *
   * @param busy - in words, or null when done
   * @param progress - 0–1, or null when unknown
   */
  showBusy(busy: string | null, progress: number | null = null): void {
    this.setStatus(busy, progress);
  }

  /**
   * An error the TV and the DM should see (the problem badge, a `tv.notice` to every tablet).
   *
   * @param text - what went wrong, in words
   */
  report(text: string): void {
    this.problem(text);
    this.send({ type: 'tv.notice', level: 'error', text });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────

  /**
   * A game by id: the device's copy, else the server's backup (checked, stored here, its map
   * files fetched with progress). Null when neither has it.
   */
  private async load(gameId: string): Promise<Game | null> {
    const t0 = this.now();
    this.setStatus('Opening the game…', null);
    let game: Game | null = null;
    try {
      game = await this.ports.games.get(gameId);
    } catch (e) {
      this.log.error('tv', 'Stored game could not be read', { gameId, error: errorText(e) });
    }
    if (game) {
      this.log.info('tv', 'Game loaded', { gameId, from: 'tv', ms: this.now() - t0 });
      return game;
    }
    this.setStatus('Fetching the game from the server…', null);
    const raw = await this.ports.backups.get(gameId);
    if (!raw) return null;
    const checked = check(GameSchema, raw);
    if (!checked.ok) {
      this.log.error('tv', 'Backup is not a valid game', { gameId, error: checked.error });
      throw new Error('the server’s copy of that game is damaged');
    }
    game = checked.value;
    await this.fetchFiles(game);
    await this.ports.games.put(game);
    this.log.info('tv', 'Game restored from the server', { gameId, ms: this.now() - t0 });
    return game;
  }

  /** Fetches the files of a game's maps (the active one first) into the device's cache. */
  private async fetchFiles(game: Game): Promise<void> {
    const order = [game.activeMapId, ...game.mapOrder.filter((id) => id !== game.activeMapId)];
    const refs = order.flatMap((id) => {
      const info = game.maps[id]?.info;
      if (!info) return [];
      return [info.tableCopy ?? info.picture, ...(info.geometry ? [info.geometry] : [])];
    });
    const total = refs.reduce((n, r) => n + r.bytes, 0) || 1;
    let done = 0;
    const label = `Loading “${game.name}”…`;
    for (const ref of refs) {
      this.setStatus(label, done / total);
      try {
        await this.ports.files.get(ref, (f) => this.setStatus(label, Math.min(1, (done + f * ref.bytes) / total)));
      } catch (e) {
        this.log.warn('tv', 'Map file could not be fetched', { gameId: game.id, hash: ref.hash, error: errorText(e) });
      }
      done += ref.bytes;
    }
  }

  /** Puts a game (or none) on the table under a new epoch. */
  private show(game: Game | null, reason: string): void {
    this.savedGame = game;
    this.host.replace({ ...this.host.state, game, live: emptyLive(), history: { undo: [], redo: [] } }, reason);
    this.onGameChanged?.(game);
  }

  private async rememberLast(gameId: string | null): Promise<void> {
    try {
      await this.ports.settings.put(KEY_LAST_GAME, gameId);
    } catch (e) {
      this.log.warn('tv', 'Last game could not be remembered', { gameId, error: errorText(e) });
    }
  }

  private setStatus(busy: string | null, progress: number | null): void {
    if (busy === this.status.busy && progress === this.status.progress) return;
    const shownProgress = progress === null ? null : Math.round(progress * 100) / 100;
    if (busy === this.status.busy && shownProgress === this.status.progress) return;
    this.status = { busy, progress: shownProgress };
    this.onStatus?.(this.status);
    this.send({ type: 'tv.status', busy, progress: shownProgress });
  }

  private problem(text: string): void {
    this.onProblem?.(text);
  }
}
