# relay protocol

all messages are JSON objects sent through the VPS WebSocket relay. the relay forwards messages verbatim between the table (TV) and companion (phone). no state is stored on the relay.

## connection lifecycle

```
client → relay:  {"type": "register", "role": "table"|"companion"}
relay → client:  {"type": "registered", "role": "...", "paired": true|false}
relay → client:  {"type": "peer_connected"}
relay → client:  {"type": "peer_disconnected"}
relay → client:  {"type": "replaced", "role": "..."}   (to the OLD client, right before closing it)
```

one slot per role, last registration wins (a restarted TV takes over its own zombie). the
replaced client gets `replaced` and **stops auto-reconnecting** (`RelayConnectionState.replaced`):
before 2026-10-10 two devices in one role took the slot from each other every second, both
badges flashing. the TV then shows "Another TV took over" + a focused "Take over" button, the
companion a "Reconnect" snackbar / button; both call `connect()` to claim the slot back.
clients older than that ignore `replaced` and keep the old swap behaviour.

**bot role** (test automation, `tools/bench_bot.py`): `{"type": "register", "role": "bot"}` sits
next to the companion instead of replacing it. bot → table; table → companion **and** bot. the
bot never takes part in pairing (no `peer_connected`/`peer_disconnected` for it), so the TV
still only broadcasts `vtt.fullState` while a real companion is paired.

## heartbeat

```
either → either:  {"type": "ping"}
either → either:  {"type": "pong"}
```

relay sends ping every 20s. client sends ping every 15s. zombie detection at 30-45s of silence.

## navigation (companion → table)

```
{"type": "nav.goToLibrary"}
{"type": "nav.goToGame", "mapId": "uuid", "sessionId": "uuid"}
{"type": "nav.newSession", "mapId": "uuid", "name": "Session 1"}
{"type": "nav.goToSettings"}
```

## library (companion → table)

```
{"type": "lib.requestList"}
{"type": "lib.deleteMap", "mapId": "uuid"}
{"type": "lib.deleteSession", "sessionId": "uuid"}
{"type": "lib.renameSession", "sessionId": "uuid", "name": "new name"}
{"type": "lib.getThumbnail", "mapId": "uuid"}     // since 2026-10-10; ignored if the map has none
```

## library (table → companion)

```
{"type": "lib.listing", "maps": [...], "sessions": [...]}
{"type": "lib.thumbnail", "mapId": "uuid", "png": "<base64 PNG, longest side 288 px>"}   // since 2026-10-10
```

Each listed map carries `thumbnailAvailable`. The companion asks for those once per app run
(`lib.getThumbnail`); the TV makes missing ones after every listing while it shows the library
and pushes each `lib.thumbnail` unasked as soon as it's ready (`docs/sessions.md` "thumbnails").

## map transfer

### upload UVTT (phone → VPS → TV)
1. phone HTTP PUTs file to `http://VPS:4242/upload/<filename>`
2. phone sends: `{"type": "vtt.mapUploaded", "url": "http://...", "displayName": "..."}`
3. TV HTTP GETs the file from the URL

### upload PDF or image (phone → VPS → TV) — since 1.1.3
1. **PDF only:** phone renders page 1 to PNG itself (pdfrx PDFium-WASM, ≤ 4096 px) — the TV never
   sees a PDF, so it needs no PDF engine (Apple TV has none)
