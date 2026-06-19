//! MCP (Model Context Protocol) tool surface for Galley agents.
//!
//! Defines the tool names exposed to agents, the permission model that
//! restricts which tools each agent role may invoke, and the `McpRouter`
//! that validates calls before they reach the Tauri command layer.
//!
//! No I/O lives here — every type is pure and exercised to 100% coverage
//! by the unit tests at the bottom of this file.

use galley_core::agents::AgentRole;

/// The tools available in the Galley MCP tool surface.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpToolName {
    /// Read a project file by its project-relative path.
    ReadFile,
    /// Search the project's source files for a pattern.
    SearchProject,
    /// Compile the current document and return the result.
    Compile,
    /// Read the most recent compile diagnostics (errors / warnings).
    ReadDiagnostics,
    /// Look up a DOI or arXiv identifier and return a BibTeX entry.
    LookupReference,
    /// Apply an accepted patch to the document source.
    ApplyPatch,
    /// List files in the project's asset directory.
    ListAssets,
}

impl McpToolName {
    /// The kebab-case identifier used in `[TOOL:<name>]` markup.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadFile => "read-file",
            Self::SearchProject => "search-project",
            Self::Compile => "compile",
            Self::ReadDiagnostics => "read-diagnostics",
            Self::LookupReference => "lookup-reference",
            Self::ApplyPatch => "apply-patch",
            Self::ListAssets => "list-assets",
        }
    }

    /// Parse a kebab-case string into a `McpToolName`.
    /// Returns `None` for unrecognised values.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "read-file" => Some(Self::ReadFile),
            "search-project" => Some(Self::SearchProject),
            "compile" => Some(Self::Compile),
            "read-diagnostics" => Some(Self::ReadDiagnostics),
            "lookup-reference" => Some(Self::LookupReference),
            "apply-patch" => Some(Self::ApplyPatch),
            "list-assets" => Some(Self::ListAssets),
            _ => None,
        }
    }

    /// A one-line description of what this tool does.
    pub fn description(self) -> &'static str {
        match self {
            Self::ReadFile => "Read a project-relative source file.",
            Self::SearchProject => "Search all .tex files for a pattern.",
            Self::Compile => "Compile the document and return the log.",
            Self::ReadDiagnostics => "Return the current compile error/warning list.",
            Self::LookupReference => "Fetch a BibTeX entry for a DOI or arXiv id.",
            Self::ApplyPatch => "Apply a reviewed source patch.",
            Self::ListAssets => "List files in the project assets directory.",
        }
    }
}

/// A tool call request issued by an agent.
#[derive(Debug, Clone, PartialEq)]
pub struct McpToolCall {
    /// Which tool is being requested.
    pub name: McpToolName,
    /// The argument string (e.g. a file path, a search query, or a DOI).
    pub arg: String,
}

impl McpToolCall {
    /// Construct a tool call with the given name and argument.
    pub fn new(name: McpToolName, arg: impl Into<String>) -> Self {
        Self {
            name,
            arg: arg.into(),
        }
    }
}

/// The set of MCP tools a specific agent is permitted to use.
#[derive(Debug, Clone, PartialEq)]
pub struct ToolPermissions {
    allowed: Vec<McpToolName>,
}

impl ToolPermissions {
    /// Construct a permission set from a list of allowed tools.
    pub fn new(allowed: Vec<McpToolName>) -> Self {
        Self { allowed }
    }

    /// Construct a permission set that allows all tools.
    pub fn all() -> Self {
        Self::new(vec![
            McpToolName::ReadFile,
            McpToolName::SearchProject,
            McpToolName::Compile,
            McpToolName::ReadDiagnostics,
            McpToolName::LookupReference,
            McpToolName::ApplyPatch,
            McpToolName::ListAssets,
        ])
    }

    /// Construct an empty permission set (no tools allowed).
    pub fn none() -> Self {
        Self::new(vec![])
    }

    /// Returns `true` when `name` is in the allowed set.
    pub fn is_allowed(&self, name: McpToolName) -> bool {
        self.allowed.contains(&name)
    }

    /// Read-only view of the allowed tool list.
    pub fn allowed_tools(&self) -> &[McpToolName] {
        &self.allowed
    }

