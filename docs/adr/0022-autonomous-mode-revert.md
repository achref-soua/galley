# ADR-0022 — Autonomous agent mode with in-memory checkpoints and revert

**Date:** 2026-06-20
**Status:** Accepted

## Context

ADR-0021 introduced a multi-agent orchestration panel that operates in _suggest_ mode: every
patch the agents produce is routed through the review queue, requiring an explicit accept/reject
from the author before the document changes. This is the right default — authorial intent is
preserved at all times — but it creates friction for iterative, exploratory workflows where the
author trusts the agents to draft freely and wants the option to undo rather than pre-approve.

Three concrete pain points motivated a second mode:

1. **Compile-fix loops** — the compile-fixer agent may need several iterations to repair a
   broken document. Routing each intermediate patch through the review queue breaks the loop.
2. **Exploratory drafting** — an author wanting to see "how would AI extend this section?" wants
   to _inspect_ the result, not approve each sentence in advance.
3. **Multi-step rewrites** — a sequence of writer → stylist → citation-librarian steps
   accumulates overlapping patches that are hard to review independently.

## Decision

Add an **autonomous mode** to `AgentPanel` as an opt-in prop (`autonomous?: boolean`). When
enabled, the panel operates as follows:

### Patch application

Instead of calling `onpatch(before, after)` (which queues a review entry), the panel applies
each patch directly to a local `runningContent` variable and emits the result immediately via
`onautonapply(newContent)`. The parent (`App.svelte`) wires `onautonapply` to
`projectController.edit`, so the document updates in real time.

`runningContent` is a local variable inside the async `runAgents()` function. This sidesteps
Svelte's prop-update latency: subsequent agent steps see the already-patched content without
waiting for the reactive update cycle.

### In-memory checkpoints

After each autonomous patch, a `CheckpointEntry { name, content, timestamp }` is appended to
the `checkpoints` state array. The name follows the pattern `Checkpoint N`. A checkpoints panel
renders below the log and exposes a "Revert" button per entry.

Checkpoints are deliberately **in-memory only** for v0.5.x. They survive within a single
autonomous run but are cleared when a new run starts. Persistent, git-backed checkpoint history
is deferred to v0.6.0 (ADR-0023, planned).

The pure checkpoint helpers (`createCheckpoint`, `applyCheckpoint`) live in
`src/lib/autonomous.ts` with no Svelte or DOM dependency, giving them full unit-test coverage
without a jsdom environment.

### Compile-fix loop bounding

The compile-fixer agent can run indefinitely if the document never compiles cleanly. A
`LoopState { iteration, maxIterations }` value tracks how many compile-fixer steps have been
attempted. When `iteration >= maxIterations` the loop `break`s and logs `[Limit]`. The default
limit is 3; it is configurable via the `maxFixIterations` prop.

### Network permission prompts

The `lookup_reference` tool makes outbound network requests. In autonomous mode, the panel
invokes `networkrequest(toolName, arg)` (an async callback prop) before dispatching any tool
identified by `isNetworkTool(name)`. If the callback resolves to `false`, the tool call is
skipped and `[Denied]` is logged. The default callback grants all requests
(`async () => true`).

In suggest mode, network tools are dispatched without a permission check (the author is already
approving each patch, so the implicit trust level is higher).

### Stop-in-flight guard

The existing generation counter (`let generation = 0`) ensures that `stop()` increments the
counter and any `await` that resumes after a stop finds `myGen !== generation` and returns
early. The guard is checked after the orchestrator call, after each agent call, and after each
tool dispatch — the three `await` sites that can span a stop.

## Rust domain (`galley-core`)

`crates/galley-core/src/checkpoint.rs` provides a pure Rust `CheckpointStore` (a `Vec`-backed
domain object mirroring the TS helpers) for future use by the Tauri backend if checkpoints are
ever persisted to disk or surfaced via IPC. Keeping the type in core prevents duplication and
makes the model testable at the domain level.

## Consequences

**Positive**

- Authors who trust the agents can iterate quickly without a review bottleneck.
- Compile-fix loops terminate predictably.
- Network tool dispatch is auditable even in autonomous mode.
- Checkpoints provide a lightweight undo without requiring git integration.

**Negative / deferred**

- Checkpoints are lost on page reload or when a new run starts — no persistence.
- There is no visual diff between checkpoints; the author must mentally track what changed.
- Git-backed history (persistent named snapshots, branch-per-run) is deferred to v0.6.0.
- The `networkrequest` callback is injected as a prop; in the real app it would open a
  permission dialog — that UI is not yet built. The default (`() => true`) is safe for the
  current single-user desktop context but is a placeholder.
