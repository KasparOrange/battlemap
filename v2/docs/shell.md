# The Android shell

One APK, `app.battlemap.table` ("battlemap"), for every Android device at the table: Google TV /
Android TV (the Xiaomi TV Box S 3rd gen), Amazon Fire TV (no Google Play services — the shell has
no GMS dependency at all) and Android tablets/phones (the DM's companion). It is a thin host: a
full-screen WebView running the web app, plus the few things a web page can't do (install
updates, keep the screen on, hide the system bars, Back key, logs from the Android side).
Everything else is the web app's job.

Installs side by side with the old Flutter app (`com.example.battlemap`).

Code: `v2/shell/` — Kotlin, Gradle, dependencies `androidx.webkit` and `androidx.activity` only.

| File | What |
|---|---|
| `build.sh` | builds debug + release APKs into `shell/build/` |
| `app/src/main/AndroidManifest.xml` | one activity, launcher + leanback launcher entry, banner |
| `app/src/main/kotlin/app/battlemap/table/MainActivity.kt` | WebView host: loading, Back, keys, immersive, keep awake, renderer crashes, memory |
| `…/ShellBridge.kt` | `window.BattlemapShell` |
| `…/ShellSettings.kt` | start mode, dev URL, server URL, device id, intent extras |
| `…/BundleStore.kt` | serves the web app (built-in or downloaded bundle), bundle updates, rollback |
| `…/ApkInstaller.kt` | in-app APK updates |
| `…/ShellLog.kt`, `PageEvents.kt` | logcat + log lines and events to the page |
| `…/Device.kt`, `Downloader.kt` | device facts; HTTP download with progress |
| `bridge.d.ts` | **the typed contract** of the bridge and its events (import it in the app) |
| `pages/index.html` | the shell's own page: key log, checks, buttons (shown when no app is bundled) |
| `probe/probe.html` | the WebGL probe (below) |
| `tools/webview.ts` | drive a debug build's WebView from the Mac (DevTools protocol): eval JS, crash the renderer |

## Build

```bash
v2/shell/build.sh            # debug + release → v2/shell/build/battlemap-<version>-{debug,release}.apk
v2/shell/build.sh debug      # or: release
```

- Needs JDK 17 (Homebrew `openjdk@17`, or `~/Library/Android/jdk`) and the SDK in
  `~/Library/Android/sdk` (platform 36). Gradle 8.14 via the wrapper, AGP 8.11, Kotlin 2.2.
- **The web app is bundled when `v2/app/dist/index.html` exists** (Gradle task `shellAssets`
  copies `app/dist` → `assets/app/`, `pages/` + `probe/` → `assets/shell/`). Build the app first.
  Without it the APK opens on the shell's own page.
- Version: `shellVersionName` / `shellVersionCode` in `shell/gradle.properties`. Bump the code
  for every APK that should install as an update (or pass `-PshellVersionCode=N` to Gradle).
- **Signing:** debug and release are both signed with the local key
  `~/.config/battlemap/shell.jks` (alias `battlemap`, passwords `battlemap` — a debug-style key,
  not for a store). `build.sh` creates it on first run. One key for both types means either
  installs over the other. **Copy this file to every machine that builds APKs** (the VPS
  included): an APK signed with another key can't update the installed app ("signatures do not
  match" — only an uninstall, which wipes the app's data, gets past that).
- Debug builds turn on WebView remote debugging (`chrome://inspect`, or `tools/webview.ts`).
- No R8/minify (the APK is ~2 MB; minifying would need keep rules for the bridge).

## Install and start

```bash
ADB=~/Library/Android/sdk/platform-tools/adb
$ADB -s emulator-5556 install -r v2/shell/build/battlemap-0.1.0-debug.apk
$ADB -s emulator-5556 shell am start -S -n app.battlemap.table/.MainActivity [extras]
```

Real devices on the home Wi-Fi go through latrine (`latrine android install <apk> xiaomi`,
`latrine android shell "am start …" xiaomi`) — a session's own adb can't reach them.

