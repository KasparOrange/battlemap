//! The link fetch's door policy: only addresses on the public internet. The server must never
//! become a way into the VPS's own services (VictoriaLogs on 127.0.0.1, Docker's networks), the
//! TV box's LAN, or anyone else's. Names are checked inside the HTTP client's own DNS step
//! ([`GuardedResolver`]): the addresses checked are the addresses connected to, so there is no
//! DNS-rebinding gap. Literal addresses never reach a resolver and are checked by
//! [`check_literal`] before every request, redirects included.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

/// A link the server refuses to fetch, with the reason for the app.
#[derive(Debug, Clone, thiserror::Error)]
#[error("{0}")]
pub struct Refused(pub String);

/// The refusal for an address that isn't public.
pub const NOT_PUBLIC: &str = "that address is not on the internet";

/// IPv4 ranges that are not the public internet: `(network, prefix length)`.
const V4_BLOCKED: [(Ipv4Addr, u32); 15] = [
    (Ipv4Addr::new(0, 0, 0, 0), 8),
    (Ipv4Addr::new(10, 0, 0, 0), 8),
    (Ipv4Addr::new(100, 64, 0, 0), 10),
    (Ipv4Addr::new(127, 0, 0, 0), 8),
    (Ipv4Addr::new(169, 254, 0, 0), 16),
    (Ipv4Addr::new(172, 16, 0, 0), 12),
    (Ipv4Addr::new(192, 0, 0, 0), 24),
    (Ipv4Addr::new(192, 0, 2, 0), 24),
    (Ipv4Addr::new(192, 88, 99, 0), 24),
    (Ipv4Addr::new(192, 168, 0, 0), 16),
    (Ipv4Addr::new(198, 18, 0, 0), 15),
    (Ipv4Addr::new(198, 51, 100, 0), 24),
    (Ipv4Addr::new(203, 0, 113, 0), 24),
    (Ipv4Addr::new(224, 0, 0, 0), 4),
    (Ipv4Addr::new(240, 0, 0, 0), 4),
];

/// Whether an IPv4 address is public.
fn public_v4(ip: Ipv4Addr) -> bool {
    let n = u32::from(ip);
    !V4_BLOCKED.iter().any(|&(base, bits)| {
        let mask = if bits == 0 { 0 } else { u32::MAX << (32 - bits) };
        n & mask == u32::from(base) & mask
    })
}

/// Whether an IPv6 address is public.
fn public_v6(ip: Ipv6Addr) -> bool {
    let g = ip.segments();
    let tail = || Ipv4Addr::new((g[6] >> 8) as u8, g[6] as u8, (g[7] >> 8) as u8, g[7] as u8);
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judged by the IPv4 part.
    if g[..5].iter().all(|&x| x == 0) && g[5] == 0xffff {
        return public_v4(tail());
    }
    if g[0] == 0x64 && g[1] == 0xff9b && g[2..6].iter().all(|&x| x == 0) {
        return public_v4(tail());
    }
    if g[0] & 0xe000 != 0x2000 {
        return false; // only global unicast (2000::/3)
    }
    !(g[0] == 0x2001 && (g[1] == 0x0db8 || g[1] == 0x0000)) && g[0] != 0x2002
}

/// Whether an address is on the public internet.
///
/// IPv4: everything but the private, loopback, link-local, shared (CGNAT), documentation,
/// benchmark, multicast and reserved ranges. IPv6: only global unicast (2000::/3) outside the
/// documentation, Teredo and 6to4 ranges; IPv4-mapped and NAT64 addresses are judged by their
/// IPv4 part.
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => public_v4(v4),
        IpAddr::V6(v6) => public_v6(v6),
    }
}

