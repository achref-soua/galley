//! The JSON-RPC layer of LSP: building outgoing requests and notifications, and
//! classifying an incoming message into a response, an error, a server-to-client
//! request, or a notification.
//!
//! Pure string/JSON work on top of `serde_json`'s untyped [`Value`] — no derive
//! macros, so every decision below is ours and is exercised by the fixtures in
//! the tests. The live client (behind `real-lsp`) frames these strings with
//! [`crate::framing`] and routes responses back to their requests by id.

use serde_json::{json, Value};

/// Allocates the monotonically increasing request ids that correlate a response
/// back to the request that produced it.
#[derive(Debug, Default)]
pub struct Correlator {
    next: i64,
}

impl Correlator {
    /// A correlator whose first id will be `1`.
    #[must_use]
    pub fn new() -> Self {
        Self { next: 1 }
    }

    /// The next request id, never repeated.
    pub fn next_id(&mut self) -> i64 {
        let id = self.next;
        self.next += 1;
        id
    }
}

/// Serialize a JSON-RPC **request** (`id` + `method` + `params`) to a string.
#[must_use]
pub fn request(id: i64, method: &str, params: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }).to_string()
}

/// Serialize a JSON-RPC **notification** (`method` + `params`, no id) to a string.
#[must_use]
pub fn notification(method: &str, params: Value) -> String {
    json!({ "jsonrpc": "2.0", "method": method, "params": params }).to_string()
}

/// Serialize a JSON-RPC **response** to a server-to-client request: the `id`
/// being answered and a `result`.
#[must_use]
pub fn response(id: i64, result: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

/// A classified incoming JSON-RPC message.
#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    /// A successful response to one of our requests.
    Response {
        /// The id of the request being answered.
        id: i64,
        /// The result payload (`null` when the method returns nothing).
        result: Value,
    },
    /// An error response to one of our requests.
    ResponseError {
        /// The id of the request being answered.
        id: i64,
        /// The human-readable error message.
        message: String,
    },
    /// A request *from* the server that expects a reply (e.g. `workspace/configuration`).
    ServerRequest {
        /// The id we must echo in our reply.
        id: i64,
        /// The method the server is invoking.
        method: String,
        /// The request parameters.
        params: Value,
    },
    /// A one-way notification from the server (e.g. `textDocument/publishDiagnostics`).
    Notification {
        /// The notification method.
        method: String,
        /// The notification parameters.
        params: Value,
    },
}

/// Parse and classify a raw JSON-RPC message. Returns `None` for anything that is
/// not valid JSON or is not a recognizable request/response/notification object.
#[must_use]
pub fn parse_incoming(text: &str) -> Option<Incoming> {
    let value: Value = serde_json::from_str(text).ok()?;
    let object = value.as_object()?;
    let id = object.get("id").and_then(Value::as_i64);
    let method = object.get("method").and_then(Value::as_str);
    match (id, method) {
        (Some(id), _) if object.contains_key("error") => Some(Incoming::ResponseError {
            id,
            message: error_message(&object["error"]),
        }),
        (Some(id), Some(method)) => Some(Incoming::ServerRequest {
            id,
            method: method.to_string(),
            params: params_of(object),
        }),
        (Some(id), None) => Some(Incoming::Response {
            id,
            result: object.get("result").cloned().unwrap_or(Value::Null),
        }),
        (None, Some(method)) => Some(Incoming::Notification {
            method: method.to_string(),
            params: params_of(object),
        }),
        (None, None) => None,
    }
}

/// The `params` of a message object, defaulting to `null` when absent.
fn params_of(object: &serde_json::Map<String, Value>) -> Value {
    object.get("params").cloned().unwrap_or(Value::Null)
}

