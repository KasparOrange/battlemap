/**
 * The v2 server's HTTP API as the v1 import uses it: upload a file, add a map to the shared
 * library, store a game backup (`docs/server.md` "routes"). Plain `fetch`, no retries — the
 * import is a one-shot tool run by hand, and a failure is reported per map or game.
 */
import type { FileExt, FileRef, Game, GameSummary, LibraryEntry, MapInfo, UploadResult } from '../../shared/src/index.ts';

/** The calls the import needs; `v2Server(base)` makes the real one, tests may fake it. */
export interface V2Server {
  /** The server's address (`http://127.0.0.1:5929`). */
  readonly base: string;
  /**
   * Uploads a file as it is (`POST /files?ext=`).
   *
   * @throws Error with the server's reason
   */
  uploadFile(blob: Blob, ext: FileExt): Promise<UploadResult>;
  /**
   * Adds (or replaces, same id) a map in the shared library (`POST /api/library`).
   *
   * @throws Error with the server's reason
   */
  addToLibrary(map: MapInfo, thumb: FileRef | null, addedAt?: string): Promise<LibraryEntry>;
  /** The shared library's entries by map id (`GET /api/library`). */
  library(): Promise<Map<string, LibraryEntry>>;
  /**
   * Stores a game as a backup (`PUT /api/games/<id>`) — a v2 TV lists it and opens it from there.
   *
   * @throws Error with the server's reason
   */
  putGame(game: Game): Promise<GameSummary>;
}

/** The error text of a refused answer. */
async function refusal(res: Response, what: string): Promise<Error> {
  let reason = '';
  try {
    const body = (await res.json()) as { error?: string };
    reason = body.error ?? '';
  } catch {
    // not JSON
  }
  return new Error(`${what}: HTTP ${res.status}${reason ? ` — ${reason}` : ''}`);
}

/**
 * The real v2 server.
 *
 * @param base - its address, without a trailing slash
 * @returns the client
 */
export function v2Server(base: string): V2Server {
  const root = base.replace(/\/+$/, '');
  return {
    base: root,
    async uploadFile(blob, ext) {
      const res = await fetch(`${root}/files?ext=${ext}`, { method: 'POST', body: blob, headers: { 'content-type': blob.type || 'application/octet-stream' } });
      if (!res.ok) throw await refusal(res, `upload ${ext}`);
      return (await res.json()) as UploadResult;
    },
    async addToLibrary(map, thumb, addedAt) {
      const body = { map, ...(thumb ? { thumb } : {}), ...(addedAt ? { addedAt } : {}) };
      const res = await fetch(`${root}/api/library`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw await refusal(res, 'library add');
      const out = (await res.json()) as { entry: LibraryEntry };
      return out.entry;
    },
    async library() {
      const res = await fetch(`${root}/api/library`);
      if (!res.ok) throw await refusal(res, 'library list');
      const out = (await res.json()) as { entries: LibraryEntry[] };
      return new Map(out.entries.map((e) => [e.map.id, e]));
    },
    async putGame(game) {
      const res = await fetch(`${root}/api/games/${encodeURIComponent(game.id)}`, { method: 'PUT', body: JSON.stringify(game), headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw await refusal(res, `backup of "${game.name}"`);
      return (await res.json()) as GameSummary;
    },
  };
}
