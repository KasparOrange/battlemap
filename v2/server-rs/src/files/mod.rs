//! The file store: uploads, "Store as" conversions, thumbnails, immutable downloads.
//!
//! - [`sniff`] — what bytes are, from their first bytes;
//! - [`convert`] — decoding (with the pixel limit), re-encoding, thumbnails;
//! - [`store`] — the content-addressed store and `derived.json`;
//! - [`upload`] — one upload, from temp file to stored file + thumbnail;
//! - [`routes`] — `POST /files`, `GET /files/…`, `GET /uploads/…`.

pub mod convert;
pub mod routes;
pub mod sniff;
pub mod store;
pub mod upload;