/// The `message` of a JSON-RPC error object, or a stable fallback.
fn error_message(error: &Value) -> String {
    error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("the language server reported an error")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correlator_hands_out_increasing_ids() {
        let mut c = Correlator::new();
        assert_eq!(c.next_id(), 1);
        assert_eq!(c.next_id(), 2);
        assert_eq!(c.next_id(), 3);
        // Default starts at 0 (its first id is 0); new() starts at 1.
        let mut d = Correlator::default();
        assert_eq!(d.next_id(), 0);
        assert!(format!("{d:?}").contains("Correlator"));
    }

    #[test]
    fn builds_a_request_with_all_fields() {
        let text = request(7, "textDocument/hover", json!({ "x": 1 }));
        let parsed: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["id"], 7);
        assert_eq!(parsed["method"], "textDocument/hover");
        assert_eq!(parsed["params"]["x"], 1);
    }

    #[test]
    fn builds_a_notification_without_an_id() {
        let text = notification("initialized", json!({}));
        let parsed: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["method"], "initialized");
        assert!(parsed.get("id").is_none());
    }

    #[test]
    fn builds_a_response_to_a_server_request() {
        let text = response(3, Value::Null);
        let parsed: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["id"], 3);
        assert!(parsed["result"].is_null());
    }

    #[test]
    fn classifies_a_successful_response() {
        let incoming = parse_incoming(r#"{"jsonrpc":"2.0","id":2,"result":{"ok":true}}"#).unwrap();
        assert_eq!(
            incoming,
            Incoming::Response {
                id: 2,
                result: json!({ "ok": true })
            }
        );
        // Debug + Clone are exercised here too.
        assert!(format!("{incoming:?}").contains("Response"));
        assert_eq!(incoming.clone(), incoming);
    }

    #[test]
    fn a_response_without_a_result_defaults_to_null() {
        let incoming = parse_incoming(r#"{"jsonrpc":"2.0","id":5}"#).unwrap();
        assert_eq!(
            incoming,
            Incoming::Response {
                id: 5,
                result: Value::Null
            }
        );
    }

    #[test]
    fn classifies_an_error_response_with_and_without_a_message() {
        let with = parse_incoming(r#"{"id":4,"error":{"code":-32601,"message":"no method"}}"#);
        assert_eq!(
            with,
            Some(Incoming::ResponseError {
                id: 4,
                message: "no method".to_string()
            })
        );
        // An error object missing its message falls back to a stable string.
        let without = parse_incoming(r#"{"id":4,"error":{"code":-1}}"#);
        assert_eq!(
            without,
            Some(Incoming::ResponseError {
                id: 4,
                message: "the language server reported an error".to_string()
            })
        );
    }

    #[test]
    fn classifies_a_server_request() {
        let incoming =
            parse_incoming(r#"{"id":9,"method":"workspace/configuration","params":{"a":1}}"#)
                .unwrap();
        assert_eq!(
            incoming,
            Incoming::ServerRequest {
                id: 9,
                method: "workspace/configuration".to_string(),
                params: json!({ "a": 1 })
            }
        );
    }

    #[test]
    fn classifies_a_notification_and_defaults_missing_params() {
        let with =
            parse_incoming(r#"{"method":"textDocument/publishDiagnostics","params":{"uri":"x"}}"#)
                .unwrap();
        assert_eq!(
            with,
            Incoming::Notification {
                method: "textDocument/publishDiagnostics".to_string(),
                params: json!({ "uri": "x" })
            }
        );
        // A notification with no params reads as null params.
        let bare = parse_incoming(r#"{"method":"exit"}"#).unwrap();
        assert_eq!(
            bare,
            Incoming::Notification {
                method: "exit".to_string(),
                params: Value::Null
            }
        );
    }

    #[test]
    fn rejects_junk_and_shapeless_objects() {
        // Not JSON at all.
        assert_eq!(parse_incoming("not json"), None);
        // Valid JSON but not an object.
        assert_eq!(parse_incoming("[1,2,3]"), None);
        // An object with neither id nor method.
        assert_eq!(parse_incoming(r#"{"jsonrpc":"2.0"}"#), None);
    }
}
