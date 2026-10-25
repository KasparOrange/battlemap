//! The wire types: everything the server writes or reads as JSON.
//!
//! Two sources of truth, one per kind of type, so every type is defined exactly once:
//!
//! - **Shared types** (the game model and the relay protocol: `FileRef`, `MapInfo`,
//!   `LibraryEntry`, `GameSummary`, `Game`, `hello`, `welcome`, …) are valibot schemas in
//!   `shared/` — the app owns them. `shared/src/generated/schema.json` is generated from them
//!   (`server-contract/scripts/schema.ts`); the server checks what arrives against it
//!   ([`crate::schema`]). The Rust structs below that mirror shared types are only the server's
//!   view for building answers; a test checks every one of them against the schema.
//! - **Server-only types** (the HTTP answers no peer sends: `UploadResult`, `Fetched`, `Health`,
//!   `TableInfo`, `VersionInfo`, …) are defined here; `shared/src/generated/server.ts` is
//!   generated from them with ts-rs (`UPDATE_GENERATED=1 cargo test`), and a test fails when it
//!   is stale.
//!
//! Games are opaque to the server: it checks them against the schema, reads the few summary
//! fields ([`GameView`]) and stores the bytes as they came.

use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(test)]
use ts_rs::TS;

// ── shared types, the server's view (checked against schema.json in tests) ──────────────────

/// File kinds the server stores (shared `FileExt`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileExt {
    /// A PNG picture.
    Png,
    /// A JPEG picture.
    Jpg,
    /// A WebP picture.
    Webp,
    /// JSON (a map's geometry).
    Json,
    /// A PDF.
    Pdf,
}

impl FileExt {
    /// The extension as written in file names and URLs.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpg => "jpg",
            Self::Webp => "webp",
            Self::Json => "json",
            Self::Pdf => "pdf",
        }
    }

    /// The kind for an extension (`jpeg` counts as `jpg`), case-insensitive.
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "png" => Some(Self::Png),
            "jpg" | "jpeg" => Some(Self::Jpg),
            "webp" => Some(Self::Webp),
            "json" => Some(Self::Json),
            "pdf" => Some(Self::Pdf),
            _ => None,
        }
    }
}

/// A file on the server, by content (shared `FileRef`): `/files/<hash>.<ext>`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileRef {
    /// SHA-256 of the content, lowercase hex.
    pub hash: String,
    /// Its kind.
    pub ext: FileExt,
    /// Its size in bytes.
    pub bytes: u64,
}

/// A map in the shared library (shared `LibraryEntry`); `map` is the checked `MapInfo` as sent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    /// The map (`MapInfo`), `libraryId` set to its id.
    pub map: Value,
    /// A small picture for the list.
    pub thumb: Option<FileRef>,
    /// When it was added (ISO).
    pub added_at: String,
    /// Bytes as uploaded before conversion, or null.
    pub original_bytes: Option<u64>,
    /// What the conversion did, or null.
    pub note: Option<String>,
}

impl LibraryEntry {
    /// The map's id (its library id).
    pub fn id(&self) -> &str {
        self.map.get("id").and_then(Value::as_str).unwrap_or("")
    }
}

/// A game as a library row shows it (shared `GameSummary`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSummary {
    /// The game's id.
    pub id: String,
    /// Its name.
    pub name: String,
    /// When it was started.
    pub created_at: String,
    /// When the server received this save (ISO).
    pub saved_at: String,
    /// Names of its maps, in order.
    pub map_names: Vec<String>,
    /// The map that was on the table.
    pub active_map_name: String,
    /// Its picture's thumbnail, if the server has one.
    pub thumb: Option<FileRef>,
    /// Always `server` here.
    #[serde(rename = "where")]
    pub where_: String,
}

/// TV or companion (shared `Role`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// The table.
    Tv,
    /// A DM device.
    Companion,
}

impl Role {
    /// The role's name.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tv => "tv",
            Self::Companion => "companion",
        }
    }
}

