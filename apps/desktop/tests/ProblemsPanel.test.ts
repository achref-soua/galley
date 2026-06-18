import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ProblemsPanel from '../src/lib/ProblemsPanel.svelte';
import type { Diagnostic } from '../src/lib/diagnostics';

function diag(over: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 'error',
    kind: 'latex-error',
    message: 'boom',
    file: null,
    line: 1,
    explanation: 'why',
    ...over
  };
}

const located = diag({
  severity: 'error',
  line: 6,
  message: 'Undefined control sequence',
  explanation: 'Brace never closed'
});
const unlocated = diag({
  severity: 'warning',
  line: null,
  message: 'There were undefined references',
  explanation: 'Rerun to settle'
});

describe('ProblemsPanel', () => {
  it('lists problems with a summary and jumps a located row to its line', async () => {
    const onjump = vi.fn();
    render(ProblemsPanel, { props: { diagnostics: [located, unlocated], onjump } });

    expect(screen.getByText('1 error · 1 warning')).toBeTruthy();
    expect(screen.getByText('line 6')).toBeTruthy();
    expect(screen.getByText('Brace never closed')).toBeTruthy();

    // The located row is a button that jumps to its source line.
    await fireEvent.click(screen.getByRole('button', { name: /Brace never closed/ }));
    expect(onjump).toHaveBeenCalledWith(6);
  });

  it('renders an unlocated problem as a non-clickable row', () => {
    render(ProblemsPanel, { props: { diagnostics: [unlocated], onjump: vi.fn() } });
    // No jump button for the unlocated warning (it has nowhere to go).
    expect(screen.queryByRole('button', { name: /Rerun to settle/ })).toBeNull();
    expect(screen.getByText('Rerun to settle')).toBeTruthy();
  });

  it('shows a clean-galley message when there is nothing to report', () => {
    render(ProblemsPanel, { props: { diagnostics: [], onjump: vi.fn() } });
    expect(screen.getByText('No problems')).toBeTruthy();
    expect(screen.getByText('Nothing to report — a clean galley.')).toBeTruthy();
  });

  it('collapses and re-opens the list', async () => {
    render(ProblemsPanel, { props: { diagnostics: [located], onjump: vi.fn() } });
    expect(screen.getByText('Brace never closed')).toBeTruthy();

    const toggle = screen.getByRole('button', { name: /Problems/ });
    await fireEvent.click(toggle);
    // Collapsed: neither the list nor the empty message shows.
    expect(screen.queryByText('Brace never closed')).toBeNull();
    expect(screen.queryByText('Nothing to report — a clean galley.')).toBeNull();

    await fireEvent.click(toggle);
    expect(screen.getByText('Brace never closed')).toBeTruthy();
  });
});
