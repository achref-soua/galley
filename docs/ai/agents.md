# Multi-Agent Orchestration (v0.5.2)

Galley's agent system lets the AI work on a document using a team of specialized roles rather than
a single monolithic prompt. You describe a goal in plain language; the **Orchestrator** decomposes
it into a plan, and each named agent executes one focused step — reading files, compiling, looking
up references, or proposing edits via the existing review queue.

## Agents panel

Open the panel through the command palette (`Cmd/Ctrl-K` → *Toggle Agent Orchestrator*).

| Control | Purpose |
|---------|---------|
| **Goal** input | A plain-language description: "add a related-work paragraph with three citations", "fix all compile errors", "rewrite the abstract in a more formal tone". |
| **Run** | Starts the orchestration loop. Disabled while a run is in progress or when the goal field is empty. |
| **Stop** | Cancels the current run mid-flight. Any step already dispatched is abandoned; no partial edits are applied. |
| **Agent log** | A live, scrollable transcript of what each agent does. Screen-reader accessible via `aria-live="polite"`. |

## Agent roles

| Role | Display name | Responsibility |
|------|-------------|----------------|
| `orchestrator` | Orchestrator | Plans the goal into `[AGENT:X] [TASK:Y]` steps. Never edits the document directly. |
| `writer` | Writer | Drafts new LaTeX prose — sections, paragraphs, captions. |
| `compile-fixer` | Compile Fixer | Reads diagnostics and proposes fixes for compile errors. |
| `citation-librarian` | Citation Librarian | Locates, validates, and inserts bibliography entries. |
| `figure-wright` | Figure Wright | Generates or annotates `\includegraphics` figure blocks. |
| `stylist` | Stylist | Applies consistent formatting, macro usage, and house style. |
| `reviewer` | Reviewer | Reviews structure and logic; suggests restructuring via edits. |

## Orchestrator protocol

The Orchestrator receives your goal and the project title and responds with one or more lines of
the form:

```
[AGENT:writer] [TASK:draft a 200-word related-work paragraph]
[AGENT:citation-librarian] [TASK:insert three relevant citations into the new paragraph]
```

Lines that do not match this pattern (e.g. commentary or reasoning) are silently skipped.
Unknown role names are ignored; a step with an empty task is skipped.

## MCP tool surface

Each agent can emit exactly one tool call per step, using the markup:

```
[TOOL:<name> <argument>]
```

The seven tools exposed to agents:

| Tool | Agent arg | What it does |
|------|-----------|-------------|
| `read_file` | path relative to project root | Reads a source file |
| `search_project` | query string | Full-text search across `.tex`/`.bib` files |
| `compile` | _(no arg)_ | Runs the Tectonic compiler; returns exit code + log |
| `read_diagnostics` | _(no arg)_ | Returns the current diagnostic list |
| `lookup_reference` | DOI or arXiv ID | Fetches BibTeX for a reference |
| `apply_patch` | _(treated as patch signal)_ | See patch flow below |
| `list_assets` | _(no arg)_ | Lists all figure assets in the project |

When the Orchestrator is running in the browser (tests / offline), a stub backend returns
deterministic ok responses so the orchestration loop can be fully exercised without a Tauri
runtime.

## Patch flow

Agents that produce document edits embed a ` ```latex ``` ` code block in their response (the
same format used by the AI chat panel). The component extracts the block with `parsePatches` and
routes it through `onpatch` into the existing **ReviewEntry** queue — the author must accept or
reject every AI-proposed change. No silent writes ever happen.

The `apply_patch` tool is treated as a **signal** that the agent is done; the component switches
to the patch-emission branch rather than dispatching the tool through the backend.

## Permission layer

Permissions are enforced at both layers:

- **Rust (`galley-ai`)** — `ToolPermissions::for_role(AgentRole)` returns the allowed tool set
  for each role. The Tauri command handler checks the caller's declared role before executing any
  MCP command. Read-only roles (Reviewer, Stylist) cannot invoke `apply_patch` or `compile`.
- **TypeScript (`agent-backend.ts`)** — `dispatchTool` routes tool names through a strict switch;
  unknown tool names return `{ ok: false }` with a descriptive message rather than failing
  silently.

## Stop-in-flight

The `generation` counter (a simple integer, not a signal) is incremented by `stop()`. Every
`await` in the orchestration loop is followed by a guard:

```
if (myGen !== generation) return;
```

The guard appears in **both** the `try` body and the `catch` block so that a stopped run never
logs `[Error]` or `[Done]` after the author has already dismissed it. The `finally` block only
resets `running` when `myGen === generation`.

## Security and privacy

- The agent system is subject to the same per-project AI consent gate as the chat panel (ADR-0019,
  ADR-0020). No network request is made if the user has not enabled AI for the project.
- Orchestrator responses are parsed structurally; they are never `eval`'d or used to load
  arbitrary code.
- Tool arguments are passed verbatim to the Tauri backend, which applies the same sandboxed
  filesystem scope as all other Tauri commands.
- Patch content is displayed in the review queue for author inspection before any edit lands in
  the document.

## Architecture note

See [ADR-0021](../adr/0021-multi-agent-orchestration.md) for the full decision record, including
why the planner is keyword-based (not LLM-driven), why `dispatchTool` lives in `agent-backend.ts`
rather than the Svelte component, and the rationale for the single-markup protocol.
