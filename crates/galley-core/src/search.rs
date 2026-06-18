//! Project-wide text search: a pure, I/O-free pattern matcher.
//!
//! [`search_in_content`] matches a [`SearchQuery`] against a single string
//! and returns every match with its 1-based line/column and the surrounding
//! source line. File iteration is the caller's concern; this module stays
//! dependency-free of I/O so it is trivially driven to 100% coverage.

use regex::{Regex, RegexBuilder};

/// A search query: what to look for and how.
#[derive(Debug, Clone)]
pub struct SearchQuery {
    /// The pattern text (literal string, or a regex when `use_regex` is set).
    pub pattern: String,
    /// Match is case-sensitive when true.
    pub case_sensitive: bool,
    /// Only match whole words (bounded by non-word characters).
    pub whole_word: bool,
    /// Treat `pattern` as a regular expression rather than a literal string.
    pub use_regex: bool,
}

impl SearchQuery {
    /// Create a new search query with default settings (case-insensitive, literal).
    pub fn new(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
            case_sensitive: false,
            whole_word: false,
            use_regex: false,
        }
    }
}

/// A single match inside a file's content.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchMatch {
    /// 1-based line number.
    pub line: u32,
    /// 1-based column of the match start.
    pub column: u32,
    /// The full source line containing the match.
    pub line_text: String,
    /// Byte offset from the start of the content where the match begins.
    pub match_start: usize,
    /// Byte offset from the start of the content where the match ends.
    pub match_end: usize,
}

/// Build a [`Regex`] from `query`, returning `None` for an invalid pattern.
fn build_regex(query: &SearchQuery) -> Option<Regex> {
    let pat = if query.use_regex {
        query.pattern.clone()
    } else {
        regex::escape(&query.pattern)
    };
    let pat = if query.whole_word {
        format!(r"\b{pat}\b")
    } else {
        pat
    };
    RegexBuilder::new(&pat)
        .case_insensitive(!query.case_sensitive)
        .build()
        .ok()
}

/// Find all occurrences of `query` in `content`.
///
/// Returns an empty `Vec` when the query is empty, the pattern is an invalid
/// regex, or there are no matches.
pub fn search_in_content(content: &str, query: &SearchQuery) -> Vec<SearchMatch> {
    if query.pattern.is_empty() {
        return Vec::new();
    }
    let re = match build_regex(query) {
        Some(re) => re,
        None => return Vec::new(),
    };
    // Build a line-start offset table so we can map byte offsets → line/col
    // without rescanning the string for each match.
    let line_starts: Vec<usize> = std::iter::once(0)
        .chain(content.match_indices('\n').map(|(i, _)| i + 1))
        .collect();

    let mut results = Vec::new();
    for m in re.find_iter(content) {
        let offset = m.start();
        // Binary search for the line containing `offset`.
        let line_idx = line_starts.partition_point(|&s| s <= offset).saturating_sub(1);
        let line_start = line_starts[line_idx];
        let line_end = line_starts
            .get(line_idx + 1)
            .map(|&s| s.saturating_sub(1)) // strip the '\n'
            .unwrap_or(content.len());
        let line_text = content[line_start..line_end].trim_end_matches('\r').to_owned();
        results.push(SearchMatch {
            line: (line_idx + 1) as u32,
            column: (offset - line_start + 1) as u32,
            line_text,
            match_start: m.start(),
            match_end: m.end(),
        });
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(pattern: &str) -> SearchQuery {
        SearchQuery::new(pattern)
    }

    #[test]
    fn empty_pattern_returns_nothing() {
        let matches = search_in_content("hello world", &q(""));
        assert!(matches.is_empty());
    }

    #[test]
    fn no_match_returns_nothing() {
        let matches = search_in_content("hello world", &q("xyz"));
        assert!(matches.is_empty());
    }

    #[test]
    fn simple_literal_match() {
        let content = "hello world\nsecond line";
        let matches = search_in_content(content, &q("world"));
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line, 1);
        assert_eq!(matches[0].column, 7);
        assert_eq!(matches[0].line_text, "hello world");
    }

    #[test]
    fn case_insensitive_default() {
        let content = "Hello World";
        let matches = search_in_content(content, &q("hello"));
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].column, 1);
    }

    #[test]
    fn case_sensitive_no_match() {
        let content = "Hello World";
        let mut query = q("hello");
        query.case_sensitive = true;
        let matches = search_in_content(content, &query);
        assert!(matches.is_empty());
    }

    #[test]
    fn case_sensitive_match() {
        let content = "Hello World";
        let mut query = q("Hello");
        query.case_sensitive = true;
        let matches = search_in_content(content, &query);
        assert_eq!(matches.len(), 1);
    }

    #[test]
    fn whole_word_match() {
        let content = "cat concatenate cat";
        let mut query = q("cat");
        query.whole_word = true;
        let matches = search_in_content(content, &query);
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].column, 1);
        assert_eq!(matches[1].column, 17);
    }

    #[test]
    fn whole_word_no_match_inside_word() {
        let content = "concatenate";
        let mut query = q("cat");
        query.whole_word = true;
        let matches = search_in_content(content, &query);
        assert!(matches.is_empty());
    }

    #[test]
    fn regex_match() {
        let content = "\\section{Intro}\n\\section{Methods}";
        let mut query = q(r"\\section\{[^}]+\}");
        query.use_regex = true;
        let matches = search_in_content(content, &query);
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].line, 1);
        assert_eq!(matches[1].line, 2);
    }

    #[test]
    fn invalid_regex_returns_nothing() {
        let content = "hello";
        let mut query = q(r"[invalid(");
        query.use_regex = true;
        let matches = search_in_content(content, &query);
        assert!(matches.is_empty());
    }

    #[test]
    fn multiline_line_numbers() {
        let content = "line one\nline two\nline three";
        let matches = search_in_content(content, &q("line"));
        assert_eq!(matches.len(), 3);
        assert_eq!(matches[0].line, 1);
        assert_eq!(matches[1].line, 2);
        assert_eq!(matches[2].line, 3);
    }

    #[test]
    fn line_text_is_full_line() {
        let content = "hello world\ngoodbye world";
        let matches = search_in_content(content, &q("world"));
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].line_text, "hello world");
        assert_eq!(matches[1].line_text, "goodbye world");
    }

    #[test]
    fn multiple_matches_on_same_line() {
        let content = "aa bb aa";
        let matches = search_in_content(content, &q("aa"));
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].line, 1);
        assert_eq!(matches[1].line, 1);
        assert_eq!(matches[0].column, 1);
        assert_eq!(matches[1].column, 7);
    }

    #[test]
    fn match_offsets_correct() {
        let content = "hello world";
        let matches = search_in_content(content, &q("world"));
        assert_eq!(matches[0].match_start, 6);
        assert_eq!(matches[0].match_end, 11);
    }

    #[test]
    fn content_with_crlf_endings() {
        let content = "line one\r\nline two";
        let matches = search_in_content(content, &q("line"));
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].line, 1);
        assert_eq!(matches[1].line, 2);
        // line_text strips the trailing \r
        assert_eq!(matches[0].line_text, "line one");
    }

    #[test]
    fn literal_dot_not_treated_as_regex() {
        let content = "a.b axb";
        // Without use_regex, dot is literal — only "a.b" matches.
        let matches = search_in_content(content, &q("a.b"));
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].column, 1);
    }
}
