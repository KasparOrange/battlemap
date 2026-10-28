//! The file store: uploads, "Store as" conversions, thumbnails, immutable downloads.
//!
//! - [`sniff`] — what bytes are, from their first bytes;
//! - [`convert`] — decoding (with the pixel limit), re-encoding, thumbnails;
//! - [`store`] — the content-addressed store and `derived.json`;
//! - [`tiles`] — tile sets of big pictures for the TV (`GET /api/tiles/…`);
//! - [`upload`] — one upload, from temp file to stored file + thumbnail;
//! - [`routes`] — `POST /files`, `GET /files/…`, `GET /uploads/…`.

pub mod convert;
pub mod routes;
pub mod sniff;
pub mod store;
pub mod tiles;
pub mod upload;
