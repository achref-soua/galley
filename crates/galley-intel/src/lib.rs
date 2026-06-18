//! Galley language-intelligence adapters.
//!
//! This crate connects Galley to a LaTeX language server (TexLab) behind the
//! [`LanguageIntelligence`](galley_core::LanguageIntelligence) port, giving the
//! editor completion, hovers, go-to-definition, document symbols, and live
//! ChkTeX diagnostics. As with the compile engine, the heavy, impure part — the
//! `texlab` child process and its stdio — sits behind a feature seam
//! (`real-lsp`), while *every decision* lives in pure, fully-tested code:
//!
//! * [`framing`] — the LSP `Content-Length` base protocol;
//! * [`protocol`] — JSON-RPC requests/notifications and incoming classification;
//! * [`mapping`] — turning LSP result JSON into Galley's domain types.
//!
//! The coverage and build gates leave `real-lsp` off, so the workspace never
//! needs a language server; the live [`TexLabClient`] is exercised by the manual
//! integration tests in `tests/` (run like the Tectonic ones — see docs/adr/0009).

pub mod framing;
pub mod mapping;
pub mod protocol;

pub use framing::{encode, FrameBuffer};
pub use mapping::{map_completion, map_definition, map_diagnostics, map_hover, map_symbols};
pub use protocol::{notification, parse_incoming, request, response, Correlator, Incoming};

#[cfg(feature = "real-lsp")]
mod client;
#[cfg(feature = "real-lsp")]
pub use client::TexLabClient;
