//! Pure helpers for generating LaTeX table environments.

/// Column alignment in a tabular environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    /// Left-aligned column (`l`).
    Left,
    /// Centre-aligned column (`c`).
    Center,
    /// Right-aligned column (`r`).
    Right,
}

impl Align {
    /// The single-character column-spec letter for this alignment.
    #[must_use]
    pub fn spec(self) -> char {
        match self {
            Align::Left => 'l',
            Align::Center => 'c',
            Align::Right => 'r',
        }
    }
}

/// Build a standard `tabular` environment.
///
/// The first row is followed by `\hline` to separate the header from the data.
/// Each subsequent row is emitted as-is.
///
/// # Panics
///
/// Does not panic. Rows with fewer cells than `align.len()` produce a row with
/// trailing empty cells; extra cells are silently ignored.
#[must_use]
pub fn build_tabular(align: &[Align], rows: &[Vec<String>]) -> String {
    let col_spec: String = align.iter().map(|a| a.spec()).collect();
    let mut out = format!("\\begin{{tabular}}{{{}}}\n", col_spec);
    for (i, row) in rows.iter().enumerate() {
        out.push_str("  ");
        out.push_str(&row.join(" & "));
        out.push_str(" \\\\\n");
        if i == 0 {
            out.push_str("  \\hline\n");
        }
    }
    out.push_str("\\end{tabular}");
    out
}

/// Build a `booktabs`-style table using `\toprule`, `\midrule`, and `\bottomrule`.
///
/// `header` is the top row; `rows` are the data rows below `\midrule`.
#[must_use]
pub fn build_booktabs(align: &[Align], header: &[String], rows: &[Vec<String>]) -> String {
    let col_spec: String = align.iter().map(|a| a.spec()).collect();
    let mut out = format!("\\begin{{tabular}}{{{}}}\n", col_spec);
    out.push_str("  \\toprule\n");
    out.push_str("  ");
    out.push_str(&header.join(" & "));
    out.push_str(" \\\\\n");
    out.push_str("  \\midrule\n");
    for row in rows {
        out.push_str("  ");
        out.push_str(&row.join(" & "));
        out.push_str(" \\\\\n");
    }
    out.push_str("  \\bottomrule\n");
    out.push_str("\\end{tabular}");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &str) -> String {
        v.to_string()
    }

    #[test]
    fn align_spec_chars() {
        assert_eq!(Align::Left.spec(), 'l');
        assert_eq!(Align::Center.spec(), 'c');
        assert_eq!(Align::Right.spec(), 'r');
    }

    #[test]
    fn align_derives() {
        let a = Align::Left;
        assert_eq!(a, Align::Left);
        assert_ne!(a, Align::Center);
        let copied = a;
        assert_eq!(copied, a);
        assert_eq!(format!("{:?}", a), "Left");
    }

    #[test]
    fn tabular_one_header_row() {
        let align = [Align::Left, Align::Center, Align::Right];
        let rows = vec![vec![s("A"), s("B"), s("C")]];
        let out = build_tabular(&align, &rows);
        assert_eq!(
            out,
            "\\begin{tabular}{lcr}\n  A & B & C \\\\\n  \\hline\n\\end{tabular}"
        );
    }

    #[test]
    fn tabular_header_and_data_rows() {
        let align = [Align::Left, Align::Right];
        let rows = vec![
            vec![s("Name"), s("Value")],
            vec![s("x"), s("1")],
            vec![s("y"), s("2")],
        ];
        let out = build_tabular(&align, &rows);
        assert!(out.starts_with("\\begin{tabular}{lr}\n"));
        assert!(out.contains("  Name & Value \\\\\n  \\hline\n"));
        assert!(out.contains("  x & 1 \\\\\n"));
        assert!(out.contains("  y & 2 \\\\\n"));
        assert!(out.ends_with("\\end{tabular}"));
    }

    #[test]
    fn tabular_empty_rows() {
        let align = [Align::Center];
        let out = build_tabular(&align, &[]);
        assert_eq!(out, "\\begin{tabular}{c}\n\\end{tabular}");
    }

    #[test]
    fn booktabs_with_header_and_data() {
        let align = [Align::Left, Align::Center];
        let header = vec![s("Col A"), s("Col B")];
        let rows = vec![vec![s("1"), s("2")], vec![s("3"), s("4")]];
        let out = build_booktabs(&align, &header, &rows);
        assert!(out.starts_with("\\begin{tabular}{lc}\n"));
        assert!(out.contains("  \\toprule\n"));
        assert!(out.contains("  Col A & Col B \\\\\n"));
        assert!(out.contains("  \\midrule\n"));
        assert!(out.contains("  1 & 2 \\\\\n"));
        assert!(out.contains("  3 & 4 \\\\\n"));
        assert!(out.contains("  \\bottomrule\n"));
        assert!(out.ends_with("\\end{tabular}"));
    }

    #[test]
    fn booktabs_empty_data_rows() {
        let align = [Align::Right];
        let header = vec![s("H")];
        let out = build_booktabs(&align, &header, &[]);
        assert!(out.contains("  \\toprule\n"));
        assert!(out.contains("  H \\\\\n"));
        assert!(out.contains("  \\midrule\n"));
        assert!(out.contains("  \\bottomrule\n"));
    }
}
