/**
 * Pure, I/O-free helpers for autonomous agent sessions.
 *
 * Checkpoint management, compile-fix loop bounding, and network-permission
 * detection — all testable without a network, DOM, or Svelte runtime.
 */

// ── Checkpoints ───────────────────────────────────────────────────────────────

/**
 * A named snapshot of document content taken after a successful agent step.
 * `timestamp` is milliseconds since the Unix epoch (injected for deterministic
 * tests via {@link createCheckpoint}'s optional third argument).
 */
export interface CheckpointEntry {
  readonly name: string;
  readonly content: string;
  readonly timestamp: number;
}

/**
 * Construct a {@link CheckpointEntry}.
 * `now` defaults to `Date.now()` and can be supplied for deterministic tests.
 */
export function createCheckpoint(name: string, content: string, now?: number): CheckpointEntry {
  return { name, content, timestamp: now ?? Date.now() };
}

/**
 * Return the document content of the most-recently-saved checkpoint whose
 * label equals `name`, or `null` when no matching entry exists.
 *
 * The scan is performed in reverse to return the latest matching entry when
 * the same label has been used more than once.
 */
export function applyCheckpoint(
  checkpoints: readonly CheckpointEntry[],
  name: string
): string | null {
  for (let i = checkpoints.length - 1; i >= 0; i--) {
    if (checkpoints[i].name === name) return checkpoints[i].content;
  }
  return null;
}

// ── Compile-fix loop bounding ─────────────────────────────────────────────────

/** Tracks how many compile-fix attempts the agent has made in one run. */
export interface LoopState {
  readonly iteration: number;
  readonly maxIterations: number;
}

/**
 * Create the initial loop state.
 * `maxIterations` defaults to 3 — the hard limit on compile-fixer invocations.
 */
export function newLoopState(maxIterations = 3): LoopState {
  return { iteration: 0, maxIterations };
}

/** Return `true` when the loop has not yet reached its limit. */
export function canContinueLoop(state: LoopState): boolean {
  return state.iteration < state.maxIterations;
}

/** Return a new state with the iteration counter incremented by one. */
export function advanceLoop(state: LoopState): LoopState {
  return { iteration: state.iteration + 1, maxIterations: state.maxIterations };
}

// ── Network permission detection ──────────────────────────────────────────────

/**
 * Return `true` when `name` identifies a tool that makes outbound network
 * requests and therefore requires an explicit user permission grant before
 * the agent may invoke it.
 */
export function isNetworkTool(name: string): boolean {
  return name === 'lookup_reference';
}

/**
 * Build the human-readable permission prompt shown to the author before a
 * network tool is dispatched.
 */
export function networkPermissionMessage(toolName: string, arg: string): string {
  return `Agent wants to make a network request: ${toolName}(${arg}). Allow?`;
}
