//! The live TexLab client — the real [`LanguageIntelligence`] adapter.
//!
//! Compiled only under the `real-lsp` feature, because it spawns the `texlab`
//! process and talks LSP over its stdio. The coverage and build gates leave the
//! feature off, so this module is excluded from them; it is exercised by the
//! manual integration tests in `tests/`, run with a `texlab` on `PATH`. See
//! `docs/adr/0009`.
//!
//! It is deliberately synchronous: Tauri serializes calls through a `Mutex`, and
//! a LaTeX language server answers one request at a time. All of the decisions —
//! framing, JSON-RPC classification, result mapping — live in the pure modules;
//! this file only moves bytes and sequences the LSP lifecycle.

use crate::framing::{encode, FrameBuffer};
use crate::mapping::{map_completion, map_definition, map_diagnostics, map_hover, map_symbols};
use crate::protocol::{notification, parse_incoming, request, response, Correlator, Incoming};
use galley_core::diagnostics::Diagnostic;
use galley_core::{
    CompletionItem, DocumentSymbol, Hover, LanguageIntelligence, Location, Position, TextDocument,
};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{self, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// A running TexLab language server Galley drives over LSP.
pub struct TexLabClient {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
    frames: FrameBuffer,
    correlator: Correlator,
    open: HashSet<String>,
    version: i32,
    diagnostics: HashMap<String, Vec<Diagnostic>>,
}

impl TexLabClient {
    /// Spawn `texlab`, complete the LSP handshake rooted at `root_dir`, and return
    /// a ready client.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] when the process cannot be spawned or its pipes
    /// cannot be taken.
    pub fn start(root_dir: &Path) -> io::Result<Self> {
        let mut child = Command::new("texlab")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("texlab stdin unavailable"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("texlab stdout unavailable"))?;
        let mut client = Self {
            child,
            stdin,
            stdout,
            frames: FrameBuffer::new(),
            correlator: Correlator::new(),
            open: HashSet::new(),
            version: 0,
            diagnostics: HashMap::new(),
        };
        client.handshake(root_dir)?;
        Ok(client)
    }

    /// Run the LSP `initialize`/`initialized` handshake.
    fn handshake(&mut self, root_dir: &Path) -> io::Result<()> {
        let root_uri = path_to_uri(root_dir);
        let params = json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "capabilities": {
                "textDocument": {
                    "completion": { "completionItem": { "snippetSupport": true,
                        "documentationFormat": ["markdown", "plaintext"] } },
                    "hover": { "contentFormat": ["markdown", "plaintext"] },
                    "definition": { "linkSupport": true },
                    "documentSymbol": { "hierarchicalDocumentSymbolSupport": true },
                    "publishDiagnostics": {}
                }
            },
            "workspaceFolders": [{ "uri": root_uri, "name": "galley" }]
        });
        let _ = self.roundtrip("initialize", params)?;
        self.send(&notification("initialized", json!({})))?;
        Ok(())
    }

    /// Keep the server's copy of `doc` in sync: open it the first time, otherwise
    /// push the new full text.
    fn sync(&mut self, doc: &TextDocument) -> io::Result<()> {
        self.version += 1;
        if self.open.contains(&doc.uri) {
            self.send(&notification(
                "textDocument/didChange",
                json!({
                    "textDocument": { "uri": doc.uri, "version": self.version },
                    "contentChanges": [{ "text": doc.text }]
                }),
            ))
        } else {
            self.open.insert(doc.uri.clone());
            self.send(&notification(
                "textDocument/didOpen",
                json!({
                    "textDocument": {
                        "uri": doc.uri, "languageId": "latex",
                        "version": self.version, "text": doc.text
                    }
                }),
            ))
        }
    }

    /// Send a request and block until its matching response, returning the result
    /// (`null` on error). Notifications and server-to-client requests seen while
    /// waiting are handled along the way.
    fn roundtrip(&mut self, method: &str, params: Value) -> io::Result<Value> {
        let id = self.correlator.next_id();
        self.send(&request(id, method, params))?;
        loop {
            let Some(text) = self.read_message()? else {
                return Ok(Value::Null);
            };
            match parse_incoming(&text) {
                Some(Incoming::Response { id: got, result }) if got == id => return Ok(result),
                Some(Incoming::ResponseError { id: got, .. }) if got == id => {
                    return Ok(Value::Null)
                }
                Some(Incoming::Notification { method, params }) => {
                    self.on_notification(&method, &params)
                }
                Some(Incoming::ServerRequest { id, .. }) => {
                    self.send(&response(id, Value::Null))?
                }
                _ => {}
            }
        }
    }

    /// Record a server notification — only `publishDiagnostics` is of interest.
    fn on_notification(&mut self, method: &str, params: &Value) {
        if method == "textDocument/publishDiagnostics" {
            if let Some(uri) = params.get("uri").and_then(Value::as_str) {
                self.diagnostics
                    .insert(uri.to_string(), map_diagnostics(params));
            }
        }
    }

    /// Frame and write a JSON payload to the server.
    fn send(&mut self, payload: &str) -> io::Result<()> {
        self.stdin.write_all(&encode(payload))?;
        self.stdin.flush()
    }

    /// Read the next complete LSP message, or `None` at end of stream.
    fn read_message(&mut self) -> io::Result<Option<String>> {
        loop {
            if let Some(message) = self.frames.next_message() {
                return Ok(Some(message));
            }
            let mut chunk = [0u8; 8192];
            let read = self.stdout.read(&mut chunk)?;
            if read == 0 {
                return Ok(None);
            }
            self.frames.push(&chunk[..read]);
        }
    }
}