/// Refuses a URL host that is a literal address and not public (names are the resolver's job).
///
/// # Errors
/// [`Refused`] with [`NOT_PUBLIC`].
pub fn check_literal(host: &url::Host<&str>) -> Result<(), Refused> {
    let ip = match host {
        url::Host::Ipv4(v4) => IpAddr::V4(*v4),
        url::Host::Ipv6(v6) => IpAddr::V6(*v6),
        url::Host::Domain(_) => return Ok(()),
    };
    if is_public(ip) { Ok(()) } else { Err(Refused(NOT_PUBLIC.into())) }
}

/// The HTTP client's DNS step: resolves a name and refuses it unless every address is public.
///
/// With `test_addr` set (`BATTLEMAP_FETCH_TEST_ADDR`, the contract suite), names under `.test`
/// — reserved, never in public DNS — resolve to that address unchecked; every other name meets
/// the guard as in production.
#[derive(Debug, Clone, Default)]
pub struct GuardedResolver {
    /// Tests only: where `.test` names go.
    pub test_addr: Option<IpAddr>,
}

impl GuardedResolver {
    /// Resolves `host` to its checked addresses.
    ///
    /// # Errors
    /// [`Refused`]: an unknown host, or one with an address that isn't public.
    pub async fn resolve_checked(&self, host: &str) -> Result<Vec<SocketAddr>, Refused> {
        if let Some(addr) = self.test_addr
            && host.to_ascii_lowercase().trim_end_matches('.').ends_with(".test")
        {
            return Ok(vec![SocketAddr::new(addr, 0)]);
        }
        let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host, 0))
            .await
            .map_err(|_| Refused(format!("unknown host {host}")))?
            .collect();
        if addrs.is_empty() {
            return Err(Refused(format!("unknown host {host}")));
        }
        if !addrs.iter().all(|a| is_public(a.ip())) {
            tracing::warn!(target: "fetch", host, addrs = ?addrs.iter().map(|a| a.ip()).collect::<Vec<_>>(), "Refused a name that resolves to a local address");
            return Err(Refused(NOT_PUBLIC.into()));
        }
        Ok(addrs)
    }
}

impl reqwest::dns::Resolve for GuardedResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let me = self.clone();
        Box::pin(async move {
            let addrs = me
                .resolve_checked(name.as_str())
                .await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
            Ok(Box::new(addrs.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_and_not() {
        for ip in ["8.8.8.8", "1.1.1.1", "72.62.88.197", "2606:4700::6810:84e5", "::ffff:8.8.8.8"] {
            assert!(is_public(ip.parse().unwrap()), "{ip}");
        }
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.10",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "255.255.255.255",
            "198.18.0.1",
            "::1",
            "::",
            "fe80::1",
            "fc00::1",
            "fd12:3456::1",
            "ff02::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "64:ff9b::a00:1",
            "2001:db8::1",
            "2002:7f00:1::1",
        ] {
            assert!(!is_public(ip.parse().unwrap()), "{ip}");
        }
    }

    #[tokio::test]
    async fn names_are_checked_after_resolving() {
        let r = GuardedResolver::default();
        assert_eq!(r.resolve_checked("localhost").await.unwrap_err().0, NOT_PUBLIC);
        assert!(
            r.resolve_checked("nothing-here.invalid")
                .await
                .unwrap_err()
                .0
                .contains("unknown host")
        );
        assert!(r.resolve_checked("mock.test").await.is_err());
        let t = GuardedResolver {
            test_addr: Some("127.0.0.1".parse().unwrap()),
        };
        assert_eq!(t.resolve_checked("mock.test").await.unwrap()[0].ip().to_string(), "127.0.0.1");
        assert_eq!(t.resolve_checked("localhost").await.unwrap_err().0, NOT_PUBLIC);
    }

    #[test]
    fn literals() {
        assert!(check_literal(&url::Host::Ipv4("127.0.0.1".parse().unwrap())).is_err());
        assert!(check_literal(&url::Host::Ipv6("::1".parse().unwrap())).is_err());
        assert!(check_literal(&url::Host::Ipv4("8.8.8.8".parse().unwrap())).is_ok());
        assert!(check_literal(&url::Host::Domain("example.com")).is_ok());
    }
}
