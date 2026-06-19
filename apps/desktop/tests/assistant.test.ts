import { describe, it, expect } from 'vitest';
import {
  createUserPanelMessage,
  createAssistantPanelMessage,
  buildExplainPrompt,
  buildFixErrorPrompt,
  buildTransformPrompt,
  parsePatches,
  locatePatch,
  type PanelMessage
} from '../src/lib/assistant';

// ── Panel message constructors ────────────────────────────────────────────────

describe('createUserPanelMessage', () => {
  it('sets role to user and stores id and content', () => {
    const m = createUserPanelMessage('u1', 'hello');
    expect(m.id).toBe('u1');
    expect(m.role).toBe('user');
    expect(m.content).toBe('hello');
  });
});

describe('createAssistantPanelMessage', () => {
  it('sets role to assistant and stores id and content', () => {
    const m = createAssistantPanelMessage('a1', 'hi there');
    expect(m.id).toBe('a1');
    expect(m.role).toBe('assistant');
    expect(m.content).toBe('hi there');
  });
});

// ── buildExplainPrompt ────────────────────────────────────────────────────────

describe('buildExplainPrompt', () => {
  it('starts with a system message identifying the LaTeX expert role', () => {
    const msgs = buildExplainPrompt('\\textbf{x}', '', []);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('LaTeX expert');
  });

  it('ends with a user message containing the selection', () => {
    const msgs = buildExplainPrompt('\\emph{y}', '', []);
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('\\emph{y}');
  });

  it('does not include surrounding context text when context is empty', () => {
    const msgs = buildExplainPrompt('\\alpha', '', []);
    const last = msgs[msgs.length - 1];
    expect(last.content).not.toContain('Surrounding');
  });

  it('includes surrounding context text when context is non-empty', () => {
    const msgs = buildExplainPrompt('\\alpha', '\\documentclass{article}', []);
    const last = msgs[msgs.length - 1];
    expect(last.content).toContain('Surrounding');
    expect(last.content).toContain('\\documentclass{article}');
  });

  it('includes prior history messages between system and the new user message', () => {
    const history: PanelMessage[] = [
      createUserPanelMessage('h1', 'prior question'),
      createAssistantPanelMessage('h2', 'prior answer')
    ];
    const msgs = buildExplainPrompt('x', '', history);
    expect(msgs).toHaveLength(4);
    expect(msgs[1]).toEqual({ role: 'user', content: 'prior question' });
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'prior answer' });
    expect(msgs[3].role).toBe('user');
  });

  it('returns only system + user when history is empty', () => {
    const msgs = buildExplainPrompt('x', '', []);
    expect(msgs).toHaveLength(2);
  });
});

// ── buildFixErrorPrompt ───────────────────────────────────────────────────────

describe('buildFixErrorPrompt', () => {
  it('starts with a system message identifying the fix-error role', () => {
    const msgs = buildFixErrorPrompt('! Error', '\\bad', []);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('error fixer');
  });

  it('ends with a user message containing the error log and snippet', () => {
    const msgs = buildFixErrorPrompt('! Undefined control sequence', '\\unknwon', []);
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('Undefined control sequence');
    expect(last.content).toContain('\\unknwon');
  });

  it('includes history between system and user messages', () => {
    const history: PanelMessage[] = [createUserPanelMessage('h1', 'prev')];
    const msgs = buildFixErrorPrompt('e', 's', history);
    expect(msgs).toHaveLength(3);
    expect(msgs[1].content).toBe('prev');
  });
});

// ── buildTransformPrompt ──────────────────────────────────────────────────────

describe('buildTransformPrompt', () => {
  it('starts with a system message identifying the editor role', () => {
    const msgs = buildTransformPrompt('\\section{Old}', []);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('editor');
  });

  it('ends with a user message containing the selection and Rewrite instruction', () => {
    const msgs = buildTransformPrompt('\\section{Old}', []);
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('\\section{Old}');
    expect(last.content).toContain('Rewrite');
  });

  it('includes history between system and user messages', () => {
    const history: PanelMessage[] = [createAssistantPanelMessage('h1', 'suggestion')];
    const msgs = buildTransformPrompt('x', history);
    expect(msgs).toHaveLength(3);
    expect(msgs[1].content).toBe('suggestion');
  });

  it('returns only system + user when history is empty', () => {
    const msgs = buildTransformPrompt('x', []);
    expect(msgs).toHaveLength(2);
  });
});

// ── parsePatches ──────────────────────────────────────────────────────────────

describe('parsePatches', () => {
  it('returns an empty array when the response has no code blocks', () => {
    expect(parsePatches('Just a plain explanation.', 'orig')).toEqual([]);
  });

  it('returns one patch for a single ```latex block', () => {
    const response = 'Here is the fix:\n\n```latex\n\\textbf{corrected}\n```';
    const patches = parsePatches(response, 'original text');
    expect(patches).toHaveLength(1);
    expect(patches[0].before).toBe('original text');
    expect(patches[0].after).toBe('\\textbf{corrected}\n');
  });

  it('returns multiple patches for multiple ```latex blocks', () => {
    const response = '```latex\nfirst\n```\nsome prose\n```latex\nsecond\n```';
    const patches = parsePatches(response, 'src');
    expect(patches).toHaveLength(2);
    expect(patches[0].after).toBe('first\n');
    expect(patches[1].after).toBe('second\n');
  });

  it('uses the provided originalText as before for every patch', () => {
    const response = '```latex\nnew\n```';
    const patches = parsePatches(response, 'the selection');
    expect(patches[0].before).toBe('the selection');
  });

  it('returns an empty array when response is empty', () => {
    expect(parsePatches('', '')).toEqual([]);
  });
});

// ── locatePatch ───────────────────────────────────────────────────────────────

describe('locatePatch', () => {
  it('locates before text when found in content', () => {
    const content = 'Hello \\textbf{world} end';
    const entry = locatePatch('p1', content, '\\textbf{world}', '\\emph{world}');
    expect(entry.id).toBe('p1');
    expect(entry.from).toBe(6);
    expect(entry.to).toBe(6 + '\\textbf{world}'.length);
    expect(entry.before).toBe('\\textbf{world}');
    expect(entry.after).toBe('\\emph{world}');
  });

  it('falls back to an insertion at offset 0 when before is not found in content', () => {
    const entry = locatePatch('p2', 'some content', '\\notpresent', 'replacement');
    expect(entry.from).toBe(0);
    expect(entry.to).toBe(0);
    expect(entry.before).toBe('');
    expect(entry.after).toBe('replacement');
  });

  it('falls back to an insertion when before is an empty string', () => {
    const entry = locatePatch('p3', 'some content', '', 'insertion');
    expect(entry.from).toBe(0);
    expect(entry.to).toBe(0);
    expect(entry.before).toBe('');
    expect(entry.after).toBe('insertion');
  });

  it('locates the first occurrence when before appears multiple times', () => {
    const content = 'abc abc abc';
    const entry = locatePatch('p4', content, 'abc', 'xyz');
    expect(entry.from).toBe(0);
    expect(entry.to).toBe(3);
  });
});
