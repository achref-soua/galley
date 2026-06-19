//! Pure helpers for wrapping LaTeX math expressions.

/// Wrap `latex` as an inline math expression: `$...$`.
#[must_use]
pub fn wrap_inline(latex: &str) -> String {
    format!("${}$", latex)
}

/// Wrap `latex` as a display-mode math expression: `\[\n...\n\]`.
#[must_use]
pub fn wrap_display(latex: &str) -> String {
    format!("\\[\n{}\n\\]", latex)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inline_wraps_with_dollar_signs() {
        assert_eq!(wrap_inline("x^2"), "$x^2$");
        assert_eq!(wrap_inline(""), "$$");
    }

    #[test]
    fn display_wraps_with_bracket_notation() {
        assert_eq!(wrap_display("E = mc^2"), "\\[\nE = mc^2\n\\]");
        assert_eq!(wrap_display(""), "\\[\n\n\\]");
    }
}
