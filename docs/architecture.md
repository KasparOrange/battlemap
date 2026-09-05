# architecture

## system overview

the app turns a TV (laid flat) into a D&D battlemap. two devices connect through a VPS relay:

```
phone (safari)          VPS (72.62.88.197)          TV (xiaomi box)
┌──────────────┐        ┌──────────────┐            ┌──────────────┐
│ companion    │──ws────│ vtt_relay.py │────ws──────│ tv shell     │
│ (web build)  │        │ port 9090    │            │ (apk)        │
│              │──http──│ dev_server   │────http────│              │
│              │        │ port 4242    │            │              │
└──────────────┘        └──────────────┘            └──────────────┘
        │                                                   │
        └────── https ──▶  MwLog (VictoriaLogs + Caddy)  ◀───┘
                           srv1189697.hstgr.cloud/p/battlemap
                           (only the APK logs; the web build uses a stub)
```

## data flow

- **commands** flow phone → relay → TV (fog reveal, token place, door toggle, navigation)
- **state** flows TV → relay → phone (fullState broadcast every 50ms when paired)
- **maps** flow phone → VPS HTTP → TV HTTP download (large files bypass the relay); PDFs are rasterized to PNG on the phone first, so the TV only ever loads `.dd2vtt` or images
- **logs** flow TV (APK) → MwLog, our VictoriaLogs tenant `battlemap` on the same VPS (structured JSON lines, basic auth baked in at build time — `docs/setup.md` "logs"). The old `log_server.py` / `/tmp/battlemap.log` are retired (2026-09-05).

## TV storage

the TV stores everything persistently in its app documents directory (on the Apple TV dev target this is purgeable Caches — `docs/apple-tv-dev.md`):

```
<appDocDir>/
  maps/
    index.json              # map library index
    <uuid>.dd2vtt           # raw map files
    <uuid>_thumb.png        # lazy thumbnails
  sessions/
    <uuid>.json             # session state (fog, tokens, drawings, camera)
    <uuid>_thumb.png        # lazy thumbnails
```

## interaction model

the TV has no touch, no keyboard, no usable remote. the phone controls everything:
- screen navigation (library, game, settings)
- map loading, fog painting, drawing, token placement
- app updates

## interaction modes

single-finger gestures route to the active tool:
- **fog** — drag to reveal/hide fog cells (one `vtt.brushReveal` per cell entered), tap a door to toggle it
- **room** — tap a room to flood-fill reveal/hide it
- **draw** — freehand drawing with color/width
- **token** — tap to place, drag to move
- **measure** — drag to measure (line + distance synced to the TV), tap to clear
- **aoe** — tap places the panel's shape/size; drag aims a cone/line or moves a circle/square

two-finger gestures (any pointer count > 1, detected by pointer count — not by pinch scale)
always control the camera (pinch zoom + pan); the tool only starts on the first single-finger
move, so a late second finger never paints. Scroll wheel zooms (desktop). The ruler, when
visible, is draggable in every mode. Zoom is clamped to `[fit × 0.5, 10]`; the TV additionally
never goes below its calibrated zoom.

**Phone camera vs TV camera (since 2026-09-06):** the phone's view is independent. The TV
broadcasts its camera *and viewport size*; the phone draws it as a dashed gold frame. The
Camera tab offers "TV follows the phone" (throttled `vtt.setCamera`), "send this view", "match
TV", plus zoom/rotate buttons that act on the TV.

**DM panel** (`lib/ui/dm_control_panel.dart`): a bottom sheet — tab bar at the bottom edge
(thumb reach), content above it, tap the active tab to collapse. ≥ 44 px targets, 14 px text.
Sliders (draw width, scale) preview locally and send on release.

## rendering order (flame engine)

| priority | component | description |
|----------|-----------|-------------|
| 0 | map image | .dd2vtt image, uploaded PNG/JPG, or a PDF page rasterized on the phone |
| 1 | grid overlay | grid lines |
| 2 | strokes | completed drawings |
| 3 | live stroke | in-progress stroke preview |
| 4 | token layer | colored numbered circles |
| 5 | walls | DM debug lines |
| 6 | portals | door indicators |
| 10 | fog of war | dark overlay with reveal cutouts |
