/**
 * Plain base64 for byte arrays, written out so `shared/` needs no browser or Node globals.
 * Used for fog masks (`mask.ts`).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Character code → 6-bit value (255 = not a base64 character). */
const LOOKUP = (() => {
  const table = new Uint8Array(128).fill(255);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/**
 * Encodes bytes as base64 (with `=` padding).
 *
 * @param bytes - the bytes
 * @returns the base64 text
 */
export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    parts.push(ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    parts.push(ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + '==');
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    parts.push(ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + '=');
  }
  return parts.join('');
}

/**
 * Decodes base64 into bytes. Characters outside the alphabet (whitespace, padding) are skipped,
 * so a damaged text gives fewer bytes rather than an exception.
 *
 * @param text - the base64 text
 * @returns the bytes
 */
export function decodeBase64(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const six = code < 128 ? LOOKUP[code]! : 255;
    if (six === 255) continue;
    value = (value << 6) | six;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}
