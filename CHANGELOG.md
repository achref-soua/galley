# Changelog

All notable changes to Galley are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.3] - 2026-06-20

Template gallery: curated starters and user-saved templates.

### Added

- **`templates.ts`** — 12 curated built-in templates covering the most common LaTeX document
  types: Article, IEEE Conference Paper, ACM Conference Paper (acmart), Springer LNCS, Beamer
  presentation, moderncv résumé, Cover Letter, Report, PhD Thesis, Book, tikzposter Poster, and
  Exam. Each is a complete, compilable document. 100 % Vitest covered; correctness asserted at the
  structural level (every body has `\documentclass`, `\begin{document}`, `\end{document}`).
- **`TemplateGallery.svelte`** — full-screen modal gallery with a category sidebar, search field,
  template cards ("Use template" + per-custom "Delete"), and a footer save-form for committing the
  currently open document as a new custom template. All branches covered (100 %).
- **`CustomTemplateStore`** — localStorage-backed store for user-saved templates, following the
  same pure-helper + class pattern as `ProjectRegistry`. `parseCustomTemplates` validates every
  field with short-circuit guards, all covered. Persisted under `galley:custom-templates`.
- **`ProjectController.pickAndCreateFromTemplate`** — new method that presents the folder picker,
  creates the project, seeds `main.tex` with the template body, and loads the result. Tested with
  null-cancel and happy-path cases.
- **`ProjectDashboard` "From template…" button** — opens the gallery; wired alongside the
  existing New project… / Import… / New window actions.
- **Command palette "New from Template" action** — opens the gallery from anywhere.
- **ADR-0026** documenting the gallery design, data model, entry points, and the "new from
  template" flow.

## [0.6.2] - 2026-06-20

Project organization: registry, multi-window backend, and dashboard.

### Added

- **`ProjectRegistry`** — localStorage-backed store for all known projects. Persists name, root
  path, tags, and last-opened timestamp. Supports upsert, remove, full-text search, tag-based
  filtering, `addTag` / `removeTag`, and returns projects sorted by recency. 100 % Vitest covered.
- **`WindowBackend` interface** — injectable abstraction over `tauriWindowBackend` (opens a new
  Tauri window) and `browserWindowBackend` (no-op for tests). `selectWindowBackend()` picks the
  correct implementation at runtime. 100 % Vitest covered including the Tauri branch.
- **`ProjectDashboard.svelte`** — full-screen overlay showing all registered projects as cards with
  name, last-opened date, root path, and per-card tag chips. Supports live search, tag-filter pills,
  tag add/remove inline, open/remove actions, and header buttons (New project…, Import…, New
  window). Reactive via `generation` counter pattern. 100 % Vitest covered (32 tests).
- **`App.svelte` wiring** — command palette action "All Projects" toggles the dashboard; opening a
  project registers it in the registry; dashboard callbacks dispatch to existing open/new/import
  flows. Sidebar gains an optional `onimport` prop to surface the Import… entry.

### Fixed

- Bumped `galley-desktop` crate version (`apps/desktop/src-tauri/Cargo.toml`) from 0.6.0 to 0.6.2
  (the 0.6.1 release had inadvertently left this file at 0.6.0).

## [0.6.1] - 2026-06-20

Project import wizard: ZIP, tarball, and folder ingestion.

### Added

- **`galley-import` crate** — hardened archive extraction (`extract_zip`, `extract_tarball`) plus
  project-level operations (`create_project`, `open_folder`, `import_from_entries`,
  `export_clean_bundle`). Security: zip-slip, symlinks, hard-links, path traversal, file-count,
  per-file size, and total-size limits all enforced before anything touches disk. 100 % LLVM
  region / function / line coverage (57 unit tests, crafted archive fuzzers, `FailAfterHeaderRead`
  mock reader).
- **`galley-core::import`** — pure analysis layer: `analyze_project` detects root document,
  compile engine (`pdflatex`, `xelatex`, `lualatex`), bibtool (`bibtex`, `biber`), encoding,
  packages, and fonts from a `Vec<FileEntry>` without I/O. `clean_export_paths` strips `.galley/`
  from export bundles. 43 unit tests, 100 % covered.
- **Tauri commands** — `analyze_archive`, `analyze_folder`, `import_from_archive`,
  `import_from_folder`, `export_bundle_to` wired in `src-tauri/src/lib.rs`.
- **`import-backend.ts`** — `ImportBackend` interface with `tauriImportBackend()` (production),
  `browserImportBackend()` (tests), and `selectImportBackend()`. 100 % Vitest covered (22 tests).
- **`ImportWizard.svelte`** — three-step modal (choose source → preview analysis → confirm name
  and destination). Handles ZIP, `.tar.gz`, and local folder sources; pre-fills project name from
  filename; shows engine, bibliography tool, encoding, packages, fonts, and warnings. 100 % Vitest
  covered (21 tests).
- **`Sidebar.svelte`** — "Import project" button opens the wizard; `onimport` callback triggers
  `loadProject` in `App.svelte`.
- **ADR-0024** — documents the `Box<dyn Read>` / concrete-Cursor approach to 100 % LLVM region
  coverage in generic extraction functions, the `ImportBackend` seam, and the Svelte 5
  phantom-branch avoidance pattern.

## [0.6.0] - 2026-06-20

Git-backed version history.

### Added

- **`galley-core::vcs`** — pure LCS-based diff algorithm (`compute_diff`, `snapshot_stats`,
  `DiffKind`, `DiffLine`, `SnapshotEntry`). 100 % llvm-cov covered (30+ tests).
