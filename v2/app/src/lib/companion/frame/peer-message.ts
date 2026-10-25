/**
 * The TV's non-sync messages for the companion's screens (`lib.listing`, `tv.status`,
 * `tv.notice`, `diag.report`, `deploy.ready`), checked with the shared schemas before a screen
 * uses them (rv#11, protocol.md "every receiver parses with the shared schemas"). The session
 * hands them on raw (`CompanionSession.lastMessage`); this is the one place they become typed.
 */
import { check, ToCompanion } from '@battlemap/shared';
import { log } from '../../log.ts';

/** A message for a companion screen (sync messages never reach the screens). */
export type PeerMessage = Exclude<ToCompanion, { type: `sync.${string}` }>;

/**
 * Checks one raw peer message.
 *
 * @param raw - the session's `lastMessage`
 * @returns the typed message, or null for nothing / a message that fails its schema (logged)
 */
export function peerMessage(raw: Record<string, unknown> | null): PeerMessage | null {
  if (!raw) return null;
  const r = check(ToCompanion, raw);
  if (!r.ok) {
    log.warn('companion', 'Peer message refused (schema)', { type: String(raw.type), error: r.error });
    return null;
  }
  return r.value.type.startsWith('sync.') ? null : (r.value as PeerMessage);
}
