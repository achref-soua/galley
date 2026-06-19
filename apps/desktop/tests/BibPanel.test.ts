import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import BibPanel from '../src/lib/BibPanel.svelte';
import { type CiteCandidate } from '../src/lib/bibliography';

const candidates: CiteCandidate[] = [
  { key: 'lovelace1843', summary: 'Lovelace (1843) — Notes' },
  { key: 'turing1936', summary: 'Turing (1936) — Computability' }
];

function setup(over: Partial<Parameters<typeof render>[1]['props']> = {}) {
  const oninsert = vi.fn();
  const onlookup = vi.fn(async () => 'newkey');
  const onimport = vi.fn(async () => 1);
  const result = render(BibPanel, {
    props: { candidates, oninsert, onlookup, onimport, ...over }
  });
  return { ...result, oninsert, onlookup, onimport };
}

describe('BibPanel', () => {
  it('shows "No references yet." with an empty list', () => {
    const { getByText } = setup({ candidates: [] });
    expect(getByText('No references yet.')).toBeTruthy();
  });

  it('lists candidate keys and summaries', () => {
    const { getByText } = setup();
    expect(getByText('lovelace1843')).toBeTruthy();
    expect(getByText('Lovelace (1843) — Notes')).toBeTruthy();
    expect(getByText('turing1936')).toBeTruthy();
  });

  it('inserts a \\cite command when an entry is clicked', () => {
    const { getByText, oninsert } = setup();
    fireEvent.click(getByText('lovelace1843'));
    expect(oninsert).toHaveBeenCalledWith('\\cite{lovelace1843}');
  });

  it('toggles the panel open and closed', async () => {
    const { container } = setup();
    expect(container.querySelector('.cite-list')).toBeTruthy();
    const toggle = container.querySelector('.toggle') as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(container.querySelector('.cite-list')).toBeNull();
    expect(container.querySelector('.lookup')).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() => expect(container.querySelector('.cite-list')).toBeTruthy());
  });

  it('looks up a DOI on submit and reports the added key', async () => {
    const { container, getByLabelText, onlookup } = setup();
    const input = getByLabelText('DOI or arXiv id') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '10.1/x' } });
    await fireEvent.submit(container.querySelector('.lookup') as HTMLFormElement);
    await waitFor(() => expect(onlookup).toHaveBeenCalledWith('10.1/x', 'doi'));
    await waitFor(() =>
      expect(container.querySelector('.status')!.textContent).toBe('Added newkey')
    );
    // The query is cleared after a successful add.
    expect(input.value).toBe('');
  });

  it('looks up an arXiv id when that kind is selected', async () => {
    const { container, getByLabelText, getByText, onlookup } = setup();
    const input = getByLabelText('DOI or arXiv id') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '1706.03762' } });
    await fireEvent.click(getByText('arXiv'));
    await fireEvent.submit(container.querySelector('.lookup') as HTMLFormElement);
    await waitFor(() => expect(onlookup).toHaveBeenCalledWith('1706.03762', 'arxiv'));
  });

  it('reports when a reference could not be added', async () => {
    const { container, getByLabelText } = setup({ onlookup: vi.fn(async () => null) });
    const input = getByLabelText('DOI or arXiv id') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'bad' } });
    await fireEvent.submit(container.querySelector('.lookup') as HTMLFormElement);
    await waitFor(() =>
      expect(container.querySelector('.status')!.textContent).toBe('Could not add that reference.')
    );
  });

  it('ignores submit with a blank query', async () => {
    const { container, onlookup } = setup();
    await fireEvent.submit(container.querySelector('.lookup') as HTMLFormElement);
    expect(onlookup).not.toHaveBeenCalled();
  });

  it('ignores a second submit while a lookup is in flight', async () => {
    let resolve!: (key: string | null) => void;
    const onlookup = vi.fn(() => new Promise<string | null>((r) => (resolve = r)));
    const { container, getByLabelText } = setup({ onlookup });
    const input = getByLabelText('DOI or arXiv id') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'q' } });
    const form = container.querySelector('.lookup') as HTMLFormElement;
    await fireEvent.submit(form);
    await fireEvent.submit(form); // busy → ignored
    expect(onlookup).toHaveBeenCalledTimes(1);
    resolve('k');
    await waitFor(() => expect(container.querySelector('.status')!.textContent).toBe('Added k'));
  });

  it('imports a .bib file and reports the count (plural and singular)', async () => {
    const onimport = vi.fn(async () => 2);
    const { container } = setup({ onimport });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { name: 'lib.bib', text: async () => '@book{a}' } as unknown as File;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);
    await waitFor(() =>
      expect(container.querySelector('.status')!.textContent).toBe('Imported 2 entries.')
    );

    onimport.mockResolvedValueOnce(1);
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);
    await waitFor(() =>
      expect(container.querySelector('.status')!.textContent).toBe('Imported 1 entry.')
    );
  });

  it('reports when an import adds no new entries', async () => {
    const { container } = setup({ onimport: vi.fn(async () => 0) });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { name: 'lib.bib', text: async () => '@book{a}' } as unknown as File;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);
    await waitFor(() =>
      expect(container.querySelector('.status')!.textContent).toBe('No new entries to import.')
    );
  });

  it('ignores an import with an empty file list', async () => {
    const { container, onimport } = setup();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: { length: 0 }, configurable: true });
    await fireEvent.change(fileInput);
    expect(onimport).not.toHaveBeenCalled();
  });

  it('opens the file picker when Import is clicked', () => {
    const { container } = setup();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(container.querySelector('.import-btn') as HTMLButtonElement);
    expect(clickSpy).toHaveBeenCalled();
  });
});
