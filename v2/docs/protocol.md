# battlemap v2 — protocol

Every message between the TV, its companions and the server, and every command the reducer
understands. The source of truth is the code: schemas in `shared/src/protocol/` and
`shared/src/model/` (valibot, with the TypeScript types inferred from them). This page is the
catalogue for humans, with the old app's names (`../../docs/relay-protocol.md`) mapped to the new.
Why the protocol has this shape is in [`architecture.md`](architecture.md) "sync".

## Conventions

- **JSON text frames over a WebSocket** (`/ws` on the server today, the TV's shell on the LAN
  later). One message per frame, always an object with a `type`.
- **Names** are `area.verb` in camelCase: `fog.apply`, `sync.snapshot`, `game.renameStored`.
- **Units are squares.** Positions, stroke points and widths, the ruler, the disc, effect anchors:
  map squares, (0, 0) the map's top-left corner, x right, y down. Pixels appear only for things
  that are pixels (a picture grid's `cellW`, the TV's viewport).
- **Squares as cells:** `row * cols + col`. **Fog masks** are base64 bit masks, one bit per cell,
  least significant bit first (`geometry/mask.ts`).
- **Colours** are `#rrggbb`. **Times** are epoch ms (`sent`, `at`) or ISO text (`createdAt`).
- **Explicit values, no toggles**: `door.set {open: true}`, not "toggle door". A duplicated or
  replayed message then does no harm, and a prediction can't flip the wrong way.
- **Ids** are made by whoever creates the thing (`newId()`, 12 characters of `[0-9a-z]`) and
  travel inside the command; the reducer never invents one.
- **Checking**: every receiver parses with the shared schemas (`parseToTv`, `parseToCompanion`,
  `checkServerMessage`); a message that fails is logged with the reason and ignored (a
  `sync.cmd` that fails gets `sync.rejected`). Unknown fields are dropped, so a newer sender
  can add optional fields without breaking an older receiver.
- **Why valibot** and not zod or hand-written guards: ~50 message types and ~25 model types
  want one declarative definition per type, with the TypeScript type derived from it (no drift
  between check and type). Hand-written guards would double the code and drift; zod (even
  zod/mini) is several times larger in the bundle. Valibot is modular — the TV bundle carries
  only the validators we use (a few kB) — and fast enough to check a full snapshot in a few ms.
- **Version**: `hello.protocol` = `PROTOCOL_VERSION` (1). A breaking change bumps it; the server
  refuses a mismatch with `server.error` and the client offers to reload.

## Layers and routing

| Layer | Between | Messages |
|---|---|---|
| control | a client and the server | `hello`, `ping` → `welcome`, `pong`, `peer.joined`, `peer.left`, `replaced`, `relay.undelivered`, `server.build`, `server.error` |
| peer | companion ↔ TV, routed by the server | `sync.*`, `lib.*`, `game.*`, `tv.*`, `diag.*`, `deploy.*` |
| command | inside `sync.cmd` / `sync.applied` | the reducer's commands (below) |

