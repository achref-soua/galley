//! Bibliography domain: a tolerant `.bib` parser/serializer and the pure helpers
//! around citation management.
//!
//! Everything here is pure and dependency-free, so it is exercised to full
//! coverage with plain unit tests. The bytes that feed it come from elsewhere —
//! the project's `.bib` files (read through the sandboxed file store) and the
//! responses of reference lookups (DOI content negotiation returns BibTeX, which
//! [`parse_bib`] handles directly; arXiv returns Atom XML, which
//! [`arxiv_atom_to_entry`] turns into an entry). Galley always operates on the
//! `.bib` source as the single source of truth (§0.5): the panel lists what the
//! parser finds, and additions are serialized straight back into the file.
//!
//! The parser is deliberately forgiving — real-world `.bib` files are messy — and
//! format-agnostic: BibTeX and biblatex share the `@type{key, field = value}`
//! grammar, so both flow through unchanged.

/// A single `name = value` field within a bibliography entry.
///
/// The name is normalized to lowercase (BibTeX field names are
/// case-insensitive); the value is stored verbatim, without its surrounding
/// braces or quotes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibField {
    /// The lowercased field name (e.g. `author`, `title`, `year`).
    pub name: String,
    /// The field's value, with delimiters stripped.
    pub value: String,
}

impl BibField {
    /// A field named `name` (lowercased) carrying `value`.
    #[must_use]
    pub fn new(name: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            name: name.into().to_ascii_lowercase(),
            value: value.into(),
        }
    }
}

/// A bibliography entry: its type, citation key, and fields in source order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BibEntry {
    /// The lowercased entry type without the `@` (e.g. `article`, `book`).
    pub entry_type: String,
    /// The citation key used by `\cite{…}` (case preserved).
    pub key: String,
    /// The entry's fields, in the order they appeared.
    pub fields: Vec<BibField>,
}

impl BibEntry {
    /// An entry of `entry_type` (lowercased) with citation `key` and `fields`.
    #[must_use]
    pub fn new(
        entry_type: impl Into<String>,
        key: impl Into<String>,
        fields: Vec<BibField>,
    ) -> Self {
        Self {
            entry_type: entry_type.into().to_ascii_lowercase(),
            key: key.into(),
            fields,
        }
    }

    /// The value of the field named `name`, matched case-insensitively.
    #[must_use]
    pub fn field(&self, name: &str) -> Option<&str> {
        self.fields
            .iter()
            .find(|f| f.name.eq_ignore_ascii_case(name))
            .map(|f| f.value.as_str())
    }
}

/// Parse a `.bib` document into its entries, skipping `@comment`, `@string`, and
/// `@preamble` blocks and tolerating malformed or truncated input.
#[must_use]
pub fn parse_bib(input: &str) -> Vec<BibEntry> {
    let mut parser = Parser::new(input);
    let mut entries = Vec::new();
    while parser.advance_to_at() {
        if let Some(entry) = parser.parse_entry() {
            entries.push(entry);
        }
    }
    entries
}

/// A cursor over the characters of a `.bib` document.
struct Parser {
    chars: Vec<char>,
    pos: usize,
}