- **`galley-vcs`** — new crate: `CheckpointHistory` trait + `InMemoryHistory` (always compiled,
  100 % covered) + `Git2History` (behind `real-vcs` feature, `#[ignore]`d integration tests via
  `just vcs-itest`). Commits to `refs/galley/checkpoints` inside the project repo using `git2`.
- **Tauri commands** — `vcs_auto_checkpoint`, `vcs_create_snapshot`, `vcs_list_checkpoints`,
  `vcs_get_content` expose git-backed history to the frontend.
- **`vcs.ts`** — TypeScript port of the LCS diff (`computeDiff`, `diffStats`, `SnapshotEntry`).
  100 % Vitest covered (17 tests).
- **`vcs-backend.ts`** — `VcsBackend` interface with `tauriVcsBackend()` (production),
  `browserVcsBackend()` (tests / Playwright), and `selectVcsBackend()`. 100 % covered.
- **`HistoryPanel.svelte`** — sidebar panel: checkpoint timeline (most-recent first), compact
  added/removed diff viewer, Revert button, named-snapshot form. 100 % covered.
- **Auto-checkpoint on save** — `handleSave` in `App.svelte` creates a checkpoint on every
  successful document save; `refreshHistory` updates the panel.
- **ADR-0023** — documents the `refs/galley/checkpoints` design and the `CheckpointHistory`
  trait-seam pattern.

## [0.5.3] - 2026-06-20

Autonomous agent mode with in-memory checkpoints and revert.

### Added

- **`autonomous.ts`** — pure, I/O-free helpers for autonomous sessions: `createCheckpoint`,
  `applyCheckpoint` (reverse-scan, returns most-recent match), `newLoopState`, `canContinueLoop`,
  `advanceLoop` (immutable loop-bounding state), `isNetworkTool`, and `networkPermissionMessage`.
  100 % Vitest covered (21 tests).
- **`galley-core::checkpoint`** — Rust domain mirror: `Checkpoint { name, content }` and
  `CheckpointStore` (`push`, `revert_to`, `names`, `len`, `is_empty`). 100 % llvm-cov covered.
- **`AgentPanel.svelte` — autonomous mode** — opt-in via `autonomous?: boolean` prop:
  - Patches applied directly to `runningContent` (local variable, not the Svelte prop) and
    emitted via `onautonapply?(newContent)` instead of queueing a review entry.
  - `CheckpointEntry[]` state tracks each successful patch; a checkpoints panel renders below
    the log with a "Revert" button per entry.
  - "Autonomous" badge shown in the panel header.
  - **Compile-fix loop bounding**: `LoopState` counts compile-fixer iterations; breaks and logs
    `[Limit]` when `iteration >= maxFixIterations` (default 3, configurable via prop).
  - **Network permission prompts**: `lookup_reference` gated behind `networkrequest(tool, arg)`
    callback; call skipped and `[Denied]` logged when callback returns `false`.
  - Stop-in-flight guard extended to the tool-dispatch `await` site (line 101 branch).
- **`App.svelte`** — `agentAutonomous?: boolean` prop (injectable for test coverage),
  `agentProjectTitle` `$state` computed in the project `$effect`, `handleAutoApply` wired to
  `projectController.edit`, and `onautonapply={handleAutoApply}` on `AgentPanel`.
- **ADR-0022** — documents the in-memory checkpoint model, `runningContent` tracking,
  loop-bounding design, network permission gate, and deferred git-backed persistence.

### Changed

- All version touchpoints bumped to 0.5.3 (workspace `Cargo.toml`,
  `apps/desktop/src-tauri/Cargo.toml`, `tauri.conf.json`, `apps/desktop/package.json`,
  `packages/ui-kit/package.json`).

## [0.5.2] - 2026-06-20

Specialized agents and MCP tool host.

### Added

- **`galley-core::agents`** — pure domain types and helpers: `AgentRole` (7 variants),
  `AgentTask`, `AgentPlan`, `plan_goal` (keyword-based planner, no I/O), and
  `parse_plan_response` (`[AGENT:X] [TASK:Y]` line parser). 100 % llvm-cov covered.
- **`galley-ai::mcp`** — `McpTool` enum (7 tools: `ReadFile`, `SearchProject`, `Compile`,
  `ReadDiagnostics`, `LookupReference`, `ApplyPatch`, `ListAssets`), `McpToolResult`, and
  `ToolPermissions::for_role` (least-privilege access per `AgentRole`). 100 % covered.
- **`agents.ts`** — TypeScript orchestration helpers: `AgentRole` type, `agentLabel`,
  `agentSystemPrompt`, `buildOrchestratorPrompt`, `buildAgentPrompt`, `parseSteps`, and
  `parseToolCall`. 100 % Vitest covered (29 tests).
- **`agent-backend.ts`** — `AgentToolBackend` interface, `tauriAgentToolBackend` (Tauri
  wrappers for all 7 MCP tools), `browserAgentToolBackend` (deterministic stubs for test /
  offline use), `selectAgentToolBackend`, and `dispatchTool` (strict switch + unknown-tool
  guard). 100 % covered (30 tests).
- **`AgentPanel.svelte`** — Agents side-panel: plain-language goal input, Run / Stop controls,
  live `aria-live` log. Orchestrates goal → orchestrator plan → per-agent step loop → patch
  emission via `onpatch` → ReviewEntry queue. Stop-in-flight via generation counter (same
  pattern as AiChatPanel). 100 % covered (16 tests).
