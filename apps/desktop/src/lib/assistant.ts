/**
 * Pure, I/O-free helpers for the AI chat assistant.
 *
 * Intent-based prompt building, code-block patch extraction, and
 * ReviewEntry location from AI-proposed diffs — all testable without a
 * network or a Svelte runtime.
 */

import type { AiMessage } from './ai-backend';
import { createReviewEntry, type ReviewEntry } from './review';

// ── Panel message types ───────────────────────────────────────────────────────

/** A single message in the in-panel conversation display. */
export interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function createUserPanelMessage(id: string, content: string): PanelMessage {
  return { id, role: 'user', content };
}

export function createAssistantPanelMessage(id: string, content: string): PanelMessage {
  return { id, role: 'assistant', content };
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function historyToAiMessages(history: PanelMessage[]): AiMessage[] {
  return history.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Build the messages array for an "explain" request.
 * When `context` is non-empty it is appended as surrounding document text.
 */
export function buildExplainPrompt(
  selection: string,
  context: string,
  history: PanelMessage[]
): AiMessage[] {
  const system: AiMessage = {
    role: 'system',
    content:
      'You are a helpful LaTeX expert. Explain the provided LaTeX concisely and clearly. ' +
      'Do not propose edits unless explicitly asked.'
  };
  const userContent =
    context.length > 0
      ? `Explain this LaTeX in context:\n\n\`\`\`latex\n${selection}\n\`\`\`\n\nSurrounding document:\n\`\`\`latex\n${context}\n\`\`\``
      : `Explain this LaTeX:\n\n\`\`\`latex\n${selection}\n\`\`\``;
  return [system, ...historyToAiMessages(history), { role: 'user', content: userContent }];
}

/**
 * Build the messages array for a "fix-error" request.
 */
export function buildFixErrorPrompt(
  errorLog: string,
  snippet: string,
  history: PanelMessage[]
): AiMessage[] {
  const system: AiMessage = {
    role: 'system',
    content:
      'You are a LaTeX compile-error fixer. Analyse the error log and the failing snippet, ' +
      'then provide a corrected version inside a fenced ```latex code block. Keep changes minimal.'
  };
  const userContent =
    `Fix the compile error.\n\nError log:\n\`\`\`\n${errorLog}\n\`\`\`\n\n` +
    `Failing snippet:\n\`\`\`latex\n${snippet}\n\`\`\``;
  return [system, ...historyToAiMessages(history), { role: 'user', content: userContent }];
}

/**
 * Build the messages array for a "transform" request.
 */
export function buildTransformPrompt(selection: string, history: PanelMessage[]): AiMessage[] {
  const system: AiMessage = {
    role: 'system',
    content:
      'You are a LaTeX editor. Rewrite the provided LaTeX as instructed. ' +
      'Return the replacement inside a fenced ```latex code block.'
  };
  const userContent = `Rewrite this LaTeX:\n\n\`\`\`latex\n${selection}\n\`\`\``;
  return [system, ...historyToAiMessages(history), { role: 'user', content: userContent }];
}

// ── Patch extraction ──────────────────────────────────────────────────────────

/**
 * Extract proposed LaTeX replacements from an AI response.
 *
 * Returns one `{ before, after }` pair for every ` ```latex … ``` ` block
 * found in `response`.  `before` is always `originalText` — the text the
 * replacement is intended to replace.
 */
export function parsePatches(
  response: string,
  originalText: string
): Array<{ before: string; after: string }> {
  const re = /```latex\n([\s\S]*?)```/g;
  const patches: Array<{ before: string; after: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(response)) !== null) {
    patches.push({ before: originalText, after: m[1] });
  }
  return patches;
}

/**
 * Turn a `{ before, after }` patch into a `ReviewEntry` by locating `before`
 * in `content`.
 *
 * When `before` is non-empty and is found in `content`, the entry targets
 * that exact range.  Otherwise it records a pure insertion at offset 0 with
 * an empty `before`.
 */
export function locatePatch(
  id: string,
  content: string,
  before: string,
  after: string
): ReviewEntry {
  if (before.length > 0) {
    const idx = content.indexOf(before);
    if (idx >= 0) {
      return createReviewEntry(id, idx, idx + before.length, before, after);
    }
  }
  return createReviewEntry(id, 0, 0, '', after);
}
