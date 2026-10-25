/**
 * Game export and import (parity §20): a game with its maps and pictures as one `.battlemap`
 * file, and back. Export takes the open game from the TV's state, a stored one from the server's
 * backup; the file goes to the device's Downloads inside the Android shell (`saveFile`), to the
 * share sheet or a download in a browser (`saveBlob`). Import uploads the file's pictures, backs
 * the game up, then asks the TV to open it (`game.open` restores it from the backup). Every step
 * shows a notice and is logged.
 */
import type { Game, GameSummary } from '@battlemap/shared';
import { api, describeError } from '../../api/index.ts';
import { log } from '../../log.ts';
import { inShell, saveFile } from '../../shell.ts';
import { BUNDLE_EXT, exportGameFile, importGameFile, saveBlob } from '../../storage/index.ts';
import { dismiss, notify } from '../../ui/notice.svelte.ts';

/** "12.4 of 38 MB". */
function mb(done: number, total: number): string {
  return `${(done / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
}

/**
 * The game to export: the open one as the TV holds it, else the server's backup.
 *
 * @param summary - the library row
 * @param open - the game open on the TV now, if any
 * @returns the game, or null when the server has no backup of it
 */
async function gameFor(summary: GameSummary, open: Game | null): Promise<Game | null> {
  if (open?.id === summary.id) return open;
  return api.backups.get(summary.id);
}

/**
 * Exports a game to a file.
 *
 * @param summary - which game (its library row; for the open game build one from it)
 * @param open - the game open on the TV now (exported as is), or null
 * @returns true when the file was saved
 */
export async function exportGame(summary: Pick<GameSummary, 'id' | 'name'> & Partial<GameSummary>, open: Game | null): Promise<boolean> {
  const t0 = performance.now();
  let id = notify(`Exporting “${summary.name}”…`, { ms: 120_000 });
  try {
    const game = await gameFor(summary as GameSummary, open);
    if (!game) {
      dismiss(id);
      notify(`“${summary.name}” has no backup on the server yet — open it once, then export it.`, { kind: 'warning' });
      return false;
    }
    let shown = 0;
    const { blob, name } = await exportGameFile(game, (done, total) => {
      // a fresh notice at most every 10 %, so the text says how far it is
      const step = total > 0 ? Math.floor((done / total) * 10) : 0;
      if (step > shown) {
        shown = step;
        dismiss(id);
        id = notify(`Exporting “${summary.name}” · ${mb(done, total)}`, { ms: 120_000 });
      }
    });
    const where = inShell() ? await saveFile(blob, name) : await saveBlob(blob, name, log);
    dismiss(id);
    log.info('companion', 'Game exported', { id: game.id, name, bytes: blob.size, where, ms: Math.round(performance.now() - t0) });
    notify(where === 'shared' ? `“${name}” is ready to share.` : `Saved “${name}”${where.startsWith('Downloads') ? ' in Downloads' : ''}.`, { kind: 'success' });
    return true;
  } catch (e) {
    dismiss(id);
    if ((e as { name?: string }).name === 'AbortError') return false;
    log.warn('companion', 'Game export failed', { id: summary.id, error: String(e) });
    notify(`Couldn't export “${summary.name}”: ${describeError(e)}`, { kind: 'error' });
    return false;
  }
}

/**
 * Imports a `.battlemap` file and asks the TV to open the game.
 *
 * @param file - the picked file
 * @param openOnTv - sends `game.open` for the imported game's id; false when not connected
 * @returns the imported game, or null when it failed (a notice says why)
 */
export async function importGame(file: File, openOnTv: (gameId: string) => boolean): Promise<Game | null> {
  const t0 = performance.now();
  let id = notify(`Reading “${file.name}”…`, { ms: 120_000 });
  try {
    let shown = 0;
    const game = await importGameFile(file, (done, total) => {
      const step = total > 0 ? Math.floor((done / total) * 10) : 0;
      if (step > shown) {
        shown = step;
        dismiss(id);
        id = notify(`Uploading the game · ${mb(done, total)}`, { ms: 120_000 });
      }
    });
    dismiss(id);
    log.info('companion', 'Game imported', { id: game.id, name: game.name, file: file.name, bytes: file.size, ms: Math.round(performance.now() - t0) });
    if (openOnTv(game.id)) notify(`Opening “${game.name}” on the TV…`, { kind: 'success' });
    else notify(`“${game.name}” is in the backups — open it once the TV is connected.`, { kind: 'warning' });
    return game;
  } catch (e) {
    dismiss(id);
    log.warn('companion', 'Game import failed', { file: file.name, error: String(e) });
    notify(`Couldn't import “${file.name}”: ${e instanceof Error ? e.message : describeError(e)}`, { kind: 'error' });
    return null;
  }
}

/** What the import file picker accepts. */
export const GAME_FILE_ACCEPT = BUNDLE_EXT;