**Routing** (the server's whole job): a companion's peer message goes to its room's TV; a TV's
goes to every companion in the room, or to the one named in `to`. The server stamps `from` (the
sender's client id) and changes nothing else. A message it can't deliver comes back to the
sender as `relay.undelivered`. Every peer message may carry the **envelope**: `sent` (sender's
clock, ms — receivers log anything older than 1.5 s as late), `from`, `to`.

## Control messages

| Message | Direction | Fields |
|---|---|---|
| `hello` | client → server, first frame | `protocol`, `role` (`tv` \| `companion`), `room` (the table's id), `client` (this page's id: new on every page load, kept across reconnects of that page — so `seq` can restart at 1 safely), `name`, `build` |
| `welcome` | server → client | `client`, `room`, `role`, `peers` (`{client, role, name}[]`, everyone else), `build` (the app build the server serves, or null), `serverTime` |
| `ping` / `pong` | client → server → client | `t` (client clock, echoed), `serverTime` |
| `peer.joined` | server → room | `peer` |
| `peer.left` | server → room | `client`, `role` |
| `replaced` | server → the old TV, then closed | `by` (the new TV's name) — stop reconnecting until the DM taps "Take over" |
| `relay.undelivered` | server → sender | `msgType`, `seq` (of a `sync.cmd`), `reason` (`no-tv`, `no-such-client`, `rate-limited`) — the companion drops the command from its prediction and says why ("Too fast — that change was dropped" for `rate-limited`) |
| `server.build` | server → everyone | `build` — a newer app bundle is being served |
| `server.error` | server → client, then closed | `reason` (bad hello, protocol mismatch) |

```json
{"type":"hello","protocol":1,"role":"companion","room":"tbl-3f2a9c","client":"k2v9x3m7qa1b","name":"Tab A11+","build":"2026-10-25.ab12cd3"}
{"type":"welcome","client":"k2v9x3m7qa1b","room":"tbl-3f2a9c","role":"companion","peers":[{"client":"tv-7h2k","role":"tv","name":"Living-room TV"}],"build":"2026-10-25.ab12cd3","serverTime":1761400000000}
```

## Table code

The TV's home shows its **name** and a **table code**; the tablet's table picker shows the same
two for every TV online, so the DM picks by matching (qa#18). The code is `tableCode(room)` from
`@battlemap/shared` (`shared/src/util/table-code.ts`) — the room id's last four letters or
digits, upper case (`table-yf6kig4q` → `IG4Q`; fewer than four characters give what there is,
none gives `?`). It is display only: the room id stays the address, and both sides compute the
code from it, so they can't disagree. The name is the device's own (Android's "Device name"
from the shell; a browser's guess; `?name=` overrides), "This TV" when empty.

## Peer messages

### companion → TV

| Message | Fields | What the TV does |
|---|---|---|
| `sync.cmd` | `seq` (per sender, from 1, kept across reconnects), `cmd`, `onMap?` (the map the sender saw on the table, sent with map-scoped commands — `MAP_SCOPED_COMMANDS`) | applies it → `sync.applied` to all, or `sync.rejected` to the sender (also when `onMap` is no longer the map on the table, rv#28) |
| `sync.request` | — | `sync.snapshot` to the sender |
| `lib.list` | — | `lib.listing` to the sender |
| `game.open` | `gameId` | saves the open game, loads this one (from the server's backup if not on the TV), new epoch → `sync.snapshot` to all |
| `game.new` | `game: {id, name, createdAt, map, settings?}` | saves, starts the game (`newGame`), new epoch → `sync.snapshot` to all |
| `game.close` | — | saves, closes → snapshot with `game: null` |
| `game.delete` | `gameId` | deletes it on the TV and in the backup → `lib.listing` |
| `game.renameStored` | `gameId`, `name` | renames a stored game that isn't open → `lib.listing` |
| `diag.status` | — | `diag.report` to the sender |
| `deploy.prepare` | — | saves now → `deploy.ready` |
| `tv.reload` | — | saves, reloads the app (a new build), reopens its game |

**Lost commands (qa#6).** A command can vanish without a `relay.undelivered` — the TV page
reloading took it and died. So the companion keeps two rules besides the acks, and needs nothing
from the server: (1) when the TV leaves the room (`peer.left`) or its own link drops, every
pending command is rolled back from the prediction at once, with one notice; (2) a command not
echoed (`sync.applied`/`sync.rejected`) within **5 s** is rolled back the same way. Neither is
ever resent. A late echo still lands in the confirmed state — the TV's state is the truth — and
an unanswered `sync.request` is repeated every 3 s.

**Dev and test control (QA-03).** Tools speak the same peer messages as a companion — no extra
protocol: *status* = `diag.status` → `diag.report`; *prepare* = `deploy.prepare` → `deploy.ready`;
*resume* = `lib.list` → `game.open` of the newest game; *reload* = `tv.reload`.
`bun tools/tv-ctl.ts <status|prepare|resume|reload|list> --server … --table …` wraps them.

### TV → companion

| Message | Fields | Meaning |
|---|---|---|
| `sync.snapshot` | `epoch`, `rev`, `state` (`RootState`), `acks` (`{clientId: lastSeq}`) | the whole state; replaces the confirmed state and drops pending commands the acks cover (the rest: dropped with a notice, never resent) |
| `sync.applied` | `epoch`, `rev`, `by`, `seq`, `cmd` | the TV applied this command; apply it to the confirmed state if `rev` is the next one, else ask for a snapshot |
| `sync.rejected` | `seq`, `reason` | your command was refused; drop it from pending, show the reason |
| `lib.listing` | `games` (`GameSummary[]`: id, name, createdAt, savedAt, mapNames, activeMapName, thumb, where `tv`\|`server`\|`both`) | the games |
| `tv.status` | `busy` (text or null), `progress` (0–1 or null) | what the TV is doing ("Loading the tower…"), for the same progress on the tablet |
| `tv.notice` | `level` (`info`\|`warn`\|`error`), `text` | something to show the DM (a load that failed) |
| `diag.report` | `build`, `epoch`, `rev`, `gameId`, `activeMapId`, `table` (`"34x19"`), `uptimeS`, `heapMb` | the answer to `diag.status` |
| `deploy.ready` | `gameId` | saved; safe to update |

```json
{"type":"sync.cmd","seq":7,"sent":1761400001234,"cmd":{"type":"fog.apply","cells":[412,413,446],"value":"reveal","gesture":"p3k9a0b1c2d3"}}
{"type":"sync.applied","from":"tv-7h2k","epoch":"e8f2k1","rev":41,"by":"k2v9x3m7qa1b","seq":7,"cmd":{"type":"fog.apply","cells":[412,413,446],"value":"reveal","gesture":"p3k9a0b1c2d3"}}
```

## The state (what a snapshot carries)

`RootState` (`shared/src/model/root.ts`): `table` (calibration `widthInches`, `overscanPercent`,
`viewport`, `pattern {on, pivot}`), `game` (or null), `live` (`measure`, `stroke`, `shots`) and
`history` (`undo`, `redo`). A `Game` has `id`, `name`, `createdAt`, `settings` (`fogStyle`,
`fogEdgeInset`, `fogFade`, `effects`), `previewFirst`, `mapOrder`, `activeMapId` and `maps`: per map
id a `MapPlay` — `info` (`MapInfo`: name, kind, `picture`/`tableCopy`/`geometry` file refs, the
picture `grid`, `drawGrid`, `doorCount`, `drawDoors`, `libraryId`), `fog` (`on`, `revealed`,
`staged`, `live`), `doorsOpen`, `tokens`, `strokes`, `layers`, `ruler`, `disc`, `effects`, `view`
(`mode`, `col`, `row`, `quarterTurns`, `free`) and `showGrid`.

## Commands

Inside `sync.cmd` and `sync.applied`. All act on the open game's **map on the table** unless
they say otherwise; without a game they are refused ("No game is open."), except `table.*`.
*Undo* marks the commands that make an undo step; `gesture` merges consecutive steps into one.

| Command | Fields | Undo | Old name(s) |
|---|---|---|---|
| `fog.apply` | `cells`, `value` (`reveal`\|`hide`), `gesture`, `live?` (`start`\|`replace`) | yes, per gesture | `vtt.brushReveal`, `vtt.roomReveal` (+ `circle: new\|replace`), `vtt.toggleReveal` |
| `fog.all` | `value` | yes | `vtt.revealAll`, `vtt.hideAll` |
| `fog.enable` | `on` | — | `vtt.toggleFog` |
| `fog.preview` | `on` (game-wide; discards every staged preview) | — | `vtt.toggleShadowMode` |
| `fog.commit` / `fog.discard` | — | commit: yes | `vtt.commitShadow` / `vtt.clearShadow` |
| `door.set` | `index`, `open` | yes | `vtt.togglePortal` |
| `token.add` | `token` (`{id, label, name, color, col, row, placed, hidden}`) | yes | `vtt.addToken`, `vtt.createToken` (`placed: false`) |
| `token.move` | `id`, `col`, `row`, `gesture?` (places a waiting token) | yes, per gesture | `vtt.moveToken` |
| `token.update` | `id`, `name?`, `label?`, `color?`, `hidden?`, `placed?: false` | yes | `vtt.setTokenHidden`, `vtt.editToken` (name) |
| `token.remove` / `token.clear` | `id` / — | yes | `vtt.removeToken` / `vtt.clearTokens` |
| `draw.add` | `stroke` (`{id, points: [x0,y0,x1,y1,…], color, width}`) | yes | `vtt.addStroke` (+ `vtt.strokeEnd`) |
| `draw.remove` | `id` | yes | `vtt.undoStroke` (any stroke now) |
| `draw.clear` | — | yes | `vtt.clearDrawings` |
| `draw.live` | `stroke` or null (live, not saved) | — | `vtt.strokeUpdate` |
| `measure.set` | `line` (`{a, b}`) or null (live) | — | `vtt.setMeasure` |
| `ruler.set` | `ruler` (`{visible, x, y, rotation}`) — the whole value | — | `vtt.toggleRuler`, `vtt.setRulerPosition`, `vtt.rotateRuler` |
| `disc.set` | `disc` (the whole `TemplateDisc`) | — | `vtt.setTemplateDisc` (`center` gone: the tablet computes the TV's view) |
| `layers.set` | `layers` (`DmLayer[]`, bottom first) | — | `vtt.setDmOverlays` (`rev` gone: prediction handles it) |
| `view.mode` | `mode` (`table`\|`fit`\|`free`) | — | `vtt.setTvCameraMode`, `vtt.zoomToFit` |
| `view.window` | `col`, `row` (null = centred) | — | `vtt.setTableWindow` |
| `view.pan` | `dx`, `dy` (whole squares) | — | `vtt.panTable` |
| `view.rotate` | `quarterTurns` (0–3, the window keeps its centre) | — | `vtt.rotateCW`, `vtt.rotateCCW`, `vtt.resetRotation` |
| `view.free` | `x`, `y`, `zoom` (px per square) | — | `vtt.setCamera` outside the table view, `vtt.zoomIn`/`zoomOut` |
| `view.grid` | `on` | — | `vtt.toggleGrid` |
| `table.calibrate` | `widthInches` (clamped 10–90) | — | `vtt.calibrate` |
| `table.overscan` | `percent` (clamped 0–12) | — | `vtt.setOverscan` |
| `table.reset` | — | — | `vtt.resetCalibration` |
| `table.pattern` | `on`, `pivot?` | — | `vtt.showCalibration` |
| `table.viewport` | `width`, `height` (sent by the TV itself) | — | `camera.vw`/`vh` in `vtt.fullState` |
| `map.add` | `map` (`MapInfo`), `activate` | — | `lib.openSharedMap` with `intoGame` |
| `map.switch` | `mapId` | — | `vtt.switchMap` |
| `map.remove` | `mapId` (not the last) | — | new (a leftover of 2026-10-10) |
| `map.rename` | `mapId`, `name` | — | new |
| `map.regrid` | `grid` (`RasterGrid`), `drawGrid?` (same counts keep the fog) | — | `vtt.setMapGrid` |
| `fx.place` / `fx.remove` | `effect` (`PlacedEffect`) / `id` | — | new |
| `fx.trigger` | `shot` (`OneShot`, live — the last 8 kept) | — | `vtt.triggerEffect` |
| `game.rename` | `name` (the open game) | — | `lib.renameSession` |
| `game.settings` | `settings` (any of `fogStyle`, `fogEdgeInset`, `fogFade`, `effects`) | — | `vtt.updateSessionSettings` |
| `history.undo` / `history.redo` | — | — | `vtt.undo` / `vtt.redo` |

## Old messages that are gone, and why

| Old | Why it's gone |
|---|---|
| `register`, `registered`, `peer_connected`, `peer_disconnected`, `replaced` | → `hello`, `welcome`, `peer.joined`, `peer.left`, `replaced` (rooms instead of one global slot) |
| `vtt.fullState` (every 50 ms) | → one `sync.snapshot` on join, then `sync.applied` per command |
| `vtt.setMode`, `vtt.setBrushRadius`, `vtt.toggleRevealMode`, `vtt.setDrawColor`, `vtt.setDrawWidth`, `vtt.toggleWalls` | tool settings are local to the companion; commands carry explicit values |
| `vtt.mapUploaded`, `vtt.imageUploaded`, `vtt.pdfUploaded`, `vtt.downloadMap`, `vtt.mapStart`/`mapChunk`/`mapEnd` | maps are files by hash over HTTP; `MapInfo` travels in the state |
| `lib.getThumbnail`, `lib.thumbnail`, `lib.deleteMap`, `lib.requestList` | thumbnails and the map library are on the server (HTTP); games: `lib.list` |
| `nav.goToLibrary`, `nav.goToGame`, `nav.newSession`, `nav.goToSettings` | → `game.close`, `game.open`, `game.new`; the TV has no settings screen |
| `vtt.setAoe`, `vtt.clearAoe`, HP / conditions in `vtt.editToken` | digital mode is dormant; the template disc covers tabletop AoE |
| `vtt.setScaleFactor` | broke the one-inch rule (already ignored since 1.1.9) |
| `vtt.clearMap` | the TV never shows a game without a map now |
| `update.check`, `update.versionInfo`, `update.download`, `update.progress`, `patch.*` | the bundle is the update: `server.build` + `tv.reload` |
| `tv.log` | logs go to MwLog from every device directly |
| `tv.error`, `tv.rendering` | → `tv.notice`, `tv.status` |
| `bot` role | a test bot is just another companion now (several are allowed) |

## Over HTTP (server, for the record)

Not WebSocket messages, but part of the contract the server package implements:
`GET /health`; `POST /log` (mwlog-ts browser batches); `GET /api/tables` (rooms with a TV
online); `POST /files?ext=&format=` → `FileRef`, `GET /files/<hash>.<ext>` (immutable);
`GET|POST|DELETE /api/library` (`LibraryEntry`); `PUT|GET /api/games/<id>` and `GET /api/games`
(backups, `GameSummary`); `GET /api/fetch?url=` (a link's file, as the old `/fetch`).
