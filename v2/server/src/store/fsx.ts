/**
 * File-system helpers for the server's data: atomic writes (a reader never sees half a file,
 * a crash never leaves one), JSON reads that tolerate a missing file, and a per-key lock so two
 * requests never edit the same index at once.
 */
import { mkdir, rename, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

let tmpCounter = 0;

/**
 * Writes a file atomically: into a temp file next to it, then renamed over it.
 *
 * @param path - the file
 * @param data - its new content
 */
export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${++tmpCounter}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, path);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}

/**
 * Reads a JSON file.
 *
 * @param path - the file
 * @param fallback - what a missing file reads as
 * @returns the parsed content, or `fallback` when the file doesn't exist
 * @throws {SyntaxError} when the file exists but isn't JSON (a broken index must not be
 *   silently replaced by an empty one)
 */
export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw e;
  }
  return JSON.parse(text) as T;
}

/**
 * One-at-a-time sections per key: `lock.run('library', fn)` waits for every earlier call with
 * the same key to finish before `fn` starts.
 */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * Runs `fn` once every earlier section with this key has finished.
   *
   * @param key - what is being edited
   * @param fn - the section
   * @returns what `fn` returns
   */
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const before = this.tails.get(key) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(fn);
    this.tails.set(key, mine);
    try {
      return await mine;
    } finally {
      if (this.tails.get(key) === mine) this.tails.delete(key);
    }
  }
}
