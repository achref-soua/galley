import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AgentPanel from '../src/lib/AgentPanel.svelte';
import { browserAiBackend, type AiBackend } from '../src/lib/ai-backend';
import { browserAgentToolBackend, type AgentToolBackend } from '../src/lib/agent-backend';

// ── Helpers ───────────────────────────────────────────────────────────────────

type PanelProps = {
  backend: AiBackend;
  agentBackend: AgentToolBackend;
  projectRoot: string;
  projectTitle: string;
  content: string;
  onpatch: (before: string, after: string) => void;
};

function fixedBackend(response: string): AiBackend {
  return {
    ...browserAiBackend(),
    async complete() {
      return response;
    }
  };
}

function deferredBackend(): {
  backend: AiBackend;
  resolve(s: string): void;
  reject(e: Error): void;
} {
  let res: (s: string) => void = () => {};
  let rej: (e: Error) => void = () => {};
  const backend: AiBackend = {
    ...browserAiBackend(),
    complete: () =>
      new Promise<string>((r, j) => {
        res = r;
        rej = j;
      })
  };
  return { backend, resolve: (s) => res(s), reject: (e) => rej(e) };
}

function failingBackend(message: string): AiBackend {
  return {
    ...browserAiBackend(),
    async complete() {
      throw new Error(message);
    }
  };
}

function baseProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    backend: fixedBackend('[AGENT:writer] [TASK:draft intro]'),
    agentBackend: browserAgentToolBackend(),
    projectRoot: '/project',
    projectTitle: 'My Paper',
    content: '\\documentclass{article}',
    onpatch: vi.fn(),
    ...overrides
  };
}

// ── Initial state ─────────────────────────────────────────────────────────────

describe('AgentPanel — initial state', () => {
  it('renders the section with accessible label', () => {
    render(AgentPanel, { props: baseProps() });
    expect(screen.getByLabelText('Agent orchestrator')).toBeTruthy();
  });

  it('renders the goal input', () => {
    render(AgentPanel, { props: baseProps() });
    expect(screen.getByLabelText('Goal')).toBeTruthy();
  });

  it('Run button is disabled when goal is empty', () => {
    render(AgentPanel, { props: baseProps() });
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Run button is enabled when goal is non-empty', async () => {
    render(AgentPanel, { props: baseProps() });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'write intro' } });
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('log area is initially empty', () => {
    render(AgentPanel, { props: baseProps() });
    expect(screen.getByLabelText('Agent log').textContent).toBe('');
  });
});

// ── Orchestrator produces no steps ────────────────────────────────────────────

describe('AgentPanel — empty plan', () => {
  it('logs "No plan could be formed" when orchestrator returns no steps', async () => {
    const props = baseProps({ backend: fixedBackend('Just some commentary, no agent steps.') });
    render(AgentPanel, { props });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'write intro' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Agent log').textContent).toContain('No plan')
    );
  });
});

// ── Successful run with latex patches ─────────────────────────────────────────

