/**
 * What kind of map file the DM picked — decided by the file name's extension (Safari's picker
 * doesn't know `.dd2vtt`, so it accepts any type) and checked against the content's magic
 * numbers — plus the checks every file passes first (empty, too big).
 */
import { ImportError } from './errors.ts';
import { looksLikePdf, pictureKind } from './sniff.ts';
import { MAX_FILE_BYTES } from './sizing.ts';

/** The three import paths. */
export type FileKind = 'uvtt' | 'pdf' | 'picture';

/** The message for a file of a kind battlemap doesn't read (v1's text). */
export const UNSUPPORTED_MESSAGE = 'Unsupported file. Use .dd2vtt, .uvtt, .pdf, .png, .jpg, or .webp files.';

/** The message for a file with no bytes (v1's text). */
export const EMPTY_MESSAGE = 'Could not read file. Try downloading it to your phone first, then pick from local storage.';

/**
 * The kind a file name's extension says, or null.
 *
 * @param name - the file name
 * @returns the kind
 */
export function kindFromName(name: string): FileKind | null {
  const ext = /\.([^.]+)$/.exec(name.trim().toLowerCase())?.[1] ?? '';
  if (ext === 'dd2vtt' || ext === 'uvtt') return 'uvtt';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'picture';
  return null;
}

/**
 * The kind of a picked file, by its name and its first bytes; throws when it can't be read.
 * The content wins when the name says nothing (a share without an extension); a name that
 * promises one kind and content of another is refused as damaged.
 *
 * @param name - the file name
 * @param size - its size in bytes
 * @param head - its first bytes (1 KB is enough)
 * @returns the kind
 * @throws ImportError `empty`, `too-big`, `unsupported` or `corrupt`
 */
export function classifyFile(name: string, size: number, head: Uint8Array): FileKind {
  if (size === 0) throw new ImportError('empty', EMPTY_MESSAGE);
  if (size > MAX_FILE_BYTES) {
    throw new ImportError('too-big', `This file is ${mb(size)} MB; battlemap takes map files up to ${mb(MAX_FILE_BYTES)} MB.`);
  }
  const byContent: FileKind | null = pictureKind(head) ? 'picture' : looksLikePdf(head) ? 'pdf' : startsWithBrace(head) ? 'uvtt' : null;
  const byName = kindFromName(name);
  if (!byName) {
    if (byContent) return byContent;
    throw new ImportError('unsupported', UNSUPPORTED_MESSAGE, `name ${name}`);
  }
  if (byContent !== byName) {
    const what = byName === 'uvtt' ? 'Dungeondraft/Universal VTT map' : byName === 'pdf' ? 'PDF' : 'picture';
    throw new ImportError('corrupt', `"${name}" is not a ${what} inside — the file is damaged or misnamed.`, `content ${byContent ?? 'unknown'}`);
  }
  return byName;
}

/**
 * The map's name from its file name: the extension dropped, underscores as spaces, trimmed.
 *
 * @param fileName - the file name
 * @returns the name ("Map" when nothing is left)
 */
export function mapNameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  return (base || 'Map').slice(0, 200);
}

function startsWithBrace(head: Uint8Array): boolean {
  for (let i = 0; i < head.length; i++) {
    const c = head[i]!;
    if (c === 0xef || c === 0xbb || c === 0xbf || c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue; // BOM, spaces
    return c === 0x7b; // {
  }
  return false;
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
}
