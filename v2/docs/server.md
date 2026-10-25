# battlemap v2 — server

**Since 2026-10-25 production runs the Rust server** (`server-rs.md` "Production switch"); this
Bun server is the stopped, installed fallback (`server-rs/switch.sh to-bun`), and
`server/deploy.sh` refuses to run while Caddy points at the Rust server.

The Bun server in `server/`: the relay, the file store, the shared map library, game backups,
the link fetch, the log forward and the built app. Dumb on purpose — it never interprets a game
(`architecture.md` rule 3). Production: **https://battlemap.srv1189697.hstgr.cloud/app/**
(health: `/health`), also plain on `http://72.62.88.197:5929`.

## Routes

Every answer carries CORS `*`; JSON answers are `no-store`; refusals are `{error}` with a reason
the app can show.

| Route | Body / answer |
|---|---|
| `GET /health` | `{ok, build (app), serverBuild, uptimeS, startedAt, rooms, tvs, companions, members, waiting, library, games, mwlog}` |
| `POST /log` | mwlog-ts browser batches → MwLog (`app=battlemap-v2-ui`) |
| `GET /api/tables` | `{tables: [{room, tvName, companions, since}]}` — rooms with a TV online |
| `GET /ws` | the relay (WebSocket) — `protocol.md` |
| `POST /files?ext=&format=` | raw bytes (≤ 200 MB) → 201 `UploadResult` = `FileRef` (`hash`, `ext`, `bytes`) + `width`, `height`, `thumb` (`FileRef`, ≤ 288 px WebP, pictures only), `originalBytes`, `note`. `ext` = png \| jpg \| webp \| json \| pdf (optional; the bytes decide for pictures), `format` = webp \| jpeg \| png \| asis (default) |
| `GET /files/<sha256>.<ext>` | the file, `Cache-Control: immutable` |
| `GET /uploads/<name>` | a link fetch's file (temporary) |
| `GET /api/library` | `{entries: LibraryEntry[]}`, newest first |
| `GET /api/library/<id>` | one `LibraryEntry` |
| `POST /api/library` | `{map: MapInfo, thumb?, originalBytes?, note?, addedAt?}` → `{entry, added}` (201 new, 200 replaced — same `map.id` keeps `addedAt`). Every named file must be on the server; `thumb` defaults to the one made at the picture's upload; `map.libraryId` := `map.id` |
| `DELETE /api/library/<id>` | `{removed: entry}`; the files stay (games keep their maps) |
| `GET /api/games` | `{games: GameSummary[]}` (`where: "server"`), newest save first |
| `PUT /api/games/<id>` | the `Game` (≤ 25 MB, id must match) → its `GameSummary` (thumb: the active map's library or upload thumbnail) |
| `GET /api/games/<id>[?at=<savedAt>]` | the `Game`, header `x-saved-at` |
| `GET /api/games/<id>/versions` | `{versions: [{savedAt, bytes, latest}]}` — latest + previous ten |
| `DELETE /api/games/<id>` | 204, moved to `trash/` (30 days) |
| `GET /api/fetch?url=` | `{url: "/uploads/…", name, bytes, kind: picture \| pdf \| uvtt, ext}` or 422 `{error}` |

**Store as** (`files/convert.ts`, the old measured rules): webp = q90, lossless when ≤ 1.5 × the
lossy size (≤ 50 MP), over 16383 px → JPEG, not smaller than a PNG/JPEG/WebP original → kept;
jpeg = q90 on black; png = max compression; EXIF orientation applied. GIF/TIFF/AVIF are always
converted (PNG without a format). A conversion is remembered per source hash (`derived.json`).

**Link fetch** (`fetch/`): http(s) only, no passwords, ≤ 5 redirects, 200 MB, 30 s per socket
op. Only public addresses: the check runs inside the socket's own DNS lookup (no rebinding
gap) and on literal IPs. Drive and Dropbox shares become downloads, Drive's virus-scan page is
answered, a page gives `og:image` / `twitter:image` / `image_src` / first `<img>`.

## Relay hardening (`relay/relay.ts`, limits in `config.ts`)

| Limit | Value | On breach |
|---|---|---|
| silent socket (app pings every 15 s) | 45 s | closed 4005, warn "zombie" |
| rate | 100 msg/s, burst 400 | dropped (warn once), `sync.cmd` → `relay.undelivered {reason: "rate-limited"}`; > 2000 drops/min → closed 4006 |
| send buffer | 32 MB | closed 4007 |
| companions per room / rooms / waiting sockets per address | 16 / 1000 / 20 | refused 4008 |
| frame | 16 MB | Bun closes it |

Clients can't send server message types. Logged: joins, leaves (`closeCode`, `upS`,
`lastDataAgoMs`), takeovers, refusals, undelivered, and once a minute a traffic summary per
room. Behind Caddy the client address is the last `X-Forwarded-For` entry.

## Data (`DATA_DIR`)

```
files/<sha256>.<ext>   immutable store          derived.json   conversions + thumbnails by source hash
library.json           shared library           games/<id>/    latest.json, summary.json, <ms>.json ×10
uploads/               link fetches (7 days)    trash/         deleted games (30 days)
```

The cleanup runs at start and every 6 h (also stale `*.tmp`). Files are never deleted.

## Deploy

`server/deploy.sh` (from the Mac, reuses the session's SSH connection): builds app + server
bundle (sharp external), rsyncs to `~/battlemap-v2/{app,server}` on the VPS, installs bun 1.4.0
in `~/.bun` and sharp, writes and restarts the systemd unit **`battlemap-v2`** (port 5929, data
in `~/battlemap-v2/data`), adds the Caddy site if missing, checks `/health` and the old 4242/9090.

Caddy runs in Docker (`/opt/victorialogs/Caddyfile`, network `victorialogs_default`); the
site block it added:

```
battlemap.srv1189697.hstgr.cloud {
	encode zstd gzip
	reverse_proxy 172.19.0.1:5929
}
```

(`*.srv1189697.hstgr.cloud` resolves to the VPS, so Caddy gets the certificate itself; WebSocket
upgrade is automatic.) Logs: `journalctl -u battlemap-v2`, MwLog app `battlemap-v2`.

## v1 library import

`server/scripts/import-v1-library.ts` (bundled as `import-v1-library.js`) reads v1's
`uploads/library/index.json`, splits each `.dd2vtt` into picture + geometry, makes table copies
(≤ 72 px per square), and posts through the HTTP API with v1's ids, names, squares, own-grid
flag and dates; re-runs skip existing ids. Run on the VPS on 2026-10-25: 15 of 15 imported.

```sh
cd ~/battlemap-v2/server && ~/.bun/bin/bun import-v1-library.js --from ~/battlemap/build/web/uploads/library --to http://127.0.0.1:5929
```

## Known gaps

- No authentication on writes (as in v1): anyone who knows the address can upload, add to the
  library or overwrite a backup. A shared token per table is the obvious next step.
- Files are never garbage-collected; DM layers that travel with a library map (parity LY-08)
  are not in the entry yet.
