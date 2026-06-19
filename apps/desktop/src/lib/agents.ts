/**
 * Pure, I/O-free helpers for the multi-agent orchestration system.
 *
 * Agent roles, system prompts, prompt builders, and markup parsers — all
 * exercisable to 100 % coverage without a network, LLM, or Svelte runtime.
 */

import type { AiMessage } from './ai-backend';

// ── Role catalogue ────────────────────────────────────────────────────────────

/** Every specialist role the orchestrator can dispatch to. */
export type AgentRole =
  | 'orchestrator'
  | 'writer'
  | 'compile-fixer'
  | 'citation-librarian'
  | 'figure-wright'
  | 'stylist'
  | 'reviewer';

/** Stable list of all roles; iterate with `for (const r of AGENT_ROLES)`. */
export const AGENT_ROLES: readonly AgentRole[] = [
  'orchestrator',
  'writer',
  'compile-fixer',
  'citation-librarian',
  'figure-wright',
  'stylist',
  'reviewer'
];

/** A single step to be dispatched to a specialist agent. */
export interface AgentStep {
  role: AgentRole;
  task: string;
}

// ── Role metadata ─────────────────────────────────────────────────────────────

/** Human-readable display name for `role`. */
export function agentLabel(role: AgentRole): string {
  const labels: Record<AgentRole, string> = {
    orchestrator: 'Orchestrator',
    writer: 'Writer',
    'compile-fixer': 'CompileFixer',
    'citation-librarian': 'CitationLibrarian',
    'figure-wright': 'FigureWright',
    stylist: 'Stylist',
    reviewer: 'Reviewer'
  };
  return labels[role];
}

/** System-prompt paragraph sent at the top of every request for `role`. */
export function agentSystemPrompt(role: AgentRole): string {
  const prompts: Record<AgentRole, string> = {
    orchestrator:
      'You are the Galley Orchestrator. Given a user goal and document context, ' +
      'produce a numbered plan as a list of agent steps. For each step write exactly ' +
      'one line: [AGENT:<id>] [TASK:<description>] where <id> is one of: writer, ' +
      'compile-fixer, citation-librarian, figure-wright, stylist, reviewer. ' +
      'Keep the plan minimal — only include agents that are directly relevant.',
    writer:
      'You are the Galley Writer agent. Draft or revise LaTeX prose and structure ' +
      'as instructed. Return every replacement inside a fenced ```latex code block. ' +
      'Keep changes minimal and preserve surrounding context.',
    'compile-fixer':
      'You are the Galley CompileFixer agent. Analyse the compile log and the ' +
      'failing source, propose a minimal fix, and return the corrected snippet ' +
      'inside a fenced ```latex code block.',
    'citation-librarian':
      'You are the Galley CitationLibrarian agent. Insert bibliography references ' +
      'where directed. When adding \\cite commands, return the updated LaTeX inside ' +
      'a fenced ```latex code block. When adding BibTeX entries, return them inside ' +
      'a fenced ```bibtex code block.',
    'figure-wright':
      'You are the Galley FigureWright agent. Insert and format figures, captions, ' +
      'and placement specifiers. Return the figure environment inside a fenced ' +
      '```latex code block.',
    stylist:
      'You are the Galley Stylist agent. Apply the requested style, spacing, or ' +
      'journal-format requirements to the document. Return every changed block ' +
      'inside a fenced ```latex code block.',
    reviewer:
      'You are the Galley Reviewer agent. Critique the document for clarity, ' +
      'consistency, undefined cross-references, and style issues. Return a concise ' +
      'bullet-point report. Do not emit code blocks unless proposing a specific fix.'
  };
  return prompts[role];
}

// ── Prompt builders ───────────────────────────────────────────────────────────

/**
 * Build the messages array for an Orchestrator planning request.
 * `projectTitle` is included when non-empty to give the LLM project context.
 */
export function buildOrchestratorPrompt(goal: string, projectTitle: string): AiMessage[] {
  const system: AiMessage = { role: 'system', content: agentSystemPrompt('orchestrator') };
  const userContent =
    projectTitle.length > 0 ? `Project: "${projectTitle}"\nGoal: ${goal}` : `Goal: ${goal}`;
  return [system, { role: 'user', content: userContent }];
}

/**
 * Build the messages array for a specialist agent request.
 * When `context` is non-empty it is appended after the task description.
 */
export function buildAgentPrompt(role: AgentRole, task: string, context: string): AiMessage[] {
  const system: AiMessage = { role: 'system', content: agentSystemPrompt(role) };
  const userContent = context.length > 0 ? `${task}\n\nContext:\n${context}` : task;
  return [system, { role: 'user', content: userContent }];
}

// ── Markup parsers ────────────────────────────────────────────────────────────

/**
 * Parse an Orchestrator LLM response into a list of `AgentStep` values.
 *
 * Expects lines of the form `[AGENT:<id>] [TASK:<description>]`.
 * Lines that do not match (or carry an unrecognised agent id) are skipped
 * silently, keeping the parser forward-compatible.
 */
export function parseSteps(response: string): AgentStep[] {
  const steps: AgentStep[] = [];
  for (const rawLine of response.split('\n')) {
    const line = rawLine.trim();
    const agentM = /\[AGENT:([^\]]*)\]/.exec(line);
    if (!agentM) continue;
    const roleStr = agentM[1];
    if (!isAgentRole(roleStr)) continue;
    const taskM = /\[TASK:([^\]]*)\]/.exec(line);
    if (!taskM) continue;
    const task = taskM[1].trim();
    if (task.length === 0) continue;
    steps.push({ role: roleStr as AgentRole, task });
  }
  return steps;
}

function isAgentRole(s: string): s is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(s);
}

/**
 * Extract a `[TOOL:<name> <arg>]` call from the first occurrence in `response`.
 *
 * Returns `null` when no valid tool call is found.
 */
export function parseToolCall(response: string): { name: string; arg: string } | null {
  const start = response.indexOf('[TOOL:');
  if (start === -1) return null;
  const closeIdx = response.indexOf(']', start);
  if (closeIdx === -1) return null;
  const inner = response.slice(start + 6, closeIdx);
  const spaceIdx = inner.search(/\s/);
  const name = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
  const arg = spaceIdx === -1 ? '' : inner.slice(spaceIdx).trim();
  if (name.length === 0) return null;
  return { name, arg };
}
