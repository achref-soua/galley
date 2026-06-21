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
  it('lists problems with a summary and expands a located row to a jump button', async () => {
    const onjump = vi.fn();
    render(ProblemsPanel, { props: { diagnostics: [located, unlocated], onjump } });

    expect(screen.getByText('1 error · 1 warning')).toBeTruthy();
    expect(screen.getByText('line 6')).toBeTruthy();
    // The plain-language explanation is shown up front, on every row.
    expect(screen.getByText('Brace never closed')).toBeTruthy();

    // The detail (raw message + jump) is hidden until the row is expanded.
    expect(screen.queryByText('Undefined control sequence')).toBeNull();
    const row = screen.getByRole('button', { name: /Brace never closed/ });
    expect(row.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Undefined control sequence')).toBeTruthy();

    // The expanded detail carries a button that jumps to the source line.
    await fireEvent.click(screen.getByRole('button', { name: 'Jump to line 6' }));
    expect(onjump).toHaveBeenCalledWith(6);
  });

  it('expands an unlocated problem for detail but offers no jump', async () => {
    render(ProblemsPanel, { props: { diagnostics: [unlocated], onjump: vi.fn() } });
    // Its explanation shows even while collapsed.
    expect(screen.getByText('Rerun to settle')).toBeTruthy();

    const row = screen.getByRole('button', { name: /Rerun to settle/ });
    await fireEvent.click(row);
    // The detail is now visible...
    expect(screen.getByText('There were undefined references')).toBeTruthy();
    // ...but there is no jump button, since the log placed it nowhere.
    expect(screen.queryByRole('button', { name: /Jump to line/ })).toBeNull();
  });

  it('collapses an expanded row again', async () => {
    render(ProblemsPanel, { props: { diagnostics: [located], onjump: vi.fn() } });
    const row = screen.getByRole('button', { name: /Brace never closed/ });

    await fireEvent.click(row);
    expect(screen.getByText('Undefined control sequence')).toBeTruthy();

    await fireEvent.click(row);
    expect(screen.queryByText('Undefined control sequence')).toBeNull();
  });

  it('shows a clean-galley message when there is nothing to report', () => {
    render(ProblemsPanel, { props: { diagnostics: [], onjump: vi.fn() } });
    expect(screen.getByText('No problems')).toBeTruthy();
    expect(screen.getByText('Nothing to report — a clean galley.')).toBeTruthy();
  });

  it('collapses and re-opens the whole list', async () => {
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
