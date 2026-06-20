# ADR-0021 — Multi-Agent Orchestration and MCP Tool Host (v0.5.2)

**Status:** Accepted  
**Date:** 2026-06-20

## Context

v0.5.1 shipped a single-shot chat panel: the author sends a message, one AI call returns a
response, any ` ```latex ``` ` blocks flow into the review queue. That covers simple intents
(Explain / Fix Error / Transform), but larger goals — "add a related-work section with three
citations and fix the compile errors it introduces" — require multiple coordinated steps that
a single prompt cannot reliably produce.

The Model Context Protocol (MCP) defines a standard tool surface for AI agents. The
`galley-ai` crate already hosts the compile invocation, file I/O, and reference lookup paths
needed to close the loop. Connecting them into a multi-step agent loop is the natural next
increment.

The design must satisfy the same hard constraints as the rest of Galley:

- 100 % llvm-cov line + region coverage across all Rust crates.
- 100 % Vitest coverage (lines / branches / functions / statements) across all TypeScript.
- No serde derives in `galley-core` or `galley-ai` (generated match arms break the 100 % gate).
- No I/O in `galley-core`; no network in `galley-ai` domain types.
- All AI-proposed edits require author accept/reject; no silent document writes.
- No AI fingerprints in code, comments, commits, or docs.

## Decision

### 1. Two-layer markup protocol

A single, legible text protocol serves both the orchestration and tool layers:

````
Orchestrator output:   [AGENT:<role>] [TASK:<description>]
Agent tool call:       [TOOL:<name> <argument>]
Agent patch:           ```latex … ```
````

No JSON, no function-calling schema, no streaming — just pattern-matched plain text. This
works with any LLM backend (including local models) and is trivially testable with fixed
string responses.

### 2. Keyword-based planner in `galley-core` (`plan_goal`)

A pure, serde-free function `plan_goal(goal: &str) -> AgentPlan` maps keyword triggers to an
ordered list of `(AgentRole, task_description)` pairs without any LLM call. This is used for:

- Offline / browser testing (deterministic output).
- Fallback when the provider is unavailable.
- Unit tests that need a stable plan without network I/O.

The LLM orchestrator path (`buildOrchestratorPrompt` → `backend.complete`) produces the real
plan at runtime; `parseSteps` on the TypeScript side parses the `[AGENT:X] [TASK:Y]` lines.
`plan_goal` is separately tested on the Rust side at 100 % coverage and does not need to match
the LLM output format — it is an independent, local-only affordance.

### 3. Seven MCP tools in `galley-ai::mcp`

The tool surface mirrors the MCP `tools/call` convention and is implemented as a pure enum
(`McpTool`) with a single `McpToolResult` output type — no serde. Seven tools:

| Name               | Rust variant      |
| ------------------ | ----------------- |
| `read_file`        | `ReadFile`        |
| `search_project`   | `SearchProject`   |
| `compile`          | `Compile`         |
| `read_diagnostics` | `ReadDiagnostics` |
| `lookup_reference` | `LookupReference` |
| `apply_patch`      | `ApplyPatch`      |
| `list_assets`      | `ListAssets`      |

`ToolPermissions::for_role(AgentRole)` returns the allowed `HashSet<McpTool>` for each role.
Read-only roles (Reviewer, Stylist) exclude `Compile` and `ApplyPatch`. The Tauri command
handler checks permissions before executing any tool.

### 4. `dispatchTool` in `agent-backend.ts`, not in the Svelte component

Tool routing is a pure function of `(backend, name, arg)` with no rendering side effects.
Placing it in the component would make it untestable (Svelte components require `@testing-library`
setup) and would mix dispatch logic with UI state. `agent-backend.ts` can be imported in a plain
Vitest test and covered at 100 % without mounting anything.

### 5. `apply_patch` is intercepted before dispatch

When `parseToolCall` returns `{ name: 'apply_patch', arg }`, the component does **not** call
`dispatchTool`. Instead it falls through to the same `parsePatches` → `onpatch` → ReviewEntry
path used by the chat panel. This means:

