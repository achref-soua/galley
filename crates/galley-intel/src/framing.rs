//! LSP base-protocol framing: the `Content-Length` header that wraps every
//! JSON-RPC message on the wire.
//!
//! A language server and client exchange messages as
//! `Content-Length: <n>\r\n\r\n<n bytes of JSON>` (an optional `Content-Type`
//! header may precede the blank line and is ignored). This module turns a JSON
//! payload into those bytes ([`encode`]) and reassembles a byte stream back into
//! whole messages ([`FrameBuffer`]). It is pure — no sockets, no process — so the
//! real client (behind `real-lsp`) only has to move bytes; the framing decisions
//! are all decided and tested here.

/// Wrap a JSON `payload` in an LSP `Content-Length` frame, ready to write to the
/// server's stdin. The length is the payload's byte length, per the spec.
#[must_use]
pub fn encode(payload: &str) -> Vec<u8> {
    let mut bytes = format!("Content-Length: {}\r\n\r\n", payload.len()).into_bytes();
    bytes.extend_from_slice(payload.as_bytes());
    bytes
}

/// A reassembly buffer for an incoming LSP byte stream.
///
/// Bytes arrive from the server in arbitrary chunks; [`push`](Self::push) appends
/// them and [`next_message`](Self::next_message) yields each complete JSON payload
/// once it has fully arrived, leaving any trailing partial frame buffered.
#[derive(Debug, Default)]
pub struct FrameBuffer {
    buf: Vec<u8>,
}

impl FrameBuffer {
    /// A new, empty buffer.
    #[must_use]
    pub fn new() -> Self {
        Self { buf: Vec::new() }
    }

    /// Append freshly read bytes.
    pub fn push(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// Pull the next complete message's JSON body, if one has fully arrived.
    ///
    /// Returns `None` while the header or the announced body is still incomplete,
    /// or when the header carries no usable `Content-Length`.
    pub fn next_message(&mut self) -> Option<String> {
        let separator = find(&self.buf, b"\r\n\r\n")?;
        let length = content_length(&self.buf[..separator])?;
        let body_start = separator + 4;
        let body_end = body_start + length;
        if self.buf.len() < body_end {
            return None;
        }
        let body = String::from_utf8_lossy(&self.buf[body_start..body_end]).into_owned();
        self.buf.drain(..body_end);
        Some(body)
    }
}

/// The `Content-Length` value from a header block, if present and numeric.
fn content_length(header: &[u8]) -> Option<usize> {
    let text = String::from_utf8_lossy(header);
    for line in text.split("\r\n") {
        if let Some(value) = strip_prefix_ci(line, "content-length:") {
            return value.trim().parse::<usize>().ok();
        }
    }
    None
}

/// Strip `prefix` from the start of `line`, case-insensitively, returning the
/// remainder. (`Content-Length` may be sent in any case.)
fn strip_prefix_ci<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let head = line.get(..prefix.len())?;
    if head.eq_ignore_ascii_case(prefix) {
        Some(&line[prefix.len()..])
    } else {
        None
    }
}

/// The index of the first occurrence of `needle` in `haystack`, if any.
fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_a_payload_with_its_byte_length() {
        let frame = encode("{}");
        assert_eq!(frame, b"Content-Length: 2\r\n\r\n{}");
        // Length is the *byte* length: a multi-byte char counts its bytes.
        let frame = encode("é"); // two UTF-8 bytes
        assert_eq!(frame, "Content-Length: 2\r\n\r\né".as_bytes());
    }

    #[test]
    fn reassembles_a_whole_message() {
        let mut fb = FrameBuffer::new();
        fb.push(&encode("{\"id\":1}"));
        assert_eq!(fb.next_message().as_deref(), Some("{\"id\":1}"));
        // The buffer is now empty, so the next pull yields nothing.
        assert_eq!(fb.next_message(), None);
    }

    #[test]
    fn waits_for_the_header_separator() {
        let mut fb = FrameBuffer::default();
        fb.push(b"Content-Length: 2\r\n"); // no blank line yet
        assert_eq!(fb.next_message(), None);
    }

    #[test]
    fn waits_for_the_full_body() {
        let mut fb = FrameBuffer::new();
        fb.push(b"Content-Length: 8\r\n\r\n{\"id\":"); // body short of 8 bytes
        assert_eq!(fb.next_message(), None);
        // Once the rest arrives, the whole message comes out.
        fb.push(b"1}");
        assert_eq!(fb.next_message().as_deref(), Some("{\"id\":1}"));
    }

    #[test]
    fn splits_two_concatenated_messages() {
        let mut fb = FrameBuffer::new();
        let mut bytes = encode("{\"a\":1}");
        bytes.extend(encode("{\"b\":2}"));
        fb.push(&bytes);
        assert_eq!(fb.next_message().as_deref(), Some("{\"a\":1}"));
        assert_eq!(fb.next_message().as_deref(), Some("{\"b\":2}"));
        assert_eq!(fb.next_message(), None);
    }

    #[test]
    fn ignores_an_extra_header_and_finds_content_length_in_any_case() {
        let mut fb = FrameBuffer::new();
        fb.push(b"Content-Type: utf-8\r\ncontent-LENGTH: 2\r\n\r\n{}");
        assert_eq!(fb.next_message().as_deref(), Some("{}"));
    }

    #[test]
    fn rejects_a_header_without_content_length() {
        let mut fb = FrameBuffer::new();
        fb.push(b"Content-Type: utf-8\r\n\r\n{}");
        assert_eq!(fb.next_message(), None);
    }

    #[test]
    fn rejects_a_non_numeric_content_length() {
        let mut fb = FrameBuffer::new();
        fb.push(b"Content-Length: lots\r\n\r\n{}");
        assert_eq!(fb.next_message(), None);
    }

    #[test]
    fn strip_prefix_ci_handles_short_lines() {
        // A line shorter than the prefix cannot match.
        assert_eq!(strip_prefix_ci("ab", "content-length:"), None);
        // A same-length-but-different line does not match either.
        assert_eq!(strip_prefix_ci("content-typex:", "content-length:"), None);
        assert_eq!(
            strip_prefix_ci("Content-Length: 5", "content-length:"),
            Some(" 5")
        );
    }

    #[test]
    fn find_locates_and_misses_a_needle() {
        assert_eq!(find(b"abcd", b"cd"), Some(2));
        assert_eq!(find(b"abcd", b"xy"), None);
    }
}
