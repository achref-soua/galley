//! Galley desktop shell (Tauri 2).
//!
//! Bootstrap glue only: it wires the Tauri application together and exposes a
//! thin command layer over the covered `galley-*` crates. Every command simply
//! converts its arguments, calls into a crate, and maps the result — all of the
//! real logic (the project model, the manifest, the sandboxed file store) lives
//! in those crates and is exercised there. This file holds no testable business
//! logic and is excluded from coverage (see `docs/adr/0002`).

mod ai;

use ai::{
    build_adapter, get_api_key, load_ai_config, load_consent, remove_api_key, save_ai_config,
    save_consent, store_api_key, AiConfigFile, ConsentFile, ProviderConfigFile,
};
use galley_compile::{CachingCompiler, EmbeddedCompiler, TectonicEngine};
use galley_core::ai::LlmProvider;
use galley_core::diagnostics::{parse_log, Diagnostic};
use galley_core::search::{search_in_content, SearchQuery};
use galley_core::{
    analyze_project, arxiv_atom_to_entry, parse_bib, scan_source, BibEntry, CompileRequest,
    CompletionItem, DocumentKind, DocumentSymbol, Engine, FileEntry, LanguageIntelligence,
    Location, Position, ShellEscapePolicy, SyncTexMapper, TextDocument, VERSION,
};
use galley_import::{
    create_project as import_create, export_clean_bundle, export_share_bundle, extract_tarball,
    extract_zip, import_from_entries, open_folder as import_open, ArchiveLimits, Workspace,
};
use galley_intel::{SyncTexParser, TexLabClient};
use galley_security::SafeRoot;
use galley_vcs::{CheckpointHistory, Git2History};
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
    /// Whether SyncTeX data is available for forward/inverse navigation.
    has_synctex: bool,
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

/// The most recent `.synctex.gz` bytes, cached after each successful compile.
///
/// The bytes are stored in process — not sent to the frontend — so forward and
/// inverse search commands can query them without a round-trip that would double
/// the transfer cost of potentially large binary data.
struct SyncTexState(Mutex<Option<Vec<u8>>>);

impl CompilerState {
    fn new() -> Self {
        Self(Mutex::new(CachingCompiler::new(EmbeddedCompiler::new(
            TectonicEngine::new(),
        ))))
    }
}

impl SyncTexState {
    fn new() -> Self {
        Self(Mutex::new(None))
    }
}

