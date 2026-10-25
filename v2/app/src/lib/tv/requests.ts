/**
 * The TV's answers to requests that are not reducer commands — the skeleton's version: games
 * live in memory only (no storage yet), so `game.new` starts a game, `game.close` closes it and
 * the listing knows just the open one. The TV UI package replaces this with storage-backed
 * answers (`lib/storage/`, the server backup).
 */
import { emptyLive, newGame, tableGrid, type RootState } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { TvRequest } from '../state/host.ts';

/** What the request handler needs from the TV session. */
export interface RequestContext {
  /** The current state. */
  readonly state: RootState;
  /** The app build. */
  readonly build: string;
  /** Seconds since start. */
  uptimeS(): number;
  /** Replaces the state (new epoch, snapshot to all). */
  replace(state: RootState, reason: string): void;
  /** Sends a message. */
  send(msg: { type: string } & Record<string, unknown>): boolean;
  /** The host's epoch and revision. */
  syncInfo(): { epoch: string; rev: number };
}

/**
 * Answers one request.
 *
 * @param req - the request
 * @param from - the companion that sent it
 * @param ctx - the TV session
 * @param log - the logger (area `tv`)
 */
export function answerRequest(req: TvRequest, from: string, ctx: RequestContext, log: Logger): void {
  const s = ctx.state;
  log.info('tv', 'Request', { type: req.type, from });
  switch (req.type) {
    case 'lib.list': {
      const g = s.game;
      const games = g
        ? [{
          id: g.id, name: g.name, createdAt: g.createdAt, savedAt: g.createdAt,
          mapNames: g.mapOrder.map((id) => g.maps[id]?.info.name ?? '?'),
          activeMapName: g.maps[g.activeMapId]?.info.name ?? '?', thumb: null, where: 'tv' as const,
        }]
        : [];
      ctx.send({ type: 'lib.listing', to: from, games });
      return;
    }
    case 'game.new':
      ctx.replace({ ...s, game: newGame(req.game), live: emptyLive(), history: { undo: [], redo: [] } }, `new game ${req.game.id}`);
      return;
    case 'game.close':
      ctx.replace({ ...s, game: null, live: emptyLive(), history: { undo: [], redo: [] } }, 'game closed');
      return;
    case 'diag.status': {
      const v = s.table.viewport;
      const grid = v ? tableGrid(v, s.table.widthInches, s.table.overscanPercent) : null;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      ctx.send({
        type: 'diag.report', to: from, build: ctx.build, ...ctx.syncInfo(), gameId: s.game?.id ?? null,
        activeMapId: s.game?.activeMapId ?? null, table: grid ? `${grid.cols}x${grid.rows}` : null,
        uptimeS: ctx.uptimeS(), heapMb: memory ? Math.round(memory.usedJSHeapSize / 1e6) : null,
      });
      return;
    }
    case 'deploy.prepare':
      ctx.send({ type: 'deploy.ready', to: from, gameId: s.game?.id ?? null });
      return;
    case 'game.open':
    case 'game.delete':
    case 'game.renameStored':
    case 'tv.reload':
      ctx.send({ type: 'tv.notice', to: from, level: 'warn', text: `The TV can't do "${req.type}" yet.` });
      return;
  }
}
