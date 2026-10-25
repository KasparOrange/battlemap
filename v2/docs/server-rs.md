# battlemap v2 — the Rust server

`server-rs/` is the server ported to Rust (roadmap N13): one binary for the VPS and, next, the
TV box's Android shell, so the box itself can host the table for LAN play (S13). Same routes,
limits and data layout as the Bun server (`server.md`); the black-box suite in
`server-contract/` checks both. The Bun server keeps running as production until the switch.

## Layout

| Module | Job |
|---|---|
| `config.rs` | every setting from the environment (table below) |
| `http/` | router, CORS, preflight, the outcome log per request, the built app (`app.rs`), body caps (`respond.rs`), `/health`, `/api/tables` |
| `relay/` | rooms, routing, takeover, zombies, rate limit, caps (`mod.rs`, no socket code); the WebSocket glue (`socket.rs`) |
| `files/` | sniffing, decoding with the pixel limit, Store as, thumbnails (`convert.rs`), the content store + `derived.json` (`store.rs`), one upload (`upload.rs`), routes |
| `library/` | the shared library (`library.json`) |
| `backups/` | game backups, versions, trash |
| `fetch/` | the address guard (`guard.rs`), streaming download (`download.rs`), share links / page pictures (`link.rs`) |
| `log.rs` | mwlog-rs (tenant `battlemap`, app `battlemap-v2-rs`), `/log` → `battlemap-v2-ui`, 10-s counts of hot paths |
| `cleanup.rs` | temp cleanup at start and every 6 h |
| `schema.rs` | the shared types' JSON Schema, embedded |
| `wire.rs` | every JSON type the server writes; TypeScript generated for the server-only ones |

axum 0.8 + tokio, tower-http (`ServeFile`: streaming, HEAD, ranges), `image` (PNG, JPEG, WebP,
GIF, TIFF, BMP decode; JPEG + PNG encode) + libwebp (`webp` crate, lossy and lossless),
reqwest with rustls/ring + webpki roots (no OpenSSL, so it cross-compiles), jsonschema.

## Wire types — defined once

Two kinds of types, one source each:

| Kind | Source of truth | Other side | Freshness check |
|---|---|---|---|
| shared types the app owns: `FileRef`, `MapInfo`, `LibraryEntry`, `GameSummary`, `Game`, `hello`/`ping`, every server message, `RoutingEnvelope` | valibot in `shared/src/` | `shared/src/generated/schema.json` (JSON Schema 2020-12, `server-contract/scripts/schema.ts`), embedded in the binary; every incoming hello, ping, envelope, library map and game is checked with it | `bun test ./generated.check.ts` in `server-contract` |
| server-only HTTP answers: `UploadResult`, `Fetched`, `Health`, `TableInfo`, `VersionInfo`, `ErrorBody`, the list wrappers | Rust structs in `server-rs/src/wire.rs` | `shared/src/generated/server.ts` (ts-rs), exported from `@battlemap/shared` | `cargo test` (`generated_typescript_is_fresh`; `UPDATE_GENERATED=1 cargo test` rewrites it) |

