//! The embedded Tectonic engine — the real [`LatexEngine`].
//!
//! Compiled only under the `real-compiler` feature, because it links Tectonic's
//! vendored C/C++ and needs a package bundle. The coverage and build gates leave
//! the feature off, so this module is excluded from them; it is exercised by the
//! manual integration tests in `tests/`, run like the filesystem tests (with the
//! bundle cache warm). See `docs/adr/0006`.

use crate::{EngineArtifacts, EngineFailure, LatexEngine};
use galley_core::BuildPlan;
use tectonic::config::PersistentConfig;
use tectonic::driver::{OutputFormat, ProcessingSessionBuilder};
use tectonic::status::NoopStatusBackend;

/// The embedded Tectonic engine.
///
/// It compiles a single canonical source string into a PDF, capturing the TeX
/// log. Two things make repeat compiles fast:
///
/// * **In-memory VFS.** The source is fed from a `primary_input_buffer` and the
///   outputs are pulled from `into_file_data()` with `do_not_write_output_files`,
///   so the `.tex`/`.aux`/`.pdf`/`.log` of a build never touch disk.
/// * **Warm caches.** Tectonic persists the compiled LaTeX *format* and the
///   resource *bundle* to its on-disk cache (`format_cache_path` + the default
///   bundle). A long-lived engine — Galley keeps exactly one for the life of the
///   process, behind the [`CachingCompiler`](crate::CachingCompiler) in the app's
///   managed state — reuses those across builds, so only the first compile pays
///   the format-build cost.
///
/// A Tectonic `ProcessingSession` is single-use by design, so each build still
/// constructs its own session; "warm" means the engine instance and its caches
/// stay hot, not that a session object is reused. The [`CachingCompiler`] sits in
/// front and skips the engine entirely when the input is unchanged.
pub struct TectonicEngine {
    only_cached: bool,
}

impl TectonicEngine {
    /// An engine that fetches bundle resources over the network when they are
    /// not already cached.
    #[must_use]
    pub fn new() -> Self {
        Self { only_cached: false }
    }

    /// An engine that only ever uses already-cached bundle resources, so it
    /// never touches the network. It requires a pre-warmed cache (`just
    /// prewarm`); without one, the first compile fails rather than reaching out.
    #[must_use]
    pub fn offline() -> Self {
        Self { only_cached: true }
    }
}

impl Default for TectonicEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl LatexEngine for TectonicEngine {
    fn run(&self, plan: &BuildPlan, source: &str) -> Result<EngineArtifacts, EngineFailure> {
        let mut status = NoopStatusBackend::default();

        let config = PersistentConfig::open(false)
            .map_err(|e| EngineFailure::new(format!("failed to open Tectonic config: {e}")))?;
        let bundle = config
            .default_bundle(self.only_cached)
            .map_err(|e| EngineFailure::new(format!("failed to load the resource bundle: {e}")))?;
        let format_cache_path = config
            .format_cache_path()
            .map_err(|e| EngineFailure::new(format!("failed to set up the format cache: {e}")))?;

        let input_name = format!("{}.tex", plan.job_name);
        let pdf_name = format!("{}.pdf", plan.job_name);
        let log_name = format!("{}.log", plan.job_name);
        let synctex_name = format!("{}.synctex.gz", plan.job_name);

        let mut builder = ProcessingSessionBuilder::default();
        builder
            .bundle(bundle)
            .primary_input_buffer(source.as_bytes())
            .tex_input_name(&input_name)
            .format_name("latex")
            .format_cache_path(format_cache_path)
            .keep_logs(true)
            .keep_intermediates(false)
            .print_stdout(false)
            .synctex(true)
            .output_format(OutputFormat::Pdf)
            .do_not_write_output_files();

        let mut session = builder
            .create(&mut status)
            .map_err(|e| EngineFailure::new(format!("failed to start the engine: {e}")))?;
        let run = session.run(&mut status);
        let mut files = session.into_file_data();

        let log = files
            .remove(&log_name)
            .map(|file| String::from_utf8_lossy(&file.data).into_owned())
            .unwrap_or_default();

        let synctex = files.remove(&synctex_name).map(|f| f.data);

        match run {
            Ok(()) => match files.remove(&pdf_name) {
                Some(file) => Ok(EngineArtifacts {
                    pdf: file.data,
                    synctex,
                    log,
                }),
                None => Err(EngineFailure::new(fallback(
                    log,
                    "the engine reported success but produced no PDF",
                ))),
            },
            Err(err) => Err(EngineFailure::new(fallback(log, &err.to_string()))),
        }
    }
}

/// Prefer the captured log; fall back to `message` only when the log is empty.
fn fallback(log: String, message: &str) -> String {
    if log.is_empty() {
        message.to_string()
    } else {
        log
    }
}
