/**
 * Fog masks: one bit per square, row-major, least significant bit first, stored as base64
 * (`Mask` in `model/basics.ts`). Every function here is pure — a change returns a new mask.
 * Bits past the last square are always 0, so equal squares give equal strings.
 */
import type { Mask } from '../model/basics.ts';
import { decodeBase64, encodeBase64 } from './base64.ts';

/**
 * Bytes a mask of `cells` squares takes.
 *
 * @param cells - number of squares
 * @returns the byte length
 */
export function maskByteLength(cells: number): number {
  return Math.ceil(cells / 8);
}

/**
 * A mask with no square set.
 *
 * @param cells - number of squares
 * @returns the mask
 */
export function emptyMask(cells: number): Mask {
  return encodeBase64(new Uint8Array(maskByteLength(cells)));
}

/**
 * A mask with every square set.
 *
 * @param cells - number of squares
 * @returns the mask
 */
export function fullMask(cells: number): Mask {
  const bytes = new Uint8Array(maskByteLength(cells)).fill(0xff);
  clearTail(bytes, cells);
  return encodeBase64(bytes);
}

/**
 * The bytes of a mask, exactly `maskByteLength(cells)` long (a short or damaged mask is padded
 * with zeros, a long one cut).
 *
 * @param mask - the mask
 * @param cells - number of squares the mask is for
 * @returns a fresh byte array the caller may change
 */
export function maskToBytes(mask: Mask, cells: number): Uint8Array {
  const decoded = decodeBase64(mask);
  const bytes = new Uint8Array(maskByteLength(cells));
  bytes.set(decoded.subarray(0, bytes.length));
  clearTail(bytes, cells);
  return bytes;
}

/**
 * A mask from its bytes.
 *
 * @param bytes - the bits, as `maskToBytes` gives them
 * @param cells - number of squares (bits past it are cleared)
 * @returns the mask
 */
export function bytesToMask(bytes: Uint8Array, cells: number): Mask {
  clearTail(bytes, cells);
  return encodeBase64(bytes);
}

/**
 * Whether a square is set in a mask's bytes.
 *
 * @param bytes - the mask's bytes
 * @param cell - the square's index
 * @returns true when set
 */
export function bitIsSet(bytes: Uint8Array, cell: number): boolean {
  return ((bytes[cell >> 3] ?? 0) & (1 << (cell & 7))) !== 0;
}

/**
 * Sets or clears squares in a mask.
 *
 * @param mask - the mask
 * @param cells - number of squares the mask is for
 * @param indices - the squares to change (out-of-range ones are skipped)
 * @param on - set (true) or clear (false)
 * @returns the new mask and how many squares actually changed (0 → `mask` itself is returned)
 */
export function setMaskCells(mask: Mask, cells: number, indices: readonly number[], on: boolean): { mask: Mask; changed: number } {
  const bytes = maskToBytes(mask, cells);
  let changed = 0;
  for (const cell of indices) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cells) continue;
    const byte = cell >> 3;
    const bit = 1 << (cell & 7);
    const was = (bytes[byte]! & bit) !== 0;
    if (was === on) continue;
    bytes[byte] = on ? bytes[byte]! | bit : bytes[byte]! & ~bit;
    changed++;
  }
  return changed === 0 ? { mask, changed } : { mask: encodeBase64(bytes), changed };
}

/**
 * The squares set in a mask, ascending.
 *
 * @param mask - the mask
 * @param cells - number of squares the mask is for
 * @returns the cell indices
 */
export function maskCells(mask: Mask, cells: number): number[] {
  const bytes = maskToBytes(mask, cells);
  const out: number[] = [];
  for (let cell = 0; cell < cells; cell++) if (bitIsSet(bytes, cell)) out.push(cell);
  return out;
}

/**
 * A mask with exactly the given squares set.
 *
 * @param cells - number of squares
 * @param indices - the squares to set
 * @returns the mask
 */
export function maskFromCells(cells: number, indices: readonly number[]): Mask {
  return setMaskCells(emptyMask(cells), cells, indices, true).mask;
}

/**
 * How many squares are set.
 *
 * @param mask - the mask
 * @param cells - number of squares the mask is for
 * @returns the count
 */
export function maskCount(mask: Mask, cells: number): number {
  const bytes = maskToBytes(mask, cells);
  let n = 0;
  for (const byte of bytes) {
    let b = byte;
    while (b) {
      b &= b - 1;
      n++;
    }
  }
  return n;
}

/**
 * Applies a preview to the revealed squares: `(revealed ∪ reveal) ∖ hide`.
 *
 * @param revealed - the revealed squares
 * @param reveal - squares the preview reveals
 * @param hide - squares the preview hides
 * @param cells - number of squares
 * @returns the new revealed mask
 */
export function applyPreview(revealed: Mask, reveal: Mask, hide: Mask, cells: number): Mask {
  const out = maskToBytes(revealed, cells);
  const r = maskToBytes(reveal, cells);
  const h = maskToBytes(hide, cells);
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! | r[i]!) & ~h[i]!;
  return bytesToMask(out, cells);
}

/**
 * Writes a mask as one byte per square (0 or 255) into `out` — the fog texture's texels.
 * Allocates nothing but the decode; `out` is reused by the renderer.
 *
 * @param mask - the mask
 * @param cells - number of squares
 * @param out - at least `cells` bytes
 */
export function maskToTexels(mask: Mask, cells: number, out: Uint8Array): void {
  const bytes = maskToBytes(mask, cells);
  for (let cell = 0; cell < cells; cell++) out[cell] = bitIsSet(bytes, cell) ? 255 : 0;
}

/** Clears the bits past the last square, so equal squares give equal masks. */
function clearTail(bytes: Uint8Array, cells: number): void {
  const used = cells & 7;
  if (used !== 0 && bytes.length > 0) bytes[bytes.length - 1]! &= (1 << used) - 1;
}
