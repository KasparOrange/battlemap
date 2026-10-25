//! The shared types' JSON Schema, embedded at build time from
//! `shared/src/generated/schema.json` (generated from the valibot schemas in `shared/` by
//! `server-contract/scripts/schema.ts`). Every check of what arrives — a hello, a ping, a
//! routing envelope, a library map, a game backup — goes through it, so the Rust server refuses
//! exactly what the shared schemas refuse.
//!
//! The checker is a small interpreter for the keywords the generator emits (`type`, `const`,
//! `enum`, `properties`, `required`, `additionalProperties`, `propertyNames`, `items`,
//! `minItems`/`maxItems`, `minLength`/`maxLength`, `pattern`, `minimum`/`maximum`/
//! `exclusiveMinimum`, `anyOf`, `oneOf`, `$ref` into `$defs`); a keyword it doesn't know makes
//! [`warm_up`] fail at start, so a new valibot feature can't slip by unchecked. (The
//! `jsonschema` crate did the same job but kept ~100 MB of meta-schema machinery resident —
//! too much for the 2 GB TV box.) Lengths count UTF-16 units, like valibot.
//!
//! Differences to valibot that can't matter on the wire: `finite` isn't in the schema (JSON has
//! no NaN or Infinity), and valibot drops unknown object keys while the server keeps them (a
//! newer app's fields survive a round trip through the server).

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

/// The schema document as generated.
pub const SCHEMA_JSON: &str = include_str!("../../shared/src/generated/schema.json");

/// The parsed schema document (with `$defs`).
static DOC: LazyLock<Value> =
    LazyLock::new(|| serde_json::from_str(SCHEMA_JSON).unwrap_or_else(|e| panic!("schema.json is not JSON: {e}")));

/// Every `pattern` in the document, compiled once.
static PATTERNS: LazyLock<HashMap<String, Regex>> = LazyLock::new(|| {
    let mut out = HashMap::new();
    collect_patterns(&DOC, &mut out);
    out
});

fn collect_patterns(v: &Value, out: &mut HashMap<String, Regex>) {
    match v {
        Value::Object(map) => {
            for (k, child) in map {
                if k == "pattern"
                    && let Some(p) = child.as_str()
                {
                    let re = Regex::new(p).unwrap_or_else(|e| panic!("schema.json: pattern {p} does not compile: {e}"));
                    out.insert(p.to_string(), re);
                } else {
                    collect_patterns(child, out);
                }
            }
        }
        Value::Array(items) => items.iter().for_each(|c| collect_patterns(c, out)),
        _ => {}
    }
}

/// The keywords the checker understands (anything else in a schema is a start-up error).
const KNOWN: [&str; 22] = [
    "type",
    "const",
    "enum",
    "properties",
    "required",
    "additionalProperties",
    "propertyNames",
    "items",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "anyOf",
    "oneOf",
    "allOf",
    "$ref",
    "description",
];

