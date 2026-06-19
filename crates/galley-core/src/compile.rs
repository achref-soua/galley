//! The compile domain: how Galley turns a request to build a document into a
//! plan, and how it reports the outcome.
//!
//! Everything here is pure: there is no TeX engine, no filesystem, and no
//! network. The actual engine lives behind the [`Compiler`] port (implemented by
//! an adapter in `galley-compile`), so this module can be exercised to full
//! coverage with plain unit tests. The adapter does the heavy, native work; this
//! module owns the decisions — which file is the job, whether the request is even
//! buildable, and how a result is shaped.

use crate::document::{basename, classify, DocumentKind};
use std::fmt;

/// The TeX engine a build should be driven with.
///
/// Galley ships embedded Tectonic; the opt-in `latexmk`/TeX Live fallback
/// (architecture §4.3) joins this enum when it lands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Engine {
    /// The embedded Tectonic engine — the default.
    Tectonic,
}

impl Engine {
    /// A short, stable identifier for logs and serialization.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Engine::Tectonic => "tectonic",
        }
    }
}

/// Why a [`CompileRequest`] could not be turned into a [`BuildPlan`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlanError {
    /// The request named no root document.
    EmptyRootDocument,
    /// The root document is not a LaTeX source file.
    NotATexFile,
}

impl fmt::Display for PlanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let msg = match self {
            PlanError::EmptyRootDocument => "no root document to compile",
            PlanError::NotATexFile => "the root document is not a .tex file",
        };
        f.write_str(msg)
    }
}

impl std::error::Error for PlanError {}

/// A request to compile a project: which document is the root, and with which
/// engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileRequest {
    /// Project-relative, forward-slashed path of the root document.
    pub root_document: String,
    /// The engine to drive.
    pub engine: Engine,
    /// The absolute project root, when known. The engine resolves sibling files
    /// on disk against it — `.bib` bibliographies, `\input`-ed chapters, and
    /// images — so a multi-file document renders fully. `None` compiles only the
    /// supplied source against the bundled packages, with no disk access.
    pub project_root: Option<String>,
}

impl CompileRequest {
    /// Build a request for `root_document` using `engine`, with no project root
    /// (the source compiles in isolation).
    #[must_use]
    pub fn new(root_document: impl Into<String>, engine: Engine) -> Self {
        Self {
            root_document: root_document.into(),
            engine,
            project_root: None,
        }
    }

    /// Set the project root the engine resolves sibling files against.
    #[must_use]
    pub fn with_project_root(mut self, root: impl Into<String>) -> Self {
        self.project_root = Some(root.into());
        self
    }
}

/// A validated, ready-to-run build: the root document, the derived job name
/// (the base for `.pdf`/`.log` outputs), and the engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuildPlan {
    /// The root document to compile.
    pub root_document: String,
    /// The job name — the root document's base name without its extension.
    pub job_name: String,
    /// The engine to drive.
    pub engine: Engine,
    /// The absolute project root for on-disk file resolution, when known.
    pub project_root: Option<String>,
}

impl BuildPlan {
    /// Validate a request and derive its build plan.
    ///
    /// # Errors
    ///
    /// Returns [`PlanError::EmptyRootDocument`] when no root document is named,
    /// and [`PlanError::NotATexFile`] when it is not a LaTeX source file.
    pub fn from_request(request: &CompileRequest) -> Result<Self, PlanError> {
        if request.root_document.is_empty() {
            return Err(PlanError::EmptyRootDocument);
        }
        if classify(&request.root_document) != DocumentKind::Tex {
            return Err(PlanError::NotATexFile);
        }
        Ok(Self {
            root_document: request.root_document.clone(),
            job_name: tex_job_name(&request.root_document),
            engine: request.engine,
            project_root: request.project_root.clone(),
        })
    }
}

/// The job name for a root document: its base name with a `.tex`/`.ltx`
/// extension removed (case-insensitively). Paths without a TeX extension keep
/// their base name unchanged.
#[must_use]
pub fn tex_job_name(root_document: &str) -> String {
    let name = basename(root_document);
    for ext in [".tex", ".ltx"] {
        let has_stem = name.len() > ext.len();
        if has_stem && name[name.len() - ext.len()..].eq_ignore_ascii_case(ext) {
            return name[..name.len() - ext.len()].to_string();
        }
    }
    name.to_string()
}

