import { describe, it, expect } from 'vitest';
import {
  AGENT_ROLES,
  agentLabel,
  agentSystemPrompt,
  buildOrchestratorPrompt,
  buildAgentPrompt,
  parseSteps,
  parseToolCall,
  type AgentRole
} from '../src/lib/agents';

// ── agentLabel ────────────────────────────────────────────────────────────────

describe('agentLabel', () => {
  it('returns a non-empty label for every role', () => {
    for (const role of AGENT_ROLES) {
      expect(agentLabel(role).length).toBeGreaterThan(0);
    }
  });

  it('returns distinct labels for all roles', () => {
    const labels = AGENT_ROLES.map(agentLabel);
    expect(new Set(labels).size).toBe(AGENT_ROLES.length);
  });
});

// ── agentSystemPrompt ─────────────────────────────────────────────────────────

describe('agentSystemPrompt', () => {
  it('returns a non-empty prompt for every role', () => {
    for (const role of AGENT_ROLES) {
      expect(agentSystemPrompt(role).length).toBeGreaterThan(0);
    }
  });

  it('orchestrator prompt includes agent-step format instruction', () => {
    expect(agentSystemPrompt('orchestrator')).toContain('[AGENT:');
  });

  it('writer prompt instructs to use ```latex blocks', () => {
    expect(agentSystemPrompt('writer')).toContain('```latex');
  });

  it('reviewer prompt says not to emit code blocks unless proposing a fix', () => {
    expect(agentSystemPrompt('reviewer')).toContain('bullet-point');
  });
});

// ── buildOrchestratorPrompt ───────────────────────────────────────────────────

describe('buildOrchestratorPrompt', () => {
  it('starts with a system message containing the orchestrator prompt', () => {
    const msgs = buildOrchestratorPrompt('write an intro', 'My Paper');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('[AGENT:');
  });

  it('includes the goal in the user message', () => {
    const msgs = buildOrchestratorPrompt('fix compile errors', 'Thesis');
    const user = msgs[msgs.length - 1];
    expect(user.role).toBe('user');
    expect(user.content).toContain('fix compile errors');
  });

  it('includes the project title when non-empty', () => {
    const msgs = buildOrchestratorPrompt('review the doc', 'My Thesis');
    expect(msgs[msgs.length - 1].content).toContain('My Thesis');
  });

  it('omits the project prefix when title is empty', () => {
    const msgs = buildOrchestratorPrompt('review the doc', '');
    const user = msgs[msgs.length - 1].content;
    expect(user).toContain('review the doc');
    expect(user).not.toContain('Project:');
  });

  it('returns exactly 2 messages', () => {
    expect(buildOrchestratorPrompt('goal', 'title')).toHaveLength(2);
  });
});

// ── buildAgentPrompt ──────────────────────────────────────────────────────────

describe('buildAgentPrompt', () => {
  it('starts with a system message for the given role', () => {
    const msgs = buildAgentPrompt('writer', 'draft intro', '');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('Writer');
  });

  it('ends with a user message containing the task when context is empty', () => {
    const msgs = buildAgentPrompt('reviewer', 'check refs', '');
    const user = msgs[msgs.length - 1];
    expect(user.role).toBe('user');
    expect(user.content).toBe('check refs');
  });

  it('appends context to the user message when context is non-empty', () => {
    const msgs = buildAgentPrompt('compile-fixer', 'fix error', '! Undefined control sequence');
    const user = msgs[msgs.length - 1];
    expect(user.content).toContain('fix error');
    expect(user.content).toContain('! Undefined control sequence');
    expect(user.content).toContain('Context:');
  });

  it('returns exactly 2 messages', () => {
    expect(buildAgentPrompt('stylist', 'format', '')).toHaveLength(2);
  });

  it('covers every role without throwing', () => {
    const roles: AgentRole[] = [
      'orchestrator',
      'writer',
      'compile-fixer',
      'citation-librarian',
      'figure-wright',
      'stylist',
      'reviewer'
    ];
    for (const role of roles) {
      expect(() => buildAgentPrompt(role, 'task', '')).not.toThrow();
    }
  });
});

// ── parseSteps ────────────────────────────────────────────────────────────────

describe('parseSteps', () => {
  it('extracts steps from a well-formed orchestrator response', () => {
    const resp =
      '1. [AGENT:writer] [TASK:draft the related-work section]\n' +
      '2. [AGENT:citation-librarian] [TASK:insert 3 citations]\n' +
      '3. [AGENT:compile-fixer] [TASK:fix any remaining errors]';
    const steps = parseSteps(resp);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({ role: 'writer', task: 'draft the related-work section' });
    expect(steps[1]).toEqual({ role: 'citation-librarian', task: 'insert 3 citations' });
    expect(steps[2]).toEqual({ role: 'compile-fixer', task: 'fix any remaining errors' });
  });

  it('skips lines with no [AGENT:] marker', () => {
    const resp = 'Just a plain sentence.\n[AGENT:writer] [TASK:draft intro]';
    const steps = parseSteps(resp);
    expect(steps).toHaveLength(1);
    expect(steps[0].role).toBe('writer');
  });

  it('skips lines with an unrecognised agent id', () => {
    const resp = '[AGENT:unknown-bot] [TASK:do stuff]\n[AGENT:reviewer] [TASK:check it]';
    const steps = parseSteps(resp);
    expect(steps).toHaveLength(1);
    expect(steps[0].role).toBe('reviewer');
  });

  it('skips lines with no [TASK:] marker', () => {
    const resp = '[AGENT:stylist] no task here\n[AGENT:stylist] [TASK:apply ieee]';
    const steps = parseSteps(resp);
    expect(steps).toHaveLength(1);
    expect(steps[0].task).toBe('apply ieee');
  });

  it('skips lines with an empty task description', () => {
    const resp = '[AGENT:writer] [TASK:]\n[AGENT:reviewer] [TASK:check refs]';
    const steps = parseSteps(resp);
    expect(steps).toHaveLength(1);
    expect(steps[0].role).toBe('reviewer');
  });

  it('returns an empty array for an empty response', () => {
    expect(parseSteps('')).toEqual([]);
  });
});

// ── parseToolCall ─────────────────────────────────────────────────────────────

describe('parseToolCall', () => {
  it('returns null when no [TOOL: marker is present', () => {
    expect(parseToolCall('Just a plain response.')).toBeNull();
  });

  it('returns null when [TOOL: has no closing bracket', () => {
    expect(parseToolCall('[TOOL:read_file path/to/file')).toBeNull();
  });

  it('returns null for an empty inner content [TOOL:]', () => {
    expect(parseToolCall('[TOOL:]')).toBeNull();
  });

  it('returns the tool name with an empty arg when there is no space', () => {
    const result = parseToolCall('[TOOL:compile]');
    expect(result).toEqual({ name: 'compile', arg: '' });
  });

  it('extracts name and arg from [TOOL:name arg]', () => {
    const result = parseToolCall('[TOOL:read_file path/to/doc.tex]');
    expect(result).toEqual({ name: 'read_file', arg: 'path/to/doc.tex' });
  });

  it('trims the arg and handles multi-word args', () => {
    const result = parseToolCall('[TOOL:search_project key words here]');
    expect(result).toEqual({ name: 'search_project', arg: 'key words here' });
  });

  it('picks the first occurrence when multiple tool calls are present', () => {
    const result = parseToolCall('[TOOL:compile] some text [TOOL:read_file foo]');
    expect(result?.name).toBe('compile');
  });
});
