import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { tauriBibBackend, browserBibBackend, selectBibBackend } from '../src/lib/bib-backend';

function fakeWindow(tauri: boolean): Window {
  return (tauri ? { __TAURI_INTERNALS__: {} } : {}) as unknown as Window;
}

beforeEach(() => {
  invoke.mockReset();
});

describe('tauriBibBackend', () => {
  it('invokes lookup_reference and maps the snake_case entry', async () => {
    invoke.mockResolvedValueOnce({
      entry_type: 'article',
      key: 'vaswani2017',
      fields: [
        { name: 'author', value: 'Ashish Vaswani' },
        { name: 'title', value: 'Attention Is All You Need' }
      ]
    });
    const entry = await tauriBibBackend().lookupReference('1706.03762', 'arxiv');
    expect(invoke).toHaveBeenCalledWith('lookup_reference', {
      query: '1706.03762',
      kind: 'arxiv'
    });
    expect(entry).toEqual({
      entryType: 'article',
      key: 'vaswani2017',
      fields: [
        { name: 'author', value: 'Ashish Vaswani' },
        { name: 'title', value: 'Attention Is All You Need' }
      ]
    });
  });
});

describe('browserBibBackend', () => {
  it('fabricates a deterministic entry keyed on a slug of the query', async () => {
    const entry = await browserBibBackend().lookupReference('10.1145/3292500', 'doi');
    expect(entry.entryType).toBe('article');
    expect(entry.key).toBe('1011453292500');
    expect(entry.fields).toContainEqual({
      name: 'title',
      value: 'Demo doi reference for 10.1145/3292500'
    });
    expect(entry.fields).toContainEqual({ name: 'year', value: '2024' });
  });

  it('falls back to a kind-based key and label when the query is empty', async () => {
    const entry = await browserBibBackend().lookupReference('', 'arxiv');
    expect(entry.key).toBe('arxivref');
    expect(entry.fields).toContainEqual({
      name: 'title',
      value: 'Demo arxiv reference for (empty)'
    });
  });
});

describe('selectBibBackend', () => {
  it('returns the tauri backend in a Tauri window', async () => {
    invoke.mockResolvedValueOnce({ entry_type: 'misc', key: 'k', fields: [] });
    await selectBibBackend(fakeWindow(true)).lookupReference('x', 'doi');
    expect(invoke).toHaveBeenCalledWith('lookup_reference', { query: 'x', kind: 'doi' });
  });

  it('returns the browser backend in a plain window', async () => {
    const entry = await selectBibBackend(fakeWindow(false)).lookupReference('x', 'doi');
    expect(entry.key).toBe('x');
    expect(invoke).not.toHaveBeenCalled();
  });
});