/// Whether a build succeeded or failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompileStatus {
    /// The engine produced a PDF.
    Succeeded,
    /// The engine did not produce a PDF.
    Failed,
}

/// The non-binary outcome of a compile: a status and the TeX log.
///
/// The PDF bytes themselves travel separately in a [`CompileResult`]; this part
/// is the small, copyable summary that the UI shows in the status bar and (from
/// v0.1.2) the problems panel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileReport {
    /// Whether a PDF was produced.
    pub status: CompileStatus,
    /// The captured TeX log (may be empty).
    pub log: String,
}

impl CompileReport {
    /// A successful report carrying `log`.
    #[must_use]
    pub fn succeeded(log: impl Into<String>) -> Self {
        Self {
            status: CompileStatus::Succeeded,
            log: log.into(),
        }
    }

    /// A failed report carrying `log`.
    #[must_use]
    pub fn failed(log: impl Into<String>) -> Self {
        Self {
            status: CompileStatus::Failed,
            log: log.into(),
        }
    }

    /// Whether the build succeeded.
    #[must_use]
    pub fn is_ok(&self) -> bool {
        self.status == CompileStatus::Succeeded
    }
}

/// The full result of a compile: the report plus the PDF bytes, present only on
/// success.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileResult {
    /// The status and log.
    pub report: CompileReport,
    /// The produced PDF, or `None` when the build failed.
    pub pdf: Option<Vec<u8>>,
    /// The `.synctex.gz` bytes, present when the engine produced them alongside
    /// the PDF. Used for forward/inverse source↔PDF navigation.
    pub synctex: Option<Vec<u8>>,
}

impl CompileResult {
    /// A successful result with `pdf` bytes, optional `synctex` bytes, and `log`.
    #[must_use]
    pub fn succeeded(pdf: Vec<u8>, synctex: Option<Vec<u8>>, log: impl Into<String>) -> Self {
        Self {
            report: CompileReport::succeeded(log),
            pdf: Some(pdf),
            synctex,
        }
    }

    /// A failed result carrying `log` and no PDF.
    #[must_use]
    pub fn failed(log: impl Into<String>) -> Self {
        Self {
            report: CompileReport::failed(log),
            pdf: None,
            synctex: None,
        }
    }
}

/// The compile port: drive a build for `request` over the given `source`.
///
/// The single `source` string is the canonical `.tex` content for the root
/// document — Galley always compiles the source the editor holds, never a
/// parallel model. Adapters (embedded Tectonic today) implement this; the
/// orchestration is otherwise engine-agnostic.
pub trait Compiler {
    /// Compile `source` as the plan's root document and report the outcome.
    fn compile(&self, request: &CompileRequest, source: &str) -> CompileResult;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_has_a_stable_label() {
        assert_eq!(Engine::Tectonic.label(), "tectonic");
    }

    #[test]
    fn derives_job_name_by_stripping_the_tex_extension() {
        assert_eq!(tex_job_name("main.tex"), "main");
        assert_eq!(tex_job_name("paper.ltx"), "paper");
        assert_eq!(tex_job_name("main.TEX"), "main");
        assert_eq!(tex_job_name("chapters/report.tex"), "report");
        // No TeX extension: the base name is kept verbatim.
        assert_eq!(tex_job_name("notes.bib"), "notes.bib");
        assert_eq!(tex_job_name("README"), "README");
        // A bare extension has no stem to strip.
        assert_eq!(tex_job_name(".tex"), ".tex");
    }

    #[test]
    fn plans_a_valid_request() {
        let request = CompileRequest::new("chapters/main.tex", Engine::Tectonic);
        let plan = BuildPlan::from_request(&request).unwrap();
        assert_eq!(plan.root_document, "chapters/main.tex");
        assert_eq!(plan.job_name, "main");
        assert_eq!(plan.engine, Engine::Tectonic);
    }

