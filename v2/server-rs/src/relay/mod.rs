//! The relay: rooms of one TV and any number of companions, and the routing between them — the
//! server's whole part in a game. It reads only a message's `type`, `to` and `seq`, stamps
//! `from`, and passes everything else through untouched (key order and unknown fields too).
//!
//! - The first message on a socket must be `hello` (within the hello timeout), else it is closed.
//! - One TV per room: a TV with another client id takes the slot and the old one gets
//!   `replaced` (it stops reconnecting); the same client reconnecting just replaces its dead
//!   socket. Companions: one slot per client id, up to the cap.
//! - A companion's message goes to the room's TV (or back as `relay.undelivered`); a TV's goes
//!   to every companion, or to the one named in `to`.
//! - Hardening (lessons of the old `tools/vtt_relay.py`): a socket silent for the zombie time
//!   (the app pings every 15 s) is closed; a token-bucket rate limit per socket (drops logged, a
//!   `sync.cmd` comes back `rate-limited`, a flood closes the socket); a consumer that can't keep
//!   up is closed; caps on rooms, companions per room and sockets waiting for hello per address.
//!   A client can't send server message types.
//! - Logs (area `relay`): joins, leaves (close code, time up, messages), takeovers, refusals,
//!   zombies, rate drops, undelivered messages, and once a minute a traffic summary per room.
//!
//! Independent of the socket library: it talks to a [`Conn`] (a channel to the socket's task,
//! [`socket`]), so it is easy to read and test. Close codes in [`close`].
//!
//! See also `docs/protocol.md` "layers and routing".

pub mod socket;

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::mpsc;

use crate::config::RelayLimits;
use crate::fsx::{iso, now_ms};
use crate::schema::{Def, check, is_server_type, protocol_version};
use crate::wire::{Hello, Peer, RelayStats, Role, ServerMessage, TableInfo};

/// Close codes the relay uses (same as the Bun server's).
pub mod close {
    /// The same client connected again; this socket is the old one.
    pub const SUPERSEDED: u16 = 4000;
    /// Another TV took the room.
    pub const REPLACED: u16 = 4001;
    /// No hello in time.
    pub const NO_HELLO: u16 = 4002;
    /// The first message wasn't a valid hello.
    pub const BAD_HELLO: u16 = 4003;
    /// Another protocol version.
    pub const PROTOCOL: u16 = 4004;
    /// Silent too long (no ping).
    pub const ZOMBIE: u16 = 4005;
    /// Sent far more than the rate limit.
    pub const RATE: u16 = 4006;
    /// Couldn't keep up with what it was sent.
    pub const SLOW: u16 = 4007;
    /// A cap was reached (rooms, companions in a room, sockets waiting from one address).
    pub const FULL: u16 = 4008;
    /// The server is stopping.
    pub const GOING_AWAY: u16 = 1001;
    /// A frame over the size limit.
    pub const TOO_BIG: u16 = 1009;
}

/// What the relay asks a socket's task to do.
#[derive(Debug)]
pub enum Outbound {
    /// Send a text frame.
    Text(String),
    /// Send a close frame with this code and reason, then end.
    Close(u16, String),
}

/// One socket, as the relay sees it: an id, the client's address, and a channel to the task
/// that owns the socket.
#[derive(Debug, Clone)]
pub struct Conn {
    /// Unique per socket.
    pub id: u64,
    /// The client's address (for the log and the per-address cap).
    pub ip: String,
    tx: mpsc::UnboundedSender<Outbound>,
    buffered: Arc<AtomicUsize>,
}

impl Conn {
    /// A connection and the receiving end its socket task reads.
    pub fn new(id: u64, ip: String) -> (Self, mpsc::UnboundedReceiver<Outbound>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (
            Self {
                id,
                ip,
                tx,
                buffered: Arc::new(AtomicUsize::new(0)),
            },
            rx,
        )
    }

