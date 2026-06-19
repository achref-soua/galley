import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MathEditor from '../src/lib/MathEditor.svelte';
import type { MathFieldSetup } from '../src/lib/math-field.js';

/** Fake setup: appends a plain input and returns a handle over its value. */
function fakeSetup(initial: string): MathFieldSetup {
  return (el: HTMLElement, init: string) => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'math-input');
    input.value = init ?? initial;
    el.appendChild(input);
    return { getValue: () => input.value };
  };
}

const noop = () => {};

describe('MathEditor', () => {
  it('mounts and inserts inline math on confirm', async () => {
    const oninsert = vi.fn();
    render(MathEditor, {
      props: { setupField: fakeSetup('x^2'), oninsert, oncancel: noop, initialValue: 'x^2' }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(oninsert).toHaveBeenCalledWith('$x^2$');
  });

  it('inserts display math after switching to display mode', async () => {
    const oninsert = vi.fn();
    render(MathEditor, {
      props: { setupField: fakeSetup('E=mc^2'), oninsert, oncancel: noop, initialValue: 'E=mc^2' }
    });

    // The second radio (Display) fires onchange to set isDisplay = true.
    const radios = screen.getAllByRole('radio');
    await fireEvent.change(radios[1], { target: { checked: true } });

    await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(oninsert).toHaveBeenCalledWith('\\[\nE=mc^2\n\\]');
  });

  it('restores inline mode when switching back', async () => {
    const oninsert = vi.fn();
    render(MathEditor, {
      props: { setupField: fakeSetup('z'), oninsert, oncancel: noop, initialValue: 'z' }
    });

    const radios = screen.getAllByRole('radio');
    // Switch to display.
    await fireEvent.change(radios[1], { target: { checked: true } });
    // Switch back to inline.
    await fireEvent.change(radios[0], { target: { checked: true } });

    await fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(oninsert).toHaveBeenCalledWith('$z$');
  });

  it('calls oncancel when Cancel is clicked', async () => {
    const oncancel = vi.fn();
    render(MathEditor, {
      props: { setupField: fakeSetup(''), oninsert: noop, oncancel }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('calls oncancel when Escape is pressed', async () => {
    const oncancel = vi.fn();
    render(MathEditor, {
      props: { setupField: fakeSetup(''), oninsert: noop, oncancel }
    });

    const dialog = screen.getByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('does not cancel on non-Escape keys', async () => {
    const oncancel = vi.fn();
    render(MathEditor, {
      props: { setupField: fakeSetup(''), oninsert: noop, oncancel }
    });

    const dialog = screen.getByRole('dialog');
    await fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(oncancel).not.toHaveBeenCalled();
  });
});
