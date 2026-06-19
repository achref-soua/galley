import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FormatBar from '../src/lib/FormatBar.svelte';

const noop = () => {};

describe('FormatBar', () => {
  it('renders a toolbar with 4 action buttons', () => {
    render(FormatBar, {
      props: { onbold: noop, onitalic: noop, onpromote: noop, ondemote: noop }
    });
    const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' });
    expect(toolbar).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('calls onbold when the Bold button is clicked', async () => {
    const onbold = vi.fn();
    render(FormatBar, { props: { onbold, onitalic: noop, onpromote: noop, ondemote: noop } });
    const boldBtn = screen.getByTitle('Bold (⌘/Ctrl+B)');
    await fireEvent.click(boldBtn);
    expect(onbold).toHaveBeenCalledOnce();
  });

  it('calls onitalic when the Italic button is clicked', async () => {
    const onitalic = vi.fn();
    render(FormatBar, { props: { onbold: noop, onitalic, onpromote: noop, ondemote: noop } });
    const italicBtn = screen.getByTitle('Italic (⌘/Ctrl+I)');
    await fireEvent.click(italicBtn);
    expect(onitalic).toHaveBeenCalledOnce();
  });

  it('calls onpromote when the Promote button is clicked', async () => {
    const onpromote = vi.fn();
    render(FormatBar, { props: { onbold: noop, onitalic: noop, onpromote, ondemote: noop } });
    const promoteBtn = screen.getByTitle('Promote heading (Shift+Tab)');
    await fireEvent.click(promoteBtn);
    expect(onpromote).toHaveBeenCalledOnce();
  });

  it('calls ondemote when the Demote button is clicked', async () => {
    const ondemote = vi.fn();
    render(FormatBar, { props: { onbold: noop, onitalic: noop, onpromote: noop, ondemote } });
    const demoteBtn = screen.getByTitle('Demote heading (Tab)');
    await fireEvent.click(demoteBtn);
    expect(ondemote).toHaveBeenCalledOnce();
  });
});