/// Someone in a room (shared `Peer`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Peer {
    /// Their client id.
    pub client: String,
    /// TV or companion.
    pub role: Role,
    /// A human name.
    pub name: String,
}

/// The first message on a socket (shared `Hello`), read after the schema check.
#[derive(Debug, Clone, Deserialize)]
pub struct Hello {
    /// The client's protocol version.
    pub protocol: i64,
    /// TV or companion.
    pub role: Role,
    /// The table's id.
    pub room: String,
    /// This device's client id.
    pub client: String,
    /// A human name for this device.
    pub name: String,
    /// The app build the client runs.
    pub build: String,
}

/// What the server sends of its own (shared `ServerMessage`).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    /// You're in.
    #[serde(rename = "welcome")]
    Welcome {
        /// Your client id.
        client: String,
        /// Your room.
        room: String,
        /// Your role.
        role: Role,
        /// Everyone else in the room.
        peers: Vec<Peer>,
        /// The app build the server serves, or null.
        build: Option<String>,
        /// The server's clock (epoch ms).
        #[serde(rename = "serverTime")]
        server_time: u64,
    },
    /// Answer to `ping`.
    #[serde(rename = "pong")]
    Pong {
        /// The ping's `t`, echoed as it came.
        t: serde_json::Number,
        /// The server's clock.
        #[serde(rename = "serverTime")]
        server_time: u64,
    },
    /// Someone joined the room.
    #[serde(rename = "peer.joined")]
    PeerJoined {
        /// Who.
        peer: Peer,
    },
    /// Someone left the room.
    #[serde(rename = "peer.left")]
    PeerLeft {
        /// Their client id.
        client: String,
        /// Their role.
        role: Role,
    },
    /// Another TV took the room's TV slot.
    #[serde(rename = "replaced")]
    Replaced {
        /// The new TV's name.
        by: String,
    },
    /// A message could not be delivered.
    #[serde(rename = "relay.undelivered")]
    Undelivered {
        /// The type of the message that wasn't delivered.
        #[serde(rename = "msgType")]
        msg_type: String,
        /// Its `seq` if it was a `sync.cmd`.
        #[serde(skip_serializing_if = "Option::is_none")]
        seq: Option<u64>,
        /// Why: `no-tv`, `no-such-client`, `rate-limited`.
        reason: String,
    },
    /// The server now serves a newer app build.
    #[serde(rename = "server.build")]
    ServerBuild {
        /// The build.
        build: String,
    },
    /// The server refuses this socket; it closes after this.
    #[serde(rename = "server.error")]
    ServerError {
        /// Why.
        reason: String,
    },
}

impl ServerMessage {
    /// The message as a JSON text frame.
    pub fn text(&self) -> String {
        // Serialising these plain structs can't fail; an empty object is the impossible fallback.
        serde_json::to_string(self).unwrap_or_else(|_| "{}".into())
    }
}

/// The fields of a stored game the server reads for its summary (the rest is opaque).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameView {
    /// The game's id.
    pub id: String,
    /// Its name.
    pub name: String,
    /// When it was started.
    pub created_at: String,
    /// The order of its maps.
    pub map_order: Vec<String>,
    /// The map on the table.
    pub active_map_id: String,
    /// Its maps by id.
    pub maps: std::collections::HashMap<String, MapPlayView>,
}

/// A map of a game, as far as the summary needs it.
#[derive(Debug, Deserialize)]
pub struct MapPlayView {
    /// The map's description.
    pub info: MapInfoView,
}

/// The fields of a `MapInfo` the server reads.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapInfoView {
    /// The map's id.
    pub id: String,
    /// Its name.
    pub name: String,
    /// `uvtt` or `picture`.
    pub kind: String,
    /// The original picture.
    pub picture: FileRef,
    /// The table copy, if any.
    pub table_copy: Option<FileRef>,
    /// The geometry file, if any.
    pub geometry: Option<FileRef>,
    /// The library entry it came from.
    pub library_id: Option<String>,
    /// Its squares.
    pub grid: GridView,
}

/// A map's size in squares.
#[derive(Debug, Clone, Deserialize)]
pub struct GridView {
    /// Squares across.
    pub cols: u32,
    /// Squares down.
    pub rows: u32,
}

