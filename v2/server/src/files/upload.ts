/**
 * One upload into the file store (`POST /files?ext=&format=`): check what the bytes are,
 * convert a picture when asked ("Store as"), store it by content and make its thumbnail.
 *
 * - Pictures: PNG, JPEG and WebP are stored as they are, or converted (`format`). Other
 *   pictures sharp reads (GIF, TIFF, AVIF, …) are always converted — to PNG when no format was
 *   asked for. A conversion that fails stores the upload as it came ("not converted: …").
 * - `json` must parse; `pdf` must be a PDF. `.dd2vtt` files are split by the app at import and
 *   never uploaded whole.
 */
import type { FileExt, FileRef } from '@battlemap/shared';
import type { ServerLog } from '../log.ts';
import { convertPicture, makeThumbnail, pictureInfo, type StoreFormat } from './convert.ts';
import { PICTURE_EXTS, sniff } from './sniff.ts';
import { FileStore } from './store.ts';

/** What `POST /files` answers: the `FileRef` fields plus what the server found and made. */
export interface UploadResult extends FileRef {
  /** Picture width in pixels, or null for JSON / PDF. */
  width: number | null;
  /** Picture height in pixels, or null. */
  height: number | null;
  /** The thumbnail (≤ 288 px WebP) of a picture, or null. */
  thumb: FileRef | null;
  /** Bytes as uploaded when the picture was converted, else null. */
  originalBytes: number | null;
  /** What the conversion did ("lossless", "already smaller as it was", …), or null. */
  note: string | null;
}

/** An upload the server refuses, with the reason for the app. */
export class BadUpload extends Error {}

/**
 * Stores one upload.
 *
 * @param store - the file store
 * @param data - the uploaded bytes
 * @param ext - what the sender says it is (`png`, `jpg`, `webp`, `json`, `pdf`), or null to go by
 *   the bytes alone
 * @param format - "Store as" (`asis` keeps a PNG/JPEG/WebP as it came)
 * @param log - the logger (conversion timings)
 * @returns the stored file and what was made
 * @throws {BadUpload} when the bytes are empty or not what they claim to be
 */
export async function storeUpload(store: FileStore, data: Uint8Array, ext: FileExt | null, format: StoreFormat, log: ServerLog): Promise<UploadResult> {
  if (data.byteLength === 0) throw new BadUpload('empty file');
  const kind = sniff(data);
  const plain = { width: null, height: null, thumb: null, originalBytes: null, note: null };

  if (ext === 'json' || (ext === null && (kind === 'json' || kind === 'uvtt'))) {
    if (kind !== 'json' && kind !== 'uvtt') throw new BadUpload('that is not a JSON file');
    try {
      JSON.parse(new TextDecoder().decode(data));
    } catch (e) {
      throw new BadUpload(`not JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { ...(await store.put(data, 'json')), ...plain };
  }
  if (ext === 'pdf' || (ext === null && kind === 'pdf')) {
    if (kind !== 'pdf') throw new BadUpload('that is not a PDF');
    return { ...(await store.put(data, 'pdf')), ...plain };
  }

  // A picture.
  const sniffedPicture = kind && PICTURE_EXTS.has(kind) ? (kind as 'png' | 'jpg' | 'webp') : null;
  if (!sniffedPicture && (kind === 'pdf' || kind === 'json' || kind === 'uvtt' || kind === 'html')) {
    throw new BadUpload(`that is a ${kind === 'uvtt' ? '.dd2vtt map' : kind.toUpperCase()}, not a picture`);
  }
  const info = await pictureInfo(data);
  if (!info) throw new BadUpload('not a picture battlemap can read (PNG, JPEG, WebP, GIF, TIFF, AVIF)');

  const sourceHash = FileStore.hash(data);
  const target: Exclude<StoreFormat, 'asis'> | null = format !== 'asis' ? format : sniffedPicture ? null : 'png';
  let stored: { ref: FileRef; note: string | null; width: number; height: number; originalBytes: number | null };
  if (!target) {
    stored = { ref: await store.put(data, sniffedPicture!), note: null, width: info.width, height: info.height, originalBytes: null };
  } else {
    const key = `${sourceHash}:${target}`;
    const before = await store.getDerived(key);
    if (before && before.width && before.height) {
      stored = { ref: before.ref, note: before.note, width: before.width, height: before.height, originalBytes: data.byteLength };
    } else {
      const t0 = performance.now();
      try {
        const c = await convertPicture(data, target, sniffedPicture);
        const ref = await store.put(c.bytes, c.ext);
        const ms = Math.round(performance.now() - t0);
        log.info('files', 'Converted', { format: target, from: data.byteLength, to: c.bytes.byteLength, ext: c.ext, note: c.note, ms, width: info.width, height: info.height });
        stored = { ref, note: c.note, width: info.width, height: info.height, originalBytes: data.byteLength };
        await store.setDerived(key, { ref, note: c.note, width: info.width, height: info.height });
      } catch (e) {
        if (!sniffedPicture) throw new BadUpload(`could not convert the picture: ${e instanceof Error ? e.message : String(e)}`);
        const note = `not converted: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
        log.warn('files', 'Conversion failed, stored as is', { format: target, bytes: data.byteLength, error: note });
        stored = { ref: await store.put(data, sniffedPicture), note, width: info.width, height: info.height, originalBytes: data.byteLength };
      }
    }
  }
  return {
    ...stored.ref,
    width: stored.width,
    height: stored.height,
    thumb: await thumbnailOf(store, stored.ref, data, log),
    originalBytes: stored.originalBytes,
    note: stored.note,
  };
}

/**
 * The thumbnail of a stored picture, made once and remembered.
 *
 * @param store - the file store
 * @param ref - the stored picture
 * @param data - its bytes (or the original's, same pixels)
 * @param log - the logger
 * @returns the thumbnail, or null when it couldn't be made
 */
export async function thumbnailOf(store: FileStore, ref: FileRef, data: Uint8Array, log: ServerLog): Promise<FileRef | null> {
  const key = `${ref.hash}:thumb`;
  const before = await store.getDerived(key);
  if (before) return before.ref;
  const t0 = performance.now();
  try {
    const thumb = await store.put(await makeThumbnail(data), 'webp');
    await store.setDerived(key, { ref: thumb, note: null, width: null, height: null });
    log.info('files', 'Thumbnail made', { of: ref.hash.slice(0, 12), bytes: thumb.bytes, ms: Math.round(performance.now() - t0) });
    return thumb;
  } catch (e) {
    log.warn('files', 'Thumbnail failed', { of: ref.hash.slice(0, 12), error: String(e) });
    return null;
  }
}

/**
 * Looks up the thumbnail made for a stored picture.
 *
 * @param store - the file store
 * @param ref - the picture
 * @returns its thumbnail, or null when none was made
 */
export async function knownThumbnail(store: FileStore, ref: FileRef): Promise<FileRef | null> {
  return (await store.getDerived(`${ref.hash}:thumb`))?.ref ?? null;
}
