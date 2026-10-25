# api

Typed client for the server's HTTP API. Import `api` (or `createApi`) from `index.ts`.

| Call | Route |
|---|---|
| `uploadFile(blob, { ext, format, signal }, onProgress) → UploadResult` (`FileRef` + width, height, thumb, originalBytes, note) | `POST /files?ext=&format=` (raw body; `asis` sends no format) |
| `downloadFile(ref, onProgress, signal) → Blob`, `fileUrl(ref)` | `GET /files/<hash>.<ext>` |
| `library.list() / add(entry) / remove(id)` | `GET`/`POST /api/library`, `DELETE /api/library/<id>` |
| `backups.put(game) / list() / get(id) / delete(id)` | `PUT`/`GET`/`DELETE /api/games/<id>`, `GET /api/games` |
| `fetchLink(url, onProgress, signal) → { blob, name, ext, kind }` | `GET /api/fetch?url=` → `{url, name, bytes, kind, ext}` (or 422 `{error}`), then `GET <url>` |

Every call: idle timeout (no byte moved for 15 s JSON / 30 s transfers / 60 s link fetch),
`AbortSignal`, retry with backoff 1–2–4 s on network errors, timeouts, 5xx and 429 (never on other
4xx, invalid answers or a cancel), answers checked with the shared schemas (broken list entries
skipped), log lines in area `api` (start, done with ms and bytes, failures with kind and status).
Errors are `ApiError` (`kind`, `status`, `retryable`; cancelled = name `AbortError`);
`describeError(err)` gives the words for a notice. Uploads use XHR in browsers (upload
progress), `fetch` with a counting stream elsewhere; downloads use `fetch` streams.
