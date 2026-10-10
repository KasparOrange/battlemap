# sessions

## what is a session

a session is a saved gameplay state on top of a map. it stores everything the DM has set up: revealed fog, open doors, placed tokens, drawings, camera position, calibration.

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
| `tvWidthInches` | TV calibration |
| `calibratedBaseZoom` | calculated zoom from calibration |
| `cameraX/Y/zoom/angle` | camera position and orientation |
| `interactionMode` | active tool (fog/draw/token) |
| `drawColor/drawWidth` | drawing tool settings |
| `dmOverlayData` | DM-only picture layers (id, name, VPS url, visible, opacity) — stored for the phone, never drawn on the TV |

## what triggers auto-save

auto-save fires 2 seconds after the last state change. this batches rapid changes (like painting fog) into a single save. a pending save is flushed immediately before the session changes (new session, resume, back to the library) — before 2026-10-10 a switch inside the 2 s window lost the last edits. triggers:

- fog brush stroke completion (not per pixel — debounced)
- door toggle
- token add/move/remove
- drawing stroke completion
- calibration change
- camera movement that settles

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

sessions are JSON files at `<appDocDir>/sessions/<uuid>.json`. the session references a map by ID (the map is stored separately in the library).

if a map is deleted, all its sessions are deleted too.
