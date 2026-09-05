# relay protocol

all messages are JSON objects sent through the VPS WebSocket relay. the relay forwards messages verbatim between the table (TV) and companion (phone). no state is stored on the relay.

## connection lifecycle

```
client → relay:  {"type": "register", "role": "table"|"companion"}
relay → client:  {"type": "registered", "role": "...", "paired": true|false}
relay → client:  {"type": "peer_connected"}
relay → client:  {"type": "peer_disconnected"}
```

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
```

## library (table → companion)

```
{"type": "lib.listing", "maps": [...], "sessions": [...]}
```

## map transfer

### upload UVTT (phone → VPS → TV)
1. phone HTTP PUTs file to `http://VPS:4242/upload/<filename>`
2. phone sends: `{"type": "vtt.mapUploaded", "url": "http://...", "displayName": "..."}`
3. TV HTTP GETs the file from the URL

### upload PDF or image (phone → VPS → TV) — since 1.1.3
1. phone shows grid config dialog (no embedded grid metadata)
2. **PDF only:** phone renders page 1 to PNG itself (pdfrx PDFium-WASM, ≤ 4096 px) — the TV never
   sees a PDF, so it needs no PDF engine (Apple TV has none)
3. phone HTTP PUTs the PNG/JPG/WebP to `http://VPS:4242/upload/<name>.png`
4. phone sends: `{"type": "vtt.imageUploaded", "url": "http://...", "displayName": "map.png", "gridCols": 20, "gridRows": 15}`
5. TV HTTP GETs the image, loads it as a map

Legacy (phone builds < 1.1.3): `vtt.pdfUploaded` with the raw PDF; the TV renders page 1 with
pdfrx. Still handled by the TV; fails on tvOS.

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
```

## door commands (companion → table)

```
{"type": "vtt.togglePortal", "index": 3}
```

## drawing commands (companion → table)

```
{"type": "vtt.setMode", "mode": "fogReveal"|"draw"|"token"}
{"type": "vtt.addStroke", "stroke": {"points": [[x,y],...], "color": 0xFFE53935, "width": 3.0}}
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
{"type": "vtt.calibrate", "tvWidthInches": 43.0}
{"type": "vtt.resetCalibration"}
{"type": "vtt.setCamera", "x": 1200.0, "y": 800.0, "zoom": 0.6, "angle": 0.0}   // since 1.1.5
{"type": "vtt.setScaleFactor", "factor": 1.25}   // fine-tune on top of calibration, 0.5–2.0
```

`vtt.setCamera` sets the TV camera to an absolute transform (world center, zoom clamped to the
TV's calibrated minimum, angle in radians). The phone sends it once for "send this view to the
TV" and throttled (≥ 80 ms apart) while "TV follows the phone" is on. **The phone camera is
independent of the TV camera** — the phone never applies the broadcast camera to its own view,
it draws it as a dashed frame (see `camera.vw`/`vh` below).

## tool overlays (companion → table)

```
{"type": "vtt.setMeasure", "x1": 100.0, "y1": 200.0, "x2": 500.0, "y2": 200.0}   // since 1.1.5
{"type": "vtt.setMeasure"}                                                        // no coords = clear
{"type": "vtt.setAoe", "shape": "circle"|"cone"|"line"|"square", "originX": 5.5, "originY": 3.0, "radius": 4.0, "angle": 0.0}
{"type": "vtt.clearAoe"}
{"type": "vtt.toggleRuler"}
{"type": "vtt.setRulerPosition", "x": 3.25, "y": 7.5}   // corner, grid squares; sent while dragging the ruler on the phone
{"type": "vtt.rotateRuler"}
{"type": "vtt.undo"}
{"type": "vtt.redo"}
```

Measure coordinates are world pixels; AoE origin/radius and ruler position are grid squares.

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
  "camera": {"x": 100.0, "y": 200.0, "zoom": 0.5, "angle": 0.0, "vw": 1920.0, "vh": 1080.0}   // vw/vh (viewport px) since 1.1.5
}
```

Older TV builds omit `canUndo`/`canRedo` (the phone then falls back to its local stack),
`measure` and `vw`/`vh` (no TV frame is drawn).

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
