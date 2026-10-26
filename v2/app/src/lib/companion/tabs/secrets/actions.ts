/**
 * What the Secrets tab's controls do (roadmap S9): place a secret, change it, mark it found /
 * spring it (its effect plays on every screen) or hide it again, delete it. Each sends one
 * command; the notices carry the Undo.
 *
 * Saving and deleting make no undo step on the TV (prep, like scenes and areas): Undo saves the
 * old secret back. A find is not a fog change either — its Undo is `secret.found` false.
 */
import { newId, type Secret } from '@battlemap/shared';
import type { GameContext } from '../../game/tabs.ts';
import { log } from '../../../log.ts';
import { notify } from '../../../ui/notice.svelte.ts';
import { secretsLocal } from './local.svelte.ts';
import { foundVerb, secretLabel, secretShot } from './logic.ts';

/** The map's secrets. */
function secretsOf(ctx: GameContext): readonly Secret[] {
  return ctx.map.secrets ?? [];
}

/**
 * Places a new secret and selects it.
 *
 * @param ctx - the game context
 * @param s - the secret (`makeSecret`)
 * @returns whether it was sent
 */
export function placeSecret(ctx: GameContext, s: Secret): boolean {
  if (!ctx.dispatch({ type: 'secret.save', secret: s })) return false;
  secretsLocal.selected = s.id;
  log.info('companion', 'Secret placed', { secret: s.id, kind: s.kind, door: s.door });
  notify(`${secretLabel(s, secretsOf(ctx))} placed — the players see nothing of it`, {
    kind: 'success',
    action: { label: 'Undo', run: () => void ctx.dispatch({ type: 'secret.remove', id: s.id }) },
  });
  return true;
}

/**
 * Changes a secret (name, note, effect, direction) in place.
 *
 * @param ctx - the game context
 * @param s - the secret now
 * @param patch - the fields to change
 * @returns whether it was sent
 */
export function updateSecret(ctx: GameContext, s: Secret, patch: Partial<Pick<Secret, 'name' | 'note' | 'effect' | 'vertical'>>): boolean {
  const next = { ...s, ...patch };
  if (next.name === s.name && next.note === s.note && next.effect === s.effect && next.vertical === s.vertical) return false;
  if (!ctx.dispatch({ type: 'secret.save', secret: next })) return false;
  log.info('companion', 'Secret changed', { secret: s.id, fields: Object.keys(patch) });
  return true;
}

/**
 * Marks a secret found (a trap: sprung) — its effect plays on every screen and the players see
 * it — or hides it again. The notice's Undo turns it back.
 *
 * @param ctx - the game context
 * @param s - the secret
 * @param found - found / sprung (true) or hidden again (false)
 * @returns whether it was sent
 */
export function setFound(ctx: GameContext, s: Secret, found: boolean): boolean {
  const shot = found ? secretShot(s, newId(), ctx.serverNow()) : null;
  if (!ctx.dispatch({ type: 'secret.found', id: s.id, found, ...(shot ? { shot } : {}) })) return false;
  const label = secretLabel(s, secretsOf(ctx));
  log.info('companion', found ? (s.kind === 'trap' ? 'Trap sprung' : 'Secret found') : 'Secret hidden again', { secret: s.id, effect: shot?.effect ?? null });
  const text = found ? `${label} ${s.kind === 'trap' ? 'sprung' : 'found'} — the players see it` : `${label} hidden from the players again`;
  notify(text, {
    kind: 'success',
    action: { label: 'Undo', run: () => void ctx.dispatch({ type: 'secret.found', id: s.id, found: !found }) },
  });
  return true;
}

/**
 * The one-tap button's action in the list: Found / Spring, or Hide again.
 *
 * @param ctx - the game context
 * @param s - the secret
 * @returns whether it was sent
 */
export function toggleFound(ctx: GameContext, s: Secret): boolean {
  log.info('companion', 'Secret button', { secret: s.id, verb: foundVerb(s) });
  return setFound(ctx, s, !s.found);
}

/**
 * Deletes a secret; the notice's Undo saves it back at its place.
 *
 * @param ctx - the game context
 * @param s - the secret
 * @returns whether it was sent
 */
export function deleteSecret(ctx: GameContext, s: Secret): boolean {
  const all = secretsOf(ctx);
  const index = all.findIndex((x) => x.id === s.id);
  const label = secretLabel(s, all);
  if (!ctx.dispatch({ type: 'secret.remove', id: s.id })) return false;
  if (secretsLocal.selected === s.id) secretsLocal.selected = null;
  log.info('companion', 'Secret deleted', { secret: s.id });
  notify(`Deleted ${label}`, {
    kind: 'success',
    action: { label: 'Undo', run: () => void ctx.dispatch({ type: 'secret.save', secret: s, index: Math.max(0, index) }) },
  });
  return true;
}