- **`App.svelte`** — `agentsOpen` state, `toggle-agents` command palette action, `AgentPanel`
  mounted inside `{#if agentsOpen}`.
- **ADR-0021** — documents the two-layer markup protocol, keyword-based planner, permission
  layer, `apply_patch` intercept, and stop-in-flight design.
- **`docs/ai/agents.md`** — product documentation for the agent system.

### Changed

- All version touchpoints bumped to 0.5.2 (workspace `Cargo.toml`, `apps/desktop/src-tauri/Cargo.toml`,
  `tauri.conf.json`, `apps/desktop/package.json`, `packages/ui-kit/package.json`).

## [0.5.1] - 2026-06-20

AI chat assistant panel (suggest mode).

### Added

- **`galley-core::assistant`** — pure domain types and prompt construction: `ChatRole`,
  `ChatMessage`, `ChatThread`, `ChatIntent` (Explain / FixError / Transform), and
  `build_chat_prompt`. 100 % llvm-cov covered, no I/O.
- **`assistant.ts`** — TypeScript mirror: `PanelMessage`, three intent-based prompt builders,
  `parsePatches` (extracts `` ```latex ``` `` blocks from an AI response), and `locatePatch`
  (maps a before/after pair to a `ReviewEntry` by searching document content).
- **`AiChatPanel.svelte`** — chat side-panel with intent tabs (Explain / Fix Error / Transform),
  message history, stop-in-flight via a generation counter, and automatic patch proposal via
  the existing ReviewEntry queue. All AI-proposed edits require author accept/reject — no silent
  writes.
- **Titlebar** — "Open / Close assistant" `IconButton` with `pressed` state and `ontogglechat`
  callback. New `chat` icon added to `@galley/ui-kit`.
- **`App.svelte`** — `chatOpen` state, `handleAiPatch` handler, `toggle-assistant` command
  palette action, `AiChatPanel` mounted inside `{#if chatOpen}`.
- **ADR-0020** — documents the suggest-mode design, patch-flow, stop mechanism, and scope limits.

### Changed

- `chatProjectRoot` computed via `$effect` alongside `searchRoot` to keep both null and
  non-null branches reachable for coverage.

## [0.5.0] - 2026-06-19

AI settings & provider gateway.

### Added

- **`galley-core::ai`** — pure domain types: `Provider`, `ProviderConfig`, `GatewayConfig`,
  `LlmMessage`, `LlmRequest`, `LlmResponse`, `LlmError`, `ProjectAiConsent`, `LlmProvider` trait.
  All types are Clone + PartialEq; 100 % covered with no serde derives.
- **`galley-ai`** — `ProviderGateway<P>` — provider-agnostic routing and policy enforcement.
  Enforces per-project consent gate, active-provider selection, and global local-only policy.
- **`src-tauri::ai`** — file-based secret store (`secrets.json` at 0o600), AI config persistence
  (`ai.json`), per-project consent (`<project>/.galley/ai-consent.json`), `OpenAiAdapter`
  (ChatCompletions-compatible; also covers Ollama), `AnthropicAdapter` (Messages API), and
  `AnyAdapter` discriminated enum implementing `LlmProvider`.
- **8 new Tauri commands:** `get_ai_config`, `set_ai_config`, `store_ai_key`, `remove_ai_key`,
  `get_project_consent`, `set_project_consent`, `test_ai_provider`, `send_ai_completion`.
- **`ai-backend.ts`** — `AiBackend` interface with `tauriAiBackend()`, `browserAiBackend()`, and
  `selectAiBackend()` following the established backend-seam pattern.
- **`AiSettingsPanel.svelte`** — Settings "AI" section: policy toggles (local-only, per-project
  consent), provider list with active-provider selector, masked API key input with store/remove,
  and per-provider connectivity test button.
- **Settings.svelte** — new "AI" section added to the section list; `aiBackend` and `projectRoot`
  props wired through.
- **ADR-0019** — documents provider gateway design, the single-monomorphization mock pattern, the
  file-based secret store rationale, and the serde-free workspace constraint.

## [0.4.2] - 2026-06-19

Layout, drag/drop section reorder, image resize, and track-changes review queue.

### Added

- **`visual.ts`** — `SectionBlock` interface, `parseSectionBlocks`, `moveSectionBlock`,
  `CaptionSpec` interface, `parseCaptions`, `setCaption`, `parseImageWidth`,
  `setImageWidth`; all pure helpers covered at 100 %.
- **`review.ts`** — immutable `ReviewEntry` type and four pure operations:
  `createReviewEntry`, `applyReject`, `acceptEntries`, `rejectEntries`, `pendingCount`.
- **`ReviewPanel.svelte`** — sidebar panel rendering the pending review queue with
  before/after diff view and Accept/Reject actions per entry.
- **`OutlinePanel.svelte`** — new "Sections" drag list above includes/outline; HTML5
  Drag and Drop reorders sections via `parseSectionBlocks` + `moveSectionBlock`; summary
  text now includes section count.
- **`AssetPanel.svelte`** — "Resize inserted images" section with ½/¾/1× preset buttons
  for every `\includegraphics` found in the current document.
- **`Button.svelte`** — now accepts and forwards `aria-label` (a11y gap surfaced by
  ReviewPanel).
- **ADR-0018** — documents all design decisions for this release.

## [0.4.1] - 2026-06-19

Visual text and structure editing — the v0.4.0 read-only decoration layer becomes
writable. Every edit emits a minimal source patch via a CM6 transaction; the `.tex`
source remains canonical.

### Added