2. phone shows the map-squares dialog (no embedded grid metadata; since 1.1.9 with the picture's
   size, rows following the columns, how the map sits on the 34 × 19 table, and "the picture has
   its own grid lines")
3. phone HTTP PUTs the PNG/JPG/WebP to `http://VPS:4242/upload/<name>.png`
4. phone sends: `{"type": "vtt.imageUploaded", "url": "http://...", "displayName": "map.png", "gridCols": 20, "gridRows": 15, "hasGrid": true}`
   — `hasGrid` (since 1.1.9, optional): the picture has grid lines of its own, so the TV draws
   none (remembered on the map entry as `drawGrid: false`)
   — `grid` (since 1.1.10, optional): where the squares lie on the picture, a `RasterGrid`
   `{"x": 0.0, "y": 0.0, "w": 32.0, "h": 32.0, "cols": 40, "rows": 30, "pw": 1280, "ph": 960}`
   (top-left corner, square width/height in picture px, counts, picture size); it wins over
   `gridCols`/`gridRows`. Without it the counts stretch over the whole picture
5. TV HTTP GETs the image, loads it as a map

The grid lives only in the TV's library entry. The companion gets just the picture (chunks on
a new or resumed session, `vtt.downloadMap` on a reconnect) and takes the grid from
`vtt.fullState` `gridCols`/`gridRows` and `rasterGrid` (since 1.1.10, the picture grid, same
shape as `grid` above); when a later state names a different grid it re-grids
the picture (`VttState.applyRemoteGrid`, since 1.1.8 — before, it kept the previous map's grid
and a downloaded image map failed to load at all).

Legacy (phone builds < 1.1.3): `vtt.pdfUploaded` with the raw PDF; the TV renders page 1 with
pdfrx. Still handled by the TV; fails on tvOS.

### DM layer pictures (phone → VPS only) — since 1.1.6
1. phone HTTP PUTs a PNG/JPG/WebP (PDFs rasterized to PNG first) to `http://VPS:4242/upload/dm/<name>`
2. the dev server stores it in `uploads/dm/` — **kept**, the 7-day cleanup only touches top-level uploads
   (an older dev server ignores the `dm/` prefix and stores it top-level, 7-day expiry)
3. phone adds the layer and sends `vtt.setDmOverlays` (below); **the TV never downloads the picture**

### download (TV → phone, for session resume)
```
table → companion:  {"type": "vtt.downloadMap", "url": "http://...", "displayName": "..."}
```
companion downloads from VPS via HTTP.

### chunked transfer (fallback, if no VPS URL)
```
{"type": "vtt.mapStart", "chunks": 58, "displayName": "map.dd2vtt"}
{"type": "vtt.mapChunk", "i": 0, "d": "<base64 chunk>"}
...
{"type": "vtt.mapEnd"}
```

## fog commands (companion → table)

```
{"type": "vtt.toggleFog"}
{"type": "vtt.toggleRevealMode"}
{"type": "vtt.setBrushRadius", "radius": 1}
{"type": "vtt.revealAll"}
{"type": "vtt.hideAll"}
{"type": "vtt.toggleReveal", "index": 42}
{"type": "vtt.brushReveal", "indices": [42, 43, 44]}
{"type": "vtt.roomReveal", "cells": [42, 43, 44]}
```

`vtt.roomReveal` carries the squares of a Room or Circle tap, worked out on the tablet
(`WallGrid.floodFill` / `floodFillWithin`, walls and closed doors stop both); the TV reveals or
hides them by its Reveal | Hide setting, staged when "Preview first" is on. The circle's radius
never travels — it is the tablet's own setting.

## door commands (companion → table)

```
{"type": "vtt.togglePortal", "index": 3}
```

## drawing commands (companion → table)

```
{"type": "vtt.setMode", "mode": "token"|"fogReveal"|"roomReveal"|"circleReveal"|"draw"|"measure"|"aoe"}
{"type": "vtt.addStroke", "stroke": {"points": [[x,y],...], "color": "ffe53935", "width": 3.0}}   // color = ARGB hex string
{"type": "vtt.strokeUpdate", "stroke": {...}|null}
{"type": "vtt.strokeEnd"}
{"type": "vtt.clearDrawings"}
{"type": "vtt.undoStroke"}
{"type": "vtt.setDrawColor", "color": 0xFFE53935}
{"type": "vtt.setDrawWidth", "width": 4.0}
```

## token commands (companion → table)

```
{"type": "vtt.addToken", "gridX": 5, "gridY": 3}
{"type": "vtt.moveToken", "id": "uuid", "gridX": 6, "gridY": 3}
{"type": "vtt.removeToken", "id": "uuid"}
{"type": "vtt.clearTokens"}
```

## view commands (companion → table)

