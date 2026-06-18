# ADR-0011: Power editing — keymap modes, spell-check, command palette, project search, and status bar

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

`v0.2.1` brought multi-file navigation and the structure sidebar. The editor itself remained a
plain textarea backed by CodeMirror 6. `v0.2.2` fills the gap between "editable" and "pleasant
to use" for power users:

1. **Vim and Emacs keymaps** — many LaTeX authors live in a modal editor; losing that muscle
   memory when switching to Galley is a friction point.
2. **Spell-check** — LaTeX source is prose; misspellings should be flagged in the editor, not
   discovered at submission time. But naively checking every token is wrong: commands, math,
   citations, and references must be excluded.
3. **Command palette** — as the feature set grows, surfacing every action through a fuzzy-search
   overlay (Ctrl+Shift+P) keeps the UI from becoming a toolbar maze.
4. **Project-wide find and replace** — authors need to rename terms across all files; a
   per-file search is not enough.
5. **Status bar** — basic word and character counts provide immediate feedback during writing
   without cluttering the editor chrome.

## Decision

### Keymap modes via CM6 `Compartment`

Keymap and spell-check extensions are runtime-reconfigurable through two dedicated
`Compartment` instances (`keymapCompartment`, `spellCompartment`) on the single CodeMirror
`EditorView`. Reconfiguration sends a `StateEffect` (`compartment.reconfigure(newExtension)`)
via `view.dispatch()` — no teardown or recreation of the view. The default keymap stays the
browser default; `vim` and `emacs` extension packs are loaded from `@replit/codemirror-vim`
and `@codemirror/legacy-modes`. The active mode is persisted in `localStorage` through the
existing `EditorPrefsStore`.

### Spell-check via nspell + CM6 linter

The spell-check linter (`makeSpellLinter`, `spellCheckDiagnostics`) uses
[nspell](https://github.com/wooorm/nspell) against the Hunspell-format English dictionary
bundled under `public/dict/`. Three layers of filtering ensure LaTeX source is not mangled:

- `maskLatexRegions` blanks out `\commands`, `{arguments}`, and `% comments` before splitting.
- `extractSpellWords` tokenises and strips leading/trailing punctuation.
- `isSkippableToken` discards tokens starting with `\`, containing digits, hyphens, or
  non-letter characters, and single-character tokens.

The dictionary is fetched lazily (only when spell-check is toggled on) via `fetchSpellChecker`
in `App.svelte` and supplied to the `spellCompartment` through the editor's public
`setSpellChecker` method. On toggle-off the compartment reverts to a no-op extension. This
keeps the dictionary out of the initial bundle.

### Command palette

A single `CommandPalette.svelte` overlay (role=`dialog`, aria-label `Command palette`,
Ctrl+Shift+P to open/close) accepts a fuzzy filter and presents a flat list of actions. The
action list (`palette.ts`) is a plain array of `{ id, label, shortcut, run }` objects — no
framework coupling. Palette and search panel are mutually exclusive: opening either closes the
other. The palette is intentionally simple at `v0.2.2`; extensibility (plugin actions, recent
commands) is deferred.

### Project-wide find and replace

`SearchPanel.svelte` (Ctrl+Shift+F) drives `ProjectBackend.searchProject` (which calls the
Rust `galley_core::search::search_project` full-text search function added in this release)
and `ProjectBackend.readDocument` / `saveDocument` for replace-all. Search options: literal
or regex, case-sensitive, whole-word. Results are grouped by file; matches show line number
and the matched line. Replace-all applies `replaceInContent` to each affected file and calls
`onreplace` for the active file (so the in-memory buffer stays in sync) and saves the rest
directly via the backend.

The pure search helpers (`buildRegex`, `searchInContent`, `replaceInContent`) live in
`search-content.ts`, fully unit-tested independently of the panel.

### Status bar

`StatusBar.svelte` derives word and character counts from the live editor content via a simple
`$derived` with a `count.ts` helper. It sits below the editor area and updates reactively on
every keypress with zero I/O.

## Alternatives considered

**Forking the CM6 view on keymap change.** Creating a new `EditorView` on every preference
change is simpler to reason about but loses editor state (cursor position, undo history, fold
state). `Compartment.reconfigure()` is the CM6-idiomatic answer.

**Server-side spell-check (via Rust).** Checking through the Tauri IPC on every keystroke
adds round-trip latency (≥1 frame). The client-side nspell approach is synchronous within the
CM6 linting pipeline and keeps the intelligence layer out of the IPC hot path.

**Embedding Hunspell via WASM.** A WASM Hunspell port would unify dictionary management with
the Rust side but adds ~2 MB to the bundle. nspell is 20 kB and handles the same `.aff`/`.dic`
format; sufficient for `v0.2.2`.

**A keybinding-driven search (no panel).** An inline search bar (CM6's built-in search panel)
covers single-file use but does not address multi-file replace. The dedicated `SearchPanel`
also serves the command palette's "Find in Project" action and provides a persistent results
list.

## Consequences

- The editor accepts Vim and Emacs keybindings when configured; the default stays unchanged.
- Spell-check fires on every edit when enabled; it skips commands, math, numbers, and
  single-character tokens — false-positive rate on normal LaTeX prose is low.
- The command palette is the single entry point for all keyboard-accessible actions; every
  new action added to the app must also appear there.
- Project-wide replace modifies files through the backend; the active file is updated
  in-memory via `onreplace` to keep the editor buffer consistent without a reload.
- The Rust `galley_core::search` module provides the backend search implementation, covered
  by unit tests at 100% branch coverage alongside the TypeScript helpers.
