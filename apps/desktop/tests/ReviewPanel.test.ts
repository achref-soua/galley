import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ReviewPanel from '../src/lib/ReviewPanel.svelte';
import { createReviewEntry, type ReviewEntry } from '../src/lib/review';

function entry(id: string, before = 'OLD', after = 'NEW'): ReviewEntry {
  return createReviewEntry(id, 0, after.length, before, after);
}

function props(over: Record<string, unknown> = {}) {
  return {
    entries: [] as ReviewEntry[],
    onaccept: vi.fn(),
    onreject: vi.fn(),
    ...over
  };
}

describe('ReviewPanel — empty state', () => {
  it('shows "No changes to review." when the entries list is empty', () => {
    render(ReviewPanel, { props: props() });
    expect(screen.getByText('No changes to review.')).toBeTruthy();
  });

  it('shows "No pending changes" in the summary when empty', () => {
    render(ReviewPanel, { props: props() });
    expect(screen.getByText('No pending changes')).toBeTruthy();
  });
});

describe('ReviewPanel — summary text', () => {
  it('shows "1 pending change" for a single entry', () => {
    render(ReviewPanel, { props: props({ entries: [entry('e1')] }) });
    expect(screen.getByText('1 pending change')).toBeTruthy();
  });

  it('shows "N pending changes" for multiple entries', () => {
    render(ReviewPanel, { props: props({ entries: [entry('e1'), entry('e2'), entry('e3')] }) });
    expect(screen.getByText('3 pending changes')).toBeTruthy();
  });
});

describe('ReviewPanel — entry list', () => {
  it('renders before and after text for each entry', () => {
    render(ReviewPanel, {
      props: props({ entries: [entry('e1', 'alpha', 'beta')] })
    });
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('renders Accept and Reject buttons for each entry', () => {
    render(ReviewPanel, { props: props({ entries: [entry('e1')] }) });
    expect(screen.getByRole('button', { name: /Accept change e1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reject change e1/ })).toBeTruthy();
  });

  it('calls onaccept with the entry id when Accept is clicked', async () => {
    const onaccept = vi.fn();
    render(ReviewPanel, { props: props({ entries: [entry('e1')], onaccept }) });
    await fireEvent.click(screen.getByRole('button', { name: /Accept change e1/ }));
    expect(onaccept).toHaveBeenCalledWith('e1');
  });

  it('calls onreject with the entry id when Reject is clicked', async () => {
    const onreject = vi.fn();
    render(ReviewPanel, { props: props({ entries: [entry('e1')], onreject }) });
    await fireEvent.click(screen.getByRole('button', { name: /Reject change e1/ }));
    expect(onreject).toHaveBeenCalledWith('e1');
  });

  it('renders multiple entries with independent accept/reject buttons', () => {
    render(ReviewPanel, {
      props: props({ entries: [entry('e1'), entry('e2')] })
    });
    expect(screen.getByRole('button', { name: /Accept change e1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Accept change e2/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reject change e1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reject change e2/ })).toBeTruthy();
  });

  it('renders the entries list with the aria-label "Pending changes"', () => {
    render(ReviewPanel, { props: props({ entries: [entry('e1')] }) });
    expect(screen.getByRole('list', { name: 'Pending changes' })).toBeTruthy();
  });
});

describe('ReviewPanel — collapse / expand', () => {
  it('hides the entries list when collapsed', async () => {
    render(ReviewPanel, { props: props({ entries: [entry('e1')] }) });
    await fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    expect(screen.queryByText('Pending changes')).toBeNull();
  });

  it('shows the entries list after expanding again', async () => {
    render(ReviewPanel, { props: props({ entries: [entry('e1')] }) });
    const toggle = screen.getByRole('button', { name: /Review/ });
    await fireEvent.click(toggle);
    await fireEvent.click(toggle);
    expect(screen.getByRole('list', { name: 'Pending changes' })).toBeTruthy();
  });

  it('toggle button has aria-expanded=true when expanded', () => {
    render(ReviewPanel, { props: props() });
    const toggle = screen.getByRole('button', { name: /Review/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggle button has aria-expanded=false when collapsed', async () => {
    render(ReviewPanel, { props: props() });
    const toggle = screen.getByRole('button', { name: /Review/ });
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