```
{"type": "vtt.toggleGrid"}
{"type": "vtt.toggleWalls"}
```

## camera commands (companion → table)

```
{"type": "vtt.zoomIn"}
{"type": "vtt.zoomOut"}
{"type": "vtt.zoomToFit"}
{"type": "vtt.rotateCW"}
{"type": "vtt.rotateCCW"}
{"type": "vtt.resetRotation"}
{"type": "vtt.setCamera", "x": 1200.0, "y": 800.0, "zoom": 0.6, "angle": 0.0}   // since 1.1.5
```

`vtt.zoomIn`/`zoomOut` leave the table view (`tvCameraMode` → `free`); `vtt.zoomToFit` is the
whole-map view (`fit`). Rotation snaps to quarter turns; in the table view the window keeps its
centre. `vtt.setCamera` sets the TV camera to an absolute transform (world center, zoom
clamped to `[fit × 0.5, 10]`, angle in radians) — **in the table view only the centre counts**:
the window moves there in whole squares, one inch per square stays. The phone sends it once for
"Show my view on the TV" and throttled (≥ 80 ms apart) while "TV follows the tablet" is on. **The
phone camera is independent of the TV camera** — the phone never applies the broadcast camera
to its own view, it draws it as a dashed frame (see `camera.vw`/`vh` below).

### table view (companion → table) — since 1.1.9

```
{"type": "vtt.setTvCameraMode", "mode": "table"|"fit"|"free"}   // 1-inch table / whole map / leave alone
{"type": "vtt.setTableWindow", "col": 12, "row": 4}   // window's first square (map axes); TV clamps, a fitting axis stays centred
{"type": "vtt.panTable", "dx": 1, "dy": 0}            // move the window by whole squares
{"type": "vtt.calibrate", "tvWidthInches": 34.5}      // the TV's picture is this wide → stored on the TV, every game
{"type": "vtt.resetCalibration"}                      // back to 34.5 in = 34 × 19 squares
{"type": "vtt.showCalibration", "on": true}           // the TV's one-inch squares + 10-inch measuring bar
{"type": "vtt.setMapGrid", "cols": 50, "rows": 50, "grid": {…}}  // re-grid the open picture/PDF map; optional grid = RasterGrid (upload above); same counts keep the fog
```