impl Parser {
    fn new(input: &str) -> Self {
        Self {
            chars: input.chars().collect(),
            pos: 0,
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn bump(&mut self) -> Option<char> {
        let current = self.peek();
        if current.is_some() {
            self.pos += 1;
        }
        current
    }

    /// Consume one character when it equals `expected`; report whether it did.
    fn consume(&mut self, expected: char) -> bool {
        if self.peek() == Some(expected) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn skip_ws(&mut self) {
        while let Some(c) = self.peek() {
            if c.is_whitespace() {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    /// Advance past the next `@`, consuming it. Returns `false` at end of input.
    fn advance_to_at(&mut self) -> bool {
        while let Some(c) = self.peek() {
            self.pos += 1;
            if c == '@' {
                return true;
            }
        }
        false
    }

    /// Read an identifier (alphanumeric or `_`) — an entry type after `@`.
    fn read_identifier(&mut self) -> String {
        let mut out = String::new();
        while let Some(c) = self.peek() {
            if c.is_alphanumeric() || c == '_' {
                out.push(c);
                self.pos += 1;
            } else {
                break;
            }
        }
        out
    }

    /// Read a citation key — everything up to the first `,` or `}`.
    fn read_key(&mut self) -> String {
        let mut out = String::new();
        while let Some(c) = self.peek() {
            if c == ',' || c == '}' {
                break;
            }
            out.push(c);
            self.pos += 1;
        }
        out.trim().to_string()
    }

    /// Read a field name — alphanumerics and the punctuation BibTeX allows.
    fn read_field_name(&mut self) -> String {
        let mut out = String::new();
        while let Some(c) = self.peek() {
            if c.is_alphanumeric() || matches!(c, '_' | '-' | '+' | ':' | '.') {
                out.push(c);
                self.pos += 1;
            } else {
                break;
            }
        }
        out
    }

    /// Parse one entry. The cursor sits just past the `@`. Returns `None` for
    /// special (`@comment`/`@string`/`@preamble`) or malformed blocks, having
    /// consumed them so parsing can continue.
    fn parse_entry(&mut self) -> Option<BibEntry> {
        let entry_type = self.read_identifier().to_ascii_lowercase();
        if entry_type.is_empty() {
            return None;
        }
        self.skip_ws();
        if !self.consume('{') {
            return None;
        }
        if matches!(entry_type.as_str(), "comment" | "string" | "preamble") {
            self.skip_entry_body();
            return None;
        }
        let key = self.read_key();
        let mut fields = Vec::new();
        loop {
            self.skip_ws();
            if !self.consume(',') {
                break;
            }
            self.skip_ws();
            if let Some(field) = self.read_field() {
                fields.push(field);
            }
        }
        self.skip_ws();
        self.consume('}');
        Some(BibEntry {
            entry_type,
            key,
            fields,
        })
    }

    /// Read a `name = value` field. Returns `None` when no field name is present
    /// (a trailing comma) or no `=` follows the name.
    fn read_field(&mut self) -> Option<BibField> {
        let name = self.read_field_name().to_ascii_lowercase();
        if name.is_empty() {
            return None;
        }
        self.skip_ws();
        if !self.consume('=') {
            return None;
        }
        self.skip_ws();
        let value = self.read_value();
        Some(BibField { name, value })
    }

    /// Read a field value: `{braced}`, `"quoted"`, or a bare token.
    fn read_value(&mut self) -> String {
        match self.peek() {
            Some('{') => self.read_braced(),
            Some('"') => self.read_quoted(),
            _ => self.read_bare(),
        }
    }

    /// Read a brace-delimited value, honoring nested braces. The cursor sits on
    /// the opening `{`; on return it is just past the matching `}`.
    fn read_braced(&mut self) -> String {
        self.pos += 1; // consume the opening '{'
        let mut depth = 1;
        let mut out = String::new();
        while let Some(c) = self.bump() {
            if c == '{' {
                depth += 1;
                out.push(c);
            } else if c == '}' {
                depth -= 1;
                if depth == 0 {
                    break;
                }
                out.push(c);
            } else {
                out.push(c);
            }
        }
        out
    }

    /// Read a quote-delimited value. The cursor sits on the opening `"`.
    fn read_quoted(&mut self) -> String {
        self.pos += 1; // consume the opening '"'
        let mut out = String::new();
        while let Some(c) = self.bump() {
            if c == '"' {
                break;
            }
            out.push(c);
        }
        out
    }

    /// Read a bare value (a number or single token) up to the next `,` or `}`.
    fn read_bare(&mut self) -> String {
        let mut out = String::new();
        while let Some(c) = self.peek() {
            if c == ',' || c == '}' {
                break;
            }
            out.push(c);
            self.pos += 1;
        }
        out.trim().to_string()
    }

    /// Skip a brace-delimited entry body, used for blocks Galley ignores. The
    /// cursor sits just past the opening `{`.
    fn skip_entry_body(&mut self) {
        let mut depth = 1;
        while let Some(c) = self.bump() {
            if c == '{' {
                depth += 1;
            } else if c == '}' {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
        }
    }
}

/// Serialize a single entry to canonical `.bib` text — one field per indented
/// line, every value brace-wrapped.
#[must_use]
pub fn serialize_entry(entry: &BibEntry) -> String {
    let mut out = format!("@{}{{{},\n", entry.entry_type, entry.key);
    for field in &entry.fields {
        out.push_str(&format!("  {} = {{{}}},\n", field.name, field.value));
    }
    out.push_str("}\n");
    out
}

/// Serialize a list of entries, separated by a blank line.
#[must_use]
pub fn serialize_bib(entries: &[BibEntry]) -> String {
    entries
        .iter()
        .map(serialize_entry)
        .collect::<Vec<_>>()
        .join("\n")
}

/// A one-line human summary of an entry for the citation picker:
/// `Surname (Year) — Title`, degrading gracefully when fields are missing.
#[must_use]
pub fn entry_summary(entry: &BibEntry) -> String {
    let title = entry.field("title").unwrap_or("(untitled)");
    let mut lead = String::new();
    if let Some(author) = entry.field("author") {
        lead.push_str(&first_author(author));
    }
    if let Some(year) = entry.field("year") {
        if !lead.is_empty() {
            lead.push(' ');
        }
        lead.push_str(&format!("({year})"));
    }
    if lead.is_empty() {
        title.to_string()
    } else {
        format!("{lead} — {title}")
    }
}

/// The first author's surname from a BibTeX `author` field (handles both
/// `Last, First and …` and `First Last and …` forms).
fn first_author(author: &str) -> String {
    let first = match author.find(" and ") {
        Some(i) => &author[..i],
        None => author,
    }
    .trim();
    match first.split_once(',') {
        Some((last, _)) => last.trim().to_string(),
        None => last_word(first),
    }
}

/// The last whitespace-separated word of `s` (its surname, for `First Last`).
fn last_word(s: &str) -> String {
    match s.rsplit_once(' ') {
        Some((_, last)) => last.to_string(),
        None => s.to_string(),
    }
}

/// Suggest a citation key from an `author` field and a `year`: a lowercased
/// surname followed by the year's digits (e.g. `einstein1905`). Falls back to
/// `ref` when no usable surname is present.
#[must_use]
pub fn suggest_cite_key(author: &str, year: &str) -> String {
    let surname: String = first_author(author)
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect();
    let base = if surname.is_empty() {
        "ref".to_string()
    } else {
        surname.to_ascii_lowercase()
    };
    let digits: String = year.chars().filter(char::is_ascii_digit).collect();
    format!("{base}{digits}")
}

/// Turn an arXiv Atom API response into a bibliography entry, or `None` when it
/// carries no usable entry (no `<entry>` block or no title).
#[must_use]
pub fn arxiv_atom_to_entry(xml: &str) -> Option<BibEntry> {
    let entry = extract_tag(xml, "entry")?;
    let title = clean_ws(&extract_tag(&entry, "title")?);
    if title.is_empty() {
        return None;
    }
    let authors: Vec<String> = extract_all(&entry, "name")
        .iter()
        .map(|name| clean_ws(name))
        .filter(|name| !name.is_empty())
        .collect();
    let author_field = authors.join(" and ");
    let year: String = extract_tag(&entry, "published")
        .unwrap_or_default()
        .chars()
        .take(4)
        .collect();
    let eprint = extract_tag(&entry, "id")
        .map(|id| arxiv_id_from_url(&clean_ws(&id)))
        .unwrap_or_default();

    let key = if author_field.is_empty() {
        format!("arxiv{}", sanitize_key(&eprint))
    } else {
        suggest_cite_key(&author_field, &year)
    };

    let mut fields = Vec::new();
    if !author_field.is_empty() {
        fields.push(BibField::new("author", author_field));
    }
    fields.push(BibField::new("title", title));
    if !year.is_empty() {
        fields.push(BibField::new("year", year));
    }
    if !eprint.is_empty() {
        fields.push(BibField::new("eprint", eprint));
        fields.push(BibField::new("archivePrefix", "arXiv"));
    }
    Some(BibEntry::new("article", key, fields))
}

/// Extract the inner text of the first `<tag …>…</tag>` element, or `None`.
fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let start = xml.find(&open)?;
    let after_open = &xml[start + open.len()..];
    let gt = after_open.find('>')?;
    let content_start = start + open.len() + gt + 1;
    let close = format!("</{tag}>");
    let rel_end = xml[content_start..].find(&close)?;
    Some(xml[content_start..content_start + rel_end].to_string())
}

/// Extract the inner text of every `<tag …>…</tag>` element, in order.
fn extract_all(xml: &str, tag: &str) -> Vec<String> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find(&open) {
        let after_open = &rest[start + open.len()..];
        let Some(gt) = after_open.find('>') else {
            break;
        };
        let content_start = start + open.len() + gt + 1;
        let Some(rel_end) = rest[content_start..].find(&close) else {
            break;
        };
        out.push(rest[content_start..content_start + rel_end].to_string());
        rest = &rest[content_start + rel_end + close.len()..];
    }
    out
}

/// Collapse runs of whitespace (including newlines) into single spaces and trim.
fn clean_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The bare arXiv identifier from an abstract URL (`…/abs/2401.00001v1`).
fn arxiv_id_from_url(url: &str) -> String {
    let id = match url.rsplit_once("/abs/") {
        Some((_, rest)) => rest,
        None => url,
    };
    id.trim().to_string()
}

/// Keep only the alphanumeric characters of `s` (for a safe key fragment).
fn sanitize_key(s: &str) -> String {
    s.chars().filter(char::is_ascii_alphanumeric).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bib_field_lowercases_its_name() {
        let field = BibField::new("Author", "Ada Lovelace");
        assert_eq!(field.name, "author");
        assert_eq!(field.value, "Ada Lovelace");
        assert_eq!(field.clone(), field);
        assert!(format!("{field:?}").contains("BibField"));
    }

    #[test]
    fn bib_entry_lowercases_its_type_and_looks_up_fields() {
        let entry = BibEntry::new(
            "Article",
            "lovelace1843",
            vec![BibField::new("title", "Notes")],
        );
        assert_eq!(entry.entry_type, "article");
        assert_eq!(entry.key, "lovelace1843");
        assert_eq!(entry.field("TITLE"), Some("Notes"));
        assert_eq!(entry.field("missing"), None);
        assert_eq!(entry.clone(), entry);
        assert!(format!("{entry:?}").contains("BibEntry"));
    }

    #[test]
    fn parses_a_single_entry_with_mixed_delimiters() {
        let src = r#"@article{key1,
  author = {Lovelace, Ada},
  title  = "Notes on the Analytical Engine",
  year   = 1843
}"#;
        let entries = parse_bib(src);
        assert_eq!(entries.len(), 1);
        let entry = &entries[0];
        assert_eq!(entry.entry_type, "article");
        assert_eq!(entry.key, "key1");
        assert_eq!(entry.field("author"), Some("Lovelace, Ada"));
        assert_eq!(entry.field("title"), Some("Notes on the Analytical Engine"));
        assert_eq!(entry.field("year"), Some("1843"));
    }

    #[test]
    fn parses_multiple_entries_and_ignores_surrounding_noise() {
        let src =
            "junk before\n@book{a, title = {One}}\n% a comment line\n@misc{b, title = {Two},}";
        let entries = parse_bib(src);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].key, "a");
        assert_eq!(entries[0].entry_type, "book");
        assert_eq!(entries[1].key, "b");
        // The trailing comma after the last field is tolerated (no empty field).
        assert_eq!(entries[1].fields.len(), 1);
    }

    #[test]
    fn handles_nested_braces_in_values() {
        let entries = parse_bib(r"@article{k, title = {A {Nested} Title}}");
        assert_eq!(entries[0].field("title"), Some("A {Nested} Title"));
    }

    #[test]
    fn accepts_punctuated_field_names() {
        // Zotero/biblatex emit names like `date-added` and `file_name`.
        let entries = parse_bib("@misc{k, date-added = {2020}, file_name = {a.pdf}}");
        assert_eq!(entries[0].field("date-added"), Some("2020"));
        assert_eq!(entries[0].field("file_name"), Some("a.pdf"));
    }

    #[test]
    fn skips_special_blocks() {
        let src = r#"@comment{ this is ignored {with braces} }
@string{ pub = {ACM} }
@preamble{ "\newcommand{\x}{y}" }
@article{real, title = {Kept}}"#;
        let entries = parse_bib(src);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key, "real");
    }

    #[test]
    fn tolerates_malformed_and_truncated_input() {
        // '@' with no identifier.
        assert!(parse_bib("@").is_empty());
        assert!(parse_bib("@ {x}").is_empty());
        // Identifier but no opening brace.
        assert!(parse_bib("@article").is_empty());
        // Truncated value (no closing brace at EOF) still yields the entry.
        let truncated = parse_bib("@article{k, title = {Unterminated");
        assert_eq!(truncated.len(), 1);
        assert_eq!(truncated[0].field("title"), Some("Unterminated"));
        // Truncated quoted value.
        let quoted = parse_bib(r#"@article{k, note = "open"#);
        assert_eq!(quoted[0].field("note"), Some("open"));
        // A field name with no '=' is dropped; the entry still parses.
        let no_eq = parse_bib("@article{k, lonely }");
        assert_eq!(no_eq.len(), 1);
        assert!(no_eq[0].fields.is_empty());
    }

    #[test]
    fn parses_bare_values_terminated_by_comma_or_brace() {
        let entries = parse_bib("@article{k, year = 2020, volume = 7}");
        assert_eq!(entries[0].field("year"), Some("2020"));
        assert_eq!(entries[0].field("volume"), Some("7"));
    }

    #[test]
    fn empty_and_keyless_inputs() {
        assert!(parse_bib("").is_empty());
        // An entry with only a key and no fields.
        let entries = parse_bib("@book{solo}");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key, "solo");
        assert!(entries[0].fields.is_empty());
    }

    #[test]
    fn serializes_an_entry_round_trip() {
        let entry = BibEntry::new(
            "article",
            "k",
            vec![
                BibField::new("author", "Ada Lovelace"),
                BibField::new("title", "Notes"),
            ],
        );
        let text = serialize_entry(&entry);
        assert_eq!(
            text,
            "@article{k,\n  author = {Ada Lovelace},\n  title = {Notes},\n}\n"
        );
        // Re-parsing the serialized text yields the same entry.
        let reparsed = parse_bib(&text);
        assert_eq!(reparsed, vec![entry]);
    }

    #[test]
    fn serializes_an_entry_with_no_fields() {
        let entry = BibEntry::new("misc", "x", vec![]);
        assert_eq!(serialize_entry(&entry), "@misc{x,\n}\n");
    }

    #[test]
    fn serializes_a_list_with_blank_line_separators() {
        let entries = vec![
            BibEntry::new("book", "a", vec![BibField::new("title", "One")]),
            BibEntry::new("book", "b", vec![BibField::new("title", "Two")]),
        ];
        let text = serialize_bib(&entries);
        assert_eq!(
            text,
            "@book{a,\n  title = {One},\n}\n\n@book{b,\n  title = {Two},\n}\n"
        );
        assert_eq!(serialize_bib(&[]), "");
    }

    #[test]
    fn entry_summary_combines_author_year_and_title() {
        let full = BibEntry::new(
            "article",
            "k",
            vec![
                BibField::new("author", "Lovelace, Ada and Babbage, Charles"),
                BibField::new("year", "1843"),
                BibField::new("title", "Notes"),
            ],
        );
        assert_eq!(entry_summary(&full), "Lovelace (1843) — Notes");

        // Author in "First Last" form, no year.
        let first_last = BibEntry::new(
            "article",
            "k",
            vec![
                BibField::new("author", "Ada Lovelace"),
                BibField::new("title", "Notes"),
            ],
        );
        assert_eq!(entry_summary(&first_last), "Lovelace — Notes");

        // Year but no author.
        let year_only = BibEntry::new(
            "misc",
            "k",
            vec![
                BibField::new("year", "2020"),
                BibField::new("title", "Untitled-ish"),
            ],
        );
        assert_eq!(entry_summary(&year_only), "(2020) — Untitled-ish");

        // Nothing but a key.
        let bare = BibEntry::new("misc", "k", vec![]);
        assert_eq!(entry_summary(&bare), "(untitled)");
    }

    #[test]
    fn suggest_cite_key_builds_surname_plus_year() {
        assert_eq!(suggest_cite_key("Einstein, Albert", "1905"), "einstein1905");
        assert_eq!(
            suggest_cite_key("Ada Lovelace and Charles Babbage", "1843"),
            "lovelace1843"
        );
        // Non-digit year characters are dropped; missing surname falls back.
        assert_eq!(suggest_cite_key("", "(2020)"), "ref2020");
        assert_eq!(suggest_cite_key("   ", ""), "ref");
    }

    #[test]
    fn arxiv_atom_to_entry_extracts_full_metadata() {
        let xml = r#"<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v5</id>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is
      All You Need</title>
    <author><name>Ashish Vaswani</name></author>
    <author><name>  </name></author>
    <author><name>Noam Shazeer</name></author>
    <summary>The dominant sequence models...</summary>
  </entry>
</feed>"#;
        let entry = arxiv_atom_to_entry(xml).expect("an entry");
        assert_eq!(entry.entry_type, "article");
        assert_eq!(entry.key, "vaswani2017");
        assert_eq!(
            entry.field("author"),
            Some("Ashish Vaswani and Noam Shazeer")
        );
        assert_eq!(entry.field("title"), Some("Attention Is All You Need"));
        assert_eq!(entry.field("year"), Some("2017"));
        assert_eq!(entry.field("eprint"), Some("1706.03762v5"));
        assert_eq!(entry.field("archivePrefix"), Some("arXiv"));
    }

    #[test]
    fn arxiv_atom_to_entry_without_authors_uses_id_key() {
        let xml = r#"<feed><entry>
            <id>http://arxiv.org/abs/2401.00001</id>
            <title>A Lonely Paper</title>
        </entry></feed>"#;
        let entry = arxiv_atom_to_entry(xml).expect("an entry");
        assert_eq!(entry.key, "arxiv240100001");
        assert_eq!(entry.field("author"), None);
        assert_eq!(entry.field("year"), None);
        assert_eq!(entry.field("eprint"), Some("2401.00001"));
        assert_eq!(entry.field("title"), Some("A Lonely Paper"));
    }

    #[test]
    fn arxiv_atom_to_entry_rejects_empty_or_titleless_input() {
        // No <entry> block.
        assert!(arxiv_atom_to_entry("<feed></feed>").is_none());
        // <entry> but no <title>.
        assert!(arxiv_atom_to_entry("<entry><id>x</id></entry>").is_none());
        // A blank title.
        assert!(arxiv_atom_to_entry("<entry><title>   </title></entry>").is_none());
        // An id with no /abs/ segment is kept verbatim.
        let entry =
            arxiv_atom_to_entry("<entry><title>T</title><id>bare-id</id></entry>").expect("entry");
        assert_eq!(entry.field("eprint"), Some("bare-id"));
        // No <id> at all: the eprint/archivePrefix fields are simply omitted.
        let no_id = arxiv_atom_to_entry("<entry><title>T</title></entry>").expect("entry");
        assert_eq!(no_id.key, "arxiv");
        assert_eq!(no_id.field("eprint"), None);
        assert_eq!(no_id.field("archivePrefix"), None);
    }

    #[test]
    fn extract_tag_handles_missing_and_malformed_markup() {
        // Missing tag.
        assert_eq!(extract_tag("<a>x</a>", "b"), None);
        // Opening tag never closed with '>'.
        assert_eq!(extract_tag("<title", "title"), None);
        // No closing tag.
        assert_eq!(extract_tag("<title>x", "title"), None);
        // Attribute on the opening tag is skipped.
        assert_eq!(
            extract_tag(r#"<title type="text">Hi</title>"#, "title"),
            Some("Hi".to_string())
        );
    }

    #[test]
    fn extract_all_collects_and_stops_on_malformed_markup() {
        assert_eq!(
            extract_all("<n>a</n><n>b</n>", "n"),
            vec!["a".to_string(), "b".to_string()]
        );
        // Stops cleanly when an opening tag has no '>'.
        assert_eq!(extract_all("<n>a</n><n", "n"), vec!["a".to_string()]);
        // Stops cleanly when a closing tag is missing.
        assert_eq!(extract_all("<n>a</n><n>b", "n"), vec!["a".to_string()]);
        // No matches at all.
        assert!(extract_all("nothing", "n").is_empty());
    }
}