describe('AgentPanel — successful run emitting patches', () => {
  it('dispatches writer and emits a patch for a ```latex block in the response', async () => {
    const onpatch = vi.fn();
    let call = 0;
    const backend: AiBackend = {
      ...browserAiBackend(),
      async complete() {
        if (call++ === 0) {
          return '[AGENT:writer] [TASK:draft intro]';
        }
        return '```latex\n\\section{Introduction}\n```';
      }
    };
    render(AgentPanel, { props: baseProps({ backend, onpatch }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'write intro' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getByLabelText('Agent log').textContent).toContain('[Done]'));
    expect(onpatch).toHaveBeenCalledWith('\\documentclass{article}', '\\section{Introduction}\n');
  });

  it('logs each step label and Done on a clean run', async () => {
    let call = 0;
    const backend: AiBackend = {
      ...browserAiBackend(),
      async complete() {
        if (call++ === 0) return '[AGENT:reviewer] [TASK:check refs]';
        return 'Looks good.';
      }
    };
    render(AgentPanel, { props: baseProps({ backend }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'review' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      const text = screen.getByLabelText('Agent log').textContent ?? '';
      expect(text).toContain('[Reviewer]');
      expect(text).toContain('[Done]');
    });
  });
});

// ── Tool dispatch (non-apply_patch) ───────────────────────────────────────────

describe('AgentPanel — tool dispatch with ok result', () => {
  it('dispatches a named tool and continues without logging Tool error', async () => {
    let call = 0;
    const backend: AiBackend = {
      ...browserAiBackend(),
      async complete() {
        if (call++ === 0) return '[AGENT:compile-fixer] [TASK:fix it]';
        return 'Let me compile it. [TOOL:compile]';
      }
    };
    render(AgentPanel, { props: baseProps({ backend }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'fix errors' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      const text = screen.getByLabelText('Agent log').textContent ?? '';
      expect(text).toContain('[Done]');
      expect(text).not.toContain('[Tool error]');
    });
  });

  it('logs Tool error when tool backend returns ok: false', async () => {
    let call = 0;
    const backend: AiBackend = {
      ...browserAiBackend(),
      async complete() {
        if (call++ === 0) return '[AGENT:writer] [TASK:draft]';
        return '[TOOL:read_file nonexistent.tex]';
      }
    };
    const failingToolBackend: AgentToolBackend = {
      ...browserAgentToolBackend(),
      async readFile() {
        return { ok: false, output: 'File not found' };
      }
    };
    render(AgentPanel, { props: baseProps({ backend, agentBackend: failingToolBackend }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'draft' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Agent log').textContent).toContain('[Tool error]');
    });
  });
});

// ── apply_patch treated as patch emission ─────────────────────────────────────

describe('AgentPanel — apply_patch tool call emits patches', () => {
  it('emits onpatch when agent response contains apply_patch and a ```latex block', async () => {
    const onpatch = vi.fn();
    let call = 0;
    const backend: AiBackend = {
      ...browserAiBackend(),
      async complete() {
        if (call++ === 0) return '[AGENT:citation-librarian] [TASK:insert cite]';
        return '```latex\n\\cite{LeCun2015}\n```\n[TOOL:apply_patch ...]';
      }
    };
    render(AgentPanel, { props: baseProps({ backend, onpatch }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'add citation' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getByLabelText('Agent log').textContent).toContain('[Done]'));
    expect(onpatch).toHaveBeenCalledWith('\\documentclass{article}', '\\cite{LeCun2015}\n');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('AgentPanel — error during run', () => {
  it('logs the error message and resets running on backend throw', async () => {
    render(AgentPanel, { props: baseProps({ backend: failingBackend('Network error') }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'test' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Agent log').textContent).toContain('[Error]');
      expect(screen.getByLabelText('Agent log').textContent).toContain('Network error');
    });
    expect(screen.queryByRole('button', { name: 'Run' })).toBeTruthy();
  });
});

// ── Stop button ───────────────────────────────────────────────────────────────

describe('AgentPanel — Stop button', () => {
  it('shows Stop while running and Run after stop', async () => {
    const { backend, resolve } = deferredBackend();
    render(AgentPanel, { props: baseProps({ backend }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'test' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.queryByRole('button', { name: 'Run' })).toBeTruthy();
    resolve('');
  });

  it('stop-in-flight after orchestrator: early return and no [Done] logged', async () => {
    const { backend, resolve } = deferredBackend();
    render(AgentPanel, { props: baseProps({ backend }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'goal' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    resolve('[AGENT:writer] [TASK:draft]');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Agent log').textContent).not.toContain('[Done]');
    expect(screen.queryByRole('button', { name: 'Run' })).toBeTruthy();
  });

  it('stop-in-flight during agent step: early return and no [Done] logged', async () => {
    let call = 0;
    let agentResolve: (s: string) => void = () => {};
    const backend: AiBackend = {
      ...browserAiBackend(),
      complete: () =>
        new Promise<string>((r) => {
          if (call++ === 0) r('[AGENT:writer] [TASK:draft]');
          else agentResolve = r;
        })
    };
    render(AgentPanel, { props: baseProps({ backend }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'goal' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Agent log').textContent).toContain('[Writer]');
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    agentResolve('Some response without latex block');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Agent log').textContent).not.toContain('[Done]');
  });

  it('stop-in-flight during error: catch block returns early, no [Error] logged', async () => {
    const { backend, reject } = deferredBackend();
    render(AgentPanel, { props: baseProps({ backend }) });
    const input = screen.getByLabelText('Goal') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'goal' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    reject(new Error('late error'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Agent log').textContent).not.toContain('[Error]');
  });
});
