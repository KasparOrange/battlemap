/**
 * What a file is, from its first bytes — never from its name or the sender's word.
 */

/** What the server recognises. `uvtt` is a `.dd2vtt` / `.uvtt` map (JSON with a picture). */
export type Sniffed = 'png' | 'jpg' | 'webp' | 'pdf' | 'uvtt' | 'json' | 'html' | null;

/** The picture kinds stored as they are. */
export const PICTURE_EXTS = new Set(['png', 'jpg', 'webp']);

/**
 * Looks at a file's first bytes.
 *
 * @param data - the file
 * @returns its kind, or null for anything else (other picture formats are found by sharp)
 */
export function sniff(data: Uint8Array): Sniffed {
  const b = data;
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 4 && ascii(b, 0, 4) === '%PDF') return 'pdf';
  const head = new TextDecoder().decode(b.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  if (head.startsWith('{')) {
    if (head.includes('"image"') && (head.includes('"resolution"') || head.includes('"format"'))) return 'uvtt';
    if (head.includes('"resolution"')) return 'uvtt';
    return 'json';
  }
  if (head.startsWith('[')) return 'json';
  const lower = head.slice(0, 512).toLowerCase();
  if (lower.startsWith('<!doctype html') || lower.startsWith('<html') || lower.includes('<head') || lower.includes('<body')) return 'html';
  return null;
}

/** The text of bytes `from`..`to`. */
function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.subarray(from, to));
}
