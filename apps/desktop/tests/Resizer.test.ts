import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

import Resizer from '../src/lib/Resizer.svelte';
import { firePointer } from './setup';

function setup() {
  const handlers = {
    onresizestart: vi.fn(),
    onresize: vi.fn(),
    onresizeend: vi.fn(),
    onstep: vi.fn()
  };
  const { getByRole } = render(Resizer, { props: { label: 'Resize sidebar', ...handlers } });
  const sep = getByRole('button', { name: 'Resize sidebar' });
  return { sep, ...handlers };
}

describe('Resizer', () => {
  it('drives a pointer drag and reports the delta', async () => {
    const { sep, onresizestart, onresize, onresizeend } = setup();
    firePointer('pointerdown', sep, 100);
    expect(onresizestart).toHaveBeenCalledOnce();
    await tick();
    expect(sep.className).toContain('dragging');

    firePointer('pointermove', window, 138);
    expect(onresize).toHaveBeenCalledWith(38);

    firePointer('pointerup', window, 138);
    expect(onresizeend).toHaveBeenCalledOnce();
    await tick();
    expect(sep.className).not.toContain('dragging');
  });

  it('stops tracking pointer moves after release', async () => {
    const { sep, onresize } = setup();
    firePointer('pointerdown', sep, 0);
    firePointer('pointerup', window, 0);
    onresize.mockClear();
    firePointer('pointermove', window, 50);
    expect(onresize).not.toHaveBeenCalled();
  });

  it('nudges with the arrow keys', async () => {
    const { sep, onstep } = setup();
    await fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(onstep).toHaveBeenCalledWith(-1);
    await fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(onstep).toHaveBeenCalledWith(1);
  });

  it('ignores other keys', async () => {
    const { sep, onstep } = setup();
    await fireEvent.keyDown(sep, { key: 'Enter' });
    expect(onstep).not.toHaveBeenCalled();
  });
});
