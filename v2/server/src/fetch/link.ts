/**
 * The link fetch (`GET /api/fetch?url=`): what a link points to — a picture, a PDF, a `.dd2vtt`,
 * or the main picture of a web page — downloaded into `uploads/` (removed after 7 days) for the
 * app to import like a file from the device. Ported from the old dev server's `/fetch`
 * (`tools/dev_server.py`):
 *
 * - Google Drive (`file/d/<id>`, `open?id=`, `uc?id=`) and Dropbox (`dl=1`) share links become
 *   direct downloads; Drive's "can't scan for viruses" page is answered by its confirm form.
 * - A web page gives its `og:image` / `twitter:image`, `image_src`, else its first `<img>`.
 * - The kind is read from the bytes; other pictures (GIF, AVIF, TIFF, BMP, …) become PNG.
 *
 * @see ../../../docs/parity.md SV-05
 */
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pictureInfo, convertPicture } from '../files/convert.ts';
import { sniff } from '../files/sniff.ts';
import { writeAtomic } from '../store/fsx.ts';
import type { Downloader } from './download.ts';
import { Refused } from './guard.ts';

/** What a link fetch answers. */
export interface Fetched {
  /** Where the app downloads it from: `/uploads/<name>` (relative to the server). */
  url: string;
  /** A file name for the import ("Tower.dd2vtt", "map.png"). */
  name: string;
  /** Its size in bytes. */
  bytes: number;
  /** What it is. */
  kind: 'picture' | 'pdf' | 'uvtt';
  /** Its extension (`png`, `jpg`, `webp`, `pdf`, `dd2vtt`, `uvtt`). */
  ext: string;
}

/**
 * Turns a share link into a direct download.
 *
 * @param url - the link as pasted
 * @returns the link to download
 */
export function resolveShareLink(url: string): string {
  const u = url.trim();
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/.exec(u);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  if (/^https?:\/\/([^/]*\.)?dropbox\.com\//i.test(u)) {
    const parsed = new URL(u);
    parsed.searchParams.set('dl', '1');
    return parsed.toString();
  }
  return u;
}

/** Undoes HTML's entity escapes in an attribute value. */
function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

/**
 * The main picture of a web page.
 *
 * @param html - the page
 * @param base - its URL (relative links resolve against it)
 * @returns the picture's (or Drive confirm form's) URL, or null when there is none
 */
export function pictureInPage(html: string, base: string): string | null {
  const form = /<form[^>]+action="([^"]*download[^"]*)"([\s\S]*?)<\/form>/.exec(html);
  if (form) {
    const fields = new URLSearchParams();
    for (const m of form[2]!.matchAll(/name="([^"]+)"\s+value="([^"]*)"/g)) fields.set(m[1]!, unescapeHtml(m[2]!));
    return new URL(`${unescapeHtml(form[1]!)}?${fields.toString()}`, base).toString();
  }
  const patterns = [
    /<meta[^>]+(?:property|name)="(?:og:image|twitter:image)(?::src)?"[^>]+content="([^"]+)"/i,
    /<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="(?:og:image|twitter:image)(?::src)?"/i,
    /<link[^>]+rel="image_src"[^>]+href="([^"]+)"/i,
    /<img[^>]+src="([^"]+)"/i,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) {
      try {
        return new URL(unescapeHtml(m[1]!), base).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** A file name without characters that break paths or headers. */
function cleanStem(name: string): string {
  const stem = name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim();
  return (stem || 'map').slice(0, 120);
}

/**
 * Fetches a link into `uploads/`.
 *
 * @param link - the link as pasted
 * @param download - the downloader (public addresses only)
 * @param uploadsDir - where to store it
 * @returns where the app gets it and what it is
 * @throws {Refused} with a reason the app shows ("no picture found on that page", …)
 */
export async function fetchLink(link: string, download: Downloader, uploadsDir: string): Promise<Fetched> {
  if (!link.trim()) throw new Refused('type or paste a link first');
  const first = resolveShareLink(link);
  let got = await download(first);
  let kind = sniff(got.bytes);
  if ((kind === 'html' || kind === null) && (got.contentType === 'text/html' || got.contentType === 'application/xhtml+xml' || kind === 'html')) {
    const picture = pictureInPage(new TextDecoder().decode(got.bytes.subarray(0, 2_000_000)), got.finalUrl);
    if (!picture) throw new Refused('no picture found on that page');
    got = await download(picture);
    kind = sniff(got.bytes);
  }
  let bytes = got.bytes;
  let ext: string;
  let out: Fetched['kind'];
  if (kind === 'png' || kind === 'jpg' || kind === 'webp') {
    ext = kind;
    out = 'picture';
  } else if (kind === 'pdf') {
    ext = 'pdf';
    out = 'pdf';
  } else if (kind === 'uvtt') {
    ext = /\.uvtt$/i.test(got.name) ? 'uvtt' : 'dd2vtt';
    out = 'uvtt';
  } else if (await pictureInfo(bytes)) {
    bytes = (await convertPicture(bytes, 'png', null)).bytes;
    ext = 'png';
    out = 'picture';
  } else {
    throw new Refused(`not a map file (${got.contentType || 'unknown kind'})`);
  }
  const file = `${randomBytes(6).toString('hex')}.${ext}`;
  await writeAtomic(join(uploadsDir, file), bytes);
  return { url: `/uploads/${file}`, name: `${cleanStem(got.name)}.${ext}`, bytes: bytes.byteLength, kind: out, ext };
}
