import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import UnsavedGuard from '../src/lib/UnsavedGuard.svelte';

function setup() {
  const onsave = vi.fn();
  const ondiscard = vi.fn();
  const oncancel = vi.fn();
  render(UnsavedGuard, { props: { label: 'Open intro.tex', onsave, ondiscard, oncancel } });
  return { onsave, ondiscard, oncancel };
}

describe('UnsavedGuard', () => {
  it('shows the label and resolves via the three actions', async () => {
    const { onsave, ondiscard, oncancel } = setup();
    expect(screen.getByText(/Open intro\.tex/)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
    expect(onsave).toHaveBeenCalledOnce();
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(ondiscard).toHaveBeenCalledOnce();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('cancels via the scrim and the Escape key', async () => {
    const { oncancel } = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.keyDown(window, { key: 'a' }); // ignored
    expect(oncancel).toHaveBeenCalledTimes(2);
  });
});
