/**
 * Random ids for things a command creates (games, tokens, strokes, gestures, clients).
 */

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * A random id of lowercase letters and digits (default 12 characters ≈ 62 bits). Uses the
 * platform's `crypto.getRandomValues` (browsers in any context, Bun). Not for the reducer —
 * ids are made where a command is issued.
 *
 * @param length - number of characters
 * @returns the id
 */
export function newId(length = 12): string {
  const random = (globalThis as { crypto?: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto;
  const bytes = new Uint8Array(length);
  if (random) random.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}
