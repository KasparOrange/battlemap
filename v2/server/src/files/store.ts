/**
 * The content-addressed file store: `files/<sha256>.<ext>` under the data folder. A file never
 * changes once written (its name is its content), so it is served as immutable and every device
 * caches it forever. Next to it, `derived.json` remembers what was made from a file — its
 * conversion for a "Store as" choice and its thumbnail — so the same upload is never re-encoded.
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileExt, FileRef } from '@battlemap/shared';
import { KeyedLock, readJsonFile, writeAtomic } from '../store/fsx.ts';

/** What was made from a source file, by key (`<hash>:<format>` or `<hash>:thumb`). */
export interface Derived {
  /** The made file. */
  ref: FileRef;
  /** What the conversion did, or null. */
  note: string | null;
  /** Its picture size, when it is a picture. */
  width: number | null;
  /** Its picture height. */
  height: number | null;
}

/** File names the store accepts: `<64 hex>.<ext>`. */
export const FILE_NAME = /^([0-9a-f]{64})\.(png|jpg|webp|json|pdf)$/;

/** The file store. */
export class FileStore {
  /** The folder of the files. */
  readonly dir: string;
  private readonly derivedPath: string;
  private derived: Record<string, Derived> | null = null;
  private readonly lock = new KeyedLock();

  /** @param dataDir - the server's data folder */
  constructor(dataDir: string) {
    this.dir = join(dataDir, 'files');
    this.derivedPath = join(dataDir, 'derived.json');
  }

  /**
   * The SHA-256 of bytes, as lowercase hex.
   *
   * @param data - the bytes
   * @returns 64 hex characters
   */
  static hash(data: Uint8Array): string {
    return new Bun.CryptoHasher('sha256').update(data).digest('hex');
  }

  /**
   * Where a file lives.
   *
   * @param hash - its hash
   * @param ext - its kind
   * @returns the path
   */
  path(hash: string, ext: FileExt): string {
    return join(this.dir, `${hash}.${ext}`);
  }

  /**
   * Stores bytes (a no-op when the same content is already there).
   *
   * @param data - the content
   * @param ext - its kind
   * @returns its reference
   */
  async put(data: Uint8Array, ext: FileExt): Promise<FileRef> {
    const hash = FileStore.hash(data);
    const path = this.path(hash, ext);
    if (!(await Bun.file(path).exists())) await writeAtomic(path, data);
    return { hash, ext, bytes: data.byteLength };
  }

  /**
   * Whether a file is stored (with the size its reference claims).
   *
   * @param ref - the reference
   * @returns true when the file exists with that size
   */
  async has(ref: FileRef): Promise<boolean> {
    try {
      return (await stat(this.path(ref.hash, ref.ext))).size === ref.bytes;
    } catch {
      return false;
    }
  }

  /**
   * Something made from a file before.
   *
   * @param key - `<hash>:<format>` or `<hash>:thumb`
   * @returns what was made, or null
   */
  async getDerived(key: string): Promise<Derived | null> {
    const all = await this.loadDerived();
    const d = all[key];
    return d && (await this.has(d.ref)) ? d : null;
  }

  /**
   * Remembers something made from a file.
   *
   * @param key - `<hash>:<format>` or `<hash>:thumb`
   * @param value - what was made
   */
  async setDerived(key: string, value: Derived): Promise<void> {
    await this.lock.run('derived', async () => {
      const all = await this.loadDerived();
      all[key] = value;
      await writeAtomic(this.derivedPath, JSON.stringify(all));
    });
  }

  private async loadDerived(): Promise<Record<string, Derived>> {
    this.derived ??= await readJsonFile<Record<string, Derived>>(this.derivedPath, {});
    return this.derived;
  }
}
