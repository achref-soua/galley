import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SymbolPalette from '../src/lib/SymbolPalette.svelte';

describe('SymbolPalette', () => {
  it('renders group headers', () => {
    render(SymbolPalette, { props: { oninsert: () => {} } });
    expect(screen.getByText('Greek')).toBeTruthy();
    expect(screen.getByText('Operators')).toBeTruthy();
    expect(screen.getByText('Relations')).toBeTruthy();
    expect(screen.getByText('Arrows')).toBeTruthy();
  });

  it('fires oninsert with the symbol code when a symbol button is clicked', async () => {
    const oninsert = vi.fn();
    render(SymbolPalette, { props: { oninsert } });

    // α is in the Greek group which starts open.
    const alphaBtn = screen.getByTitle('\\alpha');
    await fireEvent.click(alphaBtn);
    expect(oninsert).toHaveBeenCalledWith('\\alpha');
  });

  it('collapses a group on header click and hides its symbols', async () => {
    render(SymbolPalette, { props: { oninsert: () => {} } });

    const greekHeader = screen.getByRole('button', { name: /Greek/ });
    // Greek starts open — click to close.
    await fireEvent.click(greekHeader);
    expect(greekHeader.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTitle('\\alpha')).toBeNull();
  });

  it('re-opens a collapsed group on a second click', async () => {
    render(SymbolPalette, { props: { oninsert: () => {} } });

    const greekHeader = screen.getByRole('button', { name: /Greek/ });
    // Close then re-open.
    await fireEvent.click(greekHeader);
    await fireEvent.click(greekHeader);
    expect(greekHeader.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTitle('\\alpha')).toBeTruthy();
  });

  it('inserts a symbol from a non-Greek group', async () => {
    const oninsert = vi.fn();
    render(SymbolPalette, { props: { oninsert } });

    await fireEvent.click(screen.getByTitle('\\sum'));
    expect(oninsert).toHaveBeenCalledWith('\\sum');
  });
});
