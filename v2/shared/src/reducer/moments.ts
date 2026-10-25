/**
 * Table moments (roadmap S6, S8, S10, S11): `spotlight.set`, `timer.set`, `handout.save`,
 * `handout.remove`, `handout.show`, `note.set`, `note.remove`. Only the DM notes make undo
 * steps (one per gesture: a drag is one); the spotlight, the timer and the handouts are moments
 * at the table, set again with a tap.
 *
 * @see ../../../docs/features.md "table moments"
 */
import type { Game, MapPlay } from '../model/game.ts';
import { MAX_HANDOUTS, MAX_NOTES, type DmNote, type Handout } from '../model/moments.ts';
import type { RootState } from '../model/root.ts';
import type { CommandOf } from '../protocol/commands.ts';
import { clamp } from '../geometry/rect.ts';
import { onActiveMap, onGame, type ApplyResult } from './result.ts';

/**
 * `spotlight.set`: on a square of the map (clamped onto it) or a token of the map, or out.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function spotlightSet(root: RootState, cmd: CommandOf<'spotlight.set'>): ApplyResult {
  return onActiveMap(root, (map) => {
    const s = cmd.spotlight;
    const now = map.spotlight ?? null;
    if (!s) return now ? { map: { ...map, spotlight: null } } : { map };
    let target = s.target;
    if (target.kind === 'token') {
      const id = target.tokenId;
      if (!map.tokens.some((t) => t.id === id)) return 'That token is not on this map.';
    } else {
      const { cols, rows } = map.info.grid;
      target = { kind: 'square', col: clamp(target.col, 0, cols - 1), row: clamp(target.row, 0, rows - 1) };
    }
    const next = { target, dim: s.dim };
    if (now && JSON.stringify(now) === JSON.stringify(next)) return { map };
    return { map: { ...map, spotlight: next } };
  });
}

/**
 * `timer.set`: the countdown as the companion made it, or none.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function timerSet(root: RootState, cmd: CommandOf<'timer.set'>): ApplyResult {
  return onGame(root, (game): Game => {
    const t = cmd.timer;
    if (t && t.remainingMs > t.durationMs) return { ...game, timer: { ...t, remainingMs: t.durationMs } };
    if (!t && !game.timer) return game;
    return { ...game, timer: t };
  });
}

/**
 * `handout.save`: add a handout (at `index` or the end), or replace the one with its id.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function handoutSave(root: RootState, cmd: CommandOf<'handout.save'>): ApplyResult {
  return onGame(root, (game): Game | string => {
    const h = cmd.handout;
    if (h.kind === 'picture' && !h.file) return 'A picture handout needs its picture.';
    const list = game.handouts ?? [];
    const at = list.findIndex((x) => x.id === h.id);
    if (at < 0 && list.length >= MAX_HANDOUTS) return `A game keeps ${MAX_HANDOUTS} handouts at most.`;
    let handouts: Handout[];
    if (at >= 0 && cmd.index === undefined) {
      handouts = list.map((x, i) => (i === at ? h : x));
    } else {
      const rest = list.filter((x) => x.id !== h.id);
      const index = Math.min(cmd.index ?? rest.length, rest.length);
      handouts = [...rest.slice(0, index), h, ...rest.slice(index)];
    }
    return { ...game, handouts };
  });
}

/**
 * `handout.remove`: a handout leaves the list (and the TV, if it showed). Unknown ids change
 * nothing — it is gone already.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function handoutRemove(root: RootState, cmd: CommandOf<'handout.remove'>): ApplyResult {
  return onGame(root, (game) => {
    const list = game.handouts ?? [];
    if (!list.some((h) => h.id === cmd.id)) return game;
    const shown = game.handoutShown?.id === cmd.id ? null : (game.handoutShown ?? null);
    return { ...game, handouts: list.filter((h) => h.id !== cmd.id), handoutShown: shown };
  });
}

/**
 * `handout.show`: one of the game's handouts on the TV, or none.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function handoutShow(root: RootState, cmd: CommandOf<'handout.show'>): ApplyResult {
  return onGame(root, (game): Game | string => {
    const s = cmd.shown;
    const now = game.handoutShown ?? null;
    if (!s) return now ? { ...game, handoutShown: null } : game;
    if (!(game.handouts ?? []).some((h) => h.id === s.id)) return 'That handout is gone.';
    if (now && now.id === s.id && now.place === s.place && now.side === s.side) return game;
    return { ...game, handoutShown: { id: s.id, place: s.place, side: s.side } };
  });
}

/**
 * `note.set`: add a note to the map on the table (clamped onto it), or replace the one with its
 * id — one undo step per gesture.
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function noteSet(root: RootState, cmd: CommandOf<'note.set'>): ApplyResult {
  return onActiveMap(root, (map) => {
    const notes = map.notes ?? [];
    const { cols, rows } = map.info.grid;
    const note: DmNote = { ...cmd.note, x: clamp(cmd.note.x, 0, cols), y: clamp(cmd.note.y, 0, rows) };
    const at = notes.findIndex((n) => n.id === note.id);
    if (at < 0 && notes.length >= MAX_NOTES) return `A map keeps ${MAX_NOTES} notes at most.`;
    const old = at >= 0 ? notes[at]! : null;
    if (old && old.x === note.x && old.y === note.y && old.text === note.text) return { map };
    const next = at >= 0 ? notes.map((n, i) => (i === at ? note : n)) : [...notes, note];
    return { map: { ...map, notes: next }, undo: notesStep(map, cmd.gesture) };
  });
}

/**
 * `note.remove`: a note leaves the map (one undo step; an unknown id changes nothing).
 *
 * @param root - the state
 * @param cmd - the command
 * @returns the result
 */
export function noteRemove(root: RootState, cmd: CommandOf<'note.remove'>): ApplyResult {
  return onActiveMap(root, (map) => {
    const notes = map.notes ?? [];
    if (!notes.some((n) => n.id === cmd.id)) return { map };
    return { map: { ...map, notes: notes.filter((n) => n.id !== cmd.id) }, undo: notesStep(map, undefined) };
  });
}

/** The undo step that puts a map's notes back as they are now. */
function notesStep(map: MapPlay, gesture: string | undefined) {
  return { kind: 'notes' as const, mapId: map.info.id, gesture: gesture ?? null, notes: map.notes ?? [] };
}
