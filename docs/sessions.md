# sessions

## what is a session

a session is a saved gameplay state on top of a map. it stores everything the DM has set up: revealed fog, open doors, placed tokens, drawings, camera position, and how the map goes on the table (its scale, whether we draw a grid). the TV's own calibration (how wide its picture is) is not in the session — it belongs to the TV (`architecture.md` "table view").

sessions are stored on the TV's local disk and survive app restarts and updates.

## lifecycle

1. **create** — DM taps "play" on a map in the library → new session created with default state
2. **play** — DM reveals fog, places tokens, draws, toggles doors
3. **auto-save** — every meaningful action triggers a 2-second debounce timer → session written to disk
4. **pause** — DM taps "back to library" → session is saved, TV shows library
5. **resume** — DM taps a session → all state restored (fog, tokens, drawings, camera)
6. **delete** — DM deletes session from library

## what gets saved

| field | description |
|-------|-------------|
| `revealedCells` | set of fog cell indices that are revealed |
| `openPortals` | set of door indices that are open |
| `tokens` | list of tokens (id, position, color, label) |
| `strokes` | list of drawing strokes (points, color, width) |
| `showGrid` | grid overlay on/off |
| `fogEnabled` | fog on/off |
| `showWalls` | wall debug view on/off |
| `brushRadius` | fog brush size |
| `revealMode` | reveal vs hide mode |
| `tvCameraMode` | how the TV frames the map: `table` (1 inch per square, default), `fit` (whole map), `free` |
| `tableCol` / `tableRow` | first square of the TV's table window on a map bigger than 34 × 19 (`null` = centred) |
| `mapFit` | how this map goes on the table, written on every save: `cellPx` (map px per square), `cols`/`rows`, `tvZoom` (TV zoom for one inch), `screenWidthInches` + `pxPerInch` (the TV calibration it was computed for), `tableCols`/`tableRows` (34 × 19), `fitsTable`, `drawGrid` (false = the picture has its own grid lines). informational — the TV recomputes the scale from its current calibration on load |
| `cameraX/Y/zoom/angle` | camera position and orientation |
| `interactionMode` | active tool (fog/draw/token) |
| `drawColor/drawWidth` | drawing tool settings |
| `dmOverlayData` | DM-only picture layers (id, name, VPS url, visible, opacity) — stored for the phone, never drawn on the TV |

## several maps in one game (since 2026-10-10)

a session can hold more than one map. `mapId` is the map on the table and the fields above are
its state; `mapIds` lists every map of the game in the order it joined, and `parkedMaps` keeps the
state of each other map by map id — the per-map fields (`Session.perMapKeys`: fog, doors, grid
and fog switches, table window, `mapFit`, tokens, drawings, map kind, ruler, template disc, DM
layers, camera).
switching (`Session.switchTo`) parks the table's map and brings the target's state back, or a
fresh start for a map new to the game. name, settings, brush, draw colour and interaction mode
belong to the game and carry over. sessions saved earlier load with one map.

the library lists a game under the map on its table. deleting a map from the TV's library removes
it from every game holding it (`Session.withoutMap`); a game whose only map it was is deleted, one
that had it on the table moves on to its first other map.

## what triggers auto-save

auto-save fires 2 seconds after the last state change. this batches rapid changes (like painting fog) into a single save. a pending save is flushed immediately before the session changes (new session, resume, back to the library) — before 2026-10-10 a switch inside the 2 s window lost the last edits. triggers:

- fog brush stroke completion (not per pixel — debounced)
- door toggle
- token add/move/remove
- drawing stroke completion
- table window moved, TV view switched (1-inch table / whole map), any TV camera move
- camera movement that settles

sessions saved before 1.1.9 carried `tvWidthInches`, `calibratedBaseZoom` and `scaleSliderFactor`;
they are ignored now and such sessions open on the 1-inch table.

## per map, not per session

the library entry remembers whether battlemap draws its grid over the map (`drawGrid`, from the
upload dialog's "the picture has its own grid lines" and from every grid toggle) — a new session
on the map starts that way. a picture/PDF map's squares — the count (`pdfGridCols`/`pdfGridRows`)
and where they lie on the picture (`rasterGrid`, a `RasterGrid`: position, square width/height)
— can be changed in a game (Settings ▸ Grid: the grid editor or "Map squares") and stay on the map.
the session's fog survives a fine adjustment with the same counts; new counts clear it.

## thumbnails

map thumbnails (built 2026-10-10, `lib/storage/map_thumbnails.dart`) are generated lazily — NOT
on every save:

1. every library listing reports `thumbnailAvailable` per map
2. after the listing the TV makes the missing ones, one map at a time and only while it shows the
   library (reading a big `.dd2vtt` costs memory a game needs on the 2 GB box): the `.dd2vtt`'s
   image is extracted in a background isolate and decoded straight to 288 px on the long side,
   then stored as PNG in the `thumbnails` Hive box and pushed as `lib.thumbnail`
3. the companion asks for available ones (`lib.getThumbnail`) and shows the map icon until one
   arrives. PDF maps get none; a map whose picture can't be decoded isn't retried until restart

session thumbnails (with the fog) are not built; the library's "Continue" card uses the map's.

## library on the companion

- a **Continue** card on top resumes the most recently played session in one tap
- each map row shows its thumbnail; new sessions are named "Session N · Sat 10 Oct" (number on
  this map + the day it started) so game nights can be told apart without renaming

## storage format

sessions are JSON strings in the Hive box `sessions`, keyed by uuid. the session references a map by ID (the map is stored separately in the library, box `mapFiles`).

if a map is deleted, games that hold other maps keep those (see "several maps in one game");
games on that map alone are deleted.
