//! SyncTeX domain types and port.
//!
//! SyncTeX creates a bidirectional map between LaTeX source positions (file,
//! line) and PDF page positions (page, rectangle). Galley uses it for:
//!
//! * **Forward search** — cursor line → PDF rectangle → scroll and highlight.
//! * **Inverse search** — PDF click → source file + line → editor jump.
//!
//! All the parsing and mapping logic lives in `galley-intel::synctex`; this
//! module only holds the pure domain types and the port trait.

/// A rectangle in the SyncTeX coordinate system (scaled points, sp).
///
/// Returned by forward search; the frontend converts these to canvas pixels
/// using the `SP_TO_PTS` factor and the PDF.js viewport scale.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncTexBox {
    /// 1-based PDF page number.
    pub page: u32,
    /// Horizontal position from the left margin, in scaled points.
    pub h: i64,
    /// Vertical position from the top of the page, in scaled points.
    pub v: i64,
    /// Width of the box, in scaled points.
    pub w: i64,
    /// Depth of the box (below baseline), in scaled points.
    pub d: i64,
    /// Height of the page, in scaled points (needed for y-axis flip).
    pub page_height: i64,
}

/// A source location returned by inverse search.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncTexLocation {
    /// Absolute path of the source file.
    pub file: String,
    /// 1-based line number in that file.
    pub line: u32,
}

/// The SyncTeX mapping port.
///
/// Implemented by `galley-intel::synctex::SyncTexParser`. The port lives here
/// so the domain and the Tauri command layer can depend on it without pulling in
/// the parser's decompression and parsing code.
pub trait SyncTexMapper {
    /// Find the PDF rectangle for `file` at 1-based `line`.
    ///
    /// Returns `None` when the synctex data contains no record for that
    /// position, or when the data is invalid.
    fn forward(&self, data: &[u8], file: &str, line: u32) -> Option<SyncTexBox>;

    /// Find the source location closest to PDF coordinates `(x, y)` on `page`.
    ///
    /// `x` and `y` are in PDF user-space points (from the bottom-left origin);
    /// the implementation converts them to synctex's top-left coordinate system
    /// before searching.
    ///
    /// Returns `None` when the synctex data has no records for that page, or
    /// when the data is invalid.
    fn inverse(&self, data: &[u8], page: u32, x: f64, y: f64) -> Option<SyncTexLocation>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synctex_box_fields_and_derives() {
        let b = SyncTexBox {
            page: 1,
            h: 100,
            v: 200,
            w: 300,
            d: 50,
            page_height: 5000,
        };
        assert_eq!(b.page, 1);
        assert_eq!(b.h, 100);
        assert_eq!(b.v, 200);
        assert_eq!(b.w, 300);
        assert_eq!(b.d, 50);
        assert_eq!(b.page_height, 5000);
        assert_eq!(b.clone(), b);
        let b2 = SyncTexBox { h: 999, ..b.clone() };
        assert_ne!(b, b2);
        assert!(format!("{b:?}").contains("SyncTexBox"));
    }

    #[test]
    fn synctex_location_fields_and_derives() {
        let loc = SyncTexLocation {
            file: "/a/b.tex".into(),
            line: 42,
        };
        assert_eq!(loc.file, "/a/b.tex");
        assert_eq!(loc.line, 42);
        assert_eq!(loc.clone(), loc);
        let loc2 = SyncTexLocation { line: 1, ..loc.clone() };
        assert_ne!(loc, loc2);
        assert!(format!("{loc:?}").contains("SyncTexLocation"));
    }
}