- **`visual.ts`** — editing helpers: `HEADING_ORDER` canonical array, `HeadingCmd` type,
  `lineHeadingCmd`, `promoteHeading`, `demoteHeading`, `VisualEdit` interface, `toggleBold`,
  `toggleItalic`, `isItemLine`; all pure and covered at 100 %.
- **`visualHeadingPromote` / `visualHeadingDemote`** — CM6 commands bound to Shift-Tab /
  Tab; return `false` on non-heading lines so Tab still indents and Shift-Tab still
  dedents in normal text.
- **`visualToggleBold` / `visualToggleItalic`** — CM6 commands bound to Ctrl/Cmd+B and
  Ctrl/Cmd+I; detect and unwrap existing `\textbf{…}`, `\textit{…}`, `\emph{…}` by
  inspecting source context around the selection.
- **`visualInsertItem`** — CM6 command bound to Enter; inserts a new `\item ` at the end
  of an `\item` line, preserving the line's leading whitespace; returns `false` otherwise.
- **`VISUAL_KEY_BINDINGS`** — exported binding array (Shift-Tab, Tab, Mod-b, Mod-i,
  Enter) installed at `Prec.highest` so visual commands take priority over `indentWithTab`
  and the default keymap, while still falling through when the guards return `false`.
- **`LatexEditor`** — four new methods: `toggleBold`, `toggleItalic`, `promoteHeading`,
  `demoteHeading`.
- **`FormatBar.svelte`** — floating toolbar visible only in visual mode; Bold, Italic,
  Promote, Demote buttons with keyboard-shortcut hints in their titles.
- **ADR-0017** — documents the visual editing architecture, `VisualEdit` interface rationale,
  `Prec.highest` key-priority strategy, and the Ctrl+B compile guard.

### Changed

- `App.svelte` — `FormatBar` mounted inside `.editor-stack` when `viewMode === 'visual'`;
  `isCompileShortcut` guarded with `&& viewMode === 'code'` so Ctrl+B in visual mode
  reaches the CM6 keymap instead of triggering a compile.
- `visualCompartment` now initialised with `visualExtensions()` (plugin + keybindings) in
  both the factory constructor and `setViewMode`.

---

## [0.4.0] - 2026-06-19

Rich-text view — a CM6 decoration layer that renders headings, emphasis, lists, links,
images, and math over the canonical `.tex` source as a read-only visual overlay, with an
instant code ↔ visual toggle.

### Added

- **`visual.ts`** — pure, CM6-free parse helpers (`parseHeadings`, `parseMarkup`,
  `parseItems`, `parseInlineMath`, `parseLinks`, `parseImages`) that return typed spec
  objects with `from`/`to` byte offsets; fully unit-tested at 100 % coverage with no DOM.
- **`BulletWidget` / `ChipWidget`** — CM6 `WidgetType` subclasses for replacing `\item`
  with a bullet glyph and inline-math / `\includegraphics` commands with read-only chips.
- **`buildVisualDecorations(doc)`** — builds the sorted, non-overlapping `DecorationSet`
  from all parse results, using `Decoration.replace`, `Decoration.mark`, and
  `Decoration.widget`; exported for direct unit testing.
- **`visualPlugin()`** — a CM6 `ViewPlugin` wrapping `buildVisualDecorations`; rebuilds
  on every document update.
- **Visual mode toggle** via a CM6 `Compartment` in `createLatexEditor`; exposes
  `setViewMode(mode)` on the `LatexEditor` interface for runtime reconfiguration without
  rebuilding the `EditorView`.
- **Titlebar toggle button** — a ghost `Button` with `aria-pressed` for the code ↔ visual
  toggle; disabled when no document is open; reachable from the command palette as
  "Toggle Visual Mode".
- **Onionskin and Carbon theme** styles for `.cm-visual-h1`–`.cm-visual-h6`,
  `.cm-visual-bold`, `.cm-visual-italic`, `.cm-visual-link`, `.cm-visual-bullet`,
  `.cm-visual-chip`, `.cm-visual-math`, `.cm-visual-image`.
- **`aria-pressed` support in `Button`** — the ui-kit `Button` component now forwards an
  optional `aria-pressed` prop to the underlying `<button>` for toggle semantics.
- **ADR-0016** — records the decoration-only approach and the alternatives considered.

## [0.3.4] - 2026-06-19

Bibliography — `.bib` management, DOI/arXiv reference lookup, citation completion, and
on-disk bibliography rendering.

### Added

- **`galley-core::bibliography`** — a pure, tolerant `.bib` parser/serializer (`parse_bib`,
  `serialize_bib`, `serialize_entry`) over `BibEntry`/`BibField`, plus `entry_summary`,
  `suggest_cite_key`, and `arxiv_atom_to_entry` (arXiv Atom → entry). BibTeX and biblatex both
  parse unchanged.
- **`bibliography.ts`** — a faithful TypeScript mirror of the parser/serializer for client-side
  use (`parseBib`, `serializeBib`, `serializeEntry`, `entryField`, `entrySummary`,
  `citeCandidates`), so the project's `.bib` files parse with no IPC round-trip.
- **Reference lookup** — a `lookup_reference` command resolves a DOI (via content negotiation)
  or an arXiv id (via the arXiv API) into a bibliography entry, keeping network egress in the
  Rust core. A `BibBackend` seam (`bib-backend.ts`) abstracts it for the browser and tests.
- **Citation completion** — typing inside a `\cite`-family argument (including biblatex's
  `\autocite`, `\textcite`, `\parencite`, `\nocite`, …) completes from the project's `.bib`
  keys, including entries added but not yet saved.