#[tauri::command]
fn compile_document(
    compiler_state: State<'_, CompilerState>,
    synctex_state: State<'_, SyncTexState>,
    source: String,
    root_document: String,
    project_root: String,
) -> CompileDto {
    let request = CompileRequest::new(root_document, Engine::Tectonic)
        .with_project_root(project_root)
        .with_shell_escape(ShellEscapePolicy::Off);
    let mut compiler = compiler_state
        .0
        .lock()
        .expect("the compiler mutex was poisoned");
    let outcome = compiler.compile(&request, &source);
    let has_synctex = outcome.result.synctex.is_some();
    if let Some(bytes) = outcome.result.synctex.clone() {
        let mut sx = synctex_state
            .0
            .lock()
            .expect("the synctex mutex was poisoned");
        *sx = Some(bytes);
    }
    let diagnostics = parse_log(&outcome.result.report.log)
        .into_iter()
        .map(DiagnosticDto::from_diagnostic)
        .collect();
    CompileDto {
        ok: outcome.result.report.is_ok(),
        log: outcome.result.report.log,
        pdf: outcome.result.pdf,
        has_synctex,
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

/// The PDF rectangle returned by forward search, in scaled points.
#[derive(Serialize)]
struct SyncTexBoxDto {
    page: u32,
    h: i64,
    v: i64,
    w: i64,
    d: i64,
    page_height: i64,
}

/// The source location returned by inverse search.
#[derive(Serialize)]
struct SyncTexLocationDto {
    file: String,
    line: u32,
}

#[tauri::command]
fn synctex_forward(
    state: State<'_, SyncTexState>,
    file: String,
    line: u32,
) -> Option<SyncTexBoxDto> {
    let guard = state.0.lock().expect("the synctex mutex was poisoned");
    let data = guard.as_deref()?;
    SyncTexParser
        .forward(data, &file, line)
        .map(|b| SyncTexBoxDto {
            page: b.page,
            h: b.h,
            v: b.v,
            w: b.w,
            d: b.d,
            page_height: b.page_height,
        })
}

#[tauri::command]
fn synctex_inverse(
    state: State<'_, SyncTexState>,
    page: u32,
    x: f64,
    y: f64,
) -> Option<SyncTexLocationDto> {
    let guard = state.0.lock().expect("the synctex mutex was poisoned");
    let data = guard.as_deref()?;
    SyncTexParser
        .inverse(data, page, x, y)
        .map(|loc| SyncTexLocationDto {
            file: loc.file,
            line: loc.line,
        })
}

/// Sanitize a user-supplied filename to a safe basename.
///
/// Strips any directory prefix and replaces characters that are illegal on at
/// least one major OS (`\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, and ASCII
/// control characters) with underscores. The result is always a plain filename
/// with no path separators.
fn sanitize_filename(name: &str) -> String {
    let base = name.split(['/', '\\']).next_back().unwrap_or_default();
    base.chars()
        .map(|c| {
            if c.is_ascii_control()
                || matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
            {
                '_'
            } else {
                c
            }
        })
        .collect()
}

/// Copy binary `src_bytes` into the project's `assets/` folder as `filename`.
///
/// The filename is sanitized (no directory separators; illegal characters
/// replaced). Returns the project-relative path (`assets/<filename>`).
#[tauri::command]
fn copy_asset(root: String, src_bytes: Vec<u8>, filename: String) -> Result<String, String> {
    let store = SafeRoot::open(Path::new(&root)).map_err(|err| err.to_string())?;
    let clean = sanitize_filename(&filename);
    let rel = format!("assets/{clean}");
    store
        .write_bytes(&rel, &src_bytes)
        .map_err(|err| err.to_string())?;
    Ok(rel)
}

/// List every file in the project's `assets/` subfolder.
///
/// Returns project-relative paths (e.g. `"assets/figure.png"`). Returns an
/// empty list when the project root cannot be opened or `assets/` does not
/// exist — never returns an error to keep the UI responsive.
#[tauri::command]
fn list_assets(root: String) -> Vec<String> {
    let store = match SafeRoot::open(Path::new(&root)) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let all = match store.list() {
        Ok(files) => files,
        Err(_) => return Vec::new(),
    };
    all.into_iter()
        .filter(|f| f.starts_with("assets/"))
        .collect()
}

/// A bibliography field as sent to the UI.
#[derive(Serialize)]
struct BibFieldDto {
    name: String,
    value: String,
}

/// A bibliography entry as sent to the UI.
#[derive(Serialize)]
struct BibEntryDto {
    entry_type: String,
    key: String,
    fields: Vec<BibFieldDto>,
}

impl From<BibEntry> for BibEntryDto {
    fn from(entry: BibEntry) -> Self {
        Self {
            entry_type: entry.entry_type,
            key: entry.key,
            fields: entry
                .fields
                .into_iter()
                .map(|f| BibFieldDto {
                    name: f.name,
                    value: f.value,
                })
                .collect(),
        }
    }
}

/// Fetch the raw reference text for `query`: BibTeX via DOI content negotiation,
/// or an Atom feed from the arXiv API.
fn fetch_reference(query: &str, kind: &str) -> Result<String, String> {
    let trimmed = query.trim();
    let agent = "Galley/0.3.4 (https://github.com/achref-soua/galley)";
    let response = if kind == "arxiv" {
        let url = format!("http://export.arxiv.org/api/query?id_list={trimmed}&max_results=1");
        ureq::get(&url).set("User-Agent", agent).call()
    } else {
        let url = format!("https://doi.org/{trimmed}");
        ureq::get(&url)
            .set("User-Agent", agent)
            .set("Accept", "application/x-bibtex; charset=utf-8")
            .call()
    };
    response
        .map_err(|err| err.to_string())?
        .into_string()
        .map_err(|err| err.to_string())
}

/// Resolve a DOI or arXiv id into a bibliography entry.
///
/// The HTTP request and the parse both live here, in the (coverage-excluded)
/// shell, so reference egress stays in the core process. The parsing itself is
/// the fully-tested `galley_core::bibliography`. `kind` is `"doi"` or `"arxiv"`.
#[tauri::command]
fn lookup_reference(query: String, kind: String) -> Result<BibEntryDto, String> {
    let text = fetch_reference(&query, &kind)?;
    let entry = if kind == "arxiv" {
        arxiv_atom_to_entry(&text)
    } else {
        parse_bib(&text).into_iter().next()
    };
    entry
        .map(BibEntryDto::from)
        .ok_or_else(|| "no reference found for that identifier".to_string())
}

/// Fetch the latest published Galley release tag from GitHub (e.g. `v0.9.2`).
///
/// Network egress lives here in the (coverage-excluded) shell so the update check
/// goes through the core process rather than the webview, whose strict CSP
/// forbids cross-origin requests. The frontend compares the returned tag with the
/// running version and offers an update when it is newer.
#[tauri::command]
fn check_latest_release() -> Result<String, String> {
    let agent = concat!(
        "Galley/",
        env!("CARGO_PKG_VERSION"),
        " (https://github.com/achref-soua/galley)"
    );
    let url = "https://api.github.com/repos/achref-soua/galley/releases/latest";
    let text = ureq::get(url)
        .set("User-Agent", agent)
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|err| err.to_string())?
        .into_string()
        .map_err(|err| err.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|err| err.to_string())?;
    json.get("tag_name")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "no tag_name in the release response".to_string())
}

