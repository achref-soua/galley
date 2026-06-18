//! Galley desktop shell (Tauri 2).
//!
//! Bootstrap glue only: it wires the Tauri application together and exposes a
//! thin command layer over the covered `galley-*` crates. Every command simply
//! converts its arguments, calls into a crate, and maps the result — all of the
//! real logic (the project model, the manifest, the sandboxed file store) lives
//! in those crates and is exercised there. This file holds no testable business
//! logic and is excluded from coverage (see `docs/adr/0002`).

use galley_compile::{CachingCompiler, EmbeddedCompiler, TectonicEngine};
use galley_core::diagnostics::{parse_log, Diagnostic};
use galley_core::{CompileRequest, DocumentKind, Engine, VERSION};
use galley_import::{create_project as import_create, open_folder as import_open, Workspace};
use galley_security::SafeRoot;
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

/// A project file as sent to the UI.
#[derive(Serialize)]
struct DocumentDto {
    path: String,
    kind: &'static str,
}

/// A project as sent to the UI.
#[derive(Serialize)]
struct ProjectDto {
    name: String,
    root: String,
    root_document: String,
    documents: Vec<DocumentDto>,
}

impl ProjectDto {
    fn from_workspace(workspace: Workspace) -> Self {
        let documents = workspace
            .project
            .documents
            .into_iter()
            .map(|doc| DocumentDto {
                path: doc.path,
                kind: kind_label(doc.kind),
            })
            .collect();
        Self {
            name: workspace.project.name,
            root: workspace.root.to_string_lossy().into_owned(),
            root_document: workspace.project.root_document,
            documents,
        }
    }
}

fn kind_label(kind: DocumentKind) -> &'static str {
    match kind {
        DocumentKind::Tex => "tex",
        DocumentKind::Bib => "bib",
        DocumentKind::Asset => "asset",
        DocumentKind::Other => "other",
    }
}

/// The current time as an ISO-8601 UTC string for the manifest.
fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    galley_core::iso8601_utc(secs)
}

#[tauri::command]
fn create_project(parent: String, name: String) -> Result<ProjectDto, String> {
    import_create(Path::new(&parent), &name, VERSION, &now_iso())
        .map(ProjectDto::from_workspace)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Result<ProjectDto, String> {
    import_open(Path::new(&path), VERSION, &now_iso())
        .map(ProjectDto::from_workspace)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn read_document(root: String, rel: String) -> Result<String, String> {
    let store = SafeRoot::open(Path::new(&root)).map_err(|err| err.to_string())?;
    store.read(&rel).map_err(|err| err.to_string())
}

#[tauri::command]
fn save_document(root: String, rel: String, contents: String) -> Result<(), String> {
    let store = SafeRoot::open(Path::new(&root)).map_err(|err| err.to_string())?;
    store.write(&rel, &contents).map_err(|err| err.to_string())
}

/// A structured diagnostic as sent to the UI.
#[derive(Serialize)]
struct DiagnosticDto {
    severity: &'static str,
    kind: &'static str,
    message: String,
    file: Option<String>,
    line: Option<u32>,
    explanation: String,
}

impl DiagnosticDto {
    fn from_diagnostic(diagnostic: Diagnostic) -> Self {
        Self {
            severity: diagnostic.severity.label(),
            kind: diagnostic.kind.label(),
            message: diagnostic.message,
            file: diagnostic.file,
            line: diagnostic.line,
            explanation: diagnostic.explanation,
        }
    }
}

/// The outcome of a compile as sent to the UI.
#[derive(Serialize)]
struct CompileDto {
    ok: bool,
    log: String,
    pdf: Option<Vec<u8>>,
    cached: bool,
    diagnostics: Vec<DiagnosticDto>,
}

/// The app's one warm, long-lived compiler.
///
/// Keeping a single `CachingCompiler` (over the warm embedded Tectonic engine)
/// in managed state — rather than constructing one per build — is what makes the
/// engine "warm in process": its on-disk format/bundle caches stay hot and the
/// incremental cache short-circuits unchanged recompiles. The `Mutex` serializes
/// builds (Tectonic runs one at a time) and gives the command `&mut` access.
type WarmCompiler = CachingCompiler<EmbeddedCompiler<TectonicEngine>>;
struct CompilerState(Mutex<WarmCompiler>);

impl CompilerState {
    fn new() -> Self {
        Self(Mutex::new(CachingCompiler::new(EmbeddedCompiler::new(
            TectonicEngine::new(),
        ))))
    }
}

#[tauri::command]
fn compile_document(
    state: State<'_, CompilerState>,
    source: String,
    root_document: String,
) -> CompileDto {
    let request = CompileRequest::new(root_document, Engine::Tectonic);
    let mut compiler = state.0.lock().expect("the compiler mutex was poisoned");
    let outcome = compiler.compile(&request, &source);
    let diagnostics = parse_log(&outcome.result.report.log)
        .into_iter()
        .map(DiagnosticDto::from_diagnostic)
        .collect();
    CompileDto {
        ok: outcome.result.report.is_ok(),
        log: outcome.result.report.log,
        pdf: outcome.result.pdf,
        cached: outcome.cached,
        diagnostics,
    }
}

/// Build and run the Galley desktop application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CompilerState::new())
        .setup(|app| {
            let title = format!("{} {}", galley_core::NAME, VERSION);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&title);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_folder,
            read_document,
            save_document,
            compile_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Galley application");
}
