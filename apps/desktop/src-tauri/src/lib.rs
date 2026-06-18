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
use galley_core::search::{search_in_content, SearchQuery};
use galley_core::{
    CompileRequest, CompletionItem, DocumentKind, DocumentSymbol, Engine, LanguageIntelligence,
    Location, Position, TextDocument, VERSION,
};
use galley_import::{create_project as import_create, open_folder as import_open, Workspace};
use galley_intel::TexLabClient;
use galley_security::SafeRoot;
use serde::Serialize;
use std::path::{Path, PathBuf};
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

/// The live TexLab language server, kept warm across requests.
///
/// Like the compiler, the client is long-lived: it is started once per project
/// (the first intelligence request for a given root spawns it and runs the LSP
/// handshake) and reused, so completion/hover/go-to-definition do not pay a
/// startup cost each time. A `Mutex` serializes the requests, which a language
/// server answers one at a time. It starts lazily, and a failure to start (no
/// `texlab` on `PATH`) degrades to empty results rather than an error, so the
/// editor stays usable without the language server installed.
struct IntelSession {
    root: PathBuf,
    client: TexLabClient,
}

struct IntelState(Mutex<Option<IntelSession>>);

impl IntelState {
    fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Run `action` against the language client rooted at `root`, starting (or
/// restarting, if the project changed) the server as needed. Returns `default`
/// when the server cannot be started.
fn with_intel<T>(
    state: &IntelState,
    root: &str,
    default: T,
    action: impl FnOnce(&mut TexLabClient) -> T,
) -> T {
    let mut guard = state.0.lock().expect("the intel mutex was poisoned");
    let root_path = PathBuf::from(root);
    let stale = guard
        .as_ref()
        .is_none_or(|session| session.root != root_path);
    if stale {
        match TexLabClient::start(&root_path) {
            Ok(client) => {
                *guard = Some(IntelSession {
                    root: root_path,
                    client,
                })
            }
            Err(_) => {
                *guard = None;
                return default;
            }
        }
    }
    match guard.as_mut() {
        Some(session) => action(&mut session.client),
        None => default,
    }
}

/// A `file:` URI for a project-relative document.
fn document_uri(root: &str, rel: &str) -> String {
    format!("file://{root}/{rel}")
}

/// A completion candidate as sent to the UI.
#[derive(Serialize)]
struct CompletionItemDto {
    label: String,
    kind: &'static str,
    detail: Option<String>,
    insert_text: Option<String>,
    documentation: Option<String>,
}

impl From<CompletionItem> for CompletionItemDto {
    fn from(item: CompletionItem) -> Self {
        Self {
            label: item.label,
            kind: item.kind.label(),
            detail: item.detail,
            insert_text: item.insert_text,
            documentation: item.documentation,
        }
    }
}

/// A go-to-definition target as sent to the UI (zero-based position).
#[derive(Serialize)]
struct LocationDto {
    file: String,
    line: u32,
    character: u32,
}

impl From<Location> for LocationDto {
    fn from(location: Location) -> Self {
        Self {
            file: location.file,
            line: location.position.line,
            character: location.position.character,
        }
    }
}

/// A document-outline symbol as sent to the UI (zero-based line).
#[derive(Serialize)]
struct DocumentSymbolDto {
    name: String,
    detail: Option<String>,
    kind: &'static str,
    line: u32,
    children: Vec<DocumentSymbolDto>,
}

impl From<DocumentSymbol> for DocumentSymbolDto {
    fn from(symbol: DocumentSymbol) -> Self {
        Self {
            name: symbol.name,
            detail: symbol.detail,
            kind: symbol.kind.label(),
            line: symbol.line,
            children: symbol.children.into_iter().map(Into::into).collect(),
        }
    }
}

#[tauri::command]
fn lsp_completion(
    state: State<'_, IntelState>,
    root: String,
    rel: String,
    source: String,
    line: u32,
    character: u32,
) -> Vec<CompletionItemDto> {
    let doc = TextDocument::new(document_uri(&root, &rel), source);
    with_intel(&state, &root, Vec::new(), |client| {
        client
            .completion(&doc, Position::new(line, character))
            .into_iter()
            .map(Into::into)
            .collect()
    })
}

#[tauri::command]
fn lsp_hover(
    state: State<'_, IntelState>,
    root: String,
    rel: String,
    source: String,
    line: u32,
    character: u32,
) -> Option<String> {
    let doc = TextDocument::new(document_uri(&root, &rel), source);
    with_intel(&state, &root, None, |client| {
        client
            .hover(&doc, Position::new(line, character))
            .map(|hover| hover.contents)
    })
}

#[tauri::command]
fn lsp_definition(
    state: State<'_, IntelState>,
    root: String,
    rel: String,
    source: String,
    line: u32,
    character: u32,
) -> Option<LocationDto> {
    let doc = TextDocument::new(document_uri(&root, &rel), source);
    with_intel(&state, &root, None, |client| {
        client
            .definition(&doc, Position::new(line, character))
            .map(Into::into)
    })
}

#[tauri::command]
fn lsp_symbols(
    state: State<'_, IntelState>,
    root: String,
    rel: String,
    source: String,
) -> Vec<DocumentSymbolDto> {
    let doc = TextDocument::new(document_uri(&root, &rel), source);
    with_intel(&state, &root, Vec::new(), |client| {
        client.symbols(&doc).into_iter().map(Into::into).collect()
    })
}

/// A single match within a file, as sent to the UI.
#[derive(Serialize)]
struct SearchMatchDto {
    line: u32,
    column: u32,
    line_text: String,
    match_start: usize,
    match_end: usize,
}

/// All matches within a single file.
#[derive(Serialize)]
struct FileMatchesDto {
    file: String,
    matches: Vec<SearchMatchDto>,
}

/// Search all `.tex` files in the project for `pattern`.
#[tauri::command]
fn search_project(
    root: String,
    pattern: String,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
) -> Vec<FileMatchesDto> {
    let store = match SafeRoot::open(Path::new(&root)) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let files = match store.list() {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let query = SearchQuery {
        pattern,
        case_sensitive,
        whole_word,
        use_regex,
    };
    let mut results = Vec::new();
    for file in files {
        if !file.ends_with(".tex") {
            continue;
        }
        let content = match store.read(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let matches: Vec<SearchMatchDto> = search_in_content(&content, &query)
            .into_iter()
            .map(|m| SearchMatchDto {
                line: m.line,
                column: m.column,
                line_text: m.line_text,
                match_start: m.match_start,
                match_end: m.match_end,
            })
            .collect();
        if !matches.is_empty() {
            results.push(FileMatchesDto { file, matches });
        }
    }
    results
}

#[tauri::command]
fn lsp_diagnostics(
    state: State<'_, IntelState>,
    root: String,
    rel: String,
    source: String,
) -> Vec<DiagnosticDto> {
    let doc = TextDocument::new(document_uri(&root, &rel), source);
    with_intel(&state, &root, Vec::new(), |client| {
        client
            .diagnostics(&doc)
            .into_iter()
            .map(DiagnosticDto::from_diagnostic)
            .collect()
    })
}

/// Build and run the Galley desktop application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CompilerState::new())
        .manage(IntelState::new())
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
            compile_document,
            search_project,
            lsp_completion,
            lsp_hover,
            lsp_definition,
            lsp_symbols,
            lsp_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Galley application");
}
