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

## what triggers auto-save

auto-save fires 2 seconds after the last state change. this batches rapid changes (like painting fog) into a single save. triggers:

- fog brush stroke completion (not per pixel — debounced)
- door toggle
- token add/move/remove
- drawing stroke completion
- calibration change
- camera movement that settles

## thumbnails

thumbnails are generated lazily — NOT on every save.

when the library view is displayed:
1. TV checks if thumbnail exists for each map/session
2. if not: `thumbnailAvailable: false` in the listing
3. TV generates missing thumbnails in the background
4. companion shows placeholder for items without thumbnails

## storage format

sessions are JSON files at `<appDocDir>/sessions/<uuid>.json`. the session references a map by ID (the map is stored separately in the library).

if a map is deleted, all its sessions are deleted too.
