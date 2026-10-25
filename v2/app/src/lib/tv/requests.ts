/**
 * Routes the TV's requests (peer messages that are not reducer commands) to `TvGames`, one
 * after another. Each answer goes to the companion that asked; anything that loads a game
 * sends everyone a new snapshot (through the host's `replace`).
 *
 * @see ../../../../docs/protocol.md "companion → TV"
 * @see ./games.ts for what each request does
 */
import type { Logger } from '../log.ts';
import type { TvRequest } from '../state/host.ts';
import type { TvGames } from './games.ts';

/**
 * Answers one request.
 *
 * @param req - the request
 * @param from - the companion that sent it
 * @param games - the TV's games
 * @param log - the logger (area `tv`)
 * @returns when the answer is done (requests queue behind each other)
 */
export function answerRequest(req: TvRequest, from: string, games: TvGames, log: Logger): Promise<void> {
  log.info('tv', 'Request', { type: req.type, from });
  switch (req.type) {
    case 'lib.list':
      return games.run(req.type, from, () => games.sendListing(from));
    case 'game.open':
      return games.run(req.type, from, () => games.open(req.gameId, from));
    case 'game.new':
      return games.run(req.type, from, () => games.start(req.game));
    case 'game.close':
      return games.run(req.type, from, () => games.close());
    case 'game.delete':
      return games.run(req.type, from, async () => {
        await games.remove(req.gameId);
        await games.sendListing(from);
      });
    case 'game.renameStored':
      return games.run(req.type, from, async () => {
        await games.rename(req.gameId, req.name);
        await games.sendListing(from);
      });
    case 'diag.status':
      games.diagnose(from);
      return Promise.resolve();
    case 'deploy.prepare':
      return games.run(req.type, from, () => games.prepareDeploy(from));
    case 'tv.reload':
      return games.run(req.type, from, () => games.reloadApp());
  }
}