Intent extras (adb `--es name value`):

| Extra | Value | Kept? |
|---|---|---|
| `url` | load the app from this URL instead of the bundle, e.g. `http://localhost:5173/` (Vite, after `adb reverse tcp:5173 tcp:5173`) or `http://<Mac's LAN IP>:5173/`; `off` = bundle again. Release builds accept only local-network hosts (private IPv4, Tailscale 100.64/10, `localhost`, `*.local`, `*.ts.net`) | yes |
| `mode` | `tv`, `companion`, `auto` (TV devices → tv) | yes |
| `server` | server base URL handed to the app as `server=`; `off` = the app's default | yes |
| `page` | `probe` or `keys` (the shell page) for this launch only; a query may follow: `"'probe?seconds=30'"` | no |

The same settings are reachable from the app through the bridge (`setDevUrl`, `setStartMode`,
`setServerUrl`) — a hidden developer screen can offer them without adb.

## How the app is loaded

- Everything is served by `WebViewAssetLoader` on **`https://appassets.androidplatform.net`** —
  a real secure origin, so IndexedDB, OPFS, `fetch`, workers and service workers work
  (checked on both emulators by the shell page's checks).
  - `/app/…` — the web app: the active downloaded bundle, else the built-in `assets/app/`.
    A path without a file extension that doesn't exist returns `index.html` (client-side
    routes); a missing file is a 404. **The app must be built for the base `/app/`** (Vite
    `base: '/app/'` or `'./'`).
  - `/shell/…` — the shell's own pages and the probe.
- Start URL: `https://appassets.androidplatform.net/app/index.html?mode=tv|companion&device=<id>[&server=…]`
  — the start parameters of `architecture.md` "clients". `device` is a random id the shell makes
  on first start and keeps. A dev URL gets the same parameters appended (unless it has them).
- The app reaches the server over plain `http://`/`ws://` too: mixed content is allowed and
  cleartext is on (checked: `fetch` and a WebSocket from the https origin to `10.0.2.2`).
- The user agent ends with `BattlemapShell/<version>`; `window.BattlemapShell` exists.
- The page's `console.*` lines go to logcat (tag `battlemap`, prefixed `web:`), never back to the page.
- Navigation away from the app's origin (or the dev URL's) opens outside the app instead, so the
  bridge only ever sees our own pages.

## The bridge: `window.BattlemapShell`

Exact types: `shell/bridge.d.ts`. All calls are synchronous; long jobs answer with events.

| Method | What |
|---|---|
| `info(): string` | JSON: shell version, device (model, Android, WebView version, isTv, isFireTv), start mode, device id, dev/server URL, bundle (source, version), display (window px, density, output mode e.g. 3840 × 2160) |
| `ready()` | the app booted — confirms a downloaded bundle (see updates). Call once per load |
| `takeLogs(): string` | buffered shell log lines (JSON), then live `log` events — forward them to MwLog with `src=shell` |
| `setKeepAwake(on)` | screen stays on (TV mode starts on, companion off) |
| `setImmersive(on)` | hide/show the system bars (both modes start immersive) |
| `openExternal(url): boolean` | http(s)/mailto outside the app; false if nothing can open it |
| `installApk(url)` | download an APK and start the system install (`apk` events) |
| `updateBundle(url, version)` | download a bundle zip, make it active on the next reload (`bundle` events) |
| `useBuiltinBundle()` | drop downloaded bundles, back to the APK's own, reload |
| `reload()` | reload the start URL |
| `setDevUrl(url)` | load from a dev server from now on (`""` = bundle) |
| `setServerUrl(url)` | the `server=` start parameter (`""` = app default) |
| `setStartMode(mode)` | `tv`, `companion` or `auto`, from the next start |

Events: `window.addEventListener('battlemapshell', e => …)`, `e.detail.type` is one of
`back` (cancelable — see below), `log`, `apk` (`downloading`/`installing`/`waiting-for-user`/`done`/`failed`),
`bundle` (`downloading`/`ready`/`failed`), `memory` (Android asked to free memory: drop textures
and caches; `level ≥ 10` = running low).

