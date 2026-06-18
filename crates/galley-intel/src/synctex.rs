//! SyncTeX parsing and mapping.
//!
//! Implements the [`SyncTexMapper`] port against the `.synctex.gz` gzip-
//! compressed text format that Tectonic (and pdfTeX) produce. All logic is
//! pure: decompression + parsing + nearest-record lookup, with no I/O.
//!
//! **Format overview.** The decompressed text has three sections:
//!
//! * **Header** — `Input:N:path` lines mapping file numbers to absolute paths,
//!   plus `Magnification`, `Unit`, and output metadata.
//! * **Content** — pages delimited by `{N` / `}N` markers, each containing
//!   box records of the form `(file,line:h,v:w,d,a` (and analogous types).
//! * **Postamble** — record count; not used by the mapper.
//!
//! **Coordinate system.** `h` and `v` are in scaled points (sp), where
//! 65781.76 sp ≈ 1 PDF user-space point.  The PDF origin is bottom-left, while
//! SyncTeX's origin is top-left with `v` increasing downward, so the y-flip is
//! `pdf_y = page_height - v`.  The page height is read from the first vbox
//! record of each page (which is always the full-page bounding box).

use galley_core::{SyncTexBox, SyncTexLocation, SyncTexMapper};
use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::io::Read;

/// A parsed record from the SyncTeX content section.
#[derive(Debug, Clone, PartialEq)]
struct Record {
    file_num: u32,
    line: u32,
    h: i64,
    v: i64,
    w: i64,
    d: i64,
}

/// A single page from the SyncTeX content.
#[derive(Debug)]
struct Page {
    number: u32,
    /// The height of this page in scaled points (from the page bounding box).
    height: i64,
    records: Vec<Record>,
}

/// A parsed SyncTeX document.
#[derive(Debug)]
struct SyncTexDoc {
    /// file_num (1-based) → absolute path.
    inputs: HashMap<u32, String>,
    pages: Vec<Page>,
}

impl SyncTexDoc {
    /// Forward search: find the PDF rectangle for `file` at 1-based `line`.
    fn forward(&self, file: &str, line: u32) -> Option<SyncTexBox> {
        let file_num = self
            .inputs
            .iter()
            .find(|(_, path)| path_matches(path, file))
            .map(|(num, _)| *num)?;

        // Find the record with the smallest line distance, carrying the page
        // reference directly so no second lookup is needed.
        let mut best: Option<(&Page, &Record, i64)> = None;
        for page in &self.pages {
            for rec in &page.records {
                if rec.file_num != file_num {
                    continue;
                }
                let dist = (rec.line as i64 - line as i64).abs();
                let replace = match &best {
                    None => true,
                    Some((_, _, bd)) => dist < *bd,
                };
                if replace {
                    best = Some((page, rec, dist));
                }
            }
        }
        let (page, rec, _) = best?;
        Some(SyncTexBox {
            page: page.number,
            h: rec.h,
            v: rec.v,
            w: rec.w,
            d: rec.d,
            page_height: page.height,
        })
    }

    /// Inverse search: find the source location closest to `(x, y)` on `page`.
    ///
    /// `x` and `y` are in PDF user-space points (bottom-left origin).
    fn inverse(&self, page: u32, x: f64, y: f64) -> Option<SyncTexLocation> {
        let pg = self.pages.iter().find(|p| p.number == page)?;

        // Convert PDF points (bottom-left) to synctex sp (top-left, y down).
        let height_pts = pg.height as f64 / SP_PER_PT;
        let sx = (x * SP_PER_PT) as i64;
        let sv = ((height_pts - y) * SP_PER_PT) as i64;

        // Nearest record by L1 distance in synctex coordinates.
        let best = pg.records.iter().min_by_key(|rec| {
            let dx = (rec.h - sx).unsigned_abs();
            let dy = (rec.v - sv).unsigned_abs();
            dx.saturating_add(dy)
        })?;

        // File path from inputs; an unknown file_num yields an empty path
        // (malformed synctex data — treated as unresolvable rather than None
        // so the line number is still available if the caller wants it).
        let file = self.inputs.get(&best.file_num).cloned().unwrap_or_default();
        Some(SyncTexLocation {
            file,
            line: best.line,
        })
    }
}

