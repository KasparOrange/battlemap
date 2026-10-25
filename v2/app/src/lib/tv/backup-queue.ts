/**
 * The TV's server backup queue: after every local save the game goes to the server (the newest
 * version per game wins). Uploads run one at a time; a failed one is retried after
 * `BACKUP_RETRY_MS`, after the next save, and whenever `retry()` is called (the TV calls it when
 * its connection comes back). A game the DM deleted is never backed up again, and its delete
 * waits for an upload already on its way (rv#6).
 *
 * @see ./games.ts which feeds it after each save
 */
import type { Game } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { TvPorts } from './ports.ts';
import { errorText, type Timers } from './timers.ts';

/** Wait before a failed backup is tried again, ms. */
export const BACKUP_RETRY_MS = 30_000;

/** The backup queue of one TV. */
export class BackupQueue {
  private readonly pending = new Map<string, Game>();
  private running = false;
  private again = false;
  private retryTimer: unknown = null;
  /** The upload run in progress (awaited before a backup is deleted). */
  private run: Promise<void> = Promise.resolve();
  /** Games the DM deleted: never backed up again. */
  private readonly deleted = new Set<string>();

  /**
   * @param backups - the server's backup API
   * @param log - the logger (area `tv`)
   * @param timers - timers for the retry
   * @param now - the clock (for timings in the log)
   */
  constructor(
    private readonly backups: TvPorts['backups'],
    private readonly log: Logger,
    private readonly timers: Timers,
    private readonly now: () => number,
  ) {}

  /** How many games wait for their backup. */
  get size(): number {
    return this.pending.size;
  }

  /**
   * Queues a game (replacing an older queued version) and starts uploading.
   *
   * @param game - the saved game
   */
  add(game: Game): void {
    if (this.deleted.has(game.id)) return;
    this.pending.set(game.id, game);
    void this.push();
  }

  /**
   * Uploads what waits now.
   *
   * @returns when this run (or the one in progress) ends
   */
  retry(): Promise<void> {
    return this.push();
  }

  /**
   * Marks a game deleted: dropped from the queue, never queued again.
   *
   * @param gameId - the game
   */
  forget(gameId: string): void {
    this.deleted.add(gameId);
    this.pending.delete(gameId);
  }

  /**
   * Waits for the upload in progress, if any — so a DELETE can't be overtaken by a PUT.
   *
   * @returns when it ended
   */
  settled(): Promise<void> {
    return this.run;
  }

  private push(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.run;
    }
    this.running = true;
    this.run = this.pushAll();
    return this.run;
  }

  /** One run: every queued game, again while new ones were queued meanwhile. */
  private async pushAll(): Promise<void> {
    try {
      do {
        this.again = false;
        for (const [id, game] of [...this.pending]) {
          if (this.deleted.has(id)) {
            this.pending.delete(id);
            continue;
          }
          const t0 = this.now();
          try {
            await this.backups.put(game);
            if (this.pending.get(id) === game) this.pending.delete(id);
            this.log.info('tv', 'Game backed up', { gameId: id, ms: this.now() - t0 });
          } catch (e) {
            this.log.warn('tv', 'Backup failed, will retry', { gameId: id, error: errorText(e), retryS: BACKUP_RETRY_MS / 1000 });
            this.scheduleRetry();
            return;
          }
        }
      } while (this.again);
    } finally {
      this.running = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null;
      void this.push();
    }, BACKUP_RETRY_MS);
  }
}
