//! Downloading one link for the link fetch: http(s) only, no passwords, public addresses only
//! (the guarded resolver for names, [`check_literal`] for literal addresses — on every
//! redirect), at most five redirects, a size cap counted as it streams, a timeout on every
//! socket operation. The body streams into a file: memory stays at one chunk (review #26).

use std::path::{Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use percent_encoding::percent_decode_str;
use reqwest::header::{CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE, LOCATION};
use tokio::io::AsyncWriteExt;
use url::Url;

use super::guard::{GuardedResolver, Refused, check_literal};
use crate::http::respond::over;

/// A downloaded link, in a file.
#[derive(Debug)]
pub struct Download {
    /// Where the bytes are (the caller moves or removes it).
    pub path: PathBuf,
    /// Their count.
    pub bytes: u64,
    /// The content type without parameters (`text/html`), or ''.
    pub content_type: String,
    /// The file name from Content-Disposition or the last path segment, or ''.
    pub name: String,
    /// The URL after redirects.
    pub final_url: Url,
}

/// The file name a response names: `filename*=UTF-8''…`, `filename="…"`, else the URL's last
/// path segment — percent-decoded and trimmed.
pub fn name_of(disposition: &str, url: &Url) -> String {
    let star = regex_capture(r"filename\*=(?:UTF-8|utf-8)''([^;]+)", disposition);
    let plain = regex_capture(r#"filename="?([^";]+)"?"#, disposition);
    let raw = star
        .or(plain)
        .unwrap_or_else(|| url.path().rsplit('/').next().unwrap_or("").to_string());
    match percent_decode_str(&raw).decode_utf8() {
        Ok(s) => s.trim().to_string(),
        Err(_) => raw.trim().to_string(),
    }
}

fn regex_capture(pattern: &str, text: &str) -> Option<String> {
    regex::Regex::new(pattern)
        .ok()?
        .captures(text)?
        .get(1)
        .map(|m| m.as_str().to_string())
}

/// The link fetch's HTTP client.
pub struct Fetcher {
    client: reqwest::Client,
    max_bytes: u64,
    timeout: Duration,
    max_redirects: usize,
}

impl Fetcher {
    /// A client with the guarded resolver, no automatic redirects and the given limits.
    ///
    /// # Errors
    /// When the TLS stack can't be set up.
    pub fn new(resolver: GuardedResolver, max_bytes: u64, timeout: Duration, max_redirects: usize) -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .dns_resolver(std::sync::Arc::new(resolver))
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(timeout)
            .read_timeout(timeout)
            .user_agent("Mozilla/5.0 battlemap")
            .no_proxy()
            .build()?;
        Ok(Self {
            client,
            max_bytes,
            timeout,
            max_redirects,
        })
    }

    /// The words for a timeout ("no answer within 30 s").
    fn timed_out(&self) -> Refused {
        Refused(format!(
            "no answer within {} s",
            (self.timeout.as_millis() as f64 / 1000.0).round() as u64
        ))
    }

    /// What a client error means for the app: the guard's refusal, a timeout, or the cause.
    fn explain(&self, e: &reqwest::Error) -> Refused {
        let mut source: Option<&(dyn std::error::Error + 'static)> = Some(e);
        while let Some(s) = source {
            if let Some(r) = s.downcast_ref::<Refused>() {
                return r.clone();
            }
            source = s.source();
        }
        if e.is_timeout() {
            return self.timed_out();
        }
        let mut text = e.to_string();
        let mut source = std::error::Error::source(e);
        while let Some(s) = source {
            text = s.to_string();
            source = s.source();
        }
        Refused(text)
    }

    /// Downloads `start` into `dest`.
    ///
    /// # Errors
    /// [`Refused`] with the reason the app shows: not a link, not http(s), a password, an
    /// address that isn't public, too many redirects, an error status, over the size, too slow.
    pub async fn download(&self, start: &str, dest: &Path) -> Result<Download, Refused> {
        let mut url = Url::parse(start.trim()).map_err(|_| Refused("that is not a link".into()))?;
        let mut hop = 0;
        loop {
            if url.scheme() != "http" && url.scheme() != "https" {
                return Err(Refused("only http and https links".into()));
            }
            if !url.username().is_empty() || url.password().is_some() {
                return Err(Refused("links with a password are not fetched".into()));
            }
            let host = url.host().ok_or_else(|| Refused("that is not a link".into()))?;
            check_literal(&host)?;
            let res = self
                .client
                .get(url.clone())
                .header("accept", "*/*")
                .send()
                .await
                .map_err(|e| self.explain(&e))?;
            let status = res.status();
            if status.is_redirection()
                && let Some(loc) = res.headers().get(LOCATION).and_then(|v| v.to_str().ok())
            {
                if hop >= self.max_redirects {
                    return Err(Refused("too many redirects".into()));
                }
                url = url.join(loc).map_err(|_| Refused("that is not a link".into()))?;
                hop += 1;
                continue;
            }
            if !status.is_success() {
                return Err(Refused(format!("the link answered {}", status.as_u16())));
            }
            let declared = res
                .headers()
                .get(CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            if declared.is_some_and(|n| n > self.max_bytes) {
                return Err(Refused(over(self.max_bytes)));
            }
            let content_type = res
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase();
            let disposition = res
                .headers()
                .get(CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let bytes = self.stream_to(res, dest).await.inspect_err(|_| {
                let _ = std::fs::remove_file(dest);
            })?;
            return Ok(Download {
                path: dest.to_path_buf(),
                bytes,
                content_type,
                name: name_of(&disposition, &url),
                final_url: url,
            });
        }
    }

    /// Streams a response body into `dest`, at most `max_bytes`.
    async fn stream_to(&self, res: reqwest::Response, dest: &Path) -> Result<u64, Refused> {
        let io = |e: std::io::Error| Refused(format!("the download failed: {e}"));
        let mut file = tokio::fs::File::create(dest).await.map_err(io)?;
        let mut total = 0u64;
        let mut body = res.bytes_stream();
        while let Some(chunk) = body.next().await {
            let chunk = chunk.map_err(|e| self.explain(&e))?;
            total += chunk.len() as u64;
            if total > self.max_bytes {
                return Err(Refused(over(self.max_bytes)));
            }
            file.write_all(&chunk).await.map_err(io)?;
        }
        file.flush().await.map_err(io)?;
        Ok(total)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_from_content_disposition_or_the_path() {
        let u = |s: &str| Url::parse(s).unwrap();
        assert_eq!(
            name_of("attachment; filename*=UTF-8''Tower%20map.dd2vtt", &u("https://x.test/dl")),
            "Tower map.dd2vtt"
        );
        assert_eq!(name_of("attachment; filename=\"cave.png\"", &u("https://x.test/dl")), "cave.png");
        assert_eq!(name_of("", &u("https://x.test/maps/keep%201.jpg")), "keep 1.jpg");
    }

    #[tokio::test]
    async fn refuses_before_connecting() {
        let f = Fetcher::new(GuardedResolver::default(), 1024, Duration::from_secs(2), 5).unwrap();
        let dest = std::env::temp_dir().join(format!("claude-v2-rs-dl-{}", std::process::id()));
        for (link, why) in [
            ("http://127.0.0.1:9/", "not on the internet"),
            ("http://[::1]:9/", "not on the internet"),
            ("http://localhost:9/", "not on the internet"),
            ("ftp://example.com/x", "only http"),
            ("http://user:pw@example.com/", "password"),
            ("not a link", "not a link"),
        ] {
            let e = f.download(link, &dest).await.unwrap_err();
            assert!(e.0.contains(why), "{link}: {}", e.0);
        }
    }
}
