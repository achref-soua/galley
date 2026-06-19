//! Asset-related pure helpers: snippet generation and preamble detection.

/// Generate the LaTeX snippet for inserting an image at `rel_path`.
///
/// Produces a bare `\includegraphics` command so the caller can paste it at
/// the cursor. The path is project-relative (e.g. `assets/figure.png`).
pub fn figure_snippet(rel_path: &str) -> String {
    format!(r"\includegraphics[width=\linewidth]{{{rel_path}}}")
}

/// Return `true` when `source` contains `\includegraphics` but not
/// `\graphicspath` — the cue to offer adding `\graphicspath{{assets/}}`.
pub fn needs_graphicspath(source: &str) -> bool {
    source.contains(r"\includegraphics") && !source.contains(r"\graphicspath")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn figure_snippet_wraps_rel_path() {
        assert_eq!(
            figure_snippet("assets/diagram.png"),
            r"\includegraphics[width=\linewidth]{assets/diagram.png}"
        );
    }

    #[test]
    fn figure_snippet_with_subdirectory_path() {
        assert_eq!(
            figure_snippet("assets/figs/plot.pdf"),
            r"\includegraphics[width=\linewidth]{assets/figs/plot.pdf}"
        );
    }

    #[test]
    fn needs_graphicspath_false_when_no_includegraphics() {
        assert!(!needs_graphicspath(r"\documentclass{article}"));
    }

    #[test]
    fn needs_graphicspath_true_when_includegraphics_without_path() {
        assert!(needs_graphicspath(
            r"\documentclass{article}\n\includegraphics[width=\linewidth]{fig.png}"
        ));
    }

    #[test]
    fn needs_graphicspath_false_when_graphicspath_already_set() {
        assert!(!needs_graphicspath(
            r"\graphicspath{{assets/}}\n\includegraphics{fig.png}"
        ));
    }
}
