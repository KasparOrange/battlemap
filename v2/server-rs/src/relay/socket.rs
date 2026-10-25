//! The relay's WebSocket glue: `GET /ws` upgrades, and one task per socket that reads frames
//! into the [`Relay`] and writes what the relay queued on the socket's [`Conn`].
//!
//! - Text frames go to the relay; binary frames are read as UTF-8 text (lossy), as the Bun
//!   server does.
//! - A frame over the size limit closes the socket with 1009.
//! - A close the server asks for (`Outbound::Close`) is sent, then the task waits up to 2 s for
//!   the client's answer before it drops the connection.
//! - A write that takes longer than 10 s (a consumer that stopped reading) ends the socket as
//!   too slow (4007); the relay's sweep also closes sockets whose queue grows past the limit.
//! - Behind the HTTPS proxy (Caddy, on a private Docker address) the client's address is the
//!   last `X-Forwarded-For` entry; a public peer's header is ignored (anyone can send one).

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade, rejection::WebSocketUpgradeRejection};
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use super::{Conn, Outbound, Relay, close};
use crate::fetch::guard::is_public;
use crate::state::Shared;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// How long a server-initiated close waits for the client's close frame.
const CLOSE_GRACE: Duration = Duration::from_secs(2);
/// How long one write may take before the socket counts as too slow.
const WRITE_TIMEOUT: Duration = Duration::from_secs(10);

/// The address to log and limit by: the peer, or behind a private proxy the last
/// `X-Forwarded-For` entry.
pub fn client_ip(headers: &HeaderMap, peer: IpAddr) -> String {
    let peer = match peer {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(IpAddr::V6(v6), IpAddr::V4),
        v4 => v4,
    };
    if is_public(peer) {
        return peer.to_string();
    }
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map_or_else(|| peer.to_string(), str::to_string)
}

/// `GET /ws`: the relay's WebSocket (426 without an upgrade).
pub async fn upgrade(
    State(state): State<Shared>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    let Ok(ws) = ws else {
        return (StatusCode::UPGRADE_REQUIRED, "WebSocket upgrade expected").into_response();
    };
    let ip = client_ip(&headers, peer.ip());
    let max = state.relay.limits().max_frame_bytes;
    let relay = Arc::clone(&state.relay);
    ws.max_message_size(max)
        .max_frame_size(max)
        .on_upgrade(move |socket| run(relay, socket, ip))
}

/// One socket's life: joined to the relay until either side closes.
async fn run(relay: Arc<Relay>, mut ws: WebSocket, ip: String) {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (conn, mut rx) = Conn::new(id, ip);
    relay.open(&conn);
    let mut code: Option<u16> = None; // the server's close code, once it asked to close
    let mut deadline: Option<tokio::time::Instant> = None;
    let client_code: u16 = loop {
        let grace = async {
            match deadline {
                Some(d) => tokio::time::sleep_until(d).await,
                None => std::future::pending::<()>().await,
            }
        };
        tokio::select! {
            frame = ws.recv() => match frame {
                Some(Ok(Message::Text(t))) => {
                    if code.is_none() {
                        relay.message(&conn, t.as_str());
                    }
                }
                Some(Ok(Message::Binary(b))) => {
                    if code.is_none() {
                        relay.message(&conn, &String::from_utf8_lossy(&b));
                    }
                }
                Some(Ok(Message::Close(frame))) => break frame.map_or(1005, |f| f.code),
                Some(Ok(_)) => {} // ping / pong: answered by the library
                Some(Err(e)) => {
                    let text = e.to_string();
                    if text.contains("too long") || text.contains("Space limit") {
                        tracing::warn!(target: "relay", ip = %conn.ip, error = %text, "Frame over the size limit, closing");
                        let _ = tokio::time::timeout(CLOSE_GRACE, ws.send(Message::Close(Some(CloseFrame { code: close::TOO_BIG, reason: "too big".into() })))).await;
                        code = Some(close::TOO_BIG);
                    }
                    break 1006;
                }
                None => break 1006,
            },
            out = rx.recv(), if code.is_none() => match out {
                Some(Outbound::Text(t)) => {
                    let n = t.len();
                    let sent = tokio::time::timeout(WRITE_TIMEOUT, ws.send(Message::Text(t.into()))).await;
                    conn.written(n);
                    match sent {
                        Ok(Ok(())) => {}
                        Ok(Err(_)) => break 1006,
                        Err(_) => {
                            tracing::warn!(target: "relay", ip = %conn.ip, "A write took over 10 s, dropping the socket");
                            code = Some(close::SLOW);
                            break 1006;
                        }
                    }
                }
                Some(Outbound::Close(c, reason)) => {
                    let _ = tokio::time::timeout(CLOSE_GRACE, ws.send(Message::Close(Some(CloseFrame { code: c, reason: reason.into() })))).await;
                    code = Some(c);
                    deadline = Some(tokio::time::Instant::now() + CLOSE_GRACE);
                }
                None => break 1006,
            },
            () = grace => break 1006,
        }
    };
    relay.close(&conn, code.unwrap_or(client_code));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn behind_the_proxy_the_forwarded_address_counts() {
        let mut h = HeaderMap::new();
        h.insert("x-forwarded-for", "203.0.114.9, 85.1.2.3".parse().unwrap());
        assert_eq!(client_ip(&h, "172.19.0.5".parse().unwrap()), "85.1.2.3");
        assert_eq!(client_ip(&HeaderMap::new(), "::ffff:127.0.0.1".parse().unwrap()), "127.0.0.1");
        let mut h = HeaderMap::new();
        h.insert("x-forwarded-for", "10.0.0.1".parse().unwrap());
        assert_eq!(client_ip(&h, "85.1.2.3".parse().unwrap()), "85.1.2.3");
    }
}
