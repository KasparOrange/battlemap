//! The link fetch (`GET /api/fetch?url=`): a link's map file, downloaded into `uploads/`.
//!
//! - [`guard`] — public addresses only (the resolver and literal addresses);
//! - [`download`] — one link into a file: redirects, caps, timeouts;
//! - [`link`] — share links, a page's main picture, the kind, the name;
//! - [`routes`] — the route, with a cap on fetches at once.

pub mod download;
pub mod guard;
pub mod link;
pub mod routes;