The Rust structs that mirror shared types (`LibraryEntry`, `GameSummary`, `ServerMessage`, …)
are only the server's view for building answers; `cargo test` validates every one against the
schema. Games stay opaque: checked, summarised from `id`, `name`, `createdAt`, `mapOrder`,
`activeMapId`, `maps[*].info`, stored as the bytes that came. Two harmless differences to
valibot: `finite` isn't in the schema (JSON has no NaN), and unknown keys are kept, not dropped
(a newer app's fields survive a round trip). The app still has hand-written copies of the
server-only types (`app/src/lib/api/client.ts` `UploadResult`, `FetchedLink`) — they can now
import the generated ones.

## Settings

The Bun server's four (`PORT` 5929, `HOST`, `APP_DIR` `../app/dist`, `DATA_DIR` `./data`) plus:

| Variable | Default | What |
|---|---|---|
| `HELLO_TIMEOUT_MS` | 8000 | a socket must say `hello` within this |
| `BUILD_POLL_MS` | 10000 | `build.json` re-read (0 = never) |
| `MAX_UPLOAD_BYTES` | 200 MiB | upload and link-download cap |
| `MAX_GAME_BYTES` | 25 MiB | game backup cap |
| `GAME_VERSIONS` | 10 | previous versions per game |
| `FETCH_TIMEOUT_MS` | 30000 | link fetch, per socket operation |
| `CLEANUP_EVERY_MS` | 6 h | cleanup timer (0 = only at start) |
| `MAX_PIXELS` | 150 000 000 | pictures larger are refused from their header (review #5) |
| `LOSSLESS_MAX_PIXELS` | 50 000 000 | largest picture tried as lossless WebP (libwebp needs ~40 B per pixel for it; the box should set ~8 MP) |
| `IMAGE_SLOTS` / `FETCH_SLOTS` | 2 / 4 | picture work and link fetches at once (review #26) |
| `RELAY_ZOMBIE_MS`, `RELAY_SWEEP_MS`, `RELAY_RATE_PER_S`, `RELAY_RATE_BURST`, `RELAY_RATE_CLOSE_AFTER`, `RELAY_COMPANIONS_PER_ROOM`, `RELAY_MAX_ROOMS`, `RELAY_WAITING_PER_IP`, `RELAY_MAX_BUFFERED_BYTES`, `RELAY_MAX_FRAME_BYTES` | `server.md` "relay hardening" | the relay's limits |
| `BATTLEMAP_SERVER_BUILD` | `dev` | `/health` `serverBuild` |
| `BATTLEMAP_LOG_STDERR` | — | `1` = log lines to stderr too (journal, contract logs) |
| `BATTLEMAP_FETCH_TEST_ADDR` | — | tests only: names under `.test` resolve here, past the guard |

`/health` also says `server: "rust"`.

## What it does beyond the Bun server (the review's fixes)

- **#5 pixel limit before decoding:** the header (`imagesize`, then the decoder's own) decides;
  over 150 MP is refused 400 ("… megapixels") and nothing is decoded. Decoders also get an
  allocation cap.
- **#7 upload cap as documented:** 200 MB everywhere, refused with `{error}` (413) — the body is
  counted as it streams, no framework default in between.
- **#26 bounded memory:** uploads stream to a temp file while hashed (JSON is checked
  streaming); link fetches stream to a file with the cap; only picture work holds a file in
  memory, inside one of 2 image slots; game checks in 2 slots; more than 4 link fetches at once
  → 429. `/health` counts backups from a cached count, not a full listing.
- **Graceful stop:** SIGTERM/SIGINT → every socket gets 1001 "server stopping", open requests
  get 10 s, the log flushes, exit 0.
- **Cleanup timer** as the Bun server (start + every 6 h).

## Known differences

- **No AVIF/HEIF** (sharp reads them; the `image` crate needs dav1d for AVIF) and **no
  JPEG-compressed (YCbCr) TIFF** — both are refused as "not a picture". LZW/uncompressed TIFF,
  GIF and BMP convert. Rare for maps; add `image`'s `avif-native` if it ever matters.
- Encoders differ (libwebp direct vs sharp's libvips; `image`'s JPEG/PNG): sizes and bytes
  differ a little, the rules (lossless ≤ 1.5 × lossy, > 16383 px → JPEG, "already smaller")
  are the same. Thumbnails use a fast box downscale.
- A frame over the limit closes with 1009 (Bun drops the connection: 1006). A server close
  sends its code (Bun's stop drops sockets: 1006).
- `library.json` is read once at start and kept in memory (edit it only through the API).

## Contract

```sh
cd server-contract && bun install
bun run.ts --target bun  --port 6301                      # the Bun server
bun run.ts --target rust --port 6302                      # server-rs/target/release/battlemap-server
bun run.ts --target rust --bin <path> [--tight-port N] [--mock-port N] [relay fetch …] [--keep]
```

`run.ts` starts a **main** server (test-sized limits: hello 300 ms, uploads 2 MiB, games 1 MiB,
fetch timeout 1.5 s, cleanup every 1 s, build poll 200 ms) and a **tight** one (`--port + 100`,
tiny relay limits), a fresh temp data folder each (the main one seeded with cleanup fixtures),
then `bun test` over `tests/*.contract.ts`, then the graceful-stop check, then stops both by PID.
The tight server and the mock default to `--port + 100` / `+ 200`; pick others when those are
taken (the Android emulator's `netsimd` holds 6402, hence `--tight-port 7302 --mock-port 7402`).
The link-fetch tests run their upstream on `--port + 200`. Files: `http` (health, `/log`,
tables, the app, CORS, 405s, cleanup at start and on its timer, new-build broadcast), `files`,
`library-games`, `relay`, `relay-limits` (tight), `fetch` (mock upstream + SSRF: literal,
after-DNS and redirected loopback/private addresses never reach the mock), `fixes` (Rust only).

Results (2026-10-25): **Bun 70 pass, 2 skipped (the fixes); Rust 72 pass.**

## Platforms

| Target | How | Binary | Checked |
|---|---|---|---|
| macOS arm64 (dev) | `cargo build --release` | 10 MB | contract 72/72 |
| x86_64 Linux (VPS) | `cargo zigbuild --release --target x86_64-unknown-linux-musl` (zig 0.17 + cargo-zigbuild; static, no glibc dependency) | 11 MB | deployed, `/health`, library identical to the Bun server's |
| aarch64 Android (box + the Mac's Google TV emulator, arm64) | `ANDROID_NDK_HOME=~/Library/Android/sdk/ndk/28.2.13676358 cargo ndk -t arm64-v8a -t x86_64 build --release` | 10 MB | run on the `bm_tv` emulator (Android 14, 2 GB) with `adb shell`, reached through `adb forward`: contract **61 pass, 11 skipped** (no tight server, no data-folder or build-file checks from the Mac), graceful stop on SIGTERM |
| x86_64 Android (x86 emulators) | same command | 11 MB | built only (the Mac's emulators are arm64) |

The VPS has no Rust toolchain; the Mac cross-compiles (`rustup target add x86_64-unknown-linux-musl
aarch64-linux-android x86_64-linux-android`, `brew install zig`, `cargo install cargo-zigbuild
cargo-ndk`). Use rustup's cargo (`/opt/homebrew/opt/rustup/bin` first in `PATH`), not Homebrew's.

On the emulator (how it was run; the next wave does this from the shell):

```sh
adb -s emulator-5554 push target/aarch64-linux-android/release/battlemap-server /data/local/tmp/
adb -s emulator-5554 shell 'cd /data/local/tmp && HOME=$PWD/bm PORT=6310 HOST=127.0.0.1 DATA_DIR=$PWD/bm/data APP_DIR=$PWD/bm/app \
  BATTLEMAP_FETCH_TEST_ADDR=10.0.2.2 … nohup ./battlemap-server > bm/server.log 2>&1 &'   # 10.0.2.2 = the Mac
adb -s emulator-5554 forward tcp:6311 tcp:6310
SERVER_URL=http://127.0.0.1:6311 MOCK_PORT=7402 CONTRACT_FIXES=1 bun test ./tests/*.contract.ts   # in server-contract
```

### Memory (RSS)

| | Bun server | Rust server |
|---|---|---|
| VPS, idle (same data: 15 library maps) | 66 MB | **11.5 MB** |
| VPS, peak converting a 12 MP noise PNG to WebP (lossy + the lossless try) | 758 MB, 340 MB still held after | 493 MB, back to 14 MB after |
| Android emulator, idle | — (Bun doesn't run on Android) | **9.5 MB** |
| Android emulator, after the whole contract suite | — | 18 MB (peak 25.6 MB) |

The conversion peak is libwebp's lossless encoder (~40 bytes per pixel, measured; `low_memory`
doesn't change it). On the 2 GB box set `LOSSLESS_MAX_PIXELS` to ~8 MP and `IMAGE_SLOTS=1`; the
VPS keeps Bun's rule (50 MP). The first version used the `jsonschema` crate and sat at 164 MB
idle — its meta-schema machinery; the small checker in `schema.rs` replaced it.

## Embedding in the shell (next wave, with LAN play)

The shell (Kotlin, `shell/`) will host the table on the box for LAN play: the server listens on
the box's Wi-Fi address, the TV page and the tablets connect to it instead of the VPS. Two ways
to run the same Rust code inside the shell; **recommended: a JNI library with a start/stop
API**, the bundled executable kept as the fallback.

| | JNI library (`cdylib`) — recommended | Bundled executable in `jniLibs` |
|---|---|---|
| How | the crate also builds `libbattlemap_server.so` with three `extern "system"` functions for a Kotlin `ServerBridge`: `start(port, dataDir, appDir, build): Long` (a tokio runtime on its own threads, returns a handle), `stop(handle)` (the graceful stop above), `health(handle): String` | today's binary renamed `libbattlemap_server.so`, packed under `jniLibs/<abi>/` (`useLegacyPackaging = true` so it is extracted), started with `ProcessBuilder(nativeLibraryDir + "/libbattlemap_server.so")` and env `PORT`, `DATA_DIR` (`filesDir/server`), `APP_DIR` (the bundle), `HOME`; stopped with `Process.destroy()` (SIGTERM → graceful stop) |
| Lifecycle | owned by a foreground `Service` (the table stays up when the WebView reloads or the screen saver runs) | the same service starts and watches the process, restarts it |
| Android 12+ | nothing special | a child process is a "phantom process": Android may kill it under pressure or for CPU use in the background |
| Crash | a Rust panic in a request is caught per task; an abort (out of memory) takes the shell down with it | the server dies alone; the service restarts it |
| Memory | one process; the server's few MB show up in the shell's | its own process (RSS measured below) |
| Logs | mwlog-rs (`HOME` = `filesDir`) plus logcat through `android_logger` | mwlog-rs; stderr to logcat by the service |
| Work | ~100 lines of JNI glue (`jni` crate, a `[lib] crate-type = ["cdylib", "rlib"]`), a Kotlin bridge + service | packaging only, but the phantom-process risk on Google TV 12/14 |

Either way the server code is unchanged: `battlemap_server::start(config, shipper)` returns a
`Running` with `stop(grace)` — exactly what the JNI `start`/`stop` wrap. For LAN play the shell
also sets `HOST=0.0.0.0`, a fixed port, and serves the bundle it already holds as `APP_DIR`;
companions find the box by mDNS/NSD (`_battlemap._tcp`) or a QR code on the TV. Data
(`files/`, `library.json`, `games/`) lives in the shell's `filesDir`; a later sync with the VPS
library is its own work package.

## Deploy (side by side)

`server-rs/deploy.sh [--no-build] [--snapshot]`: cross-builds the static musl binary on the Mac
(`cargo zigbuild`), copies it to `~/battlemap-v2-rs/bin/`, copies a snapshot of the Bun server's
data on the first deploy (`~/battlemap-v2/data` → `~/battlemap-v2-rs/data`; `--snapshot` takes a
new one), writes and restarts the systemd unit **`battlemap-v2-rs`** (port **5930**, the Bun
server's built app in `~/battlemap-v2/app`), checks `/health` and prints both servers' RSS.
Caddy and the Bun unit `battlemap-v2` are not touched; the Rust server is reachable at
`http://72.62.88.197:5930`. Logs: `journalctl -u battlemap-v2-rs`, MwLog app `battlemap-v2-rs`.

First deploy (2026-10-25): data snapshot 37 MB, `/health` ok with 15 library maps, the
library JSON byte-identical to the Bun server's, thumbnails served, a WebSocket hello welcomed.
The Bun server (5929) answered throughout. Next: point a test companion at 5930, then switch
Caddy when Konrad says so (the data folders differ from the snapshot on — copy again with
`--snapshot` right before a switch).
