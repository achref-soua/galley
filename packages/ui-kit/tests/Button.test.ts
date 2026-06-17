import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Button from '../src/Button.svelte';
import { textSnippet } from './_helpers';

describe('Button', () => {
  it('renders its children with default styling', () => {
    render(Button, { props: { children: textSnippet('Compile') } });
    const button = screen.getByRole('button', { name: 'Compile' });
    expect(button.className).toContain('btn');
    expect(button.className).not.toContain('primary');
    expect(button.className).not.toContain('ghost');
    expect(button.className).not.toContain('sm');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('applies the primary and small variants and a tooltip title', () => {
    render(Button, {
      props: { variant: 'primary', size: 'sm', title: 'Run a compile', children: textSnippet('Go') }
    });
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.className).toContain('primary');
    expect(button.className).toContain('sm');
    expect(button.getAttribute('title')).toBe('Run a compile');
  });

  it('applies the ghost variant and a submit type', () => {
    render(Button, {
      props: { variant: 'ghost', type: 'submit', children: textSnippet('Send') }
    });
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button.className).toContain('ghost');
    expect(button.getAttribute('type')).toBe('submit');
  });

  it('repaints when its props change', async () => {
    const { rerender } = render(Button, { props: { children: textSnippet('X') } });
    await rerender({
      variant: 'primary',
      size: 'sm',
      disabled: true,
      title: 'Now primary',
      children: textSnippet('X')
    });
    const button = screen.getByRole('button', { name: 'X' });
    expect(button.className).toContain('primary');
    expect(button.getAttribute('title')).toBe('Now primary');
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('fires onclick when pressed', async () => {
    const onclick = vi.fn();
    render(Button, { props: { onclick, children: textSnippet('Hit') } });
    await fireEvent.click(screen.getByRole('button', { name: 'Hit' }));
    expect(onclick).toHaveBeenCalledOnce();
  });

  it('is inert when disabled, and safe without a handler', async () => {
    render(Button, { props: { disabled: true, children: textSnippet('Nope') } });
    const button = screen.getByRole('button', { name: 'Nope' });
    await fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