    #[test]
    fn carries_the_project_root_into_the_plan() {
        // A bare request has no project root and compiles in isolation.
        let bare = CompileRequest::new("main.tex", Engine::Tectonic);
        assert_eq!(bare.project_root, None);
        assert_eq!(BuildPlan::from_request(&bare).unwrap().project_root, None);

        // `with_project_root` threads the root through to the plan.
        let rooted =
            CompileRequest::new("main.tex", Engine::Tectonic).with_project_root("/home/ada/paper");
        assert_eq!(rooted.project_root.as_deref(), Some("/home/ada/paper"));
        let plan = BuildPlan::from_request(&rooted).unwrap();
        assert_eq!(plan.project_root.as_deref(), Some("/home/ada/paper"));
        // The two requests differ once a root is set.
        assert_ne!(bare, rooted);
        assert_eq!(rooted.clone(), rooted);
        assert!(format!("{plan:?}").contains("/home/ada/paper"));
    }

    #[test]
    fn rejects_an_empty_root_document() {
        let request = CompileRequest::new("", Engine::Tectonic);
        assert_eq!(
            BuildPlan::from_request(&request),
            Err(PlanError::EmptyRootDocument)
        );
    }

    #[test]
    fn rejects_a_non_tex_root_document() {
        let request = CompileRequest::new("refs.bib", Engine::Tectonic);
        assert_eq!(
            BuildPlan::from_request(&request),
            Err(PlanError::NotATexFile)
        );
    }

    #[test]
    fn plan_errors_describe_themselves() {
        assert_eq!(
            PlanError::EmptyRootDocument.to_string(),
            "no root document to compile"
        );
        assert_eq!(
            PlanError::NotATexFile.to_string(),
            "the root document is not a .tex file"
        );
        let err: &dyn std::error::Error = &PlanError::NotATexFile;
        assert!(err.source().is_none());
    }

    #[test]
    fn reports_track_success_and_failure() {
        let ok = CompileReport::succeeded("Output written.");
        assert!(ok.is_ok());
        assert_eq!(ok.status, CompileStatus::Succeeded);
        assert_eq!(ok.log, "Output written.");

        let bad = CompileReport::failed("! Undefined control sequence.");
        assert!(!bad.is_ok());
        assert_eq!(bad.status, CompileStatus::Failed);
    }

    #[test]
    fn results_carry_bytes_only_on_success() {
        let ok = CompileResult::succeeded(vec![1, 2, 3], None, "done");
        assert!(ok.report.is_ok());
        assert_eq!(ok.pdf, Some(vec![1, 2, 3]));
        assert_eq!(ok.synctex, None);

        let with_synctex = CompileResult::succeeded(vec![1], Some(vec![0x1f, 0x8b]), "done");
        assert_eq!(with_synctex.synctex, Some(vec![0x1f, 0x8b]));

        let bad = CompileResult::failed("boom");
        assert!(!bad.report.is_ok());
        assert_eq!(bad.pdf, None);
        assert_eq!(bad.synctex, None);
    }

    #[test]
    fn types_support_their_derives() {
        // Engine / PlanError are Copy + Eq + Debug.
        let engine = Engine::Tectonic;
        let copied = engine;
        assert_eq!(copied, engine);
        assert_eq!(format!("{engine:?}"), "Tectonic");

        let plan_err = PlanError::EmptyRootDocument;
        assert_eq!(plan_err, plan_err.clone());
        assert_ne!(PlanError::EmptyRootDocument, PlanError::NotATexFile);
        assert!(format!("{plan_err:?}").contains("EmptyRootDocument"));

        // CompileStatus is Copy + Eq + Debug.
        let status = CompileStatus::Failed;
        let status_copy = status;
        assert_eq!(status_copy, status);
        assert_ne!(CompileStatus::Succeeded, CompileStatus::Failed);
        assert_eq!(format!("{status:?}"), "Failed");

        // CompileRequest / BuildPlan / CompileReport / CompileResult are
        // Clone + Eq + Debug.
        let request = CompileRequest::new("main.tex", Engine::Tectonic);
        assert_eq!(request.clone(), request);
        assert!(format!("{request:?}").contains("CompileRequest"));

        let plan = BuildPlan::from_request(&request).unwrap();
        assert_eq!(plan.clone(), plan);
        assert!(format!("{plan:?}").contains("BuildPlan"));

        let report = CompileReport::succeeded("ok");
        assert_eq!(report.clone(), report);
        assert!(format!("{report:?}").contains("CompileReport"));

        let result = CompileResult::succeeded(vec![1], None, "ok");
        assert_eq!(result.clone(), result);
        assert!(format!("{result:?}").contains("CompileResult"));
        let failed_result = CompileResult::failed("no");
        assert_ne!(result, failed_result);
    }
}
