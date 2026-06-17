//! Manual integration tests for the real embedded Tectonic engine.
//!
//! These need the `real-compiler` feature and a package bundle (network on a
//! cold cache; fully offline once `just prewarm` has run). They are `#[ignore]`d
//! so the normal suite and the coverage gate never depend on the native engine
//! or the network. Run them by hand:
//!
//! ```text
//! just prewarm                                              # warm the cache once
//! cargo test -p galley-compile --features real-compiler -- --ignored
//! ```
//!
//! Without the feature this file compiles to an empty (but documented) test
//! crate, so it never pulls Tectonic into the default build or coverage run.

#[cfg(feature = "real-compiler")]
mod real {
    use galley_compile::{EmbeddedCompiler, TectonicEngine};
    use galley_core::{CompileRequest, Compiler, Engine};

    const ARTICLE: &str = r"\documentclass{article}
\begin{document}
Hello from Galley. Pull a proof.
\end{document}
";

    #[test]
    #[ignore = "needs the Tectonic bundle (network on a cold cache); run manually"]
    fn compiles_a_stock_article_to_a_pdf() {
        let compiler = EmbeddedCompiler::new(TectonicEngine::new());
        let request = CompileRequest::new("main.tex", Engine::Tectonic);
        let result = compiler.compile(&request, ARTICLE);
        assert!(
            result.report.is_ok(),
            "compile failed; log:\n{}",
            result.report.log
        );
        let pdf = result.pdf.expect("a PDF on success");
        assert!(pdf.starts_with(b"%PDF-"), "output does not look like a PDF");
    }

    #[test]
    #[ignore = "needs a pre-warmed cache (`just prewarm` first); run manually"]
    fn compiles_offline_after_prewarm() {
        let compiler = EmbeddedCompiler::new(TectonicEngine::offline());
        let request = CompileRequest::new("main.tex", Engine::Tectonic);
        let result = compiler.compile(&request, ARTICLE);
        assert!(
            result.report.is_ok(),
            "offline compile failed; log:\n{}",
            result.report.log
        );
        assert!(result.pdf.is_some());
    }

    #[test]
    #[ignore = "needs the Tectonic bundle; run manually"]
    fn reports_a_failure_and_keeps_the_log() {
        let compiler = EmbeddedCompiler::new(TectonicEngine::new());
        let request = CompileRequest::new("main.tex", Engine::Tectonic);
        let broken = r"\documentclass{article}\begin{document}\thisIsNotAMacro\end{document}";
        let result = compiler.compile(&request, broken);
        assert!(
            !result.report.is_ok(),
            "a broken document should not succeed"
        );
        assert!(result.pdf.is_none());
        assert!(
            !result.report.log.is_empty(),
            "a failure should carry a log"
        );
    }
}
