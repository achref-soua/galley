import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CommandPalette from '../src/lib/CommandPalette.svelte';
import type { PaletteAction } from '../src/lib/palette';

function makeActions(count = 3): PaletteAction[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `action-${i}`,
    label: `Action ${i}`,
    shortcut: i === 0 ? 'Ctrl+S' : undefined,
    run: vi.fn()
  }));
}

describe('CommandPalette', () => {
  it('renders the input and lists all actions initially', () => {
    const actions = makeActions(3);
    render(CommandPalette, { props: { actions, onclose: () => {} } });
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('shows a shortcut hint when the action has one', () => {
    const actions = makeActions(1);
    render(CommandPalette, { props: { actions, onclose: () => {} } });
    expect(screen.getByText('Ctrl+S')).toBeTruthy();
  });

  it('filters the list as the user types', async () => {
    const actions = makeActions(3);
    render(CommandPalette, { props: { actions, onclose: () => {} } });
    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'Action 1' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('Action 1')).toBeTruthy();
  });

  it('shows "No matching commands" when nothing matches', async () => {
    const actions = makeActions(2);
    render(CommandPalette, { props: { actions, onclose: () => {} } });
    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No matching commands.')).toBeTruthy();
  });

  it('calls onclose and action.run when an item is clicked', async () => {
    const onclose = vi.fn();
    const actions = makeActions(2);
    render(CommandPalette, { props: { actions, onclose } });
    await fireEvent.click(screen.getByText('Action 0'));
    expect(onclose).toHaveBeenCalledOnce();
    expect(actions[0].run).toHaveBeenCalledOnce();
  });

  it('calls onclose on Escape', async () => {
    const onclose = vi.fn();
    const actions = makeActions(1);
    render(CommandPalette, { props: { actions, onclose } });
    await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('executes the selected action on Enter', async () => {
    const onclose = vi.fn();
    const actions = makeActions(2);
    render(CommandPalette, { props: { actions, onclose } });
    await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(actions[0].run).toHaveBeenCalledOnce();
  });

  it('moves selection down with ArrowDown and up with ArrowUp', async () => {
    const onclose = vi.fn();
    const actions = makeActions(3);
    render(CommandPalette, { props: { actions, onclose } });
    const input = screen.getByRole('textbox');

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(actions[2].run).toHaveBeenCalledOnce();

    // Reset mock counts for the up test
    vi.clearAllMocks();
    render(CommandPalette, { props: { actions, onclose } });
    const input2 = screen.getAllByRole('textbox')[1];
    await fireEvent.keyDown(input2, { key: 'ArrowDown' });
    await fireEvent.keyDown(input2, { key: 'ArrowUp' });
    await fireEvent.keyDown(input2, { key: 'Enter' });
    expect(actions[0].run).toHaveBeenCalledOnce();
  });

  it('does not go below 0 or above the last item', async () => {
    const actions = makeActions(2);
    render(CommandPalette, { props: { actions, onclose: () => {} } });
    const input = screen.getByRole('textbox');
    // Press up at start — stays at 0
    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(actions[0].run).toHaveBeenCalledOnce();
  });

  it('closes when the scrim is clicked', async () => {
    const onclose = vi.fn();
    render(CommandPalette, { props: { actions: makeActions(1), onclose } });
    await fireEvent.click(screen.getByLabelText('Close command palette'));
    expect(onclose).toHaveBeenCalledOnce();
  });
});
