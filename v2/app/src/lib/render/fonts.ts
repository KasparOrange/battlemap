/**
 * The renderer's bitmap fonts, installed once: token labels (bold, outlined), token names and
 * the tools' text (white glyphs, tinted per use). Installed fonts share one glyph atlas per face
 * instead of Pixi making a dynamic font per text object, and stay small for the TV's budget:
 * 48 px glyphs, ASCII plus the Latin letters names use (other characters are left out).
 *
 * No kerning tables (`skipKerning`): Pixi measures every pair of the ~160 characters with
 * `measureText` for them — 155 ms of main thread per start (qa#11), for labels of one to a few
 * characters where kerning doesn't show.
 */
import { BitmapFont } from 'pixi.js';

/** Glyph size the fonts are made at, px. */
export const GLYPH_PX = 48;

/** Token labels: bold, white with a dark outline. */
export const FONT_LABEL = 'bm-label';
/** Token names. */
export const FONT_NAME = 'bm-name';
/** Ruler numbers, disc labels, measure text (tinted). */
export const FONT_TEXT = 'bm-text';

const CHARS = [[' ', '~'], 'ÄÖÜäöüßÀÁÂÉÈÊËÍÎÏÓÔÒÚÙÛàáâãåçéèêëíìîïñóòôõúùûýÿæøÆØœŒ·×—–’‘“”…°'] as (string | [string, string])[];

let installed = false;

/** Installs the fonts (idempotent). */
export function installFonts(): void {
  if (installed) return;
  installed = true;
  const base = { fontSize: GLYPH_PX, fill: '#ffffff' } as const;
  BitmapFont.install({
    name: FONT_LABEL,
    style: { ...base, fontFamily: 'Space Grotesk, Outfit, system-ui, sans-serif', fontWeight: 'bold', stroke: { color: '#000000', width: 6, join: 'round' } },
    chars: CHARS,
    padding: 4,
    skipKerning: true,
  });
  BitmapFont.install({ name: FONT_NAME, style: { ...base, fontFamily: 'Outfit, system-ui, sans-serif', fontWeight: '600' }, chars: CHARS, padding: 2, skipKerning: true });
  BitmapFont.install({ name: FONT_TEXT, style: { ...base, fontFamily: 'Space Grotesk, Outfit, system-ui, sans-serif', fontWeight: 'bold' }, chars: CHARS, padding: 2, skipKerning: true });
}