- **`BibPanel.svelte`** — a sidebar panel listing the project's references, a DOI/arXiv lookup
  form, a `.bib` import (for Zotero exports), and click-to-insert `\cite{…}`.
- **On-disk bibliography rendering** — `CompileRequest` now carries an optional project root,
  threaded into the embedded Tectonic engine as a `filesystem_root` so `.bib` bibliographies,
  `\input`-ed files, and on-disk images resolve during a compile, and the bibliography pass
  (bibtex/biber) runs automatically.

### Changed

- `ProjectController` parses the project's `.bib` files into its state on open, exposes
  `citeCandidates()`, and gains `addReference()` and `importBibText()` for managing references.
- The frontend `compile` seam now passes the project root so renders resolve sibling files.

## [0.3.3] - 2026-06-19

Math & tables — MathLive equation editor, symbol palette, and visual table builder.

### Added

- **`galley-core::math`** — pure Rust helpers: `wrap_inline(latex)` wraps in `$…$`;
  `wrap_display(latex)` wraps in `\[…\]`.
- **`galley-core::table`** — pure Rust table builders: `build_tabular(align, rows)` and
  `build_booktabs(align, header, rows)` emit well-formed LaTeX table environments.
- **`math.ts`** — TS mirrors of the Rust helpers (`wrapInline`, `wrapDisplay`).
- **`table.ts`** — TS table builders (`buildTabular`, `buildBooktabs`) with `Align` and
  `TableStyle` types.
- **`math-field.ts`** — `MathFieldHandle`/`MathFieldSetup` interfaces plus `realMathFieldSetup`,
  which dynamically imports MathLive and appends a `<math-field>` custom element. Fully injectable
  for tests without jsdom/MathLive compatibility issues.
- **`MathEditor.svelte`** — modal dialog: a MathLive equation editor with inline/display radio,
  Insert/Cancel actions, and Escape key handling. `setupField` prop allows test injection.
- **`SymbolPalette.svelte`** — collapsible accordion with 42 common LaTeX symbols across four
  groups (Greek, Operators, Relations, Arrows); clicking any symbol fires `oninsert`.
- **`TableBuilder.svelte`** — modal table builder: configurable column count (1–8) and row count
  (1–12), per-column alignment selects, header and data cell inputs, tabular/booktabs style
  toggle, live LaTeX preview, Insert/Cancel actions, and Escape key handling.
- **Titlebar** — two new toolbar buttons (∑ equation, ⊞ table) that open the respective modals;
  disabled when no document is open.
- **App.svelte** — wires `MathEditor`, `SymbolPalette`, and `TableBuilder` into the shell; adds
  `insert-equation` and `insert-table` command-palette actions; accepts injectable
  `mathFieldSetup` prop for tests.

## [0.3.2] - 2026-06-19

Assets & figures — image insertion workflow, collapsible asset panel, OS drag-and-drop, and `\graphicspath` banner.

### Added

- **`galley-core::assets`** — pure, I/O-free helpers: `figure_snippet(rel_path)` produces an
  `\includegraphics[width=\linewidth]{…}` command; `needs_graphicspath(source)` detects whether
  a document uses `\includegraphics` without a matching `\graphicspath` declaration.
- **`SafeRoot::write_bytes`** (`galley-security`) — a binary-safe complement to `write`; accepts
  `&[u8]` so image files can be copied into the sandbox with the same path-traversal and
  symlink-escape protections as text files.
- **Two new Tauri commands** (`copy_asset`, `list_assets`) write image files into an `assets/`
  sub-directory of the project root (via `SafeRoot::write_bytes`) and enumerate them for the
  sidebar panel.
- **`assets.ts`** — TS-side helpers mirroring `galley-core::assets`: `isImageExt`, `assetSnippet`,
  `needsGraphicspath`, `insertGraphicspath`.
- **`asset-backend.ts`** — `AssetBackend` interface with `tauriAssetBackend` (invokes the Tauri
  commands), `browserAssetBackend` (in-memory Map, for tests), and `selectAssetBackend(win)`
  (auto-detects environment). Injectable via the `assetBackend` prop on `App`.
- **`AssetPanel.svelte`** — collapsible sidebar panel that lists all files under `assets/`; shows
  an `img` badge for recognized image extensions; clicking an asset calls `oninsert` with the
  corresponding `\includegraphics` snippet; the `+` button opens the OS file picker; the panel
  is only rendered when a project is open.
- **`LatexEditor.insertAtCursor`** — new method on the editor interface and `createLatexEditor`;
  dispatches a `replaceSelection` transaction so pasted snippets land at the cursor.
- **OS drag-and-drop** on the editor area: dropping an image or PDF file copies it into
  `assets/` and inserts the snippet at the cursor.
- **`\graphicspath` banner** — appears above the editor when the open document uses
  `\includegraphics` but has no `\graphicspath` declaration; "Add" inserts
  `\graphicspath{{assets/}}` before `\begin{document}` and dismisses the banner; "Dismiss"
  hides it without editing.

### Internal

- `fakeEditorFactory` in `tests/setup.ts` implements `insertAtCursor` so integration tests
  can verify snippet injection without CodeMirror.

## [0.3.1] - 2026-06-19

Preview polish — page navigation, zoom selector, synced scroll, and scroll-fraction propagation from the editor.

### Added

- **Page navigation** in the viewer bar: Previous/Next buttons step through multi-page PDFs;
  buttons are disabled at the first and last pages. `currentPage` resets to 1 whenever a new
  PDF arrives (e.g., after a recompile).