// ── AI commands ───────────────────────────────────────────────────────────────

/// DTO for a provider config as sent to / received from the frontend.
#[derive(serde::Serialize, serde::Deserialize)]
struct ProviderConfigDto {
    id: String,
    name: String,
    provider: String,
    api_base: String,
    model: String,
    local: bool,
    has_key: bool,
}

/// DTO for the full AI gateway config.
#[derive(serde::Serialize, serde::Deserialize)]
struct AiConfigDto {
    local_only: bool,
    active_provider: Option<String>,
    providers: Vec<ProviderConfigDto>,
}

#[tauri::command]
fn get_ai_config(app: tauri::AppHandle) -> AiConfigDto {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let cfg = load_ai_config(&config_dir);
    let secrets_keys: std::collections::HashMap<String, bool> = cfg
        .providers
        .iter()
        .map(|p| {
            let has = get_api_key(&config_dir, &p.id).is_some();
            (p.id.clone(), has)
        })
        .collect();
    AiConfigDto {
        local_only: cfg.local_only,
        active_provider: cfg.active_provider,
        providers: cfg
            .providers
            .into_iter()
            .map(|p| {
                let has_key = *secrets_keys.get(&p.id).unwrap_or(&false);
                ProviderConfigDto {
                    id: p.id,
                    name: p.name,
                    provider: p.provider,
                    api_base: p.api_base,
                    model: p.model,
                    local: p.local,
                    has_key,
                }
            })
            .collect(),
    }
}

#[tauri::command]
fn set_ai_config(app: tauri::AppHandle, config: AiConfigDto) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let file = AiConfigFile {
        local_only: config.local_only,
        active_provider: config.active_provider,
        providers: config
            .providers
            .into_iter()
            .map(|p| ProviderConfigFile {
                id: p.id,
                name: p.name,
                provider: p.provider,
                api_base: p.api_base,
                model: p.model,
                local: p.local,
            })
            .collect(),
    };
    save_ai_config(&config_dir, &file)
}

#[tauri::command]
fn store_ai_key(app: tauri::AppHandle, provider_id: String, key: String) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    store_api_key(&config_dir, &provider_id, &key)
}

#[tauri::command]
fn remove_ai_key(app: tauri::AppHandle, provider_id: String) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    remove_api_key(&config_dir, &provider_id)
}

#[tauri::command]
fn get_project_consent(project_root: String) -> bool {
    load_consent(Path::new(&project_root)).cloud_ai_enabled
}

#[tauri::command]
fn set_project_consent(project_root: String, enabled: bool) -> Result<(), String> {
    save_consent(
        Path::new(&project_root),
        &ConsentFile {
            cloud_ai_enabled: enabled,
        },
    )
}

