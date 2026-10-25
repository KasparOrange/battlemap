//! The shared types' JSON Schema, embedded at build time from
//! `shared/src/generated/schema.json` (generated from the valibot schemas in `shared/` by
//! `server-contract/scripts/schema.ts`). Every check of what arrives — a hello, a ping, a
//! routing envelope, a library map, a game backup — goes through it, so the Rust server refuses
//! exactly what the shared schemas refuse.
//!
//! Differences to valibot that can't matter on the wire: `finite` isn't in the schema (JSON has
//! no NaN or Infinity), and valibot drops unknown object keys while the server keeps them (a
//! newer app's fields survive a round trip through the server).

use std::collections::HashMap;
use std::sync::LazyLock;

use jsonschema::Validator;
use serde_json::{Value, json};

/// The schema document as generated.
pub const SCHEMA_JSON: &str = include_str!("../../shared/src/generated/schema.json");

/// The parsed schema document (with `$defs`).
static DOC: LazyLock<Value> =
    LazyLock::new(|| serde_json::from_str(SCHEMA_JSON).unwrap_or_else(|e| panic!("schema.json is not JSON: {e}")));

/// The shared definitions the server checks with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Def {
    /// `hello` or `ping` (`ClientControl`).
    ClientControl,
    /// The routing part of a peer message (`RoutingEnvelope`).
    RoutingEnvelope,
    /// A map (`MapInfo`).
    MapInfo,
    /// A file reference (`FileRef`).
    FileRef,
    /// A game (`Game`).
    Game,
    /// A shared library entry (`LibraryEntry`).
    LibraryEntry,
    /// A game summary (`GameSummary`).
    GameSummary,
    /// Anything the server sends of its own (`ServerMessage`).
    ServerMessage,
}

impl Def {
    /// The definition's name in `$defs`.
    pub fn name(self) -> &'static str {
        match self {
            Self::ClientControl => "ClientControl",
            Self::RoutingEnvelope => "RoutingEnvelope",
            Self::MapInfo => "MapInfo",
            Self::FileRef => "FileRef",
            Self::Game => "Game",
            Self::LibraryEntry => "LibraryEntry",
            Self::GameSummary => "GameSummary",
            Self::ServerMessage => "ServerMessage",
        }
    }
}

/// Every definition the server checks with, in one list.
const ALL: [Def; 8] = [
    Def::ClientControl,
    Def::RoutingEnvelope,
    Def::MapInfo,
    Def::FileRef,
    Def::Game,
    Def::LibraryEntry,
    Def::GameSummary,
    Def::ServerMessage,
];

/// The compiled validators, made once on first use (call [`warm_up`] at start).
static VALIDATORS: LazyLock<HashMap<Def, Validator>> = LazyLock::new(|| {
    ALL.iter()
        .map(|&def| {
            let name = def.name();
            let schema = json!({ "$defs": DOC["$defs"].clone(), "$ref": format!("#/$defs/{name}") });
            let compiled = jsonschema::draft202012::new(&schema).unwrap_or_else(|e| panic!("schema.json: {name} does not compile: {e}"));
            (def, compiled)
        })
        .collect()
});

/// Compiles every validator now, so the first request doesn't pay for it (and a broken
/// schema stops the server at start, not mid-game).
pub fn warm_up() {
    LazyLock::force(&VALIDATORS);
}

/// Checks a value against a shared definition.
///
/// # Errors
/// The first problem found, as `<path>: <what>` (e.g. `/map/grid/cols: 0 is less than 1`).
pub fn check(def: Def, value: &Value) -> Result<(), String> {
    let Some(validator) = VALIDATORS.get(&def) else {
        return Err(format!("no schema for {}", def.name()));
    };
    match validator.iter_errors(value).next() {
        None => Ok(()),
        Some(e) => {
            let path = e.instance_path.to_string();
            let msg = e.to_string();
            let msg = if msg.len() > 160 {
                format!("{}…", &msg[..msg.floor_char_boundary(160)])
            } else {
                msg
            };
            Err(if path.is_empty() { msg } else { format!("{path}: {msg}") })
        }
    }
}

/// `PROTOCOL_VERSION` from the shared protocol.
pub fn protocol_version() -> i64 {
    DOC["x-constants"]["protocolVersion"].as_i64().unwrap_or(1)
}

