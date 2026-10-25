/**
 * The TV home's LAN join band (shell.md "Table server"): the QR code's address in the home's
 * colours. The details themselves come from `lanJoinInfo()` / `onLanChange` in `config.ts`.
 */
import type { LanJoinInfo } from '../config.ts';

/** Dark modules: the graphite ink on gold (`--accent-ink`), so the code reads warm, not stark. */
export const QR_DARK = '#1a1306';
/** Light modules: the parchment base (light theme `--m0`) — calm in a dim room, a clean scan. */
export const QR_LIGHT = '#f7f1e4';

/**
 * The QR code's URL for the TV home, drawn by the table server in the home's colours.
 *
 * @param info - the TV's LAN join details
 * @returns the SVG's URL, or null while there is no join address (or the server doesn't run)
 * @see lanJoinInfo
 */
export function lanQrUrl(info: LanJoinInfo): string | null {
  if (!info.hosting || !info.qrSvgUrl) return null;
  const sep = info.qrSvgUrl.includes('?') ? '&' : '?';
  return `${info.qrSvgUrl}${sep}dark=${encodeURIComponent(QR_DARK)}&light=${encodeURIComponent(QR_LIGHT)}`;
}

/**
 * A one-line summary of the join details for the log (no URLs of the QR itself).
 *
 * @param info - the details, or null when the TV stopped hosting
 * @returns the fields worth logging
 */
export function lanLogFields(info: LanJoinInfo | null): Record<string, unknown> {
  if (!info) return { hosting: false };
  return { hosting: info.hosting, code: info.code, url: info.url, error: info.error };
}
