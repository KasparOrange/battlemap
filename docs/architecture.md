# architecture

## system overview

the app turns a TV (laid flat) into a D&D battlemap. two devices connect through a VPS relay:

```
tablet/phone (apk)      VPS (72.62.88.197)          TV (xiaomi box)
┌──────────────┐        ┌──────────────┐            ┌──────────────┐
│ companion    │──ws────│ vtt_relay.py │────ws──────│ tv shell     │
│ (or web)     │        │ port 9090    │            │ (apk)        │
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
Hive boxes (lib/storage/map_library.dart):
  mapIndex     # map library index (MapLibraryEntry JSON per map id)
  mapFiles     # raw map files: .dd2vtt, image or PDF bytes
  sessions     # session state JSON (fog, tokens, drawings, camera, DM layer list)
  thumbnails   # PNG map thumbnails, key map_<id> (made lazily, docs/sessions.md)
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
Camera tab is split by the screen each button moves (2026-10-10): **Tablet** — "Fit on tablet",
"Jump to TV" (match the TV's view); **TV** — "TV follows the tablet" (throttled
`vtt.setCamera`), "Show my view on the TV", zoom with "Fit on TV", rotation.

**DM panel** (`lib/ui/dm_control_panel.dart`): a bottom sheet — tab bar at the bottom edge
(thumb reach), content above it, tap the active tab to collapse. On a **landscape tablet**
(`DmControlPanel.sideLayoutFor`: wider than tall, shortest side ≥ 600 dp) it docks at the right
edge instead: a 72 px tab rail with undo/redo at its foot, the tab content (320 px) unfolding to
its left; the map takes the rest of the row. ≥ 44 px targets, 14 px text. Sliders (draw width,
scale, layer opacity) preview locally and send on release. Bulk buttons (Reveal all, Hide all, Clear drawings)
confirm with a snackbar that offers Undo (`vtt.undo`).

**Fog tab:** Tool = Brush | Room (the interaction mode), Reveal | Hide, brush size (brush
only), "Players see changes: Instantly | Preview first" (shadow mode; staged squares are
applied or discarded under it), fog layer, reveal all / hide all.

**Ruler:** shown via `vtt.toggleRuler`, the TV places it in the middle of its own view, square
to its screen (`VttGame.centerRulerInView`); rotating turns it around the middle of the L
(`VttState.rotateRulerCW`); its numbers stay upright on every screen (`RulerComponent.labelAngle`
undoes ruler + camera rotation).

**DM layers (since 2026-10-10):** the Layers tab adds any number of pictures (PNG/JPG/WebP, PDF
page 1) that only the DM sees — a DM version of the map, notes, secrets. Each layer has an eye,
an opacity slider, up/down and delete (undo snackbar); a master eye hides them all on this
device. Pictures go phone → VPS (`uploads/dm/`, kept); the list (`DmOverlay`, metadata only)
lives in the TV's session and comes back in `vtt.fullState`. Only the phone's `VttGame` gets a
`DmOverlayImages` cache (download, decode ≤ 4096 px while visible, free when hidden), so only
the phone has a `DmOverlayComponent` — the TV cannot draw a layer whatever its state says.

## rendering order (flame engine)

| priority | component | description |
|----------|-----------|-------------|
| 0 | map image | .dd2vtt image, uploaded PNG/JPG, or a PDF page rasterized on the phone |
| 1 | grid overlay | grid lines |
| 2 | strokes | completed drawings |
| 3 | live stroke | in-progress stroke preview |
| 4 | token layer | colored numbered circles |
| 5 | walls | DM debug lines |
| 6 | portals | door markers — DM tablet only, the TV shows the map's painted doors (`PortalComponent.showMarker`); on maps with `draw_doors` (AI maps) a top-down door leaf that swings open, on every screen |
| 10 | fog of war | dark overlay with reveal cutouts (opaque on the TV, 70 % on the phone) |
| 12 | DM layers | **phone only**: DM-only pictures, each with eye + opacity, fitted into the map (aspect kept, centered); above the fog so secrets stay readable |