/// Ping the given provider with a minimal request and return true on success.
#[tauri::command]
fn test_ai_provider(app: tauri::AppHandle, provider_id: String) -> bool {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let cfg = load_ai_config(&config_dir);
    let Some(pcfg) = cfg.providers.iter().find(|p| p.id == provider_id) else {
        return false;
    };
    let key = get_api_key(&config_dir, &provider_id);
    let adapter = build_adapter(pcfg, key);
    let req =
        galley_core::ai::LlmRequest::new(vec![galley_core::ai::LlmMessage::user("Say hi.")], 4);
    adapter.complete(&req).is_ok()
}

/// Send a completion through the active provider (requires project consent).
#[tauri::command]
fn send_ai_completion(
    app: tauri::AppHandle,
    messages: Vec<serde_json::Value>,
    max_tokens: u32,
    project_root: String,
) -> Result<String, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let consent = load_consent(Path::new(&project_root)).cloud_ai_enabled;
    if !consent {
        return Err("AI not enabled for this project — enable it in Settings > AI.".to_string());
    }
    let cfg = load_ai_config(&config_dir);
    let active_id = cfg
        .active_provider
        .as_deref()
        .ok_or_else(|| "No active AI provider configured.".to_string())?;
    let pcfg = cfg
        .providers
        .iter()
        .find(|p| p.id == active_id)
        .ok_or_else(|| "Active provider not found in config.".to_string())?;
    if cfg.local_only && !pcfg.local {
        return Err("Local-only mode: cloud providers are disabled.".to_string());
    }
    let key = get_api_key(&config_dir, active_id);
    let adapter = build_adapter(pcfg, key);
    let llm_messages: Vec<galley_core::ai::LlmMessage> = messages
        .into_iter()
        .map(|v| galley_core::ai::LlmMessage {
            role: v["role"].as_str().unwrap_or("user").to_string(),
            content: v["content"].as_str().unwrap_or("").to_string(),
        })
        .collect();
    let req = galley_core::ai::LlmRequest::new(llm_messages, max_tokens);
    adapter
        .complete(&req)
        .map(|r| r.content)
        .map_err(|e| e.to_string())
}

// ── Import / export commands ──────────────────────────────────────────────────

/// Parse-only analysis of an import source, sent to the wizard UI.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectAnalysisDto {
    root_file: String,
    engine: String,
    bib_tool: String,
    encoding: String,
    packages: Vec<String>,
    fonts: Vec<String>,
    warnings: Vec<String>,
    file_count: usize,
    total_bytes: u64,
}

impl ProjectAnalysisDto {
    fn from_entries(entries: &[FileEntry]) -> Self {
        let profile = analyze_project(entries);
        let total_bytes = entries.iter().map(|e| e.content.len() as u64).sum();
        Self {
            root_file: profile.root_file,
            engine: profile.engine.label().to_string(),
            bib_tool: profile.bib_tool.label().to_string(),
            encoding: profile.encoding,
            packages: profile.packages,
            fonts: profile.fonts,
            warnings: profile.warnings,
            file_count: entries.len(),
            total_bytes,
        }
    }
}

/// Limits applied to archive extraction: 512 MiB total / 64 MiB per file / 8 000 files.
fn import_limits() -> ArchiveLimits {
    ArchiveLimits {
        max_files: 8_000,
        max_file_bytes: 64 * 1024 * 1024,
        max_total_bytes: 512 * 1024 * 1024,
    }
}

/// Read an archive at `path` and extract its entries.
///
/// The archive type is inferred from the file extension (`.zip` → ZIP;
/// everything else is treated as a `.tar.gz` tarball).
fn read_archive_entries(path: &Path) -> Result<Vec<FileEntry>, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("zip"))
        .unwrap_or(false)
    {
        extract_zip(&bytes, import_limits()).map_err(|e| e.to_string())
    } else {
        extract_tarball(&bytes, import_limits()).map_err(|e| e.to_string())
    }
}

