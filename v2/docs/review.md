# battlemap v2 — code review of wave 2

Reviewed 2026-10-25 against `CLAUDE.md` (code rules), `architecture.md`, `protocol.md` and
`server.md`. Read-only on code; checked by reading and by small probes (noted where). The type
checks pass everywhere (`bun run check`: shared, server, app — svelte-check 0 errors, 0
warnings), every export and every Svelte component carries its doc comment, and there is no
`console.*`, `any` or `@ts-ignore` in the sources. What follows is what that doesn't catch.

**Counts:** 0 blocker · 8 major · 22 minor · 8 cleanup.

**Status after wave 3 (W4 QA, 2026-10-25):** 32 of 38 fixed, 5 fixed only in the Rust server — which runs production since the switch —
and still open in the Bun fallback (#5, #7, #26, #27, #30); #36 is half done
(`effects/runtime.ts` 655 lines). Commits per row in the Status column.

Verified = read in the code (and, where it says so, run). **Guess** = reasoned, not reproduced.

## Findings, worst first

| # | Sev | Area | Where | Problem | Fix | Status (W4 QA, 2026-10-25) |
|---|---|---|---|---|---|---|
| 1 | major | companion/view | `app/src/lib/companion/tabs/view/follow.svelte.ts:41-67` | "TV follows the tablet" outside table mode is a feedback loop: the effect reads `session.view`, `followCommand` always returns a fresh `view.free` (no equality check, and `viewFree` always makes a new state), so every echo triggers the next — ~12.5 commands/s forever while the DM does nothing; the TV re-renders continuously and its autosave timer is reset every 80 ms, so the game is **never autosaved while follow is on**. The `$effect.root` is a module singleton that is never stopped when the game screen unmounts, so after reopening a game the old root keeps sending from the old context's camera. | Depend on the camera only (read the state with `untrack`), skip when the result equals `map.view.free`/`view.col,row`; stop the root in the View tab's `onLeave` and on game-screen destroy, and reset `on` per game. | fixed in 5784c9c |
| 2 | major | render | `app/src/lib/render/map-layer.ts:165, 174, 185` | A superseded map load (`seq !== loadSeq`: a quick `map.switch`, `drop()`, a context restore) returns early without destroying the tiles already uploaded (`built`) and without closing the decoded bitmaps in `made` — GPU textures and up-to-128 MB of bitmaps leak on the 2 GB box. | One `finally`: on any early exit destroy every texture in `built` and close every bitmap in `made`. | fixed in 32bcfaa |
| 3 | major | render ↔ shell | `app/src/lib/render/index.ts:64-67`, `shell/…/MainActivity.kt:503`, `map-layer.ts` `drop()` | The shell emits every `onTrimMemory` level, including `UI_HIDDEN` (20, sent whenever the app goes to the background); the app drops textures for any level ≥ 10, and each drop multiplies the map density by 0.75 for good (floor 0.25, never restored, also for the next map). After a few trips to Home the table map is visibly blurry. | Drop only for `RUNNING_LOW`/`RUNNING_CRITICAL` (10, 15) and for ≥ 60 while hidden; reset `densityFactor` when a new map loads (or after a calm period). | fixed in 32bcfaa, 3d2696d |
| 4 | major | render (TV perf) | `app/src/lib/render/fog-layer.ts:255-262` | The cloud-fog drift lease (20 fps) is held whenever the game's fog style is `cloud`, even with fog off or no map on the table — the TV then renders 20 frames a second while idle, against the "idle = 0 frames" budget. | Hold the lease only while `mesh.visible` (re-evaluate in `set()` after the visibility change). | fixed in 32bcfaa — verified (W4 `harness-fixes` rv#4: cloud fog on 16 frames / 3 s, fog off 0) |
| 5 | major | server security | `server/src/files/convert.ts:31` (`MAX_INPUT_PIXELS = 1e9`) | A small crafted PNG (decompression bomb) passes the 200 MB byte limit and makes sharp decode up to a gigapixel (~4 GB) — the VPS process dies and every table with it. `POST /files` and `GET /api/fetch` have no authentication and no limit on parallel conversions. | Cap input at ~150 MP (16k × 9k covers real maps), run sharp jobs through a 1–2 slot queue, and refuse more than a few concurrent link fetches. | fixed in the Rust server f439fa9 (production since 8efbed6); **open in the Bun fallback** |
| 6 | major | tv | `app/src/lib/tv/games.ts:484-491` | Deleting the open game: `close()` saves it, which starts a backup `PUT` (fire-and-forget); `remove()` then sends the `DELETE` while that `PUT` may still be in flight, so the game can come back as a server backup after the DM deleted it. | Mark the id as deleted before closing, have `pushBackups` skip deleted ids, and await the running push before the `DELETE`. | fixed in e788358 |
| 7 | major | server | `server/src/server.ts:99` (`Bun.serve` without `maxRequestBodySize`) | Bun's default body limit is 128 MB (probed: 100 MB → 200, 140 MB → 413), while `config.maxUploadBytes`, `server.md` and the import's `MAX_FILE_BYTES` all promise 200 MB — a 130–200 MB picture fails at the very end of the import with Bun's bare 413 instead of the server's `{error}`. | Set `maxRequestBodySize: config.maxUploadBytes + 1 MB` (and keep `readBody`'s own check). | fixed in the Rust server f439fa9; **open in the Bun fallback** |
| 8 | major | companion ↔ render | `render/scene.ts:221`, `companion/input/camera.ts:19` vs `render/camera.ts:129`, `companion/game/MapView.svelte:39-42` | Two owners of the DM camera: the companion keeps `ctx.cam` and does its hit tests with it, but the renderer re-fits its own camera on every new map and clamps with other limits (max zoom 220 vs 400; maps whose fit zoom exceeds 400 px/square). When the companion's fit gives a camera equal to the old one, `MapView`'s effect doesn't re-send it, so what is drawn and what taps hit differ (on the phone layout the sheet offset makes this real). **Guess** for the equal-camera case; the double ownership and the differing clamps are verified. | One camera module (`render/camera.ts` or `shared/geometry/camera.ts`) used by both; the `dm` scene never fits by itself — the caller's `setDmCamera` is the only source. | fixed in 9cebd2c, 5784c9c |
| 9 | minor | state | `app/src/lib/state/client.ts:202-206` | `awaitingSnapshot` has no timeout: if the `sync.request` is lost (send fails, TV busy), every tap answers "Still loading the table" until the link drops. | Re-request after ~3 s, log each retry. | fixed in f5589c9 |
| 10 | minor | state | `app/src/lib/state/host.ts:101` with `client.ts:141-143` | `replace()` clears the acks, so the first snapshot of a new epoch confirms nothing; a command applied in the old epoch whose echo was skipped (gap → `awaitingSnapshot`) stays in `pending` forever and is folded onto the new game's prediction. Rare (gap + game switch). | On an epoch change the client drops all pending (one notice), as on a fresh connection. | fixed in f5589c9 |
| 11 | minor | state / protocol | `app/src/lib/state/sessions.svelte.ts:126-129`, `CompanionApp.svelte:58-76`, `LibraryScreen.svelte:84-92` | Non-`sync.*` peer messages (`lib.listing`, `tv.status`, `tv.notice`, `deploy.ready`) reach the screens unchecked and are used with casts (`m.games as GameSummary[]`), against protocol.md "every receiver parses with the shared schemas". | `check(ToCompanion, msg)` once in the session and hand typed messages on. | fixed in f5589c9, 6e60531 |
| 12 | minor | state / relay | `app/src/lib/state/client.ts:192`, `server/src/relay/relay.ts:325` | A rate-limited `sync.cmd` comes back as `relay.undelivered {reason: "rate-limited"}`, and the companion tells the DM "The TV isn't connected". | Pass the reason through and word it ("Too fast — that change was dropped"). | fixed in f5589c9 |
| 13 | minor | net / companion | `app/src/lib/net/connection.ts:369-379`, `CompanionApp.svelte:98-104` | `server.build` and `refused` are logged and nothing else: no "new version — reload" offer; a companion refused for a protocol mismatch shows "Connecting to the table…" forever (protocol.md promises a reload offer). | A reload card on `refused` and on a newer `server.build` (companion), `tv.reload`-style self-reload on the TV when idle. | fixed in af42fb5, 6e60531 |
| 14 | minor | net | `app/src/lib/net/connection.ts:62, 174-183` | Stall threshold is 2 s (architecture.md says 1 s); `send()` reports success for a socket that is already closing (state still `open` until `onclose`), so such a command is only found lost at the next snapshot. | Align the number with the doc; check `socket.readyState === 1` in `send`. | fixed in af42fb5 |
| 15 | minor | render | `app/src/lib/render/fog-layer.ts:205` | The settings check compares a `Float32Array` slot with `fogEdgeInset / 100` (0.15 ≠ float32 0.15) and with the unclamped value, so it is "changed" on every `update()` — a frame for every state patch, also ones the TV doesn't show. | Keep the last inset as a plain number and compare that. | fixed in 32bcfaa |
| 16 | minor | effects | `app/src/lib/render/scene.ts` (no producer), `companion/game/table-view.ts:74-81`, `effects/diff.ts:136` | Nothing in the companion issues `fx.place` / `fx.trigger` (only the settings toggle exists), and the DM view is created without `effects`, so the runtime is unreachable from the table. One-shot age compares the TV's `Date.now()` with the sender's `at` — **guess**: device clock skew will skip or replay shots once a producer exists. | Stamp `at` with `Connection.serverNow()` when the producer lands; decide whether the DM view shows effects. | fixed in 19f99e6, 645ce71 |
| 17 | minor | render / effects budget | `app/src/lib/effects/runtime.ts:183`, `render/tiles.ts:198` | The effects registry gets 64 MB on the TV, while the documented budget is map 128 + **everything else 32**; `TextureBudget.otherBytes` exists but nothing enforces it. | Pass `otherBytes` (minus fog/tokens) to the effects runtime as its budget; report the total in `stats()`. | fixed in 2db7f4d |
| 18 | minor | render | `app/src/lib/render/dm-layers.ts:96-130` | DM-layer bitmaps are never closed after upload (map-layer does close its own) — double memory on the tablet; a layer that fails to load only logs, the DM sees nothing (IO-feedback rule), and it is never retried. | Close the bitmap after `initSource`; raise a `layer-failed` view event the companion turns into a notice. | fixed in 84338ab |
| 19 | minor | companion | `companion/game/table-view.ts:74-77`, `companion/game/context.svelte.ts:199-214`, `render/scene.ts:242-262` | The DM view loads maps through `httpFiles` (not the IndexedDB file cache the companion fills on upload), and the geometry file is fetched and parsed twice — once by the scene (unchecked `as MapGeometry`, `scene.ts:254`), once by the context (checked). Map loading has no visible progress on the tablet. | Pass `files: storage.files.get` and `onEvent` (map-loading → spinner) into the view; let one of the two own the geometry and expose it. | fixed in 9cebd2c, 5784c9c |
| 20 | minor | companion | `companion/game/MapView.svelte:44`, `render/tokens-layer.ts` | The selected token's ring is only drawn by the sketch view; the real renderer ignores `setOverlay`, so a selection in the Tokens tab is invisible on the map. | Add `setSelectedToken(id)` to the seam and a ring in `TokensLayer` (dm only). | fixed in 9cebd2c, 5784c9c |
| 21 | minor | companion | `companion/CompanionApp.svelte:92, 108`, `library/LibraryScreen.svelte:183` | `TablePicker` always gets `lastTable={null}` ("Last used" never shows) and `LibraryScreen` never gets `onchangetable`, so the library's "Change table" menu item does nothing — a dead button. The props are hidden from the compiler by the `Loose` glob type (`CompanionApp.svelte:26`). | Import both screens statically, pass `onchangetable={leaveTable}` and the remembered table. | fixed in 6e60531 |
| 22 | minor | import | `companion/library/app-services.ts:56-67`, `import/pipeline.ts:162-187` | "Prepare" already uploads picture, geometry, table copy and thumbnail before the DM confirms the squares; a cancelled import leaves its files on the server for good (files are never collected). | Upload after the squares dialog, or record uploaded refs and accept the leftovers knowingly (document it). | fixed in 55fe2f0 (files upload only after the squares dialog is confirmed) |
| 23 | minor | storage (TV perf) | `app/src/lib/storage/games.ts:106-121, 137` | `list()` reads every stored game in full and schema-checks it to make a summary — on every library refresh and `lib.list`; `put()` round-trips the whole game through `JSON.stringify/parse` every autosave. Both on the TV's main thread. | Keep a small summary record per game (as the server does); store the (already plain) game directly. | fixed in e0e0087 |
| 24 | minor | tv | `app/src/lib/tv/games.ts:207` | `boot()` captures `table` before its awaits; a resize during boot is overwritten by the stale viewport in `replace()` until the next resize. | Read `this.host.state.table` right before `replace`. | fixed in 850d632 |
| 25 | minor | logs | `app/src/lib/log-outbox.ts:85-91, 113-118, 120-133` | Every batch is first posted with `keepalive` (browsers refuse keepalive bodies over 64 KB, so large batches always take the detour); `drain` slices `batch.length` off a list `keep()` may have trimmed meanwhile, dropping unsent lines. | `keepalive` only on page hide; drain by line ids or under one lock with `keep`. | fixed in c4f2c8a |
| 26 | minor | server | `server/src/fetch/download.ts:80-95`, `server/src/http/routes.ts:124` | A link fetch buffers up to 200 MB in memory per request with no cap on parallel fetches (no auth); `/health` lists every game backup on each call. | Stream to the uploads file; a small fetch semaphore; cache the backup count. | fixed in the Rust server f439fa9; **open in the Bun fallback** |
| 27 | minor | server ↔ shared | `server/src/games/backups.ts:25` vs `shared/src/model/basics.ts:26` | The server only accepts game ids `[0-9A-Za-z_-]{1,64}`, the shared `Id` accepts any string; a game whose id falls outside (an imported v1 id, a hand-made one) is refused with 400 and retried every 30 s forever. | Put one id pattern in shared and use it in both. | fixed in the Rust server 1f93bb3; **open in the Bun fallback** |
| 28 | minor | protocol | `shared/src/reducer/fog.ts` (`onActiveMap`), protocol.md "commands" | Commands act on "the map on the table" implicitly; with two companions, fog cells in flight from one land on the map the other just switched to. **Guess** (multi-companion only). | Optional `mapId` on map-scoped commands; refuse when it isn't the active map. | fixed in 4aa5855 |
| 29 | minor | companion | `companion/tabs/settings/SettingsPanel.svelte:91` | The in-game grid editor dispatches `map.regrid` without remaking the TV's table copy (the import path does, `pipeline.ts:225-240`); **guess**: a much finer grid leaves the TV below its wanted px per square. | Route the in-game regrid through the same copy check. | fixed in 8b8ed34, 4520530 |
| 30 | minor | server | `server/src/games/backups.ts:74-95` | Ten versions per game, but the TV backs up after every save (2 s after activity), so the history covers seconds of play, not sessions. | Keep versions by age (one per 10 min / per session) rather than by count. | fixed in the Rust server 1f93bb3 (10-min version slots); **open in the Bun fallback** |
| 31 | cleanup | companion | `companion/game/sketch-view.ts` (311 lines), `companion/game/table-view.ts:59`, `CompanionApp.svelte:26-29` | Wave-1 scaffolding: the Canvas sketch and `import.meta.glob` lookups that waited for modules that now exist. They hide type errors (`Loose` props) and keep a second renderer alive. | Static imports; keep the sketch only if it is the declared WebGL fallback (then say so and test it), else delete. | fixed in 5784c9c, 6e60531 |
| 32 | cleanup | geometry | `shared/src/geometry/camera.ts`, `render/camera.ts`, `companion/input/camera.ts`; `render/hit.ts` vs `companion/input/hits.ts` | Camera maths exists three times and hit testing twice (`view.hitTest`/`hits` have no caller outside the renderer). | Move camera and hits to `shared/geometry/`, one implementation each, tests ported. | fixed in 5784c9c, 9cebd2c |
| 33 | cleanup | companion | `companion/library/services.ts`, `app-services.ts:122`, side-effect imports in `tabs/layers/LayersSection.svelte:14`, `tabs/measure/look-store.svelte.ts:5` | A service locator installed by importing a module for its side effect; `StoreAs` is declared in `api/client.ts:25` and again in `services.ts:9`. | Pass services as props/context from the app root; import `StoreAs` from the API. | fixed in 6e60531, e73bc52 |
| 34 | cleanup | tv | `app/src/lib/tv/TvApp.svelte:244` | The `pagehide` listener is an anonymous closure and is never removed. | Name it and remove it in the cleanup. | fixed in af42fb5 |
| 35 | cleanup | render | `app/src/lib/render/types.ts:136` vs `index.ts:123` | `TableView.dropTextures()` is typed without the `level` the implementation takes and logs. | Add `level?: number` to the type. | fixed in 9cebd2c |
| 36 | cleanup | size | `companion/dialogs/grid-editor/GridEditor.svelte` (810), `tv/games.ts` (655), `effects/runtime.ts` (631) | Over the "small modules with one job" bar: `games.ts` mixes autosave, backup queue, requests and restore. | Split `games.ts` into autosave/backup/requests; move the editor's pointer logic into `editor-logic.ts`. | partly: `tv/games.ts` 549 lines (61484da), GridEditor 425 (a486839); **`effects/runtime.ts` still 655 — open** |
| 37 | cleanup | companion perf | `companion/game/GameScreen.svelte`, tab panels | Panels derive from `ctx.map`, so every state patch (30/s while a disc is dragged) re-runs every open panel's deriveds. Fine on a tablet today; watch it on phones. | Derive the slices each panel shows (`map.tokens`, `map.fog`) so unrelated patches don't touch them. | fixed in 924a9bc |
| 38 | cleanup | docs | `protocol.md` "control messages" | `hello.client` is documented as "this device's id, kept across reconnects"; it is per page load (`config.ts:127`), which is what makes `seq` restart safely. | Say "this page's id"; keep `device` as the stable one. | fixed in ec86cce |

## Modules

**shared/** — The healthiest part. The reducer is pure, exhaustive (`assertNever`), shares
unchanged branches and rejects with readable reasons; schemas are one declarative definition per
type and the relay's loose envelope keeps payloads intact. Weak spots are the implicit "active
map" target of commands (#28), the loose `Id` (#27), and that camera/hit maths that both screens
need live outside it (#32).

**server/** — Small, readable, well logged and hardened where the old relay hurt (zombies, rate,
slow consumers, caps, no forged server messages). Path handling is safe (`static.ts` resolves and
checks the root; `/files` and `/uploads` take only strict name patterns), backups and library are
schema-checked and written atomically under a lock. The SSRF guard works as documented — probed
under Bun 1.4: `localhost` and a public name resolving to 127.0.0.1 are refused inside the
socket's lookup, `example.com` passes. Its exposure is resource use without authentication: the
gigapixel limit (#5), unbounded parallel fetches/conversions (#26) and the 128 MB body limit that
contradicts its own contract (#7).

**net/ + state/** — The sync design is right and the code follows it closely: commands as
patches, prediction rebuilt from confirmed + pending, drop-never-replay, acks on reconnect,
lateness on the server's clock. The gaps are timeouts and edges rather than design: a lost
snapshot request blocks taps (#9), epoch changes don't clear pending (#10), the non-sync messages
skip validation (#11), and the reload/refused paths have no UI (#13).

**tv/** — Clear, testable through ports, one request at a time, autosave/backup/restore as
described, every control a real button with D-pad focus. One real race (#6), a boot-time
viewport race (#24), and the storage it sits on does too much work per listing (#23). `games.ts`
is the file to split next (#36).

**render/** — Good architecture: render on demand, reference diffs per layer, fog in one texel
per square with partial uploads, tiled maps decoded at table density, scratch buffers in the hot
paths. The faults are all on the TV's resource budget: the tile leak on superseded loads (#2),
the trim-memory compounding (#3), the idle cloud lease (#4), the always-true settings diff (#15),
and the unenforced "other" budget (#17). This is the module that most needs a fix pass before
the box is used for a night.

**effects/** — The runtime is careful (no per-frame allocation, lease only while animating,
one-shots played once, a frame governor that degrades), but it is unreachable: no command
producer, not wired into the DM view (#16), and its budget is twice the documented one (#17).

**companion/** — The most uneven module, and the one most marked by the cut-off helpers: two
camera owners (#8), a feedback loop in the View tab (#1), dead buttons and loose props from the
glob scaffolding (#21, #31), a service locator wired by side-effect imports (#33), a second
geometry fetch and no file cache for the map view (#19), and a missing selection ring (#20). The
input layer itself (gesture → tool → throttled commands, one undo step per gesture) reads well.

**import/** — Solid: worker per job (terminated on every path), steps with weighted progress,
typed errors with user-facing text, logged timings. The only seam issue is that "prepare"
already uploads (#22); the in-game regrid path bypasses its table-copy logic (#29).

**storage/ + api/** — Both are careful about quota, retries (only retryable errors, abortable
sleeps), timeouts and progress in bytes; progress units agree across `api` → `storage` →
`tv/seams` (bytes, converted to 0–1 once). Main cost is `games.list()` on the TV (#23).

**ui/** — Not reviewed in depth (no game logic by rule); every component has its top comment,
listeners are paired with removals in the components sampled.

**log** — One logger, used everywhere, no stray console calls; the outbox has two small
correctness issues (#25).

## Cross-cutting

1. **One owner per concern across the seams.** The camera, hit tests, geometry loading and file
   access each have two implementations or two owners (renderer and companion). Every pair has
   already drifted (zoom limits, selection ring, cache vs HTTP). Put the maths in `shared/`, give
   each runtime concern one owner, and make the seam say who it is.
2. **Early returns in async loads must free what they made.** Map tiles (#2), DM layers (#18),
   and any future loader: use one `try/finally` that releases textures and bitmaps unless they
   were handed over.
3. **Leases and loops are tied to visibility, not to settings.** The cloud lease (#4) and the
   follow effect (#1) run on a setting alone; tie every lease/effect to "is it on screen / is
   this screen mounted" and stop it in the owner's `destroy`/`onLeave`.
4. **Effects that dispatch must not read the state they change.** Any `$effect` that sends a
   command reads its inputs with `untrack` and skips no-op commands; otherwise the echo re-runs it.
5. **Every receiver validates.** Peer messages beyond `sync.*` (#11), the scene's geometry file
   (#19) and the server's id rules (#27) should go through the shared schemas.
6. **Resource limits on the public server.** No authentication yet (known gap), so every route
   that costs memory or CPU needs a cap: pixels (#5), body size (#7), parallel fetches and
   conversions (#26).
7. **Scaffolding from parallel waves comes out now.** `import.meta.glob` stand-ins, the sketch
   renderer, "on its way" placeholders and the service locator (#21, #31, #33) were bridges
   between helpers; with the modules in place they only hide type errors.
8. **IO feedback on the companion's map view.** Map and layer loading on the tablet have no
   spinner and failures of layers no notice (#18, #19) — the same rule the TV follows well.
