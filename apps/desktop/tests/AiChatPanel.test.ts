import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AiChatPanel from '../src/lib/AiChatPanel.svelte';
import { browserAiBackend, type AiBackend } from '../src/lib/ai-backend';

type ChatPanelProps = {
  backend: AiBackend;
  projectRoot: string;
  content: string;
  selectedText: string;
  errorLog: string;
  onpatch: (before: string, after: string) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A backend whose complete() resolves to a fixed string. */
function fixedBackend(response: string): AiBackend {
  const b = browserAiBackend();
  return {
    ...b,
    async complete() {
      return response;
    }
  };
}

/** A deferred backend: complete() returns a promise you resolve manually. */
function deferredBackend(): { backend: AiBackend; resolve(s: string): void } {
  let res: (s: string) => void = () => {};
  const backend: AiBackend = {
    ...browserAiBackend(),
    complete: () =>
      new Promise<string>((r) => {
        res = r;
      })
  };
  return { backend, resolve: (s) => res(s) };
}

function baseProps(overrides: Partial<ChatPanelProps> = {}): ChatPanelProps {
  return {
    backend: fixedBackend('Here is an explanation.'),
    projectRoot: '/project',
    content: '\\documentclass{article}',
    selectedText: '',
    errorLog: '',
    onpatch: vi.fn(),
    ...overrides
  };
}

// ── Empty state ───────────────────────────────────────────────────────────────

describe('AiChatPanel — initial state', () => {
  it('renders the panel with the assistant label', () => {
    render(AiChatPanel, { props: baseProps() });
    expect(screen.getByLabelText('AI assistant')).toBeTruthy();
  });

  it('shows the empty-state message when no messages exist', () => {
    render(AiChatPanel, { props: baseProps() });
    expect(screen.getByText(/Nothing on the galley yet/)).toBeTruthy();
  });

  it('shows three intent tabs', () => {
    render(AiChatPanel, { props: baseProps() });
    expect(screen.getByRole('tab', { name: 'Explain' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Fix Error' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Transform' })).toBeTruthy();
  });

  it('starts with Explain selected', () => {
    render(AiChatPanel, { props: baseProps() });
    expect(screen.getByRole('tab', { name: 'Explain' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Fix Error' }).getAttribute('aria-selected')).toBe(
      'false'
    );
    expect(screen.getByRole('tab', { name: 'Transform' }).getAttribute('aria-selected')).toBe(
      'false'
    );
  });
});

// ── Intent tab switching ──────────────────────────────────────────────────────

describe('AiChatPanel — intent tabs', () => {
  it('switches to Fix Error intent when that tab is clicked', async () => {
    render(AiChatPanel, { props: baseProps() });
    await fireEvent.click(screen.getByRole('tab', { name: 'Fix Error' }));
    expect(screen.getByRole('tab', { name: 'Fix Error' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Explain' }).getAttribute('aria-selected')).toBe(
      'false'
    );
  });

  it('switches to Transform intent when that tab is clicked', async () => {
    render(AiChatPanel, { props: baseProps() });
    await fireEvent.click(screen.getByRole('tab', { name: 'Transform' }));
    expect(screen.getByRole('tab', { name: 'Transform' }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('switches back to Explain when Explain tab is clicked after switching away', async () => {
    render(AiChatPanel, { props: baseProps() });
    await fireEvent.click(screen.getByRole('tab', { name: 'Fix Error' }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Explain' }));
    expect(screen.getByRole('tab', { name: 'Explain' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Fix Error' }).getAttribute('aria-selected')).toBe(
      'false'
    );
  });
});

// ── Send disabled states ──────────────────────────────────────────────────────

describe('AiChatPanel — send button disabled states', () => {
  it('enables Send in Explain mode (no selection required)', () => {
    render(AiChatPanel, { props: baseProps({ selectedText: '' }) });
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false);
  });

  it('disables Send in Fix Error mode when errorLog is empty', async () => {
    render(AiChatPanel, { props: baseProps({ errorLog: '' }) });
    await fireEvent.click(screen.getByRole('tab', { name: 'Fix Error' }));
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
  });

  it('enables Send in Fix Error mode when errorLog is non-empty', async () => {
    render(AiChatPanel, { props: baseProps({ errorLog: '! Error on line 5' }) });
    await fireEvent.click(screen.getByRole('tab', { name: 'Fix Error' }));
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false);
  });

  it('disables Send in Transform mode when selectedText is empty', async () => {
    render(AiChatPanel, { props: baseProps({ selectedText: '' }) });
    await fireEvent.click(screen.getByRole('tab', { name: 'Transform' }));
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
  });

  it('enables Send in Transform mode when selectedText is non-empty', async () => {
    render(AiChatPanel, { props: baseProps({ selectedText: '\\section{Intro}' }) });
    await fireEvent.click(screen.getByRole('tab', { name: 'Transform' }));
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows a hint when Fix Error is selected and errorLog is empty', async () => {
    render(AiChatPanel, { props: baseProps({ errorLog: '' }) });
    await fireEvent.click(screen.getByRole('tab', { name: 'Fix Error' }));
    expect(screen.getByText(/No compile errors/)).toBeTruthy();
  });

  it('shows a hint when Transform is selected and selectedText is empty', async () => {
    render(AiChatPanel, { props: baseProps({ selectedText: '' }) });
    await fireEvent.click(screen.getByRole('tab', { name: 'Transform' }));
    expect(screen.getByText(/Select text in the editor/)).toBeTruthy();
  });
});

// ── Successful send (Explain) ─────────────────────────────────────────────────

describe('AiChatPanel — successful send', () => {
  it('appends user and assistant messages after a successful send', async () => {
    render(AiChatPanel, {
      props: baseProps({ backend: fixedBackend('This is the explanation.') })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('This is the explanation.')).toBeTruthy());
    expect(screen.getByText('You')).toBeTruthy();
    // The panel header also says "Assistant"; there will be at least two occurrences.
    expect(screen.getAllByText('Assistant').length).toBeGreaterThanOrEqual(1);
  });

  it('clears the empty-state message once messages exist', async () => {
    render(AiChatPanel, { props: baseProps() });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByText(/Nothing on the galley yet/)).toBeNull());
  });

  it('uses a short excerpt of selectedText in the user message label when non-empty in Explain mode', async () => {
    render(AiChatPanel, {
      props: baseProps({
        backend: fixedBackend('Explanation.'),
        selectedText: '\\section{Introduction}'
      })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText(/Explain:/)).toBeTruthy());
  });
});

// ── Fix Error send ────────────────────────────────────────────────────────────

describe('AiChatPanel — fix-error intent send', () => {
  it('sends using the fix-error intent and shows the response', async () => {
    render(AiChatPanel, {
      props: baseProps({
        backend: fixedBackend('Fixed version here.'),
        errorLog: '! Undefined control sequence.'
      })
    });
    await fireEvent.click(screen.getByRole('tab', { name: 'Fix Error' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Fixed version here.')).toBeTruthy());
  });
});

// ── Transform send ────────────────────────────────────────────────────────────

describe('AiChatPanel — transform intent send', () => {
  it('sends using the transform intent and shows the response', async () => {
    render(AiChatPanel, {
      props: baseProps({
        backend: fixedBackend('Transformed text.'),
        selectedText: '\\section{Old Title}'
      })
    });
    await fireEvent.click(screen.getByRole('tab', { name: 'Transform' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Transformed text.')).toBeTruthy());
  });
});

// ── Patch emission ────────────────────────────────────────────────────────────

describe('AiChatPanel — patch emission', () => {
  it('calls onpatch for each ```latex block in the response', async () => {
    const onpatch = vi.fn();
    const response = 'Here:\n```latex\n\\emph{fixed}\n```';
    render(AiChatPanel, {
      props: baseProps({
        backend: fixedBackend(response),
        selectedText: '\\textbf{old}',
        onpatch
      })
    });
    await fireEvent.click(screen.getByRole('tab', { name: 'Transform' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onpatch).toHaveBeenCalledOnce());
    expect(onpatch).toHaveBeenCalledWith('\\textbf{old}', '\\emph{fixed}\n');
  });

  it('does not call onpatch when the response has no code blocks', async () => {
    const onpatch = vi.fn();
    render(AiChatPanel, {
      props: baseProps({ backend: fixedBackend('Just prose, no code.'), onpatch })
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Just prose, no code.')).toBeTruthy());
    expect(onpatch).not.toHaveBeenCalled();
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('AiChatPanel — error handling', () => {
  it('shows an error message when the backend rejects', async () => {
    const failBackend: AiBackend = {
      ...browserAiBackend(),
      async complete() {
        throw new Error('Network timeout');
      }
    };
    render(AiChatPanel, { props: baseProps({ backend: failBackend }) });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('Network timeout');
  });

  it('shows a string error when the backend rejects with a non-Error', async () => {
    const failBackend: AiBackend = {
      ...browserAiBackend(),
      async complete() {
        throw 'plain string error';
      }
    };
    render(AiChatPanel, { props: baseProps({ backend: failBackend }) });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('plain string error');
  });
});

// ── Stop button ───────────────────────────────────────────────────────────────

describe('AiChatPanel — stop button', () => {
  it('shows the Stop button while busy and the Send button when idle', async () => {
    const { backend, resolve } = deferredBackend();
    render(AiChatPanel, { props: baseProps({ backend }) });
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeTruthy());
    // Resolve the deferred promise to unblock
    resolve('response');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Send' })).toBeTruthy());
  });

  it('discards an error when Stop is clicked before a failing promise rejects', async () => {
    let rej: (e: Error) => void = () => {};
    const backend: AiBackend = {
      ...browserAiBackend(),
      complete: () =>
        new Promise<string>((_, r) => {
          rej = r;
        })
    };
    render(AiChatPanel, { props: baseProps({ backend }) });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    // Reject after Stop — error must be discarded (generation mismatch in catch)
    rej(new Error('late error'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('discards the response when Stop is clicked before the promise resolves', async () => {
    const { backend, resolve } = deferredBackend();
    render(AiChatPanel, { props: baseProps({ backend }) });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeTruthy());
    // Click Stop before the response arrives
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    // Now resolve the deferred promise — the response should be discarded
    resolve('discarded response');
    // The empty state should remain and no assistant message should appear
    await waitFor(() => expect(screen.queryByText('discarded response')).toBeNull());
  });
});
