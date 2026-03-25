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
└──────────────┘        │ log_server   │            └──────────────┘
                        │ port 4243    │
                        └──────────────┘
```

## data flow

- **commands** flow phone → relay → TV (fog reveal, token place, door toggle, navigation)
- **state** flows TV → relay → phone (fullState broadcast every 50ms when paired)
- **maps** flow phone → VPS HTTP → TV HTTP download (large files bypass the relay)
- **logs** flow both → VPS log server (structured JSONL)

## TV storage

the TV stores everything persistently in its app documents directory:

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
- **fog** — drag to reveal/hide fog cells
- **draw** — freehand drawing with color/size
- **token** — tap to place, drag to move

two-finger gestures always control the camera (pinch zoom + pan).

## rendering order (flame engine)

| priority | component | description |
|----------|-----------|-------------|
| 0 | map image | .dd2vtt or PDF background |
| 1 | grid overlay | grid lines |
| 2 | strokes | completed drawings |
| 3 | live stroke | in-progress stroke preview |
| 4 | token layer | colored numbered circles |
| 5 | walls | DM debug lines |
| 6 | portals | door indicators |
| 10 | fog of war | dark overlay with reveal cutouts |