- **Zoom selector** in the viewer bar: a `<select>` offering 100% / 125% / 150% / 200%;
  defaults to 150%. Changing zoom re-renders the current page at the new scale immediately.
- **Synced scroll** — editor → PDF pane: an `onscroll` callback in `createLatexEditor`
  (via `EditorView.domEventHandlers`) fires with a 0–1 scroll fraction on every CM6 scroll
  event; `EditorPane` forwards it via the `oneditorscroll` prop; `App.svelte` stores
  `editorScrollFraction`; `PreviewPane` uses a `syncScroller` Svelte action to set
  `scrollTop` proportionally when `syncScroll` is enabled.
- **Settings → Preview section** with a "Sync scroll" `Toggle`; preference persisted in
  `galley:preview-prefs` via `PreviewPrefsStore` (defined in v0.3.0, now wired to the UI).
- `PreviewPrefsStore` wired into `App.svelte` (`changeSyncScroll`, `previewPrefs` reactive
  state, subscriber); `syncScroll` and `editorScrollFraction` threaded through to
  `PreviewPane`; `syncScroll` threaded through to `Settings`.

### Changed

- `renderProof` Svelte action now accepts a `ProofInput { bytes, page, scale }` bundle
  instead of raw bytes, so page and zoom changes trigger the action's `update` callback.
- `handleCanvasClick` passes `currentPage` (not hardcoded `1`) to `oninversesearch`.
- `pageLabel` derived now reflects `currentPage` instead of always showing `1`.

### Internal

- `SyncTexBox` highlight SVG overlay now uses `zoomScale` variable instead of the removed
  `SCALE` constant.

## [0.3.0] - 2026-06-19

SyncTeX bidirectional navigation — forward search (Ctrl+Enter: cursor → PDF highlight) and inverse search (PDF click → source jump).

### Added

- **SyncTeX engine integration** (`tectonic_engine.rs`): passes `.synctex(true)` to the
  Tectonic `ProcessingSessionBuilder` and extracts the resulting `.synctex.gz` bytes from
  the output bundle into `EngineArtifacts::synctex`.
- **`CompileResult::synctex`** field (`galley-core`) carries `Option<Vec<u8>>` alongside `pdf`
  and `log`; all call-sites (including `CachedCompiler`) updated.
- **`galley-intel::synctex`** — a pure-Rust SyncTeX parser implementing the `SyncTexMapper`
  trait from `galley-core`. Parses the gzip-compressed SyncTeX text format, resolves input
  file indices, and provides `forward(file, line) → Option<SyncTexBox>` and
  `inverse(page, x, y) → Option<SyncTexLocation>`.
- **`SyncTexState`** Tauri managed state (`Mutex<Option<Vec<u8>>>`) caches the raw synctex
  bytes after each compile; two new Tauri commands (`synctex_forward`, `synctex_inverse`)
  parse on demand and return lightweight DTOs.
- **`synctex-backend.ts`** — a `SyncTexBackend` interface with a Tauri implementation
  (invokes the two commands) and a browser stub (returns `null`) selected via
  `selectSyncTexBackend`. Injectable in tests.
- **`pdf.ts` additions** — `SP_PER_PT` constant, `syncTexToCanvas` (sp → canvas pixels,
  accounts for SCALE), `canvasToPdfPoint` (canvas pixels → PDF user-space with y-flip).
- **`PreviewPane.svelte`** — SVG overlay (`class="synctex-highlight"`) positioned over the
  canvas; 2 s CSS fade-out animation; `highlightBox` prop drives it; `oninversesearch`
  callback fires on canvas click with the PDF coordinates. `handleCanvasClick` scales from
  CSS to buffer pixels via `getBoundingClientRect`.
- **`App.svelte`** — wires `handleForwardSearch` (Ctrl+Enter / Cmd+Enter) and
  `handleInverseSearch` (from PreviewPane callback) using an injected `SyncTexBackend`.
  Editor reference captured via new `EditorPane.oncreate` callback.
- **`EditorPane.svelte`** — `oncreate?: (editor: LatexEditor) => void` prop fires after
  the CodeMirror editor is mounted.
- **`LatexEditor.currentLine()`** — returns the one-based line of the primary cursor.
- **`PreviewPrefsStore`** (`settings-store.ts`) — `syncScroll: boolean` preference (default
  `false`, reserved for v0.3.1 synced scroll).
- **ADR-0012** (SyncTeX design decisions).

### Coverage

- Rust: 100% region coverage (6 026 regions, 0 missed) across the workspace.
- TypeScript: 100% lines / branches / functions / statements (484 tests).

## [0.2.2] - 2026-06-18

Power editing — Vim/Emacs keymaps, spell-check, command palette, project-wide find & replace, and a status bar.

### Added

- **Vim and Emacs keymaps** via two CodeMirror 6 `Compartment` instances that reconfigure the
  keymap extension at runtime without rebuilding the editor view. The active mode is persisted
  in `localStorage` through `EditorPrefsStore` and toggled in Settings → Editor.
- **Spell-check linter** (`spell-check.ts`) using nspell against a bundled Hunspell English
  dictionary (`public/dict/`). Three filtering layers suppress false positives on LaTeX source:
  `maskLatexRegions` blanks commands/arguments/comments; `extractSpellWords` strips punctuation;
  `isSkippableToken` discards commands, digit-containing tokens, and single characters. The
  dictionary is fetched lazily and wired into the editor via `setSpellChecker` on the
  `spellCompartment`.
