/**
 * The table code: the short code the DM matches between the TV's home screen and the tablet's
 * table picker (qa#18). One rule for both sides, so they can never show two different "codes".
 *
 * Format (protocol.md "table code"): the room id's last four letters or digits, upper case —
 * `table-yf6kig4q` → `IG4Q`. A room id with fewer than four such characters gives all it has;
 * one with none gives `?`. Display only: the room id stays the address.
 */

/**
 * The code of a table.
 *
 * @param room - the table's room id
 * @returns the short code, e.g. `IG4Q`
 */
export function tableCode(room: string): string {
  const code = room.replace(/[^0-9a-z]/gi, '').slice(-4).toUpperCase();
  return code || '?';
}