/// The message types only the server may send (clients sending them are dropped).
pub static SERVER_MESSAGE_TYPES: LazyLock<Vec<String>> = LazyLock::new(|| {
    DOC["x-constants"]["serverMessageTypes"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default()
});

/// Whether a type is a server message type.
pub fn is_server_type(t: &str) -> bool {
    SERVER_MESSAGE_TYPES.iter().any(|s| s == t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::*;

    fn peer() -> Peer {
        Peer {
            client: "c1".into(),
            role: Role::Companion,
            name: "Tab".into(),
        }
    }

    #[test]
    fn constants_come_from_the_shared_protocol() {
        assert_eq!(protocol_version(), 1);
        assert!(is_server_type("welcome") && is_server_type("relay.undelivered"));
        assert!(!is_server_type("sync.cmd") && !is_server_type("hello"));
    }

    #[test]
    fn every_server_message_the_relay_sends_passes_the_shared_schema() {
        let n = |v: u64| serde_json::Number::from(v);
        let msgs = [
            ServerMessage::Welcome {
                client: "c".into(),
                room: "r".into(),
                role: Role::Tv,
                peers: vec![peer()],
                build: None,
                server_time: 1,
            },
            ServerMessage::Welcome {
                client: "c".into(),
                room: "r".into(),
                role: Role::Companion,
                peers: vec![],
                build: Some("b".into()),
                server_time: 1,
            },
            ServerMessage::Pong { t: n(5), server_time: 1 },
            ServerMessage::PeerJoined { peer: peer() },
            ServerMessage::PeerLeft {
                client: "c".into(),
                role: Role::Tv,
            },
            ServerMessage::Replaced { by: "TV".into() },
            ServerMessage::Undelivered {
                msg_type: "sync.cmd".into(),
                seq: Some(3),
                reason: "no-tv".into(),
            },
            ServerMessage::Undelivered {
                msg_type: "lib.list".into(),
                seq: None,
                reason: "no-tv".into(),
            },
            ServerMessage::ServerBuild { build: "b".into() },
            ServerMessage::ServerError { reason: "x".into() },
        ];
        for m in msgs {
            let v: Value = serde_json::from_str(&m.text()).unwrap();
            check(Def::ServerMessage, &v).unwrap_or_else(|e| panic!("{v}: {e}"));
        }
    }

    #[test]
    fn library_entries_and_summaries_the_server_builds_pass() {
        let file = FileRef {
            hash: "a".repeat(64),
            ext: FileExt::Webp,
            bytes: 10,
        };
        let map = json!({
            "id": "m1", "name": "Map", "kind": "picture", "picture": file, "tableCopy": null, "geometry": null,
            "grid": {"x": 0, "y": 0, "cellW": 10, "cellH": 10, "cols": 10, "rows": 8, "pictureW": 100, "pictureH": 80},
            "drawGrid": true, "doorCount": 0, "drawDoors": false, "libraryId": "m1"
        });
        check(Def::MapInfo, &map).unwrap();
        let entry = LibraryEntry {
            map,
            thumb: Some(file.clone()),
            added_at: "2026-10-25T18:00:00.000Z".into(),
            original_bytes: Some(3),
            note: None,
        };
        check(Def::LibraryEntry, &serde_json::to_value(&entry).unwrap()).unwrap();
        let summary = GameSummary {
            id: "g".into(),
            name: "G".into(),
            created_at: "2026-10-25T18:00:00.000Z".into(),
            saved_at: "2026-10-25T18:00:00.000Z".into(),
            map_names: vec!["Map".into()],
            active_map_name: "Map".into(),
            thumb: None,
            where_: "server".into(),
        };
        check(Def::GameSummary, &serde_json::to_value(&summary).unwrap()).unwrap();
        check(Def::FileRef, &serde_json::to_value(&file).unwrap()).unwrap();
    }

    #[test]
    fn refusals_name_the_place() {
        assert!(
            check(Def::FileRef, &json!({"hash": "xyz", "ext": "png", "bytes": 1}))
                .unwrap_err()
                .contains("/hash")
        );
        assert!(check(Def::ClientControl, &json!({"type": "hello"})).is_err());
        assert!(check(Def::RoutingEnvelope, &json!({"type": "x", "seq": -1})).is_err());
        check(Def::RoutingEnvelope, &json!({"type": "sync.cmd", "seq": 1, "anything": [1, 2]})).unwrap();
    }
}