- **Command palette** (`CommandPalette.svelte`, Ctrl+Shift+P) — a fuzzy-searchable overlay of
  all app actions (`palette.ts`), mutually exclusive with the search panel.
- **Project-wide find and replace** (`SearchPanel.svelte`, Ctrl+Shift+F) — literal, regex,
  case-sensitive, and whole-word modes; results grouped by file; replace-all patches each file
  via the backend and keeps the active buffer in sync through `onreplace`. Pure search helpers
  in `search-content.ts` (`buildRegex`, `searchInContent`, `replaceInContent`).
- **`galley_core::search`** — Rust full-text search function backing `searchProject` in the
  browser backend, fully unit-tested.
- **Status bar** (`StatusBar.svelte`, `count.ts`) — live word and character counts derived from
  the editor content, displayed below the editor area.
- ADR-0011 (power editing decisions).

## [0.2.1] - 2026-06-18

Outline & multi-file navigation — the structure sidebar and root-document compile awareness.

### Added

- An **include-graph parser** (`galley-core::include_graph`, mirrored in `include-graph.ts`)
  that reads `\input{}`, `\include{}`, and `\subfile{}` directives from the live buffer — pure,
  no I/O, 100% branch-covered — and resolves extensionless paths to `.tex` following LaTeX's own
  rule.
- A **structure sidebar** (the elaborated `OutlinePanel`): two sections — *Includes* (resolved
  paths from the include graph, clickable to open the file) and *Outline* (LSP symbol tree,
  clickable to jump) — with a **jump-to-anything search input** at the top that filters both
  sections simultaneously.
- **Multi-file compile root awareness**: when the open project has a root document configured and
  the active file is not that root, `ProjectController.compile()` reads the root file from disk
  and sends it to Tectonic so the proof always reflects the whole document, not just the
  currently edited file. Unsaved edits to included files are not previewed until saved (consistent
  with how Tectonic resolves `\input` at build time).
- ADR-0010 (include graph, root-document compile, structure sidebar).

## [0.2.0] - 2026-06-18

Language intelligence — the editor now understands LaTeX, powered by the TexLab language server.

### Added

- A **`LanguageIntelligence` port** in `galley-core` with pure domain types (completion, hover,
  definition, document symbols), and a **`galley-intel`** crate that implements it over LSP:
  `Content-Length` framing, JSON-RPC, and result mapping — all pure and fully tested against
  fixtures captured from a live TexLab.
- **Completion** as you type — commands, environments, packages, document classes, `\ref` labels,
  `\cite` keys, and file paths — with kind-aware icons and the right insertion text.
- **Hovers** with signature/help for the symbol under the cursor.
- **Go-to-definition** (`F12`) that resolves a `\ref`/`\cite` to its `\label`/bibliography entry,
  **across files** in a multi-file project, opening the target file when needed.
- A **document outline** panel listing the structural symbols (sections, environments), with
  click-to-jump.
