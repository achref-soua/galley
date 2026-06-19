# ADR-0020 — AI Chat Assistant Panel (v0.5.1)

**Status:** Accepted  
**Date:** 2026-06-20

## Context

v0.5.0 shipped a provider-agnostic AI gateway (`galley-ai`, `AiSettingsPanel`, 8 Tauri commands, file-based secrets). The gateway is fully wired but had no user-facing affordance for invoking it during editing. Authors need in-context help: explaining unfamiliar macros, fixing compile errors, and rewriting selected passages — without leaving the editor.

## Decision

Add a **chat side-panel** (`AiChatPanel.svelte`) toggled from the titlebar. The panel supports three intents:

| Intent | Trigger | Sends |
|--------|---------|-------|
| **Explain** | Always available | selected text + full document context |
| **Fix Error** | Only when compile log is non-empty | log + full document as snippet |
| **Transform** | Only when text is selected | selection only |

**Patch proposals flow into the existing ReviewEntry queue** rather than being applied directly. The AI response is scanned for `` ```latex ``` `` fenced blocks; each block becomes a ReviewEntry via `locatePatch` (which searches for `before` text in the document, or falls back to a 0-length insertion). The author accepts or rejects each proposal using the existing review UI — no new write paths were added.

**Stop-in-flight** is handled by a monotonic `generation` counter. `sendMessage` captures `const myGen = ++generation` before every `await`. After the promise resolves (or rejects), it checks `if (myGen !== generation) return` and discards any stale response. `stop()` simply increments `generation` and sets `busy = false`.

**Conversation history** is held in component-local `$state<PanelMessage[]>([])`. It is not persisted (intentional for v0.5.1). The history is passed to the prompt builders so the LLM can reference prior turns.

## Pure-domain layer (`galley-core::assistant`)

All prompt-construction logic lives in a new, I/O-free Rust module:

- `ChatRole` / `ChatMessage` / `ChatThread` — typed message primitives
- `ChatIntent` — discriminated union of the three intents
- `build_chat_prompt(intent, history)` → `Vec<(String, String)>` — assembles the role/content pairs the gateway expects

The TypeScript side mirrors this with functions in `apps/desktop/src/lib/assistant.ts` (also pure, fully unit-tested):

- `buildExplainPrompt` / `buildFixErrorPrompt` / `buildTransformPrompt`
- `parsePatches(response, originalText)` — regex-extracts `` ```latex ``` `` blocks
- `locatePatch(id, content, before, after)` — maps a before/after pair to a ReviewEntry

## Coverage strategy

Both the Rust module (195 tests, `cargo llvm-cov` 100%) and the TypeScript helpers (`assistant.ts` 100%, `AiChatPanel.svelte` 100%) are fully covered. The `App.svelte` integration is covered by two new tests in `App.test.ts`: one that toggles the panel with no project loaded (covering the empty-root branch) and one that opens a project, sends a message, and verifies the ReviewEntry appears.

## Alternatives considered

- **Direct writes instead of ReviewEntry queue.** Rejected: bypasses the existing review/undo flow and breaks the author's ability to inspect proposed changes.
- **Persist conversation history to disk.** Deferred to a future release; clearing on panel close is the safer default for the initial version.
- **Streaming responses.** Deferred; the current `complete()` contract returns a `Promise<string>`. Streaming would require an `AsyncIterator` variant and changes to the Tauri command surface.

## Consequences

- Authors can ask for explanations, error fixes, and rewrites without leaving the editor window.
- All AI-proposed edits are opt-in (ReviewEntry queue) — no silent file mutations.
- The stop mechanism is safe even when the backend rejects: the stale-response guard runs in both the `try` and `catch` arms.
- `selectedText` is hardwired to `""` in this release (editor selection API not yet exposed to App). The Explain intent still works using the full document as context; Transform shows a hint until selection is wired up.
