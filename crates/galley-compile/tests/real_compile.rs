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
    use galley_compile::{CachingCompiler, EmbeddedCompiler, TectonicEngine};
    use galley_core::{CompileRequest, Compiler, Engine};
    use std::time::Instant;

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
    #[ignore = "needs the Tectonic bundle (network on a cold cache); run manually"]
    fn warm_recompiles_serve_from_cache_and_are_fast() {
        // One warm, long-lived compiler — the shape the desktop shell keeps in
        // its managed state. The first build runs the engine; an unchanged
        // recompile is served from the cache without touching it again.
        let mut compiler = CachingCompiler::new(EmbeddedCompiler::new(TectonicEngine::new()));
        let request = CompileRequest::new("main.tex", Engine::Tectonic);

        let cold_start = Instant::now();
        let first = compiler.compile(&request, ARTICLE);
        let cold = cold_start.elapsed();
        assert!(!first.cached, "the first build is a cache miss");
        assert!(
            first.result.report.is_ok(),
            "log:\n{}",
            first.result.report.log
        );

        let warm_start = Instant::now();
        let second = compiler.compile(&request, ARTICLE);
        let warm = warm_start.elapsed();
        assert!(second.cached, "an unchanged recompile is served from cache");
        assert_eq!(second.result.pdf, first.result.pdf, "identical bytes");

        // A changed source is a genuine miss but reuses the warm format/bundle.
        let edited = ARTICLE.replace("Pull a proof.", "Pull a proof. Again.");
        let edit_start = Instant::now();
        let third = compiler.compile(&request, &edited);
        let incremental = edit_start.elapsed();
        assert!(!third.cached, "an edit invalidates the cache");
        assert!(
            third.result.report.is_ok(),
            "log:\n{}",
            third.result.report.log
        );

        eprintln!("cold={cold:?} cached={warm:?} incremental={incremental:?}");
        // The cache hit is effectively free; the incremental build reuses the
        // warm format and should be well under the cold build.
        assert!(warm < cold, "a cache hit must beat a cold build");
    }

    #[test]
    #[ignore = "needs the Tectonic bundle (network on a cold cache); run manually"]
    fn renders_a_bibliography_from_an_on_disk_bib_file() {
        // The acceptance for v0.3.4: a document that cites an on-disk `.bib`
        // entry compiles, with the engine resolving the bibliography from the
        // project root and running the bibliography pass automatically.
        let dir = tempfile::tempdir().expect("a temp project dir");
        std::fs::write(
            dir.path().join("refs.bib"),
            "@article{lovelace1843,\n  author = {Lovelace, Ada},\n  title = {Notes},\n  journal = {Memoirs},\n  year = {1843}\n}\n",
        )
        .expect("write refs.bib");

        let document = r"\documentclass{article}
\begin{document}
As shown by Lovelace~\cite{lovelace1843}, the engine computes.
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
";
        let compiler = EmbeddedCompiler::new(TectonicEngine::new());
        let request = CompileRequest::new("main.tex", Engine::Tectonic)
            .with_project_root(dir.path().to_string_lossy().into_owned());
        let result = compiler.compile(&request, document);
        assert!(
            result.report.is_ok(),
            "bibliography compile failed; log:\n{}",
            result.report.log
        );
        let pdf = result.pdf.expect("a PDF on success");
        assert!(pdf.starts_with(b"%PDF-"), "output does not look like a PDF");
        // The bibliography pass ran: the log records the citation being resolved
        // rather than left undefined.
        assert!(
            !result
                .report
                .log
                .contains("Citation `lovelace1843' undefined"),
            "the citation was not resolved; log:\n{}",
            result.report.log
        );
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

    #[test]
    #[ignore = "media helper: writes a real sample proof to GALLEY_SAMPLE_PDF"]
    fn writes_the_sample_proof_for_screenshots() {
        const SAMPLE: &str = r"\documentclass{article}
\title{Pull a Proof}
\author{Galley}
\date{}
\begin{document}
\maketitle
\section{Introduction}\label{sec:intro}
Galley sets your source in type and pulls a live proof. The mass--energy
relation,
\begin{equation}
  E = mc^2,
\end{equation}
follows from the postulates of special relativity. See Section~\ref{sec:intro}.
\section{Method}
Edit on the left; the proof on the right refreshes as you type.
\end{document}
";
        let compiler = EmbeddedCompiler::new(TectonicEngine::new());
        let request = CompileRequest::new("main.tex", Engine::Tectonic);
        let result = compiler.compile(&request, SAMPLE);
        assert!(result.report.is_ok(), "log:\n{}", result.report.log);
        let pdf = result.pdf.expect("a PDF on success");
        let out = std::env::var("GALLEY_SAMPLE_PDF").expect("set GALLEY_SAMPLE_PDF");
        std::fs::write(&out, &pdf).expect("write the sample proof");
        eprintln!("wrote {} bytes to {out}", pdf.len());
    }
}
