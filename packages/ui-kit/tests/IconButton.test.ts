import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import IconButton from '../src/IconButton.svelte';
import { textSnippet } from './_helpers';

describe('IconButton', () => {
  it('uses the label as its accessible name and default title', () => {
    render(IconButton, { props: { label: 'Toggle sidebar', children: textSnippet('×') } });
    const button = screen.getByRole('button', { name: 'Toggle sidebar' });
    expect(button.getAttribute('title')).toBe('Toggle sidebar');
    expect(button.getAttribute('aria-pressed')).toBe(null);
    expect(button.className).not.toContain('pressed');
  });

  it('reflects a pressed toggle state and a custom title', () => {
    render(IconButton, {
      props: { label: 'Sidebar', pressed: true, title: 'Hide sidebar', children: textSnippet('×') }
    });
    const button = screen.getByRole('button', { name: 'Sidebar' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('title')).toBe('Hide sidebar');
    expect(button.className).toContain('pressed');
  });

  it('fires onclick', async () => {
    const onclick = vi.fn();
    render(IconButton, { props: { label: 'Act', onclick, children: textSnippet('×') } });
    await fireEvent.click(screen.getByRole('button', { name: 'Act' }));
    expect(onclick).toHaveBeenCalledOnce();
  });

  it('can be disabled', () => {
    render(IconButton, { props: { label: 'Act', disabled: true, children: textSnippet('×') } });
    expect((screen.getByRole('button', { name: 'Act' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
