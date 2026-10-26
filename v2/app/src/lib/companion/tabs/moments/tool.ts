/**
 * What a finger on the map does in the Moments tab (`docs/features.md` "table moments"):
 *
 * - a tap on a DM note's pin opens it (edit, delete);
 * - a tap on a token puts the spotlight on it (it follows the mini), a tap on an empty square on
 *   that square; a tap on what is lit already puts the light out;
 * - a drag that starts on a note's pin moves the note (one gesture = one undo step); a drag
 *   elsewhere pans the view.
 *
 * The long press that pins a new note works in every tab (the game screen hands it to
 * {@link holdNote}).
 */
import type { DmNote, Point } from '@battlemap/shared';
import { noteAt } from '../../../render/moments-logic.ts';
import type { GameContext, MapTool, ToolDrag } from '../../game/tabs.ts';
import { log } from '../../../log.ts';
import { momentsLocal, NO_NOTE_HOLD_TABS } from './local.svelte.ts';
import { NOTE_GRAB_PX, spotlightAfterTap } from './moments-logic.ts';
import { throttle } from '../../input/throttle.ts';

/** How often a note drag sends, ms. */
const NOTE_DRAG_MS = 80;

/**
 * The note pin under a map point, with a finger's grab room at the current zoom.
 *
 * @param ctx - the game context
 * @param at - the point in squares
 * @returns the note, or null
 */
export function noteUnder(ctx: GameContext, at: Point): DmNote | null {
  const zoom = ctx.camera.get()?.zoom ?? 40;
  return noteAt(ctx.map.notes ?? [], at, NOTE_GRAB_PX / Math.max(1, zoom));
}

/**
 * The Moments tool for a game screen.
 *
 * @param ctx - the game context
 * @returns the tool
 */
export function momentsTool(ctx: GameContext): MapTool {
  return {
    claims: (at) => noteUnder(ctx, at) !== null,

    tap(at) {
      const note = noteUnder(ctx, at);
      if (note) {
        momentsLocal.editNote(note);
        return;
      }
      const { cols, rows } = ctx.map.info.grid;
      const col = Math.floor(at.x);
      const row = Math.floor(at.y);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      const hit = ctx.hitsAt(at).find((h) => h.kind === 'token');
      const tokenId = hit?.kind === 'token' ? hit.id : null;
      const next = spotlightAfterTap(ctx.map.spotlight ?? null, tokenId, { col, row }, momentsLocal.dim);
      if (ctx.dispatch({ type: 'spotlight.set', spotlight: next })) {
        log.info('companion', next ? 'Spotlight set' : 'Spotlight out', next ? { target: next.target.kind, col, row } : {});
      }
    },

    begin(from): ToolDrag | null {
      const note = noteUnder(ctx, from);
      if (!note) return null;
      const gesture = ctx.newGesture();
      // the finger's offset from the pin stays while it drags
      const dx = note.x - from.x;
      const dy = note.y - from.y;
      const send = throttle(NOTE_DRAG_MS, (p: Point) => ctx.dispatch({ type: 'note.set', note: { ...note, x: p.x + dx, y: p.y + dy }, gesture }));
      return {
        move: (at) => send.push(at),
        end(at) {
          send.push(at);
          send.flush();
          log.info('companion', 'Note moved', { id: note.id, x: Math.round((at.x + dx) * 10) / 10, y: Math.round((at.y + dy) * 10) / 10 });
        },
        cancel: () => send.flush(),
      };
    },
  };
}

/**
 * A long press on the map (any tab but Draw and Fog): opens the note dialog for a new note there.
 *
 * @param ctx - the game context
 * @param at - the point in squares
 * @returns whether it was taken (outside the map, or in Draw / Fog, it is not)
 */
export function holdNote(ctx: GameContext, at: Point): boolean {
  if (NO_NOTE_HOLD_TABS.has(ctx.tab)) return false;
  const { cols, rows } = ctx.map.info.grid;
  if (at.x < 0 || at.y < 0 || at.x > cols || at.y > rows) return false;
  const existing = noteUnder(ctx, at);
  if (existing) momentsLocal.editNote(existing);
  else momentsLocal.newNote(at.x, at.y);
  globalThis.navigator?.vibrate?.(12);
  return true;
}