// ── server-only types (source of truth here; TypeScript generated into shared/) ────────────

/// A refusal: every 4xx/5xx JSON answer.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct ErrorBody {
    /// Why, in words the app may show.
    pub error: String,
}

/// What `POST /files` answers: the stored file's `FileRef` fields plus what the server found
/// and made.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    /// SHA-256 of the stored bytes.
    pub hash: String,
    /// The stored kind.
    #[cfg_attr(test, ts(type = "FileRef['ext']"))]
    pub ext: FileExt,
    /// The stored size in bytes.
    #[cfg_attr(test, ts(type = "number"))]
    pub bytes: u64,
    /// Picture width in pixels (upright), or null for JSON / PDF.
    pub width: Option<u32>,
    /// Picture height in pixels (upright), or null.
    pub height: Option<u32>,
    /// The thumbnail (≤ 288 px WebP) of a picture, or null.
    #[cfg_attr(test, ts(type = "FileRef | null"))]
    pub thumb: Option<FileRef>,
    /// Bytes as uploaded when the picture was converted, else null.
    #[cfg_attr(test, ts(type = "number | null"))]
    pub original_bytes: Option<u64>,
    /// What the conversion did ("lossless", "already smaller as it was", …), or null.
    pub note: Option<String>,
}

/// What a link fetch found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "lowercase")]
pub enum FetchKind {
    /// A PNG, JPEG or WebP (other pictures arrive as PNG).
    Picture,
    /// A PDF.
    Pdf,
    /// A `.dd2vtt` / `.uvtt` map.
    Uvtt,
}

/// What `GET /api/fetch?url=` answers.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct Fetched {
    /// Where the app downloads it: `/uploads/<name>` (relative to the server).
    pub url: String,
    /// A file name for the import ("Tower.dd2vtt", "map.png").
    pub name: String,
    /// Its size in bytes.
    #[cfg_attr(test, ts(type = "number"))]
    pub bytes: u64,
    /// What it is.
    pub kind: FetchKind,
    /// Its extension (`png`, `jpg`, `webp`, `pdf`, `dd2vtt`, `uvtt`).
    pub ext: String,
}

/// One stored version of a game backup.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    /// When it was saved (ISO); pass as `?at=` to get it.
    pub saved_at: String,
    /// Its size in bytes.
    #[cfg_attr(test, ts(type = "number"))]
    pub bytes: u64,
    /// Whether it is the latest one.
    pub latest: bool,
}

/// `GET /api/games/<id>/versions`: newest first, the latest first of all.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct Versions {
    /// The versions.
    pub versions: Vec<VersionInfo>,
}

/// `GET /api/games`: every backed-up game, newest save first.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct GameList {
    /// The summaries (`where: "server"`).
    #[cfg_attr(test, ts(type = "GameSummary[]"))]
    pub games: Vec<GameSummary>,
}

/// `GET /api/library`: the shared library, newest first.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct LibraryList {
    /// The entries.
    #[cfg_attr(test, ts(type = "LibraryEntry[]"))]
    pub entries: Vec<LibraryEntry>,
}

/// `POST /api/library`: the stored entry and whether it was new (201) or replaced one (200).
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct LibraryPut {
    /// The stored entry.
    #[cfg_attr(test, ts(type = "LibraryEntry"))]
    pub entry: LibraryEntry,
    /// True for a new entry.
    pub added: bool,
}

/// `DELETE /api/library/<id>`: the entry that went (its files stay).
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct LibraryRemoved {
    /// The removed entry.
    #[cfg_attr(test, ts(type = "LibraryEntry"))]
    pub removed: LibraryEntry,
}

/// A room with a TV online, as the companion's table picker lists it.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    /// The room (table) id.
    pub room: String,
    /// The TV's name.
    pub tv_name: String,
    /// Companions connected.
    pub companions: u32,
    /// When the TV joined (ISO).
    pub since: String,
}