impl Drop for TexLabClient {
    fn drop(&mut self) {
        let _ = self.send(&request(i64::MAX, "shutdown", Value::Null));
        let _ = self.send(&notification("exit", Value::Null));
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl LanguageIntelligence for TexLabClient {
    fn completion(&mut self, doc: &TextDocument, position: Position) -> Vec<CompletionItem> {
        if self.sync(doc).is_err() {
            return Vec::new();
        }
        let result = self
            .roundtrip("textDocument/completion", text_position(doc, position))
            .unwrap_or(Value::Null);
        map_completion(&result)
    }

    fn hover(&mut self, doc: &TextDocument, position: Position) -> Option<Hover> {
        self.sync(doc).ok()?;
        let result = self
            .roundtrip("textDocument/hover", text_position(doc, position))
            .ok()?;
        map_hover(&result)
    }

    fn definition(&mut self, doc: &TextDocument, position: Position) -> Option<Location> {
        self.sync(doc).ok()?;
        let result = self
            .roundtrip("textDocument/definition", text_position(doc, position))
            .ok()?;
        map_definition(&result)
    }

    fn symbols(&mut self, doc: &TextDocument) -> Vec<DocumentSymbol> {
        if self.sync(doc).is_err() {
            return Vec::new();
        }
        let result = self
            .roundtrip(
                "textDocument/documentSymbol",
                json!({ "textDocument": { "uri": doc.uri } }),
            )
            .unwrap_or(Value::Null);
        map_symbols(&result)
    }

    fn diagnostics(&mut self, doc: &TextDocument) -> Vec<Diagnostic> {
        if self.sync(doc).is_err() {
            return Vec::new();
        }
        // A real round-trip whose response marks "the server has processed the
        // change"; the diagnostics that matter are pushed before it answers and
        // are captured by `on_notification` along the way.
        let _ = self.roundtrip(
            "textDocument/documentSymbol",
            json!({ "textDocument": { "uri": doc.uri } }),
        );
        self.diagnostics.get(&doc.uri).cloned().unwrap_or_default()
    }
}

/// The `{ textDocument, position }` params shared by completion/hover/definition.
fn text_position(doc: &TextDocument, position: Position) -> Value {
    json!({
        "textDocument": { "uri": doc.uri },
        "position": { "line": position.line, "character": position.character }
    })
}

/// A `file:` URI for an absolute filesystem path (POSIX form; good enough for the
/// Linux dev/itest target — the Tauri layer supplies already-absolute roots).
fn path_to_uri(path: &Path) -> String {
    format!("file://{}", path.display())
}