`architecture.md` "table view" has the model. Before 1.1.9 `vtt.calibrate` set a per-session
calibration (the value meant the same: the screen's width in inches) and `vtt.setScaleFactor`
multiplied the zoom (0.5–2.0); the TV now ignores `vtt.setScaleFactor`.

## tool overlays (companion → table)

```
{"type": "vtt.setMeasure", "x1": 100.0, "y1": 200.0, "x2": 500.0, "y2": 200.0}   // since 1.1.5
{"type": "vtt.setMeasure"}                                                        // no coords = clear
{"type": "vtt.setAoe", "shape": "circle"|"cone"|"line"|"square", "originX": 5.5, "originY": 3.0, "radius": 4.0, "angle": 0.0}
{"type": "vtt.clearAoe"}
{"type": "vtt.toggleRuler"}                              // on show, the TV centres the ruler in its view
{"type": "vtt.setRulerPosition", "x": 3.25, "y": 7.5}   // corner, grid squares; sent while dragging the ruler on the phone
{"type": "vtt.rotateRuler"}
{"type": "vtt.undo"}
{"type": "vtt.redo"}
```

Measure coordinates are world pixels; AoE origin/radius and ruler position are grid squares.

## DM layers (companion → table) — since 1.1.6

```
{"type": "vtt.setDmOverlays", "rev": 1760112000000, "overlays": [
  {"id": "uuid", "name": "dm-map.png", "url": "http://72.62.88.197:4242/uploads/dm/ab12cd34ef56.png", "visible": true, "opacity": 0.6}
]}
```

DM-only pictures layered over the map **on the phone only**. The phone sends the whole list
(bottom layer first) after every edit — add, remove, reorder, eye, opacity (on slider release).
The TV stores it with the session and echoes it in `vtt.fullState` (`dmOverlays`,
`dmOverlaysRev`), so a reloaded phone gets its layers back — but it never downloads or draws
the pictures (its `VttGame` has no `DmOverlayImages`).

`rev` is the phone's edit revision (milliseconds, strictly increasing). Until a broadcast echoes
the phone's last `rev` (or 3 s pass), the phone ignores the TV's list, so a broadcast that left
the TV before the edit arrived cannot flash the old list back. A TV build without layer support
ignores the command and omits the fields; the phone then keeps its list in memory only.

## state broadcast (table → companion)

sent every 50ms when state changes:

```json
{
  "type": "vtt.fullState",
  "tvView": "game",
  "activeMapId": "uuid",
  "activeSessionId": "uuid",
  "hasMap": true,
  "revealedCells": [0, 1, 42, ...],
  "openPortals": [0, 3],
  "showGrid": true,
  "fogEnabled": true,
  "tokens": [{"id": "...", "gridX": 5, "gridY": 3, "color": 0xFFE53935, "label": "1"}],
  "strokes": [...],
  "interactionMode": "fogReveal",
  "canUndo": true,  "canRedo": false,                      // since 1.1.5 — the TV's undo stacks; the phone's buttons read these
  "measure": {"x1": 100.0, "y1": 200.0, "x2": 500.0, "y2": 200.0} | null,   // since 1.1.5
  "camera": {"x": 100.0, "y": 200.0, "zoom": 0.5, "angle": 0.0, "vw": 1920.0, "vh": 1080.0},  // vw/vh (viewport px) since 1.1.5
  "tvWidthInches": 34.5,                // since 1.1.9: the TV's calibration (picture width)
  "tvCameraMode": "table",              // table | fit | free
  "tableCol": 13, "tableRow": null,     // window's first square; null = centred (map fits that axis)
  "tableCols": 34, "tableRows": 19,     // whole one-inch squares on the TV screen
  "showCalibration": false,
  "dmOverlays": [{"id": "...", "name": "...", "url": "...", "visible": true, "opacity": 0.6}],   // since 1.1.6 — see "DM layers"
  "dmOverlaysRev": 1760112000000
}
```

Older TV builds omit `canUndo`/`canRedo` (the phone then falls back to its local stack),
`measure` and `vw`/`vh` (no TV frame is drawn); before 1.1.9 the table fields (the phone then
assumes the 1-inch table at 34 × 19). Since 1.1.9 a TV camera move alone (a map laid out on the
table, a zoom) also triggers a broadcast.

## rolling deploy (since 1.1.6+16) — `tools/deploy.sh`

```
bot → table:        {"type": "deploy.prepare"}
table → companion+bot: {"type": "deploy.ready", "view": "game", "mapId": "uuid", "sessionId": "uuid"}
```

`deploy.prepare`: the TV saves the session and its restore snapshot now and shows "Updating…";
`deploy.ready` tells the script to install and the companion to show "TV is updating". The
script reads `diag.status` before (view/map/session) and polls it after the relaunch until
the same session is open again. See `setup.md` "rolling deploy".

**Companion takeover:** when a companion replaces another one, the relay sends the TV a second
`peer_connected` while it is already paired; since 1.1.6+16 the TV then resends library, map and
state (`VttRelayClient.onPeerReconnected`). Older TVs left the new companion on "Connected to TV"
— workaround: `nav.goToGame` with the open session (`tools/tv_ctl.py resume MAP SESSION`).

## update commands

```
companion → table:  {"type": "update.check"}
table → companion:  {"type": "update.versionInfo", "currentVersion": "1.0.8+9", "availableVersion": "1.0.12+13", "hasUpdate": true}
companion → table:  {"type": "update.download"}
table → companion:  {"type": "update.progress", "progress": 0.45, "status": "Downloading..."}
```

## diagnostics

```
companion → table:  {"type": "diag.status"}
table → companion:  {"type": "diag.statusResponse", "view": "library", "mapCount": 3, ...}
```

## logging (table → companion)

```
{"type": "tv.log", "msg": "human readable log message"}
{"type": "tv.error", "msg": "error description"}
```