- No Tauri round-trip for patch application.
- The author always sees the diff in the review queue before it lands.
- `apply_patch` signals "I am done editing"; it is never a direct file write.

### 6. Stop-in-flight via monotonic generation counter

A module-level `let generation = 0` integer (not a Svelte signal — no reactivity needed) is
incremented by `stop()`. The guard `if (myGen !== generation) return` is placed:

- After every `await` in the `try` body (post-orchestrator call, post-agent call).
- At the top of the `catch` block (so late-arriving errors do not log after stop).
- In the `finally` block only resets `running` when `myGen === generation`.

This is the same pattern as `AiChatPanel.svelte`; a stopped run produces no observable state
change other than `running = false` and the Stop button reverting to Run.

### 7. Browser stubs for both backends

`browserAiBackend()` (existing) and `browserAgentToolBackend()` (new) provide deterministic,
no-I/O stubs for use in `jsdom` tests and in the packaged web build (when Tauri is absent).
`selectAgentToolBackend(projectRoot, win)` delegates to `isTauri(win)` — the same seam used by
every other backend selector in the codebase.

## Alternatives considered

### LLM-driven planner

Using the LLM itself as the planner (without `plan_goal`) is the obvious choice for production
use — and it is in fact what the runtime does. `plan_goal` is not a replacement; it is an
additional local affordance that requires zero network I/O and is fully covered by deterministic
unit tests. Both paths coexist.

### JSON function-calling schema

Using a structured schema (OpenAI tool-calling, Anthropic tool-use) would make parsing more
robust but couples the protocol to specific provider APIs. The plain-text markup works with
every provider including local Ollama/LM Studio models, and is already proven by the chat
panel's ` ```latex ``` ` convention.

### Single orchestrator call returning a full plan + all tool calls

Tempting for latency, but requires a large context window and makes stop-in-flight trivial to
the point of uselessness (the plan would already be complete before the author can intervene).
Incremental step-by-step execution keeps each agent call small and lets the author stop between
steps.

### Exposing `dispatchTool` as a Tauri command

Would add unnecessary IPC overhead for a pure routing decision. The Tauri boundary is already
crossed by each individual tool method; the dispatch layer belongs in TypeScript.

## Consequences

**Good:**

- Every layer (Rust domain, TS helpers, Svelte component, App wiring) is independently tested
  at 100 % coverage with no mocks leaking across boundaries.
- The markup protocol is backend-agnostic; any provider can participate.
- The permission layer closes the gap between "tool is defined" and "tool is reachable from a
  given role".
- Stop-in-flight is zero-overhead (integer compare) and proven by three dedicated test cases.

**Accepted trade-offs:**

- `plan_goal` in Rust will diverge from what the LLM actually produces; it exists for testing
  only and is documented as such.
- The single-tool-call-per-step constraint limits agents to one tool invocation; multi-turn
  tool loops (tool → observe → tool again) are a future extension.
- Patch content is opaque to the dispatch layer; if an agent embeds malformed LaTeX, the review
  queue will show it but cannot automatically reject it.

## References

- [ADR-0019 — AI Provider Gateway](0019-ai-provider-gateway.md)
- [ADR-0020 — AI Chat Assistant Panel](0020-ai-chat-assistant-panel.md)
- [docs/ai/agents.md](../ai/agents.md)
- `crates/galley-core/src/agents.rs` — `AgentRole`, `AgentTask`, `AgentPlan`, `plan_goal`, `parse_plan_response`
- `crates/galley-ai/src/mcp.rs` — `McpTool`, `McpToolResult`, `ToolPermissions`
- `apps/desktop/src/lib/agents.ts` — TS orchestration helpers
- `apps/desktop/src/lib/agent-backend.ts` — `AgentToolBackend`, `dispatchTool`, stubs
- `apps/desktop/src/lib/AgentPanel.svelte` — UI and orchestration loop