    /// Return the default permissions for the given agent role.
    ///
    /// Each role receives the minimal set it genuinely needs:
    /// - The Orchestrator sees nothing (it only plans, never tools).
    /// - The Reviewer reads source and diagnostics; it never writes.
    /// - Other agents get read + their specialist write tool.
    pub fn for_role(role: AgentRole) -> Self {
        match role {
            AgentRole::Orchestrator => Self::none(),
            AgentRole::Writer => Self::new(vec![
                McpToolName::ReadFile,
                McpToolName::SearchProject,
                McpToolName::ApplyPatch,
            ]),
            AgentRole::CompileFixer => Self::new(vec![
                McpToolName::ReadFile,
                McpToolName::Compile,
                McpToolName::ReadDiagnostics,
                McpToolName::ApplyPatch,
            ]),
            AgentRole::CitationLibrarian => Self::new(vec![
                McpToolName::ReadFile,
                McpToolName::LookupReference,
                McpToolName::ApplyPatch,
            ]),
            AgentRole::FigureWright => Self::new(vec![
                McpToolName::ReadFile,
                McpToolName::ListAssets,
                McpToolName::ApplyPatch,
            ]),
            AgentRole::Stylist => Self::new(vec![McpToolName::ReadFile, McpToolName::ApplyPatch]),
            AgentRole::Reviewer => Self::new(vec![
                McpToolName::ReadFile,
                McpToolName::SearchProject,
                McpToolName::ReadDiagnostics,
            ]),
        }
    }
}

/// Routes and validates agent tool calls.
///
/// The router checks every call against the `ToolPermissions` it was built
/// with, enforcing the principle of least privilege: an agent only sees the
/// tools it genuinely needs. No I/O happens here; the caller executes the
/// tool call only after the router has approved it.
#[derive(Debug, Clone)]
pub struct McpRouter {
    permissions: ToolPermissions,
}

impl McpRouter {
    /// Build a router with the given permissions.
    pub fn new(permissions: ToolPermissions) -> Self {
        Self { permissions }
    }

    /// Build a router with the default permissions for the given role.
    pub fn for_role(role: AgentRole) -> Self {
        Self::new(ToolPermissions::for_role(role))
    }

    /// Returns `true` when the call is permitted by the current permissions.
    pub fn is_permitted(&self, call: &McpToolCall) -> bool {
        self.permissions.is_allowed(call.name)
    }

    /// Read-only access to the underlying permissions.
    pub fn permissions(&self) -> &ToolPermissions {
        &self.permissions
    }
}