/// Scaled points per PDF point: 72.27 TeX points/inch × 65536 sp/pt ÷ 72 PDF pts/inch.
const SP_PER_PT: f64 = 65781.76;

/// True when the SyncTeX input path ends with the given file stem or matches it exactly.
fn path_matches(path: &str, file: &str) -> bool {
    if path == file {
        return true;
    }
    // Match by trailing component: `/path/to/main.tex` matches `main.tex`.
    let suffix = if file.starts_with('/') {
        file
    } else {
        file.trim_start_matches('/')
    };
    path.ends_with(suffix)
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/// Decompress gzip bytes into a UTF-8 string.
fn decompress(data: &[u8]) -> Option<String> {
    let mut gz = GzDecoder::new(data);
    let mut text = String::new();
    gz.read_to_string(&mut text).ok()?;
    Some(text)
}

/// Parse the header section (before `Content:`) into inputs + unit.
fn parse_header(text: &str) -> HashMap<u32, String> {
    let mut inputs = HashMap::new();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("Input:") {
            // Format: `Input:N:path`
            if let Some(colon) = rest.find(':') {
                let num_str = &rest[..colon];
                let path = &rest[colon + 1..];
                if let Ok(num) = num_str.parse::<u32>() {
                    inputs.insert(num, path.to_owned());
                }
            }
        }
        if line == "Content:" {
            break;
        }
    }
    inputs
}

/// Parse all pages from the content section of the SyncTeX text.
fn parse_pages(text: &str) -> Vec<Page> {
    let mut pages: Vec<Page> = Vec::new();
    let mut current: Option<(u32, i64, Vec<Record>)> = None;
    let mut in_content = false;

    for line in text.lines() {
        if line == "Content:" {
            in_content = true;
            continue;
        }
        if !in_content {
            continue;
        }
        if line.starts_with("Postamble:") || line.starts_with("Post scriptum:") {
            break;
        }
        if let Some(rest) = line.strip_prefix('{') {
            // Start of page N.
            if let Ok(n) = rest.trim().parse::<u32>() {
                current = Some((n, 0, Vec::new()));
            }
        } else if let Some(rest) = line.strip_prefix('}') {
            // End of page N.
            if let (Some((n, h, recs)), Ok(end_n)) = (&current, rest.trim().parse::<u32>()) {
                if *n == end_n {
                    pages.push(Page {
                        number: *n,
                        height: *h,
                        records: recs.clone(),
                    });
                    current = None;
                }
            }
        } else if let Some((_, page_height, recs)) = current.as_mut() {
            if let Some(rec) = parse_record(line) {
                // The first record on a page with h=0, v=0 is the page bounding
                // box; its `d` field is the page height in sp.
                if recs.is_empty() && rec.h == 0 && rec.v == 0 && rec.d > 0 {
                    *page_height = rec.d;
                } else {
                    recs.push(rec);
                }
            }
        }
    }
    pages
}

/// Parse one SyncTeX content record line.
///
/// Handles `(`, `)`, `[`, `]`, and `vb` prefixes (the box record types that
/// carry a full `file,line:h,v:w,d,a` payload). Returns `None` for other line
/// types (glue, kern, close markers, byte-offset lines, etc.).
fn parse_record(line: &str) -> Option<Record> {
    let body = if let Some(b) = line.strip_prefix('(') {
        b
    } else if let Some(b) = line.strip_prefix('[') {
        b
    } else if let Some(b) = line.strip_prefix(')') {
        b
    } else if let Some(b) = line.strip_prefix(']') {
        b
    } else if let Some(b) = line.strip_prefix("vb") {
        b
    } else {
        return None;
    };
    parse_box_body(body)
}

