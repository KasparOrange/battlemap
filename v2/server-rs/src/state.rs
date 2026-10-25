//! What every route shares: the settings, the stores, the relay, the link fetcher, the work
//! slots, the app build being served and the log shipper.

use std::sync::{Arc, RwLock};

use tokio::sync::Semaphore;

use crate::backups::Backups;
use crate::config::Config;
use crate::fetch::download::Fetcher;
use crate::files::store::FileStore;
use crate::files::upload::ImageWork;
use crate::library::Library;
use crate::relay::Relay;
use crate::upstream::Upstream;

/// The shared state (behind an [`Arc`], see [`Shared`]).
pub struct AppState {
    /// The settings.
    pub config: Config,
    /// The file store.
    pub files: FileStore,
    /// Picture work slots (decode, encode, thumbnails).
    pub images: ImageWork,
    /// The shared library.
    pub library: Library,
    /// Game backups.
    pub backups: Backups,
    /// The relay.
    pub relay: Arc<Relay>,
    /// The link fetch's HTTP client.
    pub fetcher: Fetcher,
    /// Link fetches at once.
    pub fetch_slots: Arc<Semaphore>,
    /// The app build served (from `build.json`), or `None`.
    pub build: Arc<RwLock<Option<String>>>,
    /// When the server started (epoch ms).
    pub started_ms: u64,
    /// The log shipper (for `/log` and `/health`).
    pub shipper: mwlog::Shipper,
    /// The internet server above this table server (LAN play), when `UPSTREAM_URL` is set.
    pub upstream: Option<Upstream>,
}

/// The state as the routes take it.
pub type Shared = Arc<AppState>;

impl AppState {
    /// The app build served now.
    pub fn build(&self) -> Option<String> {
        self.build.read().map(|b| b.clone()).unwrap_or(None)
    }
}