/// `GET /api/tables`: the rooms with a TV online, newest TV first.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct Tables {
    /// One row per table.
    pub tables: Vec<TableInfo>,
}

/// The relay's counts in `/health`.
#[derive(Debug, Clone, Copy, Default, Serialize)]
#[cfg_attr(test, derive(TS))]
pub struct RelayStats {
    /// Rooms open.
    pub rooms: u32,
    /// Rooms with a TV.
    pub tvs: u32,
    /// Companions connected.
    pub companions: u32,
    /// Sockets that said hello.
    pub members: u32,
    /// Sockets that haven't said hello yet.
    pub waiting: u32,
}

/// `GET /health`.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
pub struct Health {
    /// Whether the library and the backups could be read.
    pub ok: bool,
    /// The app build the server serves, or null.
    pub build: Option<String>,
    /// The server's own build.
    pub server_build: String,
    /// Which server answers (`rust`; the Bun server sends none).
    pub server: String,
    /// Seconds since start.
    #[cfg_attr(test, ts(type = "number"))]
    pub uptime_s: u64,
    /// When it started (ISO).
    pub started_at: String,
    /// The relay's counts.
    #[serde(flatten)]
    pub relay: RelayStats,
    /// Entries in the shared library, or null when it can't be read.
    pub library: Option<u32>,
    /// Game backups, or null when they can't be read.
    pub games: Option<u32>,
    /// The log shipper's state (mwlog).
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub mwlog: Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// The generated TypeScript file, built from the ts-rs declarations.
    fn generated_ts() -> String {
        let mut out = String::from(
            "// GENERATED by server-rs (src/wire.rs, ts-rs) — do not edit. Regenerate with\n\
             // `UPDATE_GENERATED=1 cargo test` in server-rs; `cargo test` fails when this is stale.\n\
             //\n\
             // The HTTP answers only the server makes. Shared types (FileRef, LibraryEntry,\n\
             // GameSummary, …) stay valibot schemas in ../model/ — see docs/server-rs.md \"wire types\".\n\
             import type { FileRef } from '../model/basics.ts';\n\
             import type { GameSummary, LibraryEntry } from '../model/library.ts';\n",
        );
        let decls: Vec<(String, String)> = vec![
            (ErrorBody::docs().unwrap_or_default(), ErrorBody::decl()),
            (UploadResult::docs().unwrap_or_default(), UploadResult::decl()),
            (FetchKind::docs().unwrap_or_default(), FetchKind::decl()),
            (Fetched::docs().unwrap_or_default(), Fetched::decl()),
            (VersionInfo::docs().unwrap_or_default(), VersionInfo::decl()),
            (Versions::docs().unwrap_or_default(), Versions::decl()),
            (GameList::docs().unwrap_or_default(), GameList::decl()),
            (LibraryList::docs().unwrap_or_default(), LibraryList::decl()),
            (LibraryPut::docs().unwrap_or_default(), LibraryPut::decl()),
            (LibraryRemoved::docs().unwrap_or_default(), LibraryRemoved::decl()),
            (TableInfo::docs().unwrap_or_default(), TableInfo::decl()),
            (Tables::docs().unwrap_or_default(), Tables::decl()),
            (RelayStats::docs().unwrap_or_default(), RelayStats::decl()),
            (Health::docs().unwrap_or_default(), Health::decl()),
        ];
        for (docs, decl) in decls {
            out.push('\n');
            out.push_str(&docs);
            out.push_str("export ");
            out.push_str(&decl);
            out.push('\n');
        }
        out
    }

    fn ts_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../shared/src/generated/server.ts")
    }

    #[test]
    fn generated_typescript_is_fresh() {
        let want = generated_ts();
        if std::env::var("UPDATE_GENERATED").is_ok_and(|v| v == "1") {
            std::fs::write(ts_path(), &want).unwrap();
        }
        let have = std::fs::read_to_string(ts_path()).unwrap_or_default();
        assert!(
            have == want,
            "shared/src/generated/server.ts is stale — run `UPDATE_GENERATED=1 cargo test` in server-rs"
        );
    }
}