/// Analyse an archive at `path` (`.zip` or `.tar.gz`) without writing to disk.
#[tauri::command]
fn import_analyze_archive(path: String) -> Result<ProjectAnalysisDto, String> {
    let entries = read_archive_entries(Path::new(&path))?;
    Ok(ProjectAnalysisDto::from_entries(&entries))
}

/// Materialise an archive at `path` as a new project directory.
#[tauri::command]
fn import_from_archive(path: String, parent: String, name: String) -> Result<ProjectDto, String> {
    let entries = read_archive_entries(Path::new(&path))?;
    import_from_entries(Path::new(&parent), &name, entries, VERSION, &now_iso())
        .map(|iw| {
            ProjectDto::from_workspace(Workspace {
                root: iw.root,
                project: iw.project,
            })
        })
        .map_err(|e| e.to_string())
}

/// Analyse an existing on-disk folder without modifying it.
#[tauri::command]
fn import_analyze_folder(path: String) -> Result<ProjectAnalysisDto, String> {
    let store = SafeRoot::open(Path::new(&path)).map_err(|e| e.to_string())?;
    let files = store.list().map_err(|e| e.to_string())?;
    let entries: Vec<FileEntry> = files
        .into_iter()
        .filter_map(|rel| {
            store
                .read_bytes(&rel)
                .ok()
                .map(|content| FileEntry::new(rel, content))
        })
        .collect();
    Ok(ProjectAnalysisDto::from_entries(&entries))
}

/// Copy an existing folder into a new Galley project directory.
#[tauri::command]
fn import_from_folder(parent: String, name: String, src: String) -> Result<ProjectDto, String> {
    let store = SafeRoot::open(Path::new(&src)).map_err(|e| e.to_string())?;
    let files = store.list().map_err(|e| e.to_string())?;
    let entries: Vec<FileEntry> = files
        .into_iter()
        .filter_map(|rel| {
            store
                .read_bytes(&rel)
                .ok()
                .map(|content| FileEntry::new(rel, content))
        })
        .collect();
    import_from_entries(Path::new(&parent), &name, entries, VERSION, &now_iso())
        .map(|iw| {
            ProjectDto::from_workspace(Workspace {
                root: iw.root,
                project: iw.project,
            })
        })
        .map_err(|e| e.to_string())
}

/// Export the current project as a clean `.zip` bundle (strips `.galley/`).
///
/// Writes the archive to `dest` (an absolute path chosen by the user via the
/// save-file dialog). Returns the number of bytes written.
#[tauri::command]
fn export_bundle_to(root: String, dest: String) -> Result<u64, String> {
    let ws = import_open(Path::new(&root), VERSION, &now_iso()).map_err(|e| e.to_string())?;
    let bytes = export_clean_bundle(&ws).map_err(|e| e.to_string())?;
    let n = bytes.len() as u64;
    std::fs::write(Path::new(&dest), &bytes).map_err(|e| e.to_string())?;
    Ok(n)
}

/// Save raw PDF bytes to an absolute path chosen by the user.
///
/// The bytes come directly from the last compile result (held in the frontend)
/// so no re-compilation is needed.
#[tauri::command]
fn export_pdf_to(pdf_bytes: Vec<u8>, dest: String) -> Result<(), String> {
    std::fs::write(Path::new(&dest), &pdf_bytes).map_err(|e| e.to_string())
}

/// Run Pandoc to convert the project's root document to `format` and write the
/// output to `dest`.
///
/// `format` is a Pandoc `--to` target such as `"html5"`, `"docx"`, or
/// `"markdown"`. Returns an error when Pandoc is not found in `PATH` or exits
/// with a non-zero code (Pandoc's stderr is included in the error message).
#[tauri::command]
fn export_pandoc(
    root: String,
    root_document: String,
    format: String,
    dest: String,
) -> Result<(), String> {
    let input = Path::new(&root).join(&root_document);
    let output = std::process::Command::new("pandoc")
        .arg(&input)
        .arg("--to")
        .arg(&format)
        .arg("-o")
        .arg(&dest)
        .current_dir(&root)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "Pandoc is not installed — install it to enable HTML, Word, and Markdown export."
                    .to_string()
            } else {
                e.to_string()
            }
        })?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Pandoc failed: {stderr}"))
    }
}