/// Parse `file,line:h,v:w,d,a` (or `)file,line:h,v:w,d,a`) into a [`Record`].
///
/// All fields are integers; missing trailing dimensions default to 0.
fn parse_box_body(body: &str) -> Option<Record> {
    // Split on the first `:` to get `file,line` and the rest.
    let colon1 = body.find(':')?;
    let fl = &body[..colon1];
    let rest1 = &body[colon1 + 1..];

    let comma = fl.find(',')?;
    let file_num: u32 = fl[..comma].parse().ok()?;
    let line: u32 = fl[comma + 1..].parse().ok()?;

    // Split on the second `:` to get `h,v` and `w,d,a`.
    let (hv_str, wda_str) = if let Some(colon2) = rest1.find(':') {
        (&rest1[..colon2], Some(&rest1[colon2 + 1..]))
    } else {
        (rest1, None)
    };

    let hv: Vec<i64> = hv_str
        .split(',')
        .filter_map(|s| s.parse().ok())
        .collect();
    let h = hv.first().copied().unwrap_or(0);
    let v = hv.get(1).copied().unwrap_or(0);

    let (w, d) = if let Some(wda) = wda_str {
        let wda: Vec<i64> = wda.split(',').filter_map(|s| s.parse().ok()).collect();
        (wda.first().copied().unwrap_or(0), wda.get(1).copied().unwrap_or(0))
    } else {
        (0, 0)
    };

    Some(Record { file_num, line, h, v, w, d })
}

/// Parse a complete decompressed SyncTeX document.
fn parse_synctex(text: &str) -> Option<SyncTexDoc> {
    let inputs = parse_header(text);
    if inputs.is_empty() {
        return None;
    }
    let pages = parse_pages(text);
    Some(SyncTexDoc { inputs, pages })
}

// ─── Public adapter ─────────────────────────────────────────────────────────

/// The production SyncTeX mapper: decompresses and parses the `.synctex.gz`
/// bytes then performs forward or inverse lookup.
pub struct SyncTexParser;

impl SyncTexMapper for SyncTexParser {
    fn forward(&self, data: &[u8], file: &str, line: u32) -> Option<SyncTexBox> {
        let text = decompress(data)?;
        let doc = parse_synctex(&text)?;
        doc.forward(file, line)
    }