- **Live diagnostics** from the language server (ChkTeX style notes and TexLab's own analysis),
  **merged** with the compile log's diagnostics into the same gutter and problems panel.

### Notes

- The live `texlab` process sits behind a `real-lsp` Cargo feature (off in the build and coverage
  gates, mirroring `real-compiler`) and is exercised by `#[ignore]`d integration tests
  (`just lsp-itest`). `texlab` is a host requirement for the packaged app and the itests; the
  editor degrades gracefully to no language features when it is absent.
- The compile build root remains single-file; the language server indexes the whole project, so
  completion and navigation already work across files. Multi-file **compile** root awareness and
  the richer structure sidebar are `v0.2.1`. See ADR-0009.

## [0.1.2] - 2026-06-18

Errors, warnings, and friendly tips — never just a raw log.

### Added

- A **TeX-log parser** in `galley-core` (`diagnostics`) that turns the raw compile log into
  structured **diagnostics** — errors, warnings, and bad boxes — each with a cleaned message, a
  severity, a source line where the log gives one, and a **plain-language explanation and fix
  tip** in Galley's voice. It recognises the common offenders: undefined control sequences,
  `Missing $`, runaway arguments (an unclosed brace), mismatched environments, missing files,
  package errors, undefined references and citations, and overfull/underfull boxes.
- **Inline gutter markers** in the editor — a dot beside each line that has a problem, coloured
  by the worst severity on that line.
- A **problems panel** beneath the editor that lists the diagnostics worst-first by line, with a
  one-line explanation and the raw message, and a **jump-to-source** click that moves the cursor
  to the offending line.
- ADR-0008 (compile diagnostics).

### Changed

- The compile result now carries its parsed `diagnostics` alongside the log, so the editor and
  the problems panel show the structured view while the raw log stays available in the preview.

## [0.1.1] - 2026-06-17

Fast, incremental compilation — recompiles that feel instant.

### Added

- An **incremental compile cache**: a dependency-free FNV-1a `content_hash` in `galley-core`
  and a `CachingCompiler` in `galley-compile` that serves the previous proof when the source
  is unchanged, so a no-change recompile never touches the engine.
- A **warm engine**: the desktop shell keeps one long-lived compiler in memory (rather than
  building one per compile), reusing Tectonic's on-disk format and bundle caches so only the
  first build pays the cold-start cost.
- **Compile as you type**: a debounced, cancellable auto-compile that coalesces a burst of
  keystrokes into one build and drops a stale build so it can never overwrite a newer proof.
  Toggleable under Settings → Compilation (on by default).
- **Build status and timing** in the preview bar, including a `cached` indicator when the
  proof came straight from the cache.
- An optional success **bell** — a short Web Audio "ding" on a successful build, **off by
  default**, under Settings → Compilation.
- ADR-0007 (fast, incremental compilation).

### Changed

- The preview now **keeps the last good proof on screen** while a new build runs and when a
  rebuild fails (showing the error alongside it), so it never flickers to empty.
- **Compiling no longer saves the document.** Galley compiles the editor's canonical buffer
  directly; saving stays the explicit `Ctrl`/`⌘`+`S` action (and the unsaved-changes guard),
  which keeps dirty-tracking meaningful and lets auto-compile preview unsaved work.

## [0.1.0] - 2026-06-17

Editing and compile — a real editor, an embedded TeX engine, and a live proof.

### Added

- A real **CodeMirror 6** LaTeX editor over the canonical `.tex` source, with syntax
  highlighting, environment folding, bracket matching, and history, themed for both
  Onionskin and Carbon through the design tokens. It replaces the placeholder editing
  surface.
- **Embedded Tectonic** compilation behind the `Compiler` port: the pure build planning and
  result shaping live in covered crates (`galley-core`, `galley-compile`), and the native
  engine sits behind a mockable `LatexEngine` seam, compiled only under the `real-compiler`
  feature (see ADR-0006).
- A **PDF.js** preview that renders the compiled proof onto a canvas and reports the page
  count, replacing the placeholder. The renderer is injectable and PDF.js is lazily loaded.
- A manual **Compile** action — a titlebar button and the `Ctrl`/`⌘`+`B` shortcut — that
  saves the source and compiles it, surfacing the proof or the failure log in the preview.
- Offline compilation: `just prewarm` warms the Tectonic package cache once so subsequent
  compiles need no network; an offline integration test verifies a stock `article` builds
  with connectivity disabled.
- ADR-0006 (embedded Tectonic compilation and the PDF.js preview).

## [0.0.3] - 2026-06-17

The project model and the file tree — create, open, edit, and save real projects.

### Added

- The pure project domain in `galley-core`: `Project`, `Document`/`DocumentKind`, the
  non-intrusive `.galley/project.toml` `Manifest` (a dependency-free format that never
  affects compilation and is safe to delete), root-document detection, and a small
  dependency-free ISO-8601 timestamp formatter.
- A sandboxed `FileStore` (`SafeRoot` in `galley-security`) that confines every read,
  write, and listing to the project root, refusing absolute paths, `..` traversal, and
  symlinks that escape.
- Project creation and a minimal folder importer (`galley-import`): create a project with a
  starter `main.tex`, or open an existing on-disk LaTeX folder — scanning its files,
  detecting the root document, and recreating the manifest when `.galley/` is missing.
- A thin Tauri command layer (`create_project`, `open_folder`, `read_document`,
  `save_document`) plus native folder-picker dialogs.
- A file-explorer sidebar replacing the placeholder, a plain editing surface with
  open/save and dirty tracking, an unsaved-changes guard when switching files, and a
  recent-projects list.
- ADR-0005 (the project model and the sandboxed file store).

## [0.0.2] - 2026-06-17

The Galley look — both themes, the design system, and the workspace shell.

### Added

- The full design-token system in `@galley/ui-kit`: the typewriter palette plus
  type, spacing, radius, and motion scales (`tokens.css`), a semantic theme layer
  (`themes.css`), and the editor syntax theme (`syntax.css`), bundled as
  `@galley/ui-kit/styles.css`.
- The **Onionskin** (light) and **Carbon** (dark) themes, applied across the whole
  app, the editor syntax sample, and the PDF-viewer chrome.
- A theme switcher that follows the OS on first run, persists the user's choice,
  and repaints the entire app instantly; reduced motion is honoured throughout.
- Shared UI-kit primitives — Logo, Wordmark, Button, IconButton, Toggle,
  SegmentedControl, Panel, Icon — with Storybook stories.
- A resizable, collapsible three-pane workspace (sidebar · editor · preview) whose
  pane sizes and collapse state are remembered, plus an in-app titlebar and a
  settings shell.
- A contrast baseline that checks the shipped palette against WCAG ratios in both
  themes.
- ADR-0003 (design tokens and theming) and ADR-0004 (the UI kit as a tested
  component library).

## [0.0.1] - 2026-06-17

The first scaffold — a real, buildable, fully-gated foundation.

### Added

- pnpm and Cargo workspaces: the pure `galley-core` domain crate plus placeholder adapter
  crates for compile, language intelligence, version control, import, AI, and security.
- A Tauri 2 + Svelte 5 desktop shell with a themed "hello" window that already wears the
  double-strike **G** icon.
- The brand foundation: the 1024² icon master, the generated cross-platform icon set, the
  design tokens, and the Onionskin palette.
- A manual quality gate (`just ci`) enforcing formatting, linting, a **100% coverage**
  threshold, a dependency audit, a docs gate, and the build.
- A dormant GitHub Actions workflow that mirrors the local gate, ready to enable.
- Founding documents: README, LICENSE (MIT), SECURITY, CONTRIBUTING, and ADR-0001
  (technology stack) and ADR-0002 (coverage policy and the bootstrap exclusion).

[0.1.0]: https://github.com/achref-soua/galley/releases/tag/v0.1.0
[0.0.3]: https://github.com/achref-soua/galley/releases/tag/v0.0.3
[0.0.2]: https://github.com/achref-soua/galley/releases/tag/v0.0.2
[0.0.1]: https://github.com/achref-soua/galley/releases/tag/v0.0.1
