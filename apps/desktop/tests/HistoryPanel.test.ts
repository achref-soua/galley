import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import HistoryPanel from '../src/lib/HistoryPanel.svelte';
import type { SnapshotEntry } from '../src/lib/vcs';

function makeEntry(overrides: Partial<SnapshotEntry> = {}): SnapshotEntry {
  return {
    id: 'abc123',
    name: 'auto',
    date: '2026-06-20T10:00:00Z',
    isNamed: false,
    linesAdded: 2,
    linesRemoved: 0,
    ...overrides
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    root: '/tmp/project',
    content: 'current content',
    entries: [] as SnapshotEntry[],
    selectedId: null as string | null,
    selectedContent: null as string | null,
    onselect: vi.fn(),
    onrevert: vi.fn(),
    oncreatesnapshot: vi.fn(),
    ...overrides
  };
}

describe('HistoryPanel', () => {
  it('shows empty message when no project is open', () => {
    const { getByText } = render(HistoryPanel, { props: baseProps({ root: null }) });
    expect(getByText(/Open a project/)).toBeTruthy();
  });

  it('shows no-checkpoints message when entries list is empty', () => {
    const { getByText } = render(HistoryPanel, { props: baseProps() });
    expect(getByText(/No checkpoints yet/)).toBeTruthy();
  });

  it('renders timeline entries', () => {
    const entries = [
      makeEntry({ id: '1', name: 'auto', date: '2026-06-20T10:00:00Z' }),
      makeEntry({ id: '2', name: 'before refactor', isNamed: true, date: '2026-06-20T09:00:00Z' })
    ];
    const { getByText } = render(HistoryPanel, { props: baseProps({ entries }) });
    expect(getByText('auto')).toBeTruthy();
    expect(getByText('before refactor')).toBeTruthy();
  });

  it('calls onselect when an entry is clicked', async () => {
    const onselect = vi.fn();
    const entries = [makeEntry({ id: 'eid1', name: 'auto' })];
    const { getByText } = render(HistoryPanel, { props: baseProps({ entries, onselect }) });
    await fireEvent.click(getByText('auto'));
    await tick();
    expect(onselect).toHaveBeenCalledWith('eid1');
  });

  it('does not show diff section when nothing is selected', () => {
    const entries = [makeEntry()];
    const { queryByLabelText } = render(HistoryPanel, { props: baseProps({ entries }) });
    expect(queryByLabelText('Diff viewer')).toBeNull();
  });

  it('shows diff viewer when an entry is selected with content', async () => {
    const entries = [makeEntry({ id: 'x1' })];
    const props = baseProps({
      entries,
      selectedId: 'x1',
      selectedContent: 'old content'
    });
    const { getByLabelText } = render(HistoryPanel, { props });
    expect(getByLabelText('Diff viewer')).toBeTruthy();
  });

  it('shows "Identical to current" when selected content matches current', async () => {
    const entries = [makeEntry({ id: 'x1' })];
    const props = baseProps({
      entries,
      selectedId: 'x1',
      selectedContent: 'current content',
      content: 'current content'
    });
    const { getByText } = render(HistoryPanel, { props });
    expect(getByText(/Identical to current/)).toBeTruthy();
  });

  it('calls onrevert with selectedContent when Revert is clicked', async () => {
    const onrevert = vi.fn();
    const entries = [makeEntry({ id: 'r1' })];
    const props = baseProps({
      entries,
      selectedId: 'r1',
      selectedContent: 'old version',
      onrevert
    });
    const { getByText } = render(HistoryPanel, { props });
    await fireEvent.click(getByText('Revert'));
    await tick();
    expect(onrevert).toHaveBeenCalledWith('old version');
  });

  it('calls oncreatesnapshot when form is submitted with a name', async () => {
    const oncreatesnapshot = vi.fn();
    const { getByLabelText, getByText } = render(HistoryPanel, {
      props: baseProps({ oncreatesnapshot })
    });
    const input = getByLabelText('Snapshot name');
    await fireEvent.input(input, { target: { value: 'my snapshot' } });
    await fireEvent.submit(getByText('Save named').closest('form')!);
    await tick();
    expect(oncreatesnapshot).toHaveBeenCalledWith('my snapshot');
  });

  it('does not call oncreatesnapshot when name is blank', async () => {
    const oncreatesnapshot = vi.fn();
    const { getByText } = render(HistoryPanel, { props: baseProps({ oncreatesnapshot }) });
    await fireEvent.submit(getByText('Save named').closest('form')!);
    await tick();
    expect(oncreatesnapshot).not.toHaveBeenCalled();
  });

  it('clears snapshot name after submission', async () => {
    const { getByLabelText, getByText } = render(HistoryPanel, {
      props: baseProps({ oncreatesnapshot: vi.fn() })
    });
    const input = getByLabelText('Snapshot name') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'temp name' } });
    await fireEvent.submit(getByText('Save named').closest('form')!);
    await tick();
    expect(input.value).toBe('');
  });

  it('shows named badge for named entries', () => {
    const entries = [makeEntry({ id: '1', name: 'checkpoint', isNamed: true })];
    const { getByText } = render(HistoryPanel, { props: baseProps({ entries }) });
    expect(getByText('named')).toBeTruthy();
  });

  it('shows stat labels for entries with changes', () => {
    const entries = [makeEntry({ id: '1', linesAdded: 3, linesRemoved: 1 })];
    const { getByText } = render(HistoryPanel, { props: baseProps({ entries }) });
    expect(getByText('+3')).toBeTruthy();
    expect(getByText('−1')).toBeTruthy();
  });

  it('hides stat labels when no lines changed', () => {
    const entries = [makeEntry({ id: '1', linesAdded: 0, linesRemoved: 0 })];
    const { queryByText } = render(HistoryPanel, { props: baseProps({ entries }) });
    expect(queryByText('+0')).toBeNull();
    expect(queryByText('−0')).toBeNull();
  });

  it('shows only the removed stat label when linesAdded is zero', () => {
    const entries = [makeEntry({ id: '1', linesAdded: 0, linesRemoved: 3 })];
    const { queryByText } = render(HistoryPanel, { props: baseProps({ entries }) });
    expect(queryByText('+0')).toBeNull();
    expect(queryByText('−3')).toBeTruthy();
  });

  it('hides the added label when linesAdded drops to zero on update (covers Svelte update-phase branch)', async () => {
    const initial = [makeEntry({ id: 'u1', linesAdded: 3, linesRemoved: 1 })];
    const { rerender, queryByText } = render(HistoryPanel, {
      props: baseProps({ entries: initial })
    });
    expect(queryByText('+3')).toBeTruthy();
    // linesAdded crosses 0 boundary → inner {#if linesAdded > 0} toggles off during update
    const updated = [makeEntry({ id: 'u1', linesAdded: 0, linesRemoved: 1 })];
    await rerender(baseProps({ entries: updated }));
    expect(queryByText('+0')).toBeNull();
    expect(queryByText('−1')).toBeTruthy();
  });

  it('hides the removed label when linesRemoved drops to zero on update (covers Svelte update-phase branch)', async () => {
    const initial = [makeEntry({ id: 'u2', linesAdded: 3, linesRemoved: 1 })];
    const { rerender, queryByText } = render(HistoryPanel, {
      props: baseProps({ entries: initial })
    });
    expect(queryByText('−1')).toBeTruthy();
    // linesRemoved crosses 0 boundary → inner {#if linesRemoved > 0} toggles off during update
    const updated = [makeEntry({ id: 'u2', linesAdded: 3, linesRemoved: 0 })];
    await rerender(baseProps({ entries: updated }));
    expect(queryByText('+3')).toBeTruthy();
    expect(queryByText('−0')).toBeNull();
  });

  it('does not show snapshot form when root is null', () => {
    const { queryByLabelText } = render(HistoryPanel, { props: baseProps({ root: null }) });
    expect(queryByLabelText('Snapshot name')).toBeNull();
  });

  it('shows diff lines when selected content differs from current', () => {
    const entries = [makeEntry({ id: 'diff1' })];
    const props = baseProps({
      entries,
      selectedId: 'diff1',
      selectedContent: 'old line',
      content: 'completely new line'
    });
    const { getByLabelText } = render(HistoryPanel, { props });
    const viewer = getByLabelText('Diff viewer');
    expect(viewer.innerHTML).toContain('old line');
    expect(viewer.innerHTML).toContain('completely new line');
  });

  it('shows history timeline label for accessibility', () => {
    const entries = [makeEntry()];
    const { getByLabelText } = render(HistoryPanel, { props: baseProps({ entries }) });
    expect(getByLabelText('Version history')).toBeTruthy();
  });
});
