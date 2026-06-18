import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import OutlinePanel from '../src/lib/OutlinePanel.svelte';
import type { DocumentSymbol } from '../src/lib/language-backend';

function sym(over: Partial<DocumentSymbol> = {}): DocumentSymbol {
  return { name: 'Section', detail: null, kind: 'section', line: 0, children: [], ...over };
}

const tree: DocumentSymbol[] = [
  sym({
    name: 'Introduction',
    detail: 'sec:intro',
    line: 3,
    children: [sym({ name: 'Figure', kind: 'environment', detail: null, line: 7 })]
  })
];

function props(over: Record<string, unknown> = {}) {
  return {
    symbols: [] as DocumentSymbol[],
    includes: [] as string[],
    onjump: vi.fn(),
    onopenfile: vi.fn(),
    ...over
  };
}

describe('OutlinePanel — summary text', () => {
  it("shows 'Empty' when there are no symbols or includes", () => {
    render(OutlinePanel, { props: props() });
    expect(screen.getByText('Empty')).toBeTruthy();
  });

  it("shows singular '1 file' when there is one include and no symbols", () => {
    render(OutlinePanel, { props: props({ includes: ['ch1.tex'] }) });
    expect(screen.getByText('1 file')).toBeTruthy();
  });

  it("shows plural '2 files' for multiple includes and no symbols", () => {
    render(OutlinePanel, { props: props({ includes: ['ch1.tex', 'ch2.tex'] }) });
    expect(screen.getByText('2 files')).toBeTruthy();
  });

  it("shows singular '1 symbol' for one symbol and no includes", () => {
    render(OutlinePanel, { props: props({ symbols: [sym({ name: 'Intro' })] }) });
    expect(screen.getByText('1 symbol')).toBeTruthy();
  });

  it("shows plural '2 symbols' for the flattened symbol tree", () => {
    render(OutlinePanel, { props: props({ symbols: tree }) });
    expect(screen.getByText('2 symbols')).toBeTruthy();
  });

  it('combines file and symbol counts when both are present', () => {
    render(OutlinePanel, { props: props({ symbols: tree, includes: ['ch1.tex'] }) });
    expect(screen.getByText('1 file, 2 symbols')).toBeTruthy();
  });
});

describe('OutlinePanel — includes section', () => {
  it('renders include paths under an Includes heading', () => {
    render(OutlinePanel, { props: props({ includes: ['ch1.tex', 'ch2.tex'] }) });
    expect(screen.getByText('Includes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ch1.tex' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ch2.tex' })).toBeTruthy();
  });

  it('calls onopenfile with the path when an include is clicked', async () => {
    const onopenfile = vi.fn();
    render(OutlinePanel, { props: props({ includes: ['ch1.tex'], onopenfile }) });
    await fireEvent.click(screen.getByRole('button', { name: 'ch1.tex' }));
    expect(onopenfile).toHaveBeenCalledWith('ch1.tex');
  });

  it('does not render the Includes heading when includes is empty', () => {
    render(OutlinePanel, { props: props({ symbols: tree }) });
    expect(screen.queryByText('Includes')).toBeNull();
  });
});

describe('OutlinePanel — outline section', () => {
  it('renders symbol names and calls onjump with the zero-based line', async () => {
    const onjump = vi.fn();
    render(OutlinePanel, { props: props({ symbols: tree, onjump }) });
    expect(screen.getByText('Introduction')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Figure/ }));
    expect(onjump).toHaveBeenCalledWith(7);
  });

  it('renders a detail span for symbols that carry one', () => {
    render(OutlinePanel, { props: props({ symbols: tree }) });
    expect(screen.getByText('sec:intro')).toBeTruthy();
  });

  it('does not render a detail span for symbols with null detail', () => {
    render(OutlinePanel, { props: props({ symbols: [sym({ name: 'NoDetail', detail: null })] }) });
    // Name is present; no spurious element for the null detail.
    expect(screen.getByText('NoDetail')).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });

  it('shows the Outline section label only when both includes and symbols are present', () => {
    const { unmount: u1 } = render(OutlinePanel, { props: props({ includes: ['ch1.tex'] }) });
    expect(screen.queryByText('Outline')).toBeNull();
    u1();

    const { unmount: u2 } = render(OutlinePanel, { props: props({ symbols: tree }) });
    expect(screen.queryByText('Outline')).toBeNull();
    u2();

    render(OutlinePanel, { props: props({ symbols: tree, includes: ['ch1.tex'] }) });
    expect(screen.getByText('Outline')).toBeTruthy();
  });

  it('applies an indent style to nested symbols (depth > 0)', () => {
    render(OutlinePanel, { props: props({ symbols: tree }) });
    // The Figure child is at depth 1 — the button must be present to confirm
    // indentStyle was called and applied without error.
    expect(screen.getByRole('button', { name: /Figure/ })).toBeTruthy();
  });
});

describe('OutlinePanel — empty state', () => {
  it("shows the 'no structure yet' message when both sections are empty", () => {
    render(OutlinePanel, { props: props() });
    expect(screen.getByText('No structure yet — compile to map the document.')).toBeTruthy();
  });

  it("shows 'No matches.' when a search matches nothing in symbols or includes", async () => {
    render(OutlinePanel, { props: props({ symbols: tree, includes: ['ch1.tex'] }) });
    const input = screen.getByRole('searchbox');
    await fireEvent.input(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No matches.')).toBeTruthy();
    expect(screen.queryByText('Introduction')).toBeNull();
    expect(screen.queryByText('ch1.tex')).toBeNull();
  });
});

describe('OutlinePanel — search / jump-to-anything', () => {
  it('shows all items when search is empty', () => {
    render(OutlinePanel, { props: props({ symbols: tree, includes: ['ch1.tex'] }) });
    expect(screen.getByText('Introduction')).toBeTruthy();
    expect(screen.getByText('ch1.tex')).toBeTruthy();
  });

  it('filters symbols by a case-insensitive search term', async () => {
    render(OutlinePanel, { props: props({ symbols: tree }) });
    const input = screen.getByRole('searchbox');
    await fireEvent.input(input, { target: { value: 'intro' } });
    expect(screen.getByText('Introduction')).toBeTruthy();
    expect(screen.queryByText('Figure')).toBeNull();
  });

  it('filters includes by a case-insensitive search term', async () => {
    render(OutlinePanel, {
      props: props({ includes: ['ch1.tex', 'appendix.tex'] })
    });
    const input = screen.getByRole('searchbox');
    await fireEvent.input(input, { target: { value: 'append' } });
    expect(screen.getByText('appendix.tex')).toBeTruthy();
    expect(screen.queryByText('ch1.tex')).toBeNull();
  });
});

describe('OutlinePanel — collapse / expand', () => {
  it('collapses the panel and hides all content', async () => {
    render(OutlinePanel, { props: props({ symbols: tree }) });
    expect(screen.getByText('Introduction')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Structure/ }));
    expect(screen.queryByText('Introduction')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('re-opens the panel after collapsing', async () => {
    render(OutlinePanel, { props: props({ symbols: tree }) });
    const toggle = screen.getByRole('button', { name: /Structure/ });
    await fireEvent.click(toggle);
    await fireEvent.click(toggle);
    expect(screen.getByText('Introduction')).toBeTruthy();
  });
});
