/**
 * The reducer: `apply(state, command)`. Pure and deterministic — no clock, no randomness, no IO
 * — so the TV (for real) and every companion (as a prediction) get the same state from the same
 * commands. Every command type has its handler here; a new type without one fails to compile.
 *
 * @see ../../../docs/architecture.md "the reducer"
 */
import type { RootState } from '../model/root.ts';
import type { Command } from '../protocol/commands.ts';
import { assertNever } from '../util/assert.ts';
import { drawAdd, drawClear, drawLive, drawRemove, discSet, layersSet, measureSet, rulerSet } from './drawing.ts';
import { doorSet, fogAll, fogApply, fogCommit, fogDiscard, fogEnable, fogPreview } from './fog.ts';
import { historyRedo, historyUndo } from './history.ts';
import { fxPlace, fxRemove, fxTrigger, gameRename, gameSettings, mapAdd, mapRegrid, mapRemove, mapRename, mapSwitch } from './maps.ts';
import type { ApplyResult } from './result.ts';
import { curtainSet, sceneApply, sceneOrder, sceneRemove, sceneRename, sceneSave } from './scenes.ts';
import { tokenAdd, tokenClear, tokenMove, tokenRemove, tokenUpdate } from './tokens.ts';
import { tableCalibrate, tableOverscan, tablePattern, tableReset, tableViewport, viewFree, viewGrid, viewMode, viewPan, viewRotate, viewWindow } from './view.ts';

/**
 * Applies one command.
 *
 * @param state - the current state (never changed)
 * @param cmd - the command (already checked against its schema)
 * @returns the new state — the same object when nothing changed — or why it was refused
 */
export function apply(state: RootState, cmd: Command): ApplyResult {
  switch (cmd.type) {
    case 'fog.apply': return fogApply(state, cmd);
    case 'fog.all': return fogAll(state, cmd);
    case 'fog.enable': return fogEnable(state, cmd);
    case 'fog.preview': return fogPreview(state, cmd);
    case 'fog.commit': return fogCommit(state);
    case 'fog.discard': return fogDiscard(state);
    case 'door.set': return doorSet(state, cmd);
    case 'token.add': return tokenAdd(state, cmd);
    case 'token.move': return tokenMove(state, cmd);
    case 'token.update': return tokenUpdate(state, cmd);
    case 'token.remove': return tokenRemove(state, cmd);
    case 'token.clear': return tokenClear(state);
    case 'draw.add': return drawAdd(state, cmd);
    case 'draw.remove': return drawRemove(state, cmd);
    case 'draw.clear': return drawClear(state);
    case 'draw.live': return drawLive(state, cmd);
    case 'measure.set': return measureSet(state, cmd);
    case 'ruler.set': return rulerSet(state, cmd);
    case 'disc.set': return discSet(state, cmd);
    case 'layers.set': return layersSet(state, cmd);
    case 'view.mode': return viewMode(state, cmd);
    case 'view.window': return viewWindow(state, cmd);
    case 'view.pan': return viewPan(state, cmd);
    case 'view.rotate': return viewRotate(state, cmd);
    case 'view.free': return viewFree(state, cmd);
    case 'view.grid': return viewGrid(state, cmd);
    case 'table.calibrate': return tableCalibrate(state, cmd);
    case 'table.overscan': return tableOverscan(state, cmd);
    case 'table.reset': return tableReset(state);
    case 'table.pattern': return tablePattern(state, cmd);
    case 'table.viewport': return tableViewport(state, cmd);
    case 'map.add': return mapAdd(state, cmd);
    case 'map.switch': return mapSwitch(state, cmd);
    case 'map.remove': return mapRemove(state, cmd);
    case 'map.rename': return mapRename(state, cmd);
    case 'map.regrid': return mapRegrid(state, cmd);
    case 'fx.place': return fxPlace(state, cmd);
    case 'fx.remove': return fxRemove(state, cmd);
    case 'fx.trigger': return fxTrigger(state, cmd);
    case 'game.rename': return gameRename(state, cmd);
    case 'game.settings': return gameSettings(state, cmd);
    case 'curtain.set': return curtainSet(state, cmd);
    case 'scene.save': return sceneSave(state, cmd);
    case 'scene.remove': return sceneRemove(state, cmd);
    case 'scene.rename': return sceneRename(state, cmd);
    case 'scene.order': return sceneOrder(state, cmd);
    case 'scene.apply': return sceneApply(state, cmd);
    case 'history.undo': return historyUndo(state);
    case 'history.redo': return historyRedo(state);
    default: return assertNever(cmd);
  }
}

/**
 * Applies commands in order, skipping refused ones — what a companion does to fold its pending
 * commands onto the confirmed state.
 *
 * @param state - the start
 * @param cmds - the commands
 * @returns the final state
 */
export function applyAll(state: RootState, cmds: Iterable<Command>): RootState {
  let s = state;
  for (const cmd of cmds) {
    const r = apply(s, cmd);
    if (r.ok) s = r.state;
  }
  return s;
}