/// Refuses a schema with a keyword the checker doesn't know.
fn check_keywords(schema: &Value, at: &str) -> Result<(), String> {
    let Some(map) = schema.as_object() else { return Ok(()) };
    for (k, v) in map {
        if !KNOWN.contains(&k.as_str()) {
            return Err(format!("schema.json {at}: keyword {k} is not supported by server-rs/src/schema.rs"));
        }
        match k.as_str() {
            "properties" => {
                for (name, p) in v.as_object().into_iter().flatten() {
                    check_keywords(p, &format!("{at}/{name}"))?;
                }
            }
            "items" | "additionalProperties" | "propertyNames" => check_keywords(v, at)?,
            "anyOf" | "oneOf" | "allOf" => {
                for s in v.as_array().into_iter().flatten() {
                    check_keywords(s, at)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

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

/// Parses the document, compiles its patterns and checks that every definition uses only
/// keywords the checker knows — at start, so a schema the checker can't follow stops the server
/// before the first game, not in the middle of one.
///
/// # Panics
/// When `schema.json` is broken or uses an unsupported keyword (a build that can't be right).
pub fn warm_up() {
    LazyLock::force(&PATTERNS);
    for (name, def) in DOC["$defs"].as_object().into_iter().flatten() {
        if let Err(e) = check_keywords(def, name) {
            panic!("{e}");
        }
    }
    for def in ALL {
        assert!(DOC["$defs"].get(def.name()).is_some(), "schema.json has no {}", def.name());
    }
}

/// Checks a value against a shared definition.
///
/// # Errors
/// The first problem found, as `<path>: <what>` (e.g. `/grid/cols: 0 is less than 1`).
pub fn check(def: Def, value: &Value) -> Result<(), String> {
    let schema = DOC["$defs"]
        .get(def.name())
        .ok_or_else(|| format!("no schema for {}", def.name()))?;
    validate(schema, value, "")
}

/// The JSON type name of a value as JSON Schema says it.
fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn has_type(v: &Value, t: &str) -> bool {
    match t {
        "integer" => v.as_f64().is_some_and(|n| n.fract() == 0.0),
        "number" => v.is_number(),
        other => type_name(v) == other,
    }
}

/// A short text of a value for refusals.
fn short(v: &Value) -> String {
    let s = v.to_string();
    if s.len() > 40 {
        format!("{}…", &s[..s.floor_char_boundary(40)])
    } else {
        s
    }
}

/// One schema against one value; `at` is the JSON pointer so far.
fn validate(schema: &Value, v: &Value, at: &str) -> Result<(), String> {
    let Some(s) = schema.as_object() else { return Ok(()) };
    let fail = |what: String| Err(format!("{}: {what}", if at.is_empty() { "/" } else { at }));
    if let Some(r) = s.get("$ref").and_then(Value::as_str) {
        let name = r.strip_prefix("#/$defs/").ok_or_else(|| format!("unsupported $ref {r}"))?;
        let target = DOC["$defs"].get(name).ok_or_else(|| format!("unknown $ref {r}"))?;
        validate(target, v, at)?;
    }
    if let Some(t) = s.get("type") {
        let ok = match t {
            Value::String(t) => has_type(v, t),
            Value::Array(ts) => ts.iter().filter_map(Value::as_str).any(|t| has_type(v, t)),
            _ => true,
        };
        if !ok {
            return fail(format!("{} is not of type {t}", short(v)));
        }
    }
    if let Some(c) = s.get("const")
        && c != v
    {
        return fail(format!("{} is not {c}", short(v)));
    }
    if let Some(e) = s.get("enum").and_then(Value::as_array)
        && !e.contains(v)
    {
        return fail(format!("{} is not one of {}", short(v), Value::Array(e.clone())));
    }
    if let Some(text) = v.as_str() {
        let len = text.encode_utf16().count() as u64;
        if s.get("minLength").and_then(Value::as_u64).is_some_and(|min| len < min) {
            return fail(format!("{} is shorter than {}", short(v), s["minLength"]));
        }
        if s.get("maxLength").and_then(Value::as_u64).is_some_and(|max| len > max) {
            return fail(format!("{} is longer than {}", short(v), s["maxLength"]));
        }
        if let Some(p) = s.get("pattern").and_then(Value::as_str)
            && !PATTERNS.get(p).is_some_and(|re| re.is_match(text))
        {
            return fail(format!("{} does not match {p}", short(v)));
        }
    }
    if let Some(n) = v.as_f64() {
        let num = |k: &str| s.get(k).and_then(Value::as_f64);
        if num("minimum").is_some_and(|m| n < m) {
            return fail(format!("{n} is less than {}", s["minimum"]));
        }
        if num("maximum").is_some_and(|m| n > m) {
            return fail(format!("{n} is more than {}", s["maximum"]));
        }
        if num("exclusiveMinimum").is_some_and(|m| n <= m) {
            return fail(format!("{n} is not more than {}", s["exclusiveMinimum"]));
        }
        if num("exclusiveMaximum").is_some_and(|m| n >= m) {
            return fail(format!("{n} is not less than {}", s["exclusiveMaximum"]));
        }
    }
    if let Some(items) = v.as_array() {
        let n = items.len() as u64;
        if s.get("minItems").and_then(Value::as_u64).is_some_and(|min| n < min) {
            return fail(format!("{n} items, at least {} expected", s["minItems"]));
        }
        if s.get("maxItems").and_then(Value::as_u64).is_some_and(|max| n > max) {
            return fail(format!("{n} items, at most {} allowed", s["maxItems"]));
        }
        if let Some(item) = s.get("items") {
            for (i, x) in items.iter().enumerate() {
                validate(item, x, &format!("{at}/{i}"))?;
            }
        }
    }
    if let Some(obj) = v.as_object() {
        for req in s
            .get("required")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if !obj.contains_key(req) {
                return fail(format!("{req} is missing"));
            }
        }
        let props = s.get("properties").and_then(Value::as_object);
        for (k, x) in obj {
            let here = format!("{at}/{k}");
            if let Some(p) = props.and_then(|p| p.get(k)) {
                validate(p, x, &here)?;
            } else if let Some(extra) = s.get("additionalProperties") {
                if extra == &Value::Bool(false) {
                    return fail(format!("{k} is not allowed"));
                }
                validate(extra, x, &here)?;
            }
            if let Some(names) = s.get("propertyNames") {
                validate(names, &Value::String(k.clone()), &here)?;
            }
        }
    }
    if let Some(all) = s.get("allOf").and_then(Value::as_array) {
        for sub in all {
            validate(sub, v, at)?;
        }
    }
    if let Some(any) = s.get("anyOf").and_then(Value::as_array) {
        let mut first = None;
        if !any.iter().any(|sub| match validate(sub, v, at) {
            Ok(()) => true,
            Err(e) => {
                first.get_or_insert(e);
                false
            }
        }) {
            return Err(first.unwrap_or_else(|| format!("{at}: matches none of the choices")));
        }
    }
    if let Some(one) = s.get("oneOf").and_then(Value::as_array) {
        let passing = one.iter().filter(|sub| validate(sub, v, at).is_ok()).count();
        if passing != 1 {
            let kind = v.get("type").map(short).unwrap_or_else(|| short(v));
            return fail(format!("{kind} matches {passing} of the choices, not exactly one"));
        }
    }
    Ok(())
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
    use serde_json::json;

    #[test]
    fn the_whole_document_is_understood() {
        warm_up();
    }

    #[test]
    fn keyword_semantics() {
        let hello = json!({"type": "hello", "protocol": 1, "role": "tv", "room": "r", "client": "c", "name": "n", "build": "b"});
        check(Def::ClientControl, &hello).unwrap();
        check(Def::ClientControl, &json!({"type": "ping", "t": 1.5})).unwrap();
        // integer: 1.0 counts, 1.5 doesn't; enum; lengths in UTF-16 units like valibot.
        assert!(
            check(
                Def::ClientControl,
                &json!({"type": "hello", "protocol": 1.5, "role": "tv", "room": "r", "client": "c", "name": "n", "build": "b"})
            )
            .is_err()
        );
        assert!(
            check(
                Def::ClientControl,
                &json!({"type": "hello", "protocol": 1, "role": "admin", "room": "r", "client": "c", "name": "n", "build": "b"})
            )
            .is_err()
        );
        let long_room = "🎲".repeat(33); // 66 UTF-16 units > 64
        assert!(
            check(
                Def::ClientControl,
                &json!({"type": "hello", "protocol": 1, "role": "tv", "room": long_room, "client": "c", "name": "n", "build": "b"})
            )
            .is_err()
        );
        // a variant (oneOf/anyOf by `type`): an unknown type matches none.
        assert!(check(Def::ClientControl, &json!({"type": "sync.cmd"})).is_err());
    }

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
