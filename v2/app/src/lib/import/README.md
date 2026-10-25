# import

Turns what the DM picks into an uploaded map in two steps: `importFile(file, onProgress)` reads it
and makes every file **without uploading** → `{ draft, needsGrid, detection, gridOrigin, note,
pictureBlob, upload({ grid, drawGrid, format }, onProgress) }`; `upload` runs once the squares dialog
is confirmed and answers `{ map: MapInfo, thumb }` — a cancelled import leaves nothing on the server.
Errors are `ImportError`s (`code` + a message the companion shows as a notice as is). Runs on the
companion only.

| Kind | What happens |
|---|---|
| `.dd2vtt` / `.uvtt` | parsed in the worker (`uvtt.ts`): picture out of the base64, walls (both sight lists), doors (portal bounds), lights (kept for dynamic lighting) in squares with `map_origin` subtracted, `battlemap.draw_doors` → a geometry JSON file. Squares exact, no dialog. |
| PDF | page 1 with pdf.js (lazy, its own worker under `/app/`), long side 4096 px, onto an OffscreenCanvas → bitmap transferred to the import worker → stored as WebP 0.95 (PNG without WebP), then like a picture |
| PNG / JPEG / WebP | header read (`sniff.ts`), decoded, grid detection (`grid-detect.ts`, port of `grid_detect.dart`), else squares from the file name (`name-counts.ts`), else 20 across (`grid-choice.ts`) — `needsGrid: true`, the squares dialog follows; `upload` remakes the table copy first when the chosen squares need another density |

Every map gets a **table copy** when its picture is over 72 px per square, 4096² px in all or 8192
on a side (`sizing.ts`), and a **288 px thumbnail**; then — on `upload` — picture, geometry, copy and thumbnail go
up through `$lib/api` `uploadFile` (`format` only for the picture).

**Threads.** A fresh worker per import (`worker-client.ts` → `worker.ts` → `prepare.ts`), ended
afterwards so a big picture's memory comes back at once. The main thread only slices the first
KB, renders the PDF (pdf.js slices its work) and uploads. The e2e (`e2e/import-worker.e2e.ts`)
checks no long task over 50 ms.

**Tests.** `bun test` here: detection (the Dart cases), parser, headers, sizes, the pipeline with
fakes, and the real test map set (`real-maps.test.ts`, `test_assets/maps/`, skipped where missing)
through `prepare.ts` with sharp as the picture engine (`test/sharp-backend.ts`).
