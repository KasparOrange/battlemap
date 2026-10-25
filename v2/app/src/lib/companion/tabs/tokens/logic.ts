/**
 * Token rules of the Tokens tab (parity §7): unique labels (the smallest unused number, TK-11),
 * colours that stay apart (the kit's eight marks, in turn), names for display, and what a
 * row says. Pure, tested under `bun test`.
 */
import { newId, type Token } from '@battlemap/shared';

/** The kit's eight marker hues (dark theme values of `--mark-1` … `--mark-8`), as `#rrggbb`. */
export const TOKEN_COLORS = ['#e3b45e', '#e8746a', '#6cb4e6', '#72cf98', '#b693f0', '#f0a050', '#5fd0c8', '#e98ac4'] as const;

/**
 * The smallest positive number no token uses as its label.
 *
 * @param tokens - the map's tokens
 * @returns the label, e.g. "3"
 */
export function nextLabel(tokens: readonly Token[]): string {
  const used = new Set(tokens.map((t) => t.label));
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}

/**
 * The colour for a new token: the first mark no token uses, else by count.
 *
 * @param tokens - the map's tokens
 * @returns a `#rrggbb` colour
 */
export function nextColor(tokens: readonly Token[]): string {
  const used = new Set(tokens.map((t) => t.color.toLowerCase()));
  return TOKEN_COLORS.find((c) => !used.has(c)) ?? TOKEN_COLORS[tokens.length % TOKEN_COLORS.length]!;
}

/**
 * A new token for the map.
 *
 * @param tokens - the tokens already there (for label and colour)
 * @param name - the DM's name for it (trimmed, may be empty)
 * @param square - where it stands, or null for "not on the map yet"
 * @returns the token
 */
export function makeToken(tokens: readonly Token[], name: string, square: { col: number; row: number } | null): Token {
  return {
    id: newId(),
    label: nextLabel(tokens),
    name: name.trim().slice(0, 200),
    color: nextColor(tokens),
    col: square?.col ?? 0,
    row: square?.row ?? 0,
    placed: square !== null,
    hidden: false,
  };
}

/**
 * The name to show for a token.
 *
 * @param t - the token
 * @returns its name, or "Token 3"
 */
export function tokenName(t: Token): string {
  return t.name.trim() || `Token ${t.label}`;
}

/**
 * The status line of a token row (TK-04).
 *
 * @param t - the token
 * @param armed - it waits for a tap on the map
 * @returns e.g. "On the map · hidden from the players"
 */
export function tokenStatus(t: Token, armed: boolean): string {
  const where = armed ? 'Tap the map where it stands' : t.placed ? `On the map · square ${t.col + 1}, ${t.row + 1}` : 'Not on the map yet';
  return t.hidden ? `${where} · hidden from the players` : where;
}

/**
 * Whether a square is free of placed tokens.
 *
 * @param tokens - the map's tokens
 * @param col - column
 * @param row - row
 * @param except - a token to ignore (the one being moved)
 * @returns true when nothing stands there
 */
export function squareFree(tokens: readonly Token[], col: number, row: number, except?: string): boolean {
  return !tokens.some((t) => t.placed && t.col === col && t.row === row && t.id !== except);
}
