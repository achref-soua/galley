# Galley user guide

Galley is a local-first LaTeX studio: a power-user code editor and a Word-like
visual editor over the _same_ `.tex` source, with live preview, language
intelligence, a provider-agnostic AI collaborator, version history, and one-click
import of existing projects. This guide walks through every feature.

## Getting started

1. **Install** — download an installer for your OS (see [download](download.md)) or
   build one with `just package`.
2. **Open or create a project** — a project is just a folder. _New project_
   scaffolds a starter `main.tex`; _Open a folder_ imports any LaTeX directory in
   place. A first-run tour points the way.
3. **Type and compile** — edit on the left, watch the PDF on the right. Galley
   recompiles as you type and rings an optional bell on success.

## Editing & compiling

The editor is CodeMirror 6 over the canonical `.tex` source. Galley compiles that
buffer with a warm, embedded Tectonic engine and renders the PDF inline; a failed
build shows its log. Compilation is incremental and **warm** — a cached
single-edit recompile is sub-second — and runs as you type (debounced; the
debounce scales with document size) or on demand with **Compile** / `Ctrl`/`⌘`+`B`.
The previous proof stays on screen until the new one is ready. After one online
compile (or `just prewarm`), compiles work fully offline.

## Errors & guidance

A failed build becomes structured **diagnostics** — errors, warnings, bad boxes —
shown three ways: a coloured dot in the editor gutter, a problems panel worst
first, and a click that jumps to the offending line. Each entry pairs the raw
message with a plain-language explanation and fix tip.

## Language intelligence

Through the **TexLab** language server (kept warm), you get context-aware
completion (commands, environments, packages, classes, `\ref` labels, `\cite`
keys, file paths), hover help, and go-to-definition across files (`F12`). TexLab's
ChkTeX diagnostics merge into the same problems panel.

## Structure & navigation

The structure sidebar shows the include tree (`\input`/`\include`/`\subfile`) and
the document outline, with a jump-to-anything filter. Multi-file projects compile
from the detected root document so the proof always reflects the whole work.

## Math, tables & figures

- **Math** — a MathLive equation editor (inline and display) emits LaTeX; a symbol
  palette covers common operators.
- **Tables** — a visual table builder produces `tabular` / `booktabs`.
- **Figures** — drag-and-drop or paste an image to generate a `figure` with
  `\includegraphics`, caption, and label; the asset manager tracks them.

## Bibliography

Manage `.bib` files with a built-in parser/editor, citation autocompletion, and
reference lookup by DOI / arXiv. Bibliographies, `\input`s, and images all resolve
against the project root.

## The visual editor

A rich-text view _of the source_: headings, emphasis, lists, links, images,
tables, and equations render inline; a toolbar formats text; drag to reorder
sections; resize images. Every edit maps to a precise source range, and unknown
constructs become read-only raw-LaTeX chips. Toggle to code anytime — same
document.

## AI assistant & agents

Provider-agnostic and fully under your control (see [AI agents](ai/agents.md)).
Configure a provider and model in **Settings → AI**; the key lives in the OS
keychain. The assistant explains errors, rewrites prose, and proposes **diff-based
edits you accept or reject**. Specialized agents (writer, compile-fixer, citation
librarian, …) run under an orchestrator; an opt-in autonomous mode works on a
shadow branch with a one-click revert. Nothing is branded or on by default.

## Version history

Every save auto-checkpoints into the project's own git repo. The history panel
shows the timeline, a compact diff, and a one-click revert.

## Import & export

- **Import** existing projects from a folder, an Overleaf/arXiv archive, or a git
  URL — see [migration](migration.md). Galley never touches the original.
- **Export** the compiled PDF, a clean source bundle (Overleaf-ready, `.galley/`
  stripped), a share bundle, or HTML/Word/Markdown via Pandoc; or print.

## Templates

Start from a curated template — article, IEEE/ACM/Springer, Beamer, moderncv,
letter, report, thesis, book, poster, exam — or save your own.

## Appearance & accessibility

Four themes (Onionskin / Carbon, each with a High-Contrast variant), reduced
motion, and externalised strings for localization — see
[accessibility](accessibility.md) and [i18n](i18n.md).

## Privacy

Local-first; network features are opt-in; crash reporting is off by default and
anonymised — see [privacy](privacy.md).
