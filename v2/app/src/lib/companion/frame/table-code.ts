/**
 * The short table code the DM matches between the TV's home screen and the tablet's table
 * picker (qa#18). The format belongs to the protocol (W3-A, protocol.md): when `@battlemap/shared`
 * exports `tableCode(room)`, that one is used, so TV and tablet can never disagree; until then the
 * same rule the picker always had — the room id's last four letters or digits, upper case
 * (`table-yf6kig4q` → `IG4Q`).
 */
import * as shared from '@battlemap/shared';

/** The shared formatter, when the protocol package has one. */
const sharedCode = (shared as unknown as Record<string, unknown>).tableCode as ((room: string) => string) | undefined;

/**
 * The code of a table.
 *
 * @param room - the table's room id
 * @returns the short code ("7F3K")
 */
export function tableCode(room: string): string {
  if (typeof sharedCode === 'function') return sharedCode(room);
  return room.replace(/[^0-9a-z]/gi, '').slice(-4).toUpperCase();
}
