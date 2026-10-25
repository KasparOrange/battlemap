# storage

The device's IndexedDB (database `battlemap`) and game export / import. Import from `index.ts`.

| File | What |
|---|---|
| `db.ts` | opening the database, the versioned schema (`MIGRATIONS`, append-only), promise helpers, `isQuotaError` |
| `games.ts` | `games.list() / get(id) / put(game) / delete(id)` — whole games, checked on read (a broken record is skipped, not fatal) |
| `settings.ts` | `settings.get(key) / put(key, v)` — the TV's calibration, remembered looks, Store-as; names in `SETTING` |
| `files.ts` | `files.get(ref, onProgress, signal) → Blob` — cache by content hash, download on a miss (shared between callers), LRU eviction within the budget (≤ 768 MB, ≤ half the quota), quota handling |
| `persist.ts` | `navigator.storage.persist()` + usage log |
| `bundle.ts` | `.battlemap` files: `exportGame`, `readGameBundle`, `importGame`, `saveBlob` (format and why in the file's top comment) |
| `storage.ts` | `createStorage(…)` builds the three stores on one database (tests use it with fake-indexeddb) |

Quota problems are logged (area `storage`) and shown through the kit's notice store (throttled to
once a minute per text). Small preferences (mode, last table) stay in localStorage (`config.ts`).
See `docs/architecture.md` "persistence".