## Back and the remote

- **Back:** the shell sends a cancelable `back` event first. If the app handled it (closed a
  dialog, went up a level), it calls `e.preventDefault()` — the shell then does nothing.
  Otherwise, or if the page doesn't answer within 500 ms: history back if there is any, else
  the app closes. So on its home screen the app simply doesn't prevent it.
- **Keys reach the page as normal `keydown`/`keyup`** (checked on the Google TV emulator):
  D-pad → `ArrowUp/Down/Left/Right`, OK (`DPAD_CENTER`, also a gamepad's A) → `Enter`, `Escape`,
  digits, media keys (`MediaPlayPause`, `MediaFastForward`, `MediaRewind`), `Info`,
  `ChannelUp/Down`, colour keys (`ColorF0Red` …). The **Menu key** (Fire TV's ☰) is dropped by
  WebView, so the shell synthesizes it as `ContextMenu` keydown/keyup. Home, Settings and the
  assistant key belong to the system.
- WebView has no built-in D-pad focus movement: the app moves focus itself on arrow keys (the
  shell page shows the simplest version).

## Updates

- **Web bundle (the normal update):** `updateBundle(url, version)` downloads a zip of the app's
  `dist/` (`index.html` at the top or inside one folder), unpacks it to the app's storage, makes
  it active; `reload()` then runs it — same origin, so IndexedDB/OPFS data stays.
  **Rollback:** a downloaded bundle loaded 3 times without the page calling `ready()` is dropped
  and the built-in one comes back (a broken update must not brick a TV that only has a remote).
  `info().bundle` says which one runs.
- **APK (rare, when the shell itself changes):** `installApk(url)` downloads, checks it is
  `app.battlemap.table`, and hands it to Android's PackageInstaller. Android asks the user:
  - the first time per device, "install unknown apps from this source?" → Settings → allow;
    or once by adb: `adb shell appops set app.battlemap.table REQUEST_INSTALL_PACKAGES allow`;
  - every time, "Do you want to update this app?" → Update (D-pad: left, OK on the TV).
  Android kills the old version; the new one **reopens by itself** only if the device granted
  the overlay permission once: `adb shell appops set app.battlemap.table SYSTEM_ALERT_WINDOW allow`
  (otherwise Android blocks the start from the background and the TV lands on the launcher).
  Do both appops once on the box and the tablet.

## Robustness and memory

- The WebView's renderer process dying (crash, or Android killing it for memory) recreates the
  WebView and reloads the start URL; the log line reaches the new page. From the fourth loss
  within a minute it waits 5 s before each retry. (Checked: `tools/webview.ts <serial> crash`.)
- TV: keep-screen-on and landscape in TV mode; the WebView's HTTP cache is cleared at start when
  over 64 MB (the box has 8 GB storage, 2 GB RAM); `onTrimMemory` clears WebView's memory cache
  and sends a `memory` event to the app.
- The TV's font-size setting can't rescale the page (`textZoom` fixed at 100 %).
- `<input type=file>` opens Android's file picker (for map uploads on the tablet).

## WebGL probe (the decision gate)

The question of 2026-10-24: can the box's WebView draw a map + fog + doors at a steady frame
rate? `probe/probe.html` (raw WebGL2, no build step) draws every frame at 1920 × 1080: a
4096 × 4096 map texture (generated, uploaded in strips, mipmapped) panned and zoomed between
overview and one-inch squares; 862 walls and 30 doors (instanced; doors change every second); a
fog mask at grid resolution (256 × 256, 4 cells per square) painted with two circles every frame
and uploaded with `texSubImage2D` (dirty rects); a full-screen fog pass with soft edges (9-tap
blur + 2 noise layers); 60 moving token sprites; doors above the fog. After 2 s warm-up it
measures 20 s.

**Pass = average ≥ 50 fps and 1 % low ≥ 30 fps** (1 % low = the fps of the slowest 1 % of
frames). `?load=2` or `3` draws the fog pass 2–3× to show headroom; also `seconds`, `w`, `h`,
`sprites`. OK/Enter measures again.

**On the real box** (one line; the result is one logcat line `PROBE_RESULT {…}`, also on screen):

```bash
adb shell am start -S -n app.battlemap.table/.MainActivity --es page probe; sleep 40; adb logcat -d -s battlemap | grep PROBE_RESULT
```

From a session, through latrine: `latrine android install v2/shell/build/battlemap-0.1.0-release.apk xiaomi`,
`latrine android shell "am start -S -n app.battlemap.table/.MainActivity --es page probe" xiaomi`,
40 s later `latrine android log PROBE_RESULT 5 xiaomi` (and `latrine android shot xiaomi` for the screen).
Read `renderer` (should say Mali-G310), `avgFps`, `low1Fps`, `frameMs.p99`, `gpuMs` (if the
timer extension exists). Then once more with `"'probe?load=2'"` for the headroom.

### Emulator results (2026-10-25) — not representative

The emulators render on the Mac's GPU through a GL translator ("Android Emulator OpenGL ES
Translator (Apple M2 Max)") and drop frames on their own, so these numbers say the probe runs
correctly, not whether the box passes.

| Run | WebView | avg fps | 1 % low | frame ms p50 / p99 / max | JS ms/frame | frames > 33 ms | map gen / mipmaps |
|---|---|---|---|---|---|---|---|
| `bm_tv` (Google TV 14, 1080p, dpr 2) | 113 | 55.1 | 14.4 | 16.7 / 50 / 117 | 0.1 | 15 of 1102 | 292 / 10 ms |
| `bm_tablet` (Android 16, 2560 × 1600) | 133 | 57.7 | 24.8 | 16.7 / 33.4 / 67 | 0.1 | 12 of 1155 | 326 / 11 ms |
| `bm_tv`, nearly empty (320 × 180, 1 sprite) | 113 | 57.9 | 25.7 | 16.7 / 33.3 / 50 | — | 3 of 869 | — |

Both report WebGL2, `MAX_TEXTURE_SIZE` 4096, no GPU timer. The near-empty run drops frames
too: the stalls are the emulator's. The JavaScript side costs 0.1 ms a frame, so on the box the
question is purely the Mali-G310's fill rate (map sampling + the 11-tap fog pass at 1080p).

## Bench check (2026-10-25, debug APK 0.1.0 on `bm_tv` + `bm_tablet`)

- Installs and launches on both; the TV starts full screen, landscape, keep-awake on; the
  tablet in companion mode, immersive, keep-awake off. The tablet launches from its launcher.
- Leanback: Android lists the activity under `LEANBACK_LAUNCHER` and the APK carries the banner
  (`aapt2 dump badging`). The Google TV launcher itself wasn't visible — the emulator's Google TV
  home insists on a Google sign-in.
- Keys and Back as described above; IndexedDB, OPFS, worker, http fetch and ws from the https
  origin; dev URL (set, kept across launches, cleared); bundle update, client-route fallback,
  404, rollback after 3 unconfirmed loads, `ready()` confirming; APK update 0.1.0 → 0.1.1 on both
  (unknown-sources prompt, confirm, app reopened with the overlay grant); renderer crash →
  recreated; `memory` event on `am send-trim-memory`; release build installs over debug.
- Not checked: the file picker, a real Fire TV, the real box and tablet (away at a friend's).

## Open

- The probe on the real box (the gate) — the command above.
- The TV-hosted LAN relay (`architecture.md`: "the TV's shell will host a one-room version")
  isn't in the shell yet.
- Downloads started by the page (`<a download>`, blob URLs) do nothing in the WebView yet.
- Fire TV: untested; Fire OS 7+ (Android 9+) should work (minSdk 26), its WebView version decides WebGL2.
