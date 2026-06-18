import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import OutlinePanel from '../src/lib/OutlinePanel.svelte';
import type { DocumentSymbol } from '../src/lib/language-backend';

function symbol(over: Partial<DocumentSymbol> = {}): DocumentSymbol {
  return { name: 'Section', detail: null, kind: 'section', line: 0, children: [], ...over };
}

const tree: DocumentSymbol[] = [
  symbol({
    name: 'Introduction',
    detail: 'sec:intro',
    line: 3,
    children: [symbol({ name: 'Figure', kind: 'environment', detail: null, line: 7 })]
  })
];

describe('OutlinePanel', () => {
  it('lists symbols with a count and jumps a row to its line', async () => {
    const onjump = vi.fn();
    render(OutlinePanel, { props: { symbols: tree, onjump } });

    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('Introduction')).toBeTruthy();
    // The detail (label) shows for the symbol that has one.
    expect(screen.getByText('sec:intro')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /Figure/ }));
    // The child figure begins on (zero-based) line 7.
    expect(onjump).toHaveBeenCalledWith(7);
  });

  it('shows an empty message when there is no outline', () => {
    render(OutlinePanel, { props: { symbols: [], onjump: vi.fn() } });
    expect(screen.getByText('Empty')).toBeTruthy();
    expect(screen.getByText('No outline yet — compile to map the document.')).toBeTruthy();
  });

  it('collapses and re-opens the list', async () => {
    render(OutlinePanel, { props: { symbols: tree, onjump: vi.fn() } });
    expect(screen.getByText('Introduction')).toBeTruthy();

    const toggle = screen.getByRole('button', { name: /Outline/ });
    await fireEvent.click(toggle);
    expect(screen.queryByText('Introduction')).toBeNull();
    expect(screen.queryByText('No outline yet — compile to map the document.')).toBeNull();

    await fireEvent.click(toggle);
    expect(screen.getByText('Introduction')).toBeTruthy();
  });
});