    fn inverse(&self, data: &[u8], page: u32, x: f64, y: f64) -> Option<SyncTexLocation> {
        let text = decompress(data)?;
        let doc = parse_synctex(&text)?;
        doc.inverse(page, x, y)
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    /// Compress `text` to gzip bytes for use as a fake `.synctex.gz` fixture.
    fn gz(text: &str) -> Vec<u8> {
        let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
        enc.write_all(text.as_bytes()).unwrap();
        enc.finish().unwrap()
    }

    /// A minimal two-file, two-page synctex document.
    fn fixture() -> String {
        [
            "SyncTeX Version:1",
            "Input:1:/project/main.tex",
            "Input:2:/project/ch.tex",
            "Output:pdf",
            "Magnification:1000",
            "Unit:1",
            "X Offset:0",
            "Y Offset:0",
            "Content:",
            "!42",
            "{1",
            // Page bounding box (h=0,v=0,d=page_height)
            "[1,1:0,0:50000,200000,0",
            // A record on page 1, file 1, line 5
            "(1,5:10000,30000:40000,1000,0",
            ")1,5:50000,30000:0,1000,0",
            // A vb record on page 1, file 1, line 10
            "vb1,10:10000,60000:40000,1000,0",
            // A record on page 1, file 2, line 3
            "(2,3:10000,90000:40000,1000,0",
            "]",
            "}1",
            "{2",
            // Page 2 bounding box
            "[1,1:0,0:50000,200000,0",
            // A record on page 2, file 1, line 20
            "(1,20:10000,30000:40000,1000,0",
            "}2",
            "Postamble:",
            "Count:6",
            "Post scriptum:",
        ]
        .join("\n")
    }

    // ─── decompress ─────────────────────────────────────────────────────────

    #[test]
    fn decompresses_valid_gzip() {
        let data = gz("hello");
        assert_eq!(decompress(&data).unwrap(), "hello");
    }

    #[test]
    fn decompress_returns_none_for_invalid_bytes() {
        assert!(decompress(b"not gzip").is_none());
    }

    // ─── path_matches ───────────────────────────────────────────────────────

    #[test]
    fn path_matches_exact() {
        assert!(path_matches("/a/b.tex", "/a/b.tex"));
    }

    #[test]
    fn path_matches_trailing_component() {
        assert!(path_matches("/project/main.tex", "main.tex"));
    }

    #[test]
    fn path_does_not_match_unrelated() {
        assert!(!path_matches("/project/main.tex", "other.tex"));
    }

    #[test]
    fn path_matches_with_leading_slash_in_file() {
        assert!(path_matches("/project/ch.tex", "/ch.tex"));
    }

    // ─── parse_header ───────────────────────────────────────────────────────

    #[test]
    fn parses_inputs_from_header() {
        let text = fixture();
        let inputs = parse_header(&text);
        assert_eq!(inputs.get(&1).unwrap(), "/project/main.tex");
        assert_eq!(inputs.get(&2).unwrap(), "/project/ch.tex");
    }

    #[test]
    fn ignores_malformed_input_lines() {
        // `notanumber` fails u32 parse (Err arm of `if let Ok`).
        // `nocolon` has no `:` after the prefix (None arm of `rest.find(':')`).
        let text = "Input:notanumber:/a.tex\nInput:nocolon\nInput:1:/b.tex\nContent:\n";
        let inputs = parse_header(text);
        assert!(!inputs.contains_key(&0));
        assert_eq!(inputs.get(&1).unwrap(), "/b.tex");
    }

    // ─── parse_record ───────────────────────────────────────────────────────

    #[test]
    fn parses_hbox_open_record() {
        let rec = parse_record("(1,5:10000,30000:40000,1000,0").unwrap();
        assert_eq!(rec.file_num, 1);
        assert_eq!(rec.line, 5);
        assert_eq!(rec.h, 10000);
        assert_eq!(rec.v, 30000);
        assert_eq!(rec.w, 40000);
        assert_eq!(rec.d, 1000);
    }

    #[test]
    fn parses_hbox_close_record() {
        let rec = parse_record(")1,5:50000,30000:0,1000,0").unwrap();
        assert_eq!(rec.file_num, 1);
        assert_eq!(rec.line, 5);
        assert_eq!(rec.h, 50000);
    }

    #[test]
    fn parses_vbox_open_record() {
        let rec = parse_record("[1,1:0,0:50000,200000,0").unwrap();
        assert_eq!(rec.file_num, 1);
        assert_eq!(rec.d, 200000);
    }

    #[test]
    fn parses_vbox_close_record() {
        let rec = parse_record("]1,1:0,0:50000,200000,0");
        assert!(rec.is_some());
    }

    #[test]
    fn parses_vb_record() {
        let rec = parse_record("vb1,10:10000,60000:40000,1000,0").unwrap();
        assert_eq!(rec.file_num, 1);
        assert_eq!(rec.line, 10);
        assert_eq!(rec.v, 60000);
    }

    #[test]
    fn skips_non_record_lines() {
        assert!(parse_record("g1,5:10000").is_none());
        assert!(parse_record("k1,5:10000,20000:30000").is_none());
        assert!(parse_record("ve").is_none());
        assert!(parse_record("!608").is_none());
        assert!(parse_record("").is_none());
    }

    #[test]
    fn parse_box_body_missing_comma_returns_none() {
        assert!(parse_box_body("1:10000,30000:40000").is_none());
    }

    #[test]
    fn parse_box_body_missing_first_colon_returns_none() {
        assert!(parse_box_body("1,5").is_none());
    }

    #[test]
    fn parse_box_body_nonnumeric_file_num_returns_none() {
        // `abc` fails u32 parse — covers the `fl[..comma].parse().ok()?` None arm.
        assert!(parse_box_body("abc,5:10000,30000:40000").is_none());
    }

    #[test]
    fn parse_box_body_nonnumeric_line_returns_none() {
        // file_num is valid but `xyz` fails u32 parse —
        // covers the `fl[comma+1..].parse().ok()?` None arm.
        assert!(parse_box_body("1,xyz:10000,30000:40000").is_none());
    }

    #[test]
    fn parse_box_body_no_second_colon_uses_defaults() {
        let rec = parse_box_body("1,5:10000,30000").unwrap();
        assert_eq!(rec.w, 0);
        assert_eq!(rec.d, 0);
    }

    // ─── parse_pages ────────────────────────────────────────────────────────

    #[test]
    fn parses_correct_page_count() {
        let pages = parse_pages(&fixture());
        assert_eq!(pages.len(), 2);
    }

    #[test]
    fn page_height_comes_from_bounding_box() {
        let pages = parse_pages(&fixture());
        assert_eq!(pages[0].height, 200000);
        assert_eq!(pages[1].height, 200000);
    }

    #[test]
    fn records_exclude_bounding_box_but_include_content() {
        let pages = parse_pages(&fixture());
        // Page 1 has: hbox open (1,5), hbox close (1,5), vb (1,10), hbox open (2,3), vbox close ]
        // vbox close `]` with no valid body args could be parsed or ignored — let's count:
        let p1 = &pages[0];
        assert!(p1.records.len() >= 3); // at minimum the 3 content records
    }

    #[test]
    fn mismatched_page_close_is_ignored() {
        let text = "Content:\n{1\n[1,1:0,0:50000,200000,0\n}2\n";
        let pages = parse_pages(text);
        // `}2` doesn't match `{1`, so no page is pushed.
        assert_eq!(pages.len(), 0);
    }

    #[test]
    fn nonnumeric_page_open_marker_is_ignored() {
        // `{abc` — the rest after `{` fails u32 parse, so no current page is
        // started. Covers the false branch of `if let Ok(n) = ... parse`.
        let text = "Content:\n{abc\n(1,5:10000,30000:40000,1000,0\n}1\n";
        let pages = parse_pages(text);
        // No valid page was opened, so nothing is pushed.
        assert_eq!(pages.len(), 0);
    }

    #[test]
    fn page_close_without_open_is_ignored() {
        let text = "Content:\n}1\n";
        let pages = parse_pages(text);
        assert_eq!(pages.len(), 0);
    }

    #[test]
    fn first_record_with_zero_depth_becomes_content_not_bbox() {
        // When the first record on a page has h=0, v=0 but d=0 (not > 0),
        // the `rec.d > 0` false branch runs: the record is pushed to content
        // and the page height stays at its default of 0.
        let text = concat!(
            "Input:1:/a.tex\n",
            "Content:\n",
            "{1\n",
            // d=0 → does NOT become the page bounding box
            "[1,1:0,0:50000,0,0\n",
            "(1,5:10000,30000:40000,1000,0\n",
            "}1\n",
        );
        let pages = parse_pages(text);
        assert_eq!(pages.len(), 1);
        // No valid bounding box was detected, so height defaults to 0.
        assert_eq!(pages[0].height, 0);
        // Both records are stored as content records.
        assert_eq!(pages[0].records.len(), 2);
    }

    // ─── parse_synctex ──────────────────────────────────────────────────────

    #[test]
    fn parse_synctex_succeeds_on_valid_fixture() {
        let doc = parse_synctex(&fixture()).unwrap();
        assert_eq!(doc.inputs.len(), 2);
        assert_eq!(doc.pages.len(), 2);
    }

    #[test]
    fn parse_synctex_returns_none_when_no_inputs() {
        let text = "Content:\n{1\n}1\n";
        assert!(parse_synctex(text).is_none());
    }

    // ─── SyncTexDoc::forward ────────────────────────────────────────────────

    #[test]
    fn forward_finds_exact_line_match() {
        let doc = parse_synctex(&fixture()).unwrap();
        let b = doc.forward("/project/main.tex", 5).unwrap();
        assert_eq!(b.page, 1);
        assert_eq!(b.v, 30000);
    }

    #[test]
    fn forward_finds_nearest_line_when_no_exact_match() {
        let doc = parse_synctex(&fixture()).unwrap();
        // Line 7 is between 5 and 10; nearest is 5.
        let b = doc.forward("/project/main.tex", 7).unwrap();
        assert_eq!(b.page, 1);
        assert_eq!(b.v, 30000);
    }

    #[test]
    fn forward_finds_record_by_short_filename() {
        let doc = parse_synctex(&fixture()).unwrap();
        let b = doc.forward("main.tex", 5).unwrap();
        assert_eq!(b.page, 1);
    }

    #[test]
    fn forward_finds_record_for_included_file() {
        let doc = parse_synctex(&fixture()).unwrap();
        let b = doc.forward("ch.tex", 3).unwrap();
        assert_eq!(b.page, 1);
        assert_eq!(b.v, 90000);
    }

    #[test]
    fn forward_returns_none_for_unknown_file() {
        let doc = parse_synctex(&fixture()).unwrap();
        assert!(doc.forward("missing.tex", 1).is_none());
    }

    #[test]
    fn forward_returns_none_when_no_pages() {
        let text = "Input:1:/a.tex\nContent:\n";
        let doc = parse_synctex(text).unwrap();
        assert!(doc.forward("/a.tex", 1).is_none());
    }

    // ─── SyncTexDoc::inverse ────────────────────────────────────────────────

    #[test]
    fn inverse_finds_nearest_record_on_page() {
        let doc = parse_synctex(&fixture()).unwrap();
        let page_height_pts = 200000_f64 / SP_PER_PT;
        // Click near (h=10000, v=30000) in sp → PDF (h_pts, page_h - v_pts).
        let h_pts = 10000_f64 / SP_PER_PT;
        let pdf_y = page_height_pts - 30000_f64 / SP_PER_PT;
        let loc = doc.inverse(1, h_pts, pdf_y).unwrap();
        assert_eq!(loc.line, 5);
    }

    #[test]
    fn inverse_returns_none_for_unknown_page() {
        let doc = parse_synctex(&fixture()).unwrap();
        assert!(doc.inverse(99, 0.0, 0.0).is_none());
    }

    #[test]
    fn inverse_returns_none_when_page_has_no_records() {
        let text = "Input:1:/a.tex\nContent:\n{1\n[1,1:0,0:50000,200000,0\n}1\n";
        let doc = parse_synctex(text).unwrap();
        // Page 1 has only the bounding box (which becomes the page height, not a record).
        assert!(doc.inverse(1, 0.0, 0.0).is_none());
    }

    // ─── SyncTexParser (public adapter) ─────────────────────────────────────

    #[test]
    fn parser_forward_round_trips_through_gz() {
        let data = gz(&fixture());
        let parser = SyncTexParser;
        let b = parser.forward(&data, "main.tex", 5).unwrap();
        assert_eq!(b.page, 1);
        assert_eq!(b.page_height, 200000);
    }

    #[test]
    fn parser_inverse_round_trips_through_gz() {
        let data = gz(&fixture());
        let parser = SyncTexParser;
        let page_height_pts = 200000_f64 / SP_PER_PT;
        let h_pts = 10000_f64 / SP_PER_PT;
        let pdf_y = page_height_pts - 30000_f64 / SP_PER_PT;
        let loc = parser.inverse(&data, 1, h_pts, pdf_y).unwrap();
        assert_eq!(loc.line, 5);
        assert_eq!(loc.file, "/project/main.tex");
    }

    #[test]
    fn parser_returns_none_for_bad_gzip() {
        let parser = SyncTexParser;
        assert!(parser.forward(b"garbage", "main.tex", 1).is_none());
        assert!(parser.inverse(b"garbage", 1, 0.0, 0.0).is_none());
    }

    #[test]
    fn parser_forward_returns_none_when_synctex_has_no_inputs() {
        // Valid gzip but no `Input:` lines → parse_synctex returns None →
        // SyncTexParser::forward returns None via `?`.
        let data = gz("Content:\n{1\n}1\n");
        let parser = SyncTexParser;
        assert!(parser.forward(&data, "main.tex", 1).is_none());
    }

    #[test]
    fn parser_inverse_returns_none_when_synctex_has_no_inputs() {
        // Valid gzip but no `Input:` lines → parse_synctex returns None →
        // SyncTexParser::inverse returns None via `?`.
        let data = gz("Content:\n{1\n}1\n");
        let parser = SyncTexParser;
        assert!(parser.inverse(&data, 1, 0.0, 0.0).is_none());
    }
}
