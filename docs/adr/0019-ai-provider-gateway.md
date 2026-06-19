# ADR-0019 — AI Provider Gateway

**Status:** Accepted  
**Date:** 2026-06-19

## Context

v0.5.0 introduces AI-powered features (completions, future: explain/fix/insert). Galley must
support multiple LLM providers (Anthropic, OpenAI, Ollama, and any OpenAI-compatible endpoint)
selectable at runtime, without hard-coding a vendor.

Constraints that shaped this decision:

- **100% Rust coverage gate** — serde `#[derive(Deserialize)]` generates untriggerable error arms
  in the `galley-core` / `galley-ai` workspaces, permanently breaking the gate. Persistence code
  must stay in `src-tauri`.
- **WSL2 deployment** — the `keyring` crate requires D-Bus (not present on WSL2). A file-based
  secret store with restricted permissions is required.
- **Per-project consent** — documents must never be sent to a cloud provider without the author's
  explicit opt-in.
- **Local-only policy** — a global switch must block all non-local providers without touching
  project-level consent.

## Decision

**Hexagonal layout — three layers:**

1. **`galley-core::ai`** — pure domain types: `Provider`, `ProviderConfig`, `GatewayConfig`,
   `LlmMessage`, `LlmRequest`, `LlmResponse`, `LlmError` (all Clone + PartialEq), `LlmProvider`
   trait, `ProjectAiConsent`. Zero I/O, 100% coverable.

2. **`galley-ai`** — `ProviderGateway<P: LlmProvider>` — pure routing and policy enforcement.
   Takes a `Vec<(String, P)>` adapter list and a `GatewayConfig`. Enforces consent gate, active
   provider selection, and local-only policy before delegating to the adapter. A single concrete
   `MockProvider` type is used in tests (no dynamic dispatch) so every match arm is covered by one
   monomorphization.

3. **`src-tauri::ai`** — persistence (config + secrets) and HTTP adapters. All `serde` derives
   live here. The secret store writes `~/.config/galley/secrets.json` with `0o600` permissions
   (no plaintext in the DB or git). `OpenAiAdapter` handles OpenAI + Ollama (identical ChatCompletions
   protocol). `AnthropicAdapter` handles the Anthropic Messages API. `AnyAdapter` is a
   discriminated enum of the two, implementing `LlmProvider`.

**Frontend seam** (`ai-backend.ts`):

- `AiBackend` interface — `getConfig`, `setConfig`, `storeKey`, `removeKey`, `getConsent`,
  `setConsent`, `testProvider`, `complete`.
- `tauriAiBackend()` — forwards to Tauri commands (real IPC).
- `browserAiBackend()` — fully in-memory, stateful, no network. Used in tests and browser preview.
- `selectAiBackend(win)` — detects `'__TAURI_INTERNALS__' in win`, same pattern as other backends.

**Per-project consent** is stored in `<project>/.galley/ai-consent.json`. The gateway checks
`project_consent: bool` before any cloud call. The UI only surfaces cloud AI after the author
enables it per project.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| `keyring` crate for secrets | No D-Bus on WSL2; would block non-GUI hosts |
| `serde` derives in `galley-core` | Untriggerable error arms break 100% coverage gate |
| Dynamic dispatch (`Box<dyn LlmProvider>`) | Multiple monomorphizations leave unreachable arms |
| Hard-coded Anthropic SDK | Locks vendor; blocks Ollama/local-only mode |

## Consequences

- API keys are never logged, committed, or exposed to the WebView; the frontend only learns
  `has_key: bool`.
- The local-only switch + per-project consent give authors full control over data egress.
- Adding a new provider requires: a new `Provider` variant in `galley-core`, a new adapter struct
  in `src-tauri::ai`, and a new arm in `AnyAdapter` and `build_adapter`.
- Ollama (local inference) works out of the box with no API key — users can run fully offline.