/// Export a read-only share bundle (clean source + compiled PDF) to `dest`.
///
/// Strips `.galley/` metadata just like the source bundle and appends the
/// `pdf_bytes` as `<project-name>.pdf`. Returns the number of bytes written.
#[tauri::command]
fn export_share_bundle_to(root: String, pdf_bytes: Vec<u8>, dest: String) -> Result<u64, String> {
    let ws = import_open(Path::new(&root), VERSION, &now_iso()).map_err(|e| e.to_string())?;
    let bytes = export_share_bundle(&ws, &pdf_bytes).map_err(|e| e.to_string())?;
    let n = bytes.len() as u64;
    std::fs::write(Path::new(&dest), &bytes).map_err(|e| e.to_string())?;
    Ok(n)
}

/// A single entry in the history timeline, serialised for the frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotDto {
    id: String,
    name: String,
    date: String,
    is_named: bool,
    lines_added: usize,
    lines_removed: usize,
}

/// Record an automatic checkpoint on every save.
#[tauri::command]
fn vcs_auto_checkpoint(project_root: String, content: String) -> Result<String, String> {
    let mut h = Git2History::init_or_open(Path::new(&project_root)).map_err(|e| e.to_string())?;
    h.commit(&content, "auto").map_err(|e| e.to_string())
}

/// Create a user-named snapshot from the current document content.
#[tauri::command]
fn vcs_create_snapshot(
    project_root: String,
    content: String,
    name: String,
) -> Result<String, String> {
    let mut h = Git2History::init_or_open(Path::new(&project_root)).map_err(|e| e.to_string())?;
    h.commit(&content, &name).map_err(|e| e.to_string())
}

/// Return the history timeline for the active document, most-recent first.
#[tauri::command]
fn vcs_list_checkpoints(project_root: String) -> Vec<SnapshotDto> {
    let h = match Git2History::init_or_open(Path::new(&project_root)) {
        Ok(h) => h,
        Err(_) => return Vec::new(),
    };
    h.list()
        .into_iter()
        .map(|e| SnapshotDto {
            id: e.id,
            name: e.name,
            date: e.date,
            is_named: e.is_named,
            lines_added: e.lines_added,
            lines_removed: e.lines_removed,
        })
        .collect()
}

/// Retrieve the document content stored at the given checkpoint id.
#[tauri::command]
fn vcs_get_content(project_root: String, checkpoint_id: String) -> Option<String> {
    Git2History::init_or_open(Path::new(&project_root))
        .ok()
        .and_then(|h| h.get_content(&checkpoint_id))
}

/// A sandbox report as sent to the UI.
#[derive(Serialize)]
struct SandboxReportDto {
    shell_escape: Vec<String>,
    traversal_inputs: Vec<String>,
}

/// Scan `source` for shell-escape and `\input` path traversal patterns.
///
/// Returns a report the UI can display as a pre-compile warning. Findings do
/// not block compilation — the embedded Tectonic engine already disables
/// shell-escape — but they surface suspicious constructs to the author.
#[tauri::command]
fn scan_document_source(source: String) -> SandboxReportDto {
    let report = scan_source(&source);
    SandboxReportDto {
        shell_escape: report.shell_escape,
        traversal_inputs: report.traversal_inputs,
    }
}

/// Build and run the Galley desktop application.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CompilerState::new())
        .manage(IntelState::new())
        .manage(SyncTexState::new())
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
            lsp_diagnostics,
            synctex_forward,
            synctex_inverse,
            copy_asset,
            list_assets,
            lookup_reference,
            get_ai_config,
            set_ai_config,
            store_ai_key,
            remove_ai_key,
            get_project_consent,
            set_project_consent,
            test_ai_provider,
            send_ai_completion,
            vcs_auto_checkpoint,
            vcs_create_snapshot,
            vcs_list_checkpoints,
            vcs_get_content,
            import_analyze_archive,
            import_from_archive,
            import_analyze_folder,
            import_from_folder,
            export_bundle_to,
            export_pdf_to,
            export_pandoc,
            export_share_bundle_to,
            scan_document_source,
            check_latest_release
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Galley application");
}
