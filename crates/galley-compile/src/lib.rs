//! Compile adapters for Galley.
//!
//! This crate implements the [`Compiler`] port (from `galley-core`) on top of an
//! embedded TeX engine. The design keeps the heavy, native engine call behind a
//! single narrow seam — the [`LatexEngine`] trait — so that:
//!
//! * the orchestration ([`EmbeddedCompiler`]) is pure and is tested to full
//!   coverage with a mock engine, and
//! * the real engine ([`TectonicEngine`], which links Tectonic's vendored C/C++
//!   and needs a package bundle) is compiled only when the `real-compiler`
//!   feature is enabled — which the desktop shell turns on, but the coverage and
//!   build gates do not. The real engine is exercised by the manual integration
//!   tests in `tests/` (run like the filesystem tests, with the bundle present).
//!
//! Architecture: §4.3. Speed comes from three layers that compose here: the
//! warm engine (the format and bundle stay hot in process — see
//! [`TectonicEngine`]), the in-memory VFS (intermediate `.aux`/`.pdf`/`.log`
//! never touch disk), and the incremental [`CachingCompiler`] (unchanged inputs
//! skip the engine entirely).

mod cache;
pub use cache::{CacheKey, CachedCompile, CachingCompiler, CompileCache};

#[cfg(feature = "real-compiler")]
mod tectonic_engine;
#[cfg(feature = "real-compiler")]
pub use tectonic_engine::TectonicEngine;

use galley_core::{BuildPlan, CompileRequest, CompileResult, Compiler};
use std::fmt;

/// What a TeX engine produces on a successful run.
pub struct EngineArtifacts {
    /// The rendered PDF bytes.
    pub pdf: Vec<u8>,
    /// The `.synctex.gz` bytes when the engine produced them.
    pub synctex: Option<Vec<u8>>,
    /// The captured TeX log.
    pub log: String,
}

/// A failed engine run, carrying the TeX log so the UI can show what happened.
#[derive(Debug)]
pub struct EngineFailure {
    /// The captured TeX log, or a short message when no log was produced.
    pub log: String,
}

impl EngineFailure {
    /// Build a failure from its log (or message).
    #[must_use]
    pub fn new(log: impl Into<String>) -> Self {
        Self { log: log.into() }
    }
}

impl fmt::Display for EngineFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("the TeX engine failed to produce a PDF")
    }
}

impl std::error::Error for EngineFailure {}

/// The narrow seam around an actual TeX engine.
///
/// [`EmbeddedCompiler`] is generic over this, so an adapter only has to provide
/// the engine run; everything else — validating the request, shaping the result —
/// is engine-agnostic and covered by tests against a mock implementation.
pub trait LatexEngine {
    /// Compile `source` as the plan's root document, returning the artifacts or
    /// a failure carrying the log.
    ///
    /// # Errors
    ///
    /// Returns an [`EngineFailure`] when the engine does not produce a PDF.
    fn run(&self, plan: &BuildPlan, source: &str) -> Result<EngineArtifacts, EngineFailure>;
}

/// The embedded-engine compiler: it validates a request into a [`BuildPlan`],
/// runs the engine over the canonical source, and shapes the [`CompileResult`].
pub struct EmbeddedCompiler<E: LatexEngine> {
    engine: E,
}

impl<E: LatexEngine> EmbeddedCompiler<E> {
    /// Build a compiler driving `engine`.
    pub fn new(engine: E) -> Self {
        Self { engine }
    }
}

impl<E: LatexEngine> Compiler for EmbeddedCompiler<E> {
    fn compile(&self, request: &CompileRequest, source: &str) -> CompileResult {
        let plan = match BuildPlan::from_request(request) {
            Ok(plan) => plan,
            Err(err) => return CompileResult::failed(err.to_string()),
        };
        match self.engine.run(&plan, source) {
            Ok(artifacts) => CompileResult::succeeded(artifacts.pdf, artifacts.synctex, artifacts.log),
            Err(failure) => CompileResult::failed(failure.log),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galley_core::{CompileStatus, Engine};

    /// A single, configurable mock engine. Using one type (rather than separate
    /// success/failure engines) keeps `EmbeddedCompiler` to a single
    /// monomorphization, so its every match arm is exercised — generic code is
    /// instrumented per instantiation, and a second engine type would leave the
    /// unused arms of the first uncovered.
    struct MockEngine {
        fails: bool,
    }
    impl LatexEngine for MockEngine {
        fn run(&self, plan: &BuildPlan, source: &str) -> Result<EngineArtifacts, EngineFailure> {
            if self.fails {
                Err(EngineFailure::new("! Undefined control sequence."))
            } else {
                Ok(EngineArtifacts {
                    pdf: vec![source.len() as u8],
                    synctex: None,
                    log: format!("ran {} via {}", plan.job_name, plan.engine.label()),
                })
            }
        }
    }

    #[test]
    fn compiles_a_valid_request_through_the_engine() {
        let compiler = EmbeddedCompiler::new(MockEngine { fails: false });
        let request = CompileRequest::new("main.tex", Engine::Tectonic);
        let result = compiler.compile(&request, "hello");
        assert_eq!(result.report.status, CompileStatus::Succeeded);
        assert_eq!(result.report.log, "ran main via tectonic");
        assert_eq!(result.pdf, Some(vec![5]));
        assert_eq!(result.synctex, None);
    }

    #[test]
    fn surfaces_an_engine_failure_with_its_log() {
        let compiler = EmbeddedCompiler::new(MockEngine { fails: true });
        let request = CompileRequest::new("main.tex", Engine::Tectonic);
        let result = compiler.compile(&request, "hello");
        assert_eq!(result.report.status, CompileStatus::Failed);
        assert_eq!(result.report.log, "! Undefined control sequence.");
        assert_eq!(result.pdf, None);
    }

    #[test]
    fn rejects_an_unbuildable_request_before_the_engine() {
        // A non-.tex root document never reaches the engine.
        let compiler = EmbeddedCompiler::new(MockEngine { fails: false });
        let request = CompileRequest::new("refs.bib", Engine::Tectonic);
        let result = compiler.compile(&request, "hello");
        assert_eq!(result.report.status, CompileStatus::Failed);
        assert_eq!(result.report.log, "the root document is not a .tex file");
        assert_eq!(result.pdf, None);
    }

    #[test]
    fn engine_failure_is_a_standard_error() {
        use std::error::Error;
        let failure = EngineFailure::new("boom");
        assert_eq!(failure.log, "boom");
        assert_eq!(
            failure.to_string(),
            "the TeX engine failed to produce a PDF"
        );
        assert!(failure.source().is_none());
        assert!(format!("{failure:?}").contains("EngineFailure"));
    }
}