    /// Queues a text frame (counted as buffered until the socket task wrote it).
    pub fn send(&self, text: String) {
        self.buffered.fetch_add(text.len(), Ordering::Relaxed);
        let _ = self.tx.send(Outbound::Text(text));
    }

    /// Asks the socket task to close the socket.
    pub fn close(&self, code: u16, reason: &str) {
        let _ = self.tx.send(Outbound::Close(code, reason.chars().take(120).collect()));
    }

    /// Bytes queued but not yet written.
    pub fn buffered(&self) -> usize {
        self.buffered.load(Ordering::Relaxed)
    }

    /// The socket task wrote `n` bytes of the queue.
    pub fn written(&self, n: usize) {
        self.buffered
            .fetch_sub(n.min(self.buffered.load(Ordering::Relaxed)), Ordering::Relaxed);
    }
}

/// A socket that said hello.
struct Member {
    conn: Conn,
    hello: Hello,
    room: String,
    joined_at: Instant,
    joined_ms: u64,
    messages: u64,
    /// When the last frame (any, pings too) arrived.
    last_data_at: Instant,
    tokens: f64,
    refilled_at: Instant,
    /// Messages dropped for the rate in the current minute, and when that minute began.
    rate_dropped: u32,
    rate_window_at: Instant,
}

/// Messages and bytes a room's members sent since the last summary.
#[derive(Debug, Default, Clone, Copy)]
struct Traffic {
    tv_messages: u64,
    tv_bytes: u64,
    companion_messages: u64,
    companion_bytes: u64,
    undelivered: u64,
    rate_dropped: u64,
}

/// A table: its TV and its companions (by client id, in joining order), as socket ids.
struct Room {
    tv: Option<u64>,
    companions: Vec<(String, u64)>,
    traffic: Traffic,
}

impl Room {
    fn companion(&self, client: &str) -> Option<u64> {
        self.companions.iter().find(|(c, _)| c == client).map(|(_, id)| *id)
    }

    /// Every member's socket id, the TV first.
    fn everyone(&self) -> impl Iterator<Item = u64> + '_ {
        self.tv.into_iter().chain(self.companions.iter().map(|(_, id)| *id))
    }
}

struct Waiting {
    ip: String,
    conn: Conn,
}

#[derive(Default)]
struct Inner {
    rooms: HashMap<String, Room>,
    members: HashMap<u64, Member>,
    waiting: HashMap<u64, Waiting>,
    waiting_by_ip: HashMap<String, usize>,
    last_summary_at: Option<Instant>,
}

/// The relay.
pub struct Relay {
    inner: Mutex<Inner>,
    limits: RelayLimits,
    hello_timeout: Duration,
    build: Arc<RwLock<Option<String>>>,
}

impl Relay {
    /// A relay with these limits; `build` is the app build the server serves (for `welcome`).
    pub fn new(limits: RelayLimits, hello_timeout: Duration, build: Arc<RwLock<Option<String>>>) -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            limits,
            hello_timeout,
            build,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// The relay's limits.
    pub fn limits(&self) -> &RelayLimits {
        &self.limits
    }

    /// A socket opened: it waits for its hello (closed after the hello timeout, or at once when
    /// its address has too many sockets waiting).
    pub fn open(self: &Arc<Self>, conn: &Conn) {
        {
            let mut inner = self.lock();
            let from_ip = inner.waiting_by_ip.get(&conn.ip).copied().unwrap_or(0) + 1;
            if from_ip > self.limits.waiting_per_ip {
                tracing::warn!(target: "relay", ip = %conn.ip, waiting = from_ip - 1, "Too many sockets waiting from one address");
                conn.close(close::FULL, "too many sockets");
                return;
            }
            inner.waiting_by_ip.insert(conn.ip.clone(), from_ip);
            inner.waiting.insert(
                conn.id,
                Waiting {
                    ip: conn.ip.clone(),
                    conn: conn.clone(),
                },
            );
        }
        let me = Arc::clone(self);
        let id = conn.id;
        tokio::spawn(async move {
            tokio::time::sleep(me.hello_timeout).await;
            let waiting = me.lock().waiting.get(&id).map(|w| w.conn.clone());
            if let Some(conn) = waiting {
                tracing::warn!(target: "relay", ip = %conn.ip, ms = me.hello_timeout.as_millis() as u64, "No hello in time");
                conn.close(close::NO_HELLO, "no hello");
            }
        });
    }