/// Parse a `[TOOL:<name> <arg>]` markup token from an agent response.
///
/// Returns `None` when no valid tool call is found, or when the tool name
/// is not recognised. Only the first such token in `response` is extracted.
pub fn parse_tool_call(response: &str) -> Option<McpToolCall> {
    let start = response.find("[TOOL:")?;
    let rest = &response[start + 6..];
    let end = rest.find(']')?;
    let inner = rest[..end].trim();
    if inner.is_empty() {
        return None;
    }
    let (name_str, arg) = match inner.find(' ') {
        Some(sp) => (&inner[..sp], inner[sp + 1..].trim()),
        None => (inner, ""),
    };
    let name = McpToolName::parse(name_str)?;
    Some(McpToolCall::new(name, arg))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_tool_names() -> [McpToolName; 7] {
        [
            McpToolName::ReadFile,
            McpToolName::SearchProject,
            McpToolName::Compile,
            McpToolName::ReadDiagnostics,
            McpToolName::LookupReference,
            McpToolName::ApplyPatch,
            McpToolName::ListAssets,
        ]
    }

    // ── McpToolName ───────────────────────────────────────────────────────────

    #[test]
    fn tool_name_as_str_round_trips_through_parse() {
        for name in all_tool_names() {
            assert_eq!(
                McpToolName::parse(name.as_str()),
                Some(name),
                "round-trip failed for {name:?}"
            );
        }
    }

    #[test]
    fn tool_name_parse_unknown_returns_none() {
        assert_eq!(McpToolName::parse(""), None);
        assert_eq!(McpToolName::parse("unknown"), None);
        assert_eq!(McpToolName::parse("ReadFile"), None); // case-sensitive
    }

    #[test]
    fn tool_name_description_is_non_empty() {
        for name in all_tool_names() {
            assert!(
                !name.description().is_empty(),
                "{name:?} description is empty"
            );
        }
    }

    #[test]
    fn tool_name_debug_eq_copy() {
        let a = McpToolName::ReadFile;
        let b = a;
        assert_eq!(a, b);
        assert_ne!(a, McpToolName::Compile);
        assert!(format!("{a:?}").contains("ReadFile"));
    }

    // ── McpToolCall ───────────────────────────────────────────────────────────

    #[test]
    fn tool_call_new_stores_fields() {
        let c = McpToolCall::new(McpToolName::ReadFile, "main.tex");
        assert_eq!(c.name, McpToolName::ReadFile);
        assert_eq!(c.arg, "main.tex");
    }

    #[test]
    fn tool_call_eq_clone_debug() {
        let a = McpToolCall::new(McpToolName::Compile, "");
        let b = a.clone();
        assert_eq!(a, b);
        assert_ne!(a, McpToolCall::new(McpToolName::ListAssets, ""));
        assert!(format!("{a:?}").contains("McpToolCall"));
    }

    // ── ToolPermissions ───────────────────────────────────────────────────────

    #[test]
    fn tool_permissions_all_allows_every_tool() {
        let p = ToolPermissions::all();
        for name in all_tool_names() {
            assert!(p.is_allowed(name), "{name:?} should be allowed");
        }
    }

    #[test]
    fn tool_permissions_none_denies_every_tool() {
        let p = ToolPermissions::none();
        for name in all_tool_names() {
            assert!(!p.is_allowed(name), "{name:?} should be denied");
        }
    }

    #[test]
    fn tool_permissions_new_allows_only_listed_tools() {
        let p = ToolPermissions::new(vec![McpToolName::ReadFile, McpToolName::Compile]);
        assert!(p.is_allowed(McpToolName::ReadFile));
        assert!(p.is_allowed(McpToolName::Compile));
        assert!(!p.is_allowed(McpToolName::ApplyPatch));
    }

    #[test]
    fn tool_permissions_allowed_tools_matches_constructor() {
        let names = vec![McpToolName::LookupReference, McpToolName::ListAssets];
        let p = ToolPermissions::new(names.clone());
        assert_eq!(p.allowed_tools(), names.as_slice());
    }

    #[test]
    fn tool_permissions_eq_clone_debug() {
        let a = ToolPermissions::all();
        let b = a.clone();
        assert_eq!(a, b);
        assert_ne!(a, ToolPermissions::none());
        assert!(format!("{a:?}").contains("ToolPermissions"));
    }

    #[test]
    fn for_role_orchestrator_has_no_tools() {
        let p = ToolPermissions::for_role(AgentRole::Orchestrator);
        assert!(p.allowed_tools().is_empty());
    }

    #[test]
    fn for_role_writer_allows_read_search_patch() {
        let p = ToolPermissions::for_role(AgentRole::Writer);
        assert!(p.is_allowed(McpToolName::ReadFile));
        assert!(p.is_allowed(McpToolName::SearchProject));
        assert!(p.is_allowed(McpToolName::ApplyPatch));
        assert!(!p.is_allowed(McpToolName::Compile));
    }

    #[test]
    fn for_role_compile_fixer_allows_compile_diagnostics_patch() {
        let p = ToolPermissions::for_role(AgentRole::CompileFixer);
        assert!(p.is_allowed(McpToolName::Compile));
        assert!(p.is_allowed(McpToolName::ReadDiagnostics));
        assert!(p.is_allowed(McpToolName::ApplyPatch));
        assert!(!p.is_allowed(McpToolName::LookupReference));
    }

    #[test]
    fn for_role_citation_librarian_allows_lookup_patch() {
        let p = ToolPermissions::for_role(AgentRole::CitationLibrarian);
        assert!(p.is_allowed(McpToolName::LookupReference));
        assert!(p.is_allowed(McpToolName::ApplyPatch));
        assert!(!p.is_allowed(McpToolName::Compile));
    }

    #[test]
    fn for_role_figure_wright_allows_assets_patch() {
        let p = ToolPermissions::for_role(AgentRole::FigureWright);
        assert!(p.is_allowed(McpToolName::ListAssets));
        assert!(p.is_allowed(McpToolName::ApplyPatch));
        assert!(!p.is_allowed(McpToolName::LookupReference));
    }

    #[test]
    fn for_role_stylist_allows_read_patch() {
        let p = ToolPermissions::for_role(AgentRole::Stylist);
        assert!(p.is_allowed(McpToolName::ReadFile));
        assert!(p.is_allowed(McpToolName::ApplyPatch));
        assert!(!p.is_allowed(McpToolName::ListAssets));
    }

    #[test]
    fn for_role_reviewer_allows_read_search_diagnostics_but_not_patch() {
        let p = ToolPermissions::for_role(AgentRole::Reviewer);
        assert!(p.is_allowed(McpToolName::ReadFile));
        assert!(p.is_allowed(McpToolName::SearchProject));
        assert!(p.is_allowed(McpToolName::ReadDiagnostics));
        assert!(!p.is_allowed(McpToolName::ApplyPatch));
    }

    // ── McpRouter ─────────────────────────────────────────────────────────────

    #[test]
    fn router_permits_allowed_call() {
        let r = McpRouter::new(ToolPermissions::all());
        assert!(r.is_permitted(&McpToolCall::new(McpToolName::ReadFile, "x")));
    }

    #[test]
    fn router_denies_disallowed_call() {
        let r = McpRouter::new(ToolPermissions::none());
        assert!(!r.is_permitted(&McpToolCall::new(McpToolName::ReadFile, "x")));
    }

    #[test]
    fn router_for_role_builds_correct_permissions() {
        let r = McpRouter::for_role(AgentRole::Reviewer);
        assert!(r.is_permitted(&McpToolCall::new(McpToolName::ReadFile, "")));
        assert!(!r.is_permitted(&McpToolCall::new(McpToolName::ApplyPatch, "")));
    }

    #[test]
    fn router_permissions_accessor() {
        let r = McpRouter::new(ToolPermissions::none());
        assert!(r.permissions().allowed_tools().is_empty());
    }

    #[test]
    fn router_debug_clone() {
        let r = McpRouter::for_role(AgentRole::Writer);
        let s = r.clone();
        assert!(r.is_permitted(&McpToolCall::new(McpToolName::ReadFile, "")));
        assert!(s.is_permitted(&McpToolCall::new(McpToolName::ReadFile, "")));
        assert!(format!("{r:?}").contains("McpRouter"));
    }

    // ── parse_tool_call ───────────────────────────────────────────────────────

    #[test]
    fn parse_tool_call_extracts_name_and_arg() {
        let r = parse_tool_call("I will [TOOL:read-file main.tex] now.");
        assert_eq!(r, Some(McpToolCall::new(McpToolName::ReadFile, "main.tex")));
    }

    #[test]
    fn parse_tool_call_no_arg_gives_empty_string() {
        let r = parse_tool_call("[TOOL:compile]");
        assert_eq!(r, Some(McpToolCall::new(McpToolName::Compile, "")));
    }

    #[test]
    fn parse_tool_call_unknown_name_returns_none() {
        let r = parse_tool_call("[TOOL:magic-wand foo]");
        assert!(r.is_none());
    }

    #[test]
    fn parse_tool_call_no_marker_returns_none() {
        let r = parse_tool_call("just normal text");
        assert!(r.is_none());
    }

    #[test]
    fn parse_tool_call_empty_inner_returns_none() {
        let r = parse_tool_call("[TOOL:]");
        assert!(r.is_none());
    }

    #[test]
    fn parse_tool_call_no_closing_bracket_returns_none() {
        let r = parse_tool_call("[TOOL:read-file main.tex");
        assert!(r.is_none());
    }

    #[test]
    fn parse_tool_call_extracts_first_occurrence_only() {
        let r = parse_tool_call("[TOOL:read-file a.tex] [TOOL:compile]");
        assert_eq!(r, Some(McpToolCall::new(McpToolName::ReadFile, "a.tex")));
    }

    #[test]
    fn parse_tool_call_multi_word_arg() {
        let r = parse_tool_call("[TOOL:lookup-reference 10.1145/12345]");
        assert_eq!(
            r,
            Some(McpToolCall::new(
                McpToolName::LookupReference,
                "10.1145/12345"
            ))
        );
    }
}