    /// A socket stops waiting for its hello (it said it, or closed).
    fn done_waiting(inner: &mut Inner, id: u64) {
        let Some(w) = inner.waiting.remove(&id) else { return };
        let n = inner.waiting_by_ip.get(&w.ip).copied().unwrap_or(1).saturating_sub(1);
        if n == 0 {
            inner.waiting_by_ip.remove(&w.ip);
        } else {
            inner.waiting_by_ip.insert(w.ip, n);
        }
    }

    /// A text frame arrived.
    pub fn message(&self, conn: &Conn, text: &str) {
        let value: Value = match serde_json::from_str(text) {
            Ok(v @ (Value::Object(_) | Value::Array(_))) => v,
            _ => {
                tracing::warn!(target: "relay", ip = %conn.ip, bytes = text.len(), "Unreadable frame");
                return;
            }
        };
        let mut inner = self.lock();
        let Some(member) = inner.members.get_mut(&conn.id) else {
            self.hello(&mut inner, conn, &value);
            return;
        };
        member.last_data_at = Instant::now();
        let ty = value.get("type").and_then(Value::as_str).map(str::to_string);
        match ty.as_deref() {
            Some("ping") => {
                if check(Def::ClientControl, &value).is_ok()
                    && let Some(t) = value.get("t").and_then(|t| t.as_number()).cloned()
                {
                    conn.send(ServerMessage::Pong { t, server_time: now_ms() }.text());
                }
                return;
            }
            Some("hello") => {
                tracing::warn!(target: "relay", client = %member.hello.client, "Second hello ignored");
                return;
            }
            Some(t) if is_server_type(t) => {
                tracing::warn!(target: "relay", client = %member.hello.client, r#type = t, "Client sent a server message, dropped");
                return;
            }
            _ => {}
        }
        if !self.within_rate(&mut inner, conn.id, &value) {
            return;
        }
        Self::route(&mut inner, conn.id, value, text.len());
    }

    /// A socket closed (with the code the client sent, or the one the server closed it with).
    pub fn close(&self, conn: &Conn, code: u16) {
        let mut inner = self.lock();
        Self::done_waiting(&mut inner, conn.id);
        let Some(member) = inner.members.remove(&conn.id) else { return };
        let h = &member.hello;
        tracing::info!(target: "relay", room = %member.room, role = h.role.as_str(), client = %h.client, name = %h.name, close_code = code,
            up_s = member.joined_at.elapsed().as_secs(), messages = member.messages, last_data_ago_ms = member.last_data_at.elapsed().as_millis() as u64, "Left");
        let room_id = member.room.clone();
        if let Some(room) = inner.rooms.get_mut(&room_id) {
            if room.tv == Some(conn.id) {
                room.tv = None;
            }
            room.companions.retain(|(_, id)| *id != conn.id);
        }
        Self::to_room(
            &inner,
            &room_id,
            &ServerMessage::PeerLeft {
                client: h.client.clone(),
                role: h.role,
            },
            Some(conn.id),
        );
        if inner.rooms.get(&room_id).is_some_and(|r| r.tv.is_none() && r.companions.is_empty()) {
            inner.rooms.remove(&room_id);
        }
    }

    /// Sends a message to every socket in every room (`server.build`).
    pub fn broadcast_all(&self, msg: &ServerMessage) {
        let text = msg.text();
        for m in self.lock().members.values() {
            m.conn.send(text.clone());
        }
    }

    /// Closes every socket (the server is stopping).
    pub fn shutdown(&self) {
        let inner = self.lock();
        for m in inner.members.values() {
            m.conn.close(close::GOING_AWAY, "server stopping");
        }
        for w in inner.waiting.values() {
            w.conn.close(close::GOING_AWAY, "server stopping");
        }
        tracing::info!(target: "relay", members = inner.members.len(), waiting = inner.waiting.len(), "Closing every socket");
    }

    /// The rooms with a TV online, newest TV first.
    pub fn tables(&self) -> Vec<TableInfo> {
        let inner = self.lock();
        let mut out: Vec<(u64, TableInfo)> = inner
            .rooms
            .iter()
            .filter_map(|(id, room)| {
                let tv = inner.members.get(&room.tv?)?;
                Some((
                    tv.joined_ms,
                    TableInfo {
                        room: id.clone(),
                        tv_name: tv.hello.name.clone(),
                        companions: room.companions.len() as u32,
                        since: iso(tv.joined_ms),
                    },
                ))
            })
            .collect();
        out.sort_by_key(|t| std::cmp::Reverse(t.0));
        out.into_iter().map(|(_, t)| t).collect()
    }

    /// Counts for `/health`.
    pub fn stats(&self) -> RelayStats {
        let inner = self.lock();
        RelayStats {
            rooms: inner.rooms.len() as u32,
            tvs: inner.rooms.values().filter(|r| r.tv.is_some()).count() as u32,
            companions: inner.rooms.values().map(|r| r.companions.len() as u32).sum(),
            members: inner.members.len() as u32,
            waiting: inner.waiting.len() as u32,
        }
    }

    // ── hardening ──────────────────────────────────────────────────────────────────────────

    /// One pass of the housekeeping: closes zombies and consumers that can't keep up, and once a
    /// minute logs each room's traffic. Runs every sweep interval.
    pub fn sweep(&self) {
        let mut inner = self.lock();
        for m in inner.members.values() {
            let silent = m.last_data_at.elapsed();
            if silent > self.limits.zombie {
                tracing::warn!(target: "relay", room = %m.room, role = m.hello.role.as_str(), client = %m.hello.client, silent_s = silent.as_secs(), "Closing a silent socket (zombie)");
                m.conn.close(close::ZOMBIE, "zombie");
                continue;
            }
            let buffered = m.conn.buffered();
            if buffered > self.limits.max_buffered_bytes {
                tracing::warn!(target: "relay", room = %m.room, role = m.hello.role.as_str(), client = %m.hello.client, buffered_mb = buffered / 1_048_576, "Closing a socket that cannot keep up");
                m.conn.close(close::SLOW, "too slow");
            }
        }
        let now = Instant::now();
        let last = *inner.last_summary_at.get_or_insert(now);
        if now.duration_since(last) >= Duration::from_secs(60) {
            inner.last_summary_at = Some(now);
            let secs = now.duration_since(last).as_secs();
            for (id, room) in &mut inner.rooms {
                let t = room.traffic;
                if t.tv_messages + t.companion_messages + t.undelivered + t.rate_dropped == 0 {
                    continue;
                }
                tracing::info!(target: "relay", room = %id, secs, companions = room.companions.len(), tv = room.tv.is_some(), tv_messages = t.tv_messages, tv_bytes = t.tv_bytes,
                    companion_messages = t.companion_messages, companion_bytes = t.companion_bytes, undelivered = t.undelivered, rate_dropped = t.rate_dropped, "Traffic");
                room.traffic = Traffic::default();
            }
        }
    }

    /// Spends a token for a message; false (and the drop handled) when the socket is over its rate.
    fn within_rate(&self, inner: &mut Inner, id: u64, value: &Value) -> bool {
        let Some(m) = inner.members.get_mut(&id) else { return false };
        let now = Instant::now();
        m.tokens = (m.tokens + now.duration_since(m.refilled_at).as_secs_f64() * self.limits.rate_per_s).min(self.limits.rate_burst);
        m.refilled_at = now;
        if m.tokens >= 1.0 {
            m.tokens -= 1.0;
            return true;
        }
        if now.duration_since(m.rate_window_at) > Duration::from_secs(60) {
            m.rate_window_at = now;
            m.rate_dropped = 0;
        }
        m.rate_dropped += 1;
        let ty = value.get("type").and_then(Value::as_str).unwrap_or("?").to_string();
        if m.rate_dropped == 1 {
            tracing::warn!(target: "relay", room = %m.room, role = m.hello.role.as_str(), client = %m.hello.client, r#type = %ty, rate_per_s = self.limits.rate_per_s, "Over the rate limit, dropping");
        }
        if ty == "sync.cmd"
            && let Some(seq) = value.get("seq").and_then(Value::as_u64)
        {
            m.conn.send(
                ServerMessage::Undelivered {
                    msg_type: ty.clone(),
                    seq: Some(seq),
                    reason: "rate-limited".into(),
                }
                .text(),
            );
        }
        if m.rate_dropped > self.limits.rate_close_after {
            tracing::warn!(target: "relay", room = %m.room, role = m.hello.role.as_str(), client = %m.hello.client, dropped = m.rate_dropped, "Closing a flooding socket");
            m.conn.close(close::RATE, "rate limit");
        }
        let room = m.room.clone();
        if let Some(r) = inner.rooms.get_mut(&room) {
            r.traffic.rate_dropped += 1;
        }
        false
    }

    // ── joining ────────────────────────────────────────────────────────────────────────────

    fn hello(&self, inner: &mut Inner, conn: &Conn, value: &Value) {
        let ty = value.get("type").and_then(Value::as_str);
        if let Err(e) = check(Def::ClientControl, value) {
            return Self::refuse(inner, conn, close::BAD_HELLO, &format!("say hello first ({e})"));
        }
        if ty != Some("hello") {
            return Self::refuse(
                inner,
                conn,
                close::BAD_HELLO,
                &format!("say hello first (got {})", ty.unwrap_or("?")),
            );
        }
        let hello: Hello = match serde_json::from_value(value.clone()) {
            Ok(h) => h,
            Err(e) => return Self::refuse(inner, conn, close::BAD_HELLO, &format!("say hello first ({e})")),
        };
        let want = protocol_version();
        if hello.protocol != want {
            return Self::refuse(
                inner,
                conn,
                close::PROTOCOL,
                &format!("protocol {} is not {want} — reload the app", hello.protocol),
            );
        }
        let room_exists = inner.rooms.contains_key(&hello.room);
        if !room_exists && inner.rooms.len() >= self.limits.max_rooms {
            return Self::refuse(
                inner,
                conn,
                close::FULL,
                &format!("the server is full ({} tables)", self.limits.max_rooms),
            );
        }
        let old = inner.rooms.get(&hello.room).and_then(|r| match hello.role {
            Role::Tv => r.tv,
            Role::Companion => r.companion(&hello.client),
        });
        if let Some(room) = inner.rooms.get(&hello.room)
            && hello.role == Role::Companion
            && old.is_none()
            && room.companions.len() >= self.limits.companions_per_room
        {
            return Self::refuse(
                inner,
                conn,
                close::FULL,
                &format!("this table has {} companions already", self.limits.companions_per_room),
            );
        }
        Self::done_waiting(inner, conn.id);
        inner.rooms.entry(hello.room.clone()).or_insert_with(|| Room {
            tv: None,
            companions: Vec::new(),
            traffic: Traffic::default(),
        });
        if let Some(old) = old {
            Self::supersede(inner, &hello.room, old, &hello);
        }
        let now = Instant::now();
        let room_id = hello.room.clone();
        let Some(room) = inner.rooms.get_mut(&room_id) else { return };
        match hello.role {
            Role::Tv => room.tv = Some(conn.id),
            Role::Companion => {
                room.companions.retain(|(c, _)| *c != hello.client);
                room.companions.push((hello.client.clone(), conn.id));
            }
        }
        let others: Vec<u64> = room.everyone().filter(|id| *id != conn.id).collect();
        inner.members.insert(
            conn.id,
            Member {
                conn: conn.clone(),
                hello: hello.clone(),
                room: room_id.clone(),
                joined_at: now,
                joined_ms: now_ms(),
                messages: 0,
                last_data_at: now,
                tokens: self.limits.rate_burst,
                refilled_at: now,
                rate_dropped: 0,
                rate_window_at: now,
            },
        );
        let peers: Vec<Peer> = others
            .iter()
            .filter_map(|id| inner.members.get(id))
            .map(|m| peer_of(&m.hello))
            .collect();
        let build = self.build.read().map(|b| b.clone()).unwrap_or(None);
        conn.send(
            ServerMessage::Welcome {
                client: hello.client.clone(),
                room: room_id.clone(),
                role: hello.role,
                peers: peers.clone(),
                build,
                server_time: now_ms(),
            }
            .text(),
        );
        Self::to_room(inner, &room_id, &ServerMessage::PeerJoined { peer: peer_of(&hello) }, Some(conn.id));
        tracing::info!(target: "relay", room = %room_id, role = hello.role.as_str(), client = %hello.client, name = %hello.name, build = %hello.build, ip = %conn.ip, peers = peers.len(), "Joined");
    }

    /// An old member makes room for a new one with the same slot.
    fn supersede(inner: &mut Inner, room_id: &str, old_id: u64, hello: &Hello) {
        let Some(old) = inner.members.remove(&old_id) else { return };
        if old.hello.client == hello.client {
            tracing::info!(target: "relay", room = room_id, client = %hello.client, "Same client again, old socket closed");
            old.conn.close(close::SUPERSEDED, "superseded");
            return;
        }
        tracing::warn!(target: "relay", room = room_id, old = %old.hello.client, old_name = %old.hello.name, new = %hello.client, new_name = %hello.name, "TV replaced");
        old.conn.send(ServerMessage::Replaced { by: hello.name.clone() }.text());
        old.conn.close(close::REPLACED, "replaced");
        Self::to_room(
            inner,
            room_id,
            &ServerMessage::PeerLeft {
                client: old.hello.client.clone(),
                role: old.hello.role,
            },
            Some(old_id),
        );
    }

    fn refuse(inner: &mut Inner, conn: &Conn, code: u16, reason: &str) {
        Self::done_waiting(inner, conn.id);
        tracing::warn!(target: "relay", ip = %conn.ip, reason, code, "Refused a socket");
        conn.send(ServerMessage::ServerError { reason: reason.into() }.text());
        conn.close(code, reason);
    }

    // ── routing ────────────────────────────────────────────────────────────────────────────

    fn route(inner: &mut Inner, from_id: u64, mut value: Value, bytes: usize) {
        let Some(from) = inner.members.get_mut(&from_id) else { return };
        if let Err(e) = check(Def::RoutingEnvelope, &value) {
            tracing::warn!(target: "relay", client = %from.hello.client, error = %e, "Unroutable message");
            return;
        }
        from.messages += 1;
        let role = from.hello.role;
        let client = from.hello.client.clone();
        let room_id = from.room.clone();
        let conn = from.conn.clone();
        let msg_type = value.get("type").and_then(Value::as_str).unwrap_or("").to_string();
        let seq = value.get("seq").and_then(Value::as_u64);
        let to = value.get("to").and_then(Value::as_str).map(str::to_string);
        if let Some(obj) = value.as_object_mut() {
            obj.insert("from".into(), Value::String(client.clone()));
        }
        let text = value.to_string();
        crate::log::RELAY_MESSAGES.add(1);
        let Some(room) = inner.rooms.get_mut(&room_id) else { return };
        let target: Result<Vec<u64>, &str> = match role {
            Role::Companion => {
                room.traffic.companion_messages += 1;
                room.traffic.companion_bytes += bytes as u64;
                room.tv.map(|tv| vec![tv]).ok_or("no-tv")
            }
            Role::Tv => {
                room.traffic.tv_messages += 1;
                room.traffic.tv_bytes += bytes as u64;
                match &to {
                    Some(to) => room.companion(to).map(|id| vec![id]).ok_or("no-such-client"),
                    None => Ok(room.companions.iter().map(|(_, id)| *id).collect()),
                }
            }
        };
        match target {
            Ok(ids) => {
                for id in ids {
                    if let Some(m) = inner.members.get(&id) {
                        m.conn.send(text.clone());
                    }
                }
            }
            Err(reason) => {
                room.traffic.undelivered += 1;
                tracing::info!(target: "relay", client = %client, r#type = %msg_type, reason, "Dropped while the other side was away");
                conn.send(
                    ServerMessage::Undelivered {
                        msg_type,
                        seq,
                        reason: reason.into(),
                    }
                    .text(),
                );
            }
        }
    }

    /// Sends a server message to everyone in a room except one socket.
    fn to_room(inner: &Inner, room_id: &str, msg: &ServerMessage, except: Option<u64>) {
        let Some(room) = inner.rooms.get(room_id) else { return };
        let text = msg.text();
        for id in room.everyone().filter(|id| Some(*id) != except) {
            if let Some(m) = inner.members.get(&id) {
                m.conn.send(text.clone());
            }
        }
    }
}

/// The public face of a member.
fn peer_of(h: &Hello) -> Peer {
    Peer {
        client: h.client.clone(),
        role: h.role,
        name: h.name.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn relay() -> Arc<Relay> {
        Arc::new(Relay::new(
            RelayLimits::default(),
            Duration::from_secs(8),
            Arc::new(RwLock::new(Some("b1".into()))),
        ))
    }

    fn texts(rx: &mut mpsc::UnboundedReceiver<Outbound>) -> Vec<Value> {
        let mut out = Vec::new();
        while let Ok(o) = rx.try_recv() {
            if let Outbound::Text(t) = o {
                out.push(serde_json::from_str(&t).unwrap());
            }
        }
        out
    }

    fn hello(role: &str, client: &str) -> String {
        format!(r#"{{"type":"hello","protocol":1,"role":"{role}","room":"r","client":"{client}","name":"n","build":"b"}}"#)
    }

    #[tokio::test]
    async fn routes_and_stamps_from_keeping_the_payload() {
        let r = relay();
        let (tv, mut tv_rx) = Conn::new(1, "1.2.3.4".into());
        let (c, mut c_rx) = Conn::new(2, "1.2.3.4".into());
        r.open(&tv);
        r.open(&c);
        r.message(&tv, &hello("tv", "tv"));
        r.message(&c, &hello("companion", "c"));
        assert_eq!(texts(&mut c_rx)[0]["peers"][0]["client"], "tv");
        assert_eq!(texts(&mut tv_rx).last().unwrap()["type"], "peer.joined");
        r.message(&c, r#"{"type":"sync.cmd","seq":1,"z":[1,{"b":2}],"a":"x","from":"liar"}"#);
        let got = texts(&mut tv_rx);
        assert_eq!(
            serde_json::to_string(&got[0]).unwrap(),
            r#"{"type":"sync.cmd","seq":1,"z":[1,{"b":2}],"a":"x","from":"c"}"#
        );
        assert_eq!(r.stats().members, 2);
        r.close(&c, 1000);
        assert_eq!(texts(&mut tv_rx)[0]["type"], "peer.left");
        r.close(&tv, 1000);
        assert_eq!(r.stats().rooms, 0);
    }
}
