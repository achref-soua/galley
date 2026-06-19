import { describe, it, expect } from 'vitest';
import {
  parseBib,
  serializeBib,
  serializeEntry,
  entryField,
  entrySummary,
  citeCandidates,
  type BibEntry
} from '../src/lib/bibliography';

const entry = (entryType: string, key: string, fields: [string, string][]): BibEntry => ({
  entryType,
  key,
  fields: fields.map(([name, value]) => ({ name, value }))
});

describe('parseBib', () => {
  it('parses a single entry with mixed delimiters', () => {
    const src = `@article{key1,
  author = {Lovelace, Ada},
  title  = "Notes on the Analytical Engine",
  year   = 1843
}`;
    const entries = parseBib(src);
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('article');
    expect(entries[0].key).toBe('key1');
    expect(entryField(entries[0], 'author')).toBe('Lovelace, Ada');
    expect(entryField(entries[0], 'title')).toBe('Notes on the Analytical Engine');
    expect(entryField(entries[0], 'year')).toBe('1843');
  });

  it('parses multiple entries and ignores surrounding noise', () => {
    const src = 'junk\n@book{a, title = {One}}\n% comment\n@misc{b, title = {Two},}';
    const entries = parseBib(src);
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toBe('a');
    expect(entries[0].entryType).toBe('book');
    expect(entries[1].key).toBe('b');
    expect(entries[1].fields).toHaveLength(1);
  });

  it('handles nested braces in values', () => {
    const entries = parseBib('@article{k, title = {A {Nested} Title}}');
    expect(entryField(entries[0], 'title')).toBe('A {Nested} Title');
  });

  it('accepts punctuated field names', () => {
    const entries = parseBib('@misc{k, date-added = {2020}, file_name = {a.pdf}}');
    expect(entryField(entries[0], 'date-added')).toBe('2020');
    expect(entryField(entries[0], 'file_name')).toBe('a.pdf');
  });

  it('skips special blocks', () => {
    const src = `@comment{ ignored {with braces} }
@string{ pub = {ACM} }
@preamble{ "x" }
@article{real, title = {Kept}}`;
    const entries = parseBib(src);
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('real');
  });

  it('tolerates malformed and truncated input', () => {
    expect(parseBib('@')).toEqual([]);
    expect(parseBib('@ {x}')).toEqual([]);
    expect(parseBib('@article')).toEqual([]);

    const truncated = parseBib('@article{k, title = {Unterminated');
    expect(truncated).toHaveLength(1);
    expect(entryField(truncated[0], 'title')).toBe('Unterminated');

    const quoted = parseBib('@article{k, note = "open');
    expect(entryField(quoted[0], 'note')).toBe('open');

    const noEq = parseBib('@article{k, lonely }');
    expect(noEq).toHaveLength(1);
    expect(noEq[0].fields).toEqual([]);
  });

  it('parses bare values terminated by comma or brace', () => {
    const entries = parseBib('@article{k, year = 2020, volume = 7}');
    expect(entryField(entries[0], 'year')).toBe('2020');
    expect(entryField(entries[0], 'volume')).toBe('7');
  });

  it('handles empty and keyless inputs', () => {
    expect(parseBib('')).toEqual([]);
    const solo = parseBib('@book{solo}');
    expect(solo).toHaveLength(1);
    expect(solo[0].key).toBe('solo');
    expect(solo[0].fields).toEqual([]);
  });
});

describe('entryField', () => {
  it('matches case-insensitively and returns null when absent', () => {
    const e = entry('article', 'k', [['Title', 'Notes']]);
    expect(entryField(e, 'TITLE')).toBe('Notes');
    expect(entryField(e, 'missing')).toBeNull();
  });
});

describe('serialize', () => {
  it('serializes an entry round-trip', () => {
    const e = entry('article', 'k', [
      ['author', 'Ada Lovelace'],
      ['title', 'Notes']
    ]);
    const text = serializeEntry(e);
    expect(text).toBe('@article{k,\n  author = {Ada Lovelace},\n  title = {Notes},\n}\n');
    expect(parseBib(text)).toEqual([e]);
  });

  it('serializes an entry with no fields', () => {
    expect(serializeEntry(entry('misc', 'x', []))).toBe('@misc{x,\n}\n');
  });

  it('serializes a list with blank-line separators', () => {
    const entries = [
      entry('book', 'a', [['title', 'One']]),
      entry('book', 'b', [['title', 'Two']])
    ];
    expect(serializeBib(entries)).toBe(
      '@book{a,\n  title = {One},\n}\n\n@book{b,\n  title = {Two},\n}\n'
    );
    expect(serializeBib([])).toBe('');
  });
});

describe('entrySummary', () => {
  it('combines author, year, and title', () => {
    const full = entry('article', 'k', [
      ['author', 'Lovelace, Ada and Babbage, Charles'],
      ['year', '1843'],
      ['title', 'Notes']
    ]);
    expect(entrySummary(full)).toBe('Lovelace (1843) — Notes');

    const firstLast = entry('article', 'k', [
      ['author', 'Ada Lovelace'],
      ['title', 'Notes']
    ]);
    expect(entrySummary(firstLast)).toBe('Lovelace — Notes');

    const yearOnly = entry('misc', 'k', [
      ['year', '2020'],
      ['title', 'Untitled-ish']
    ]);
    expect(entrySummary(yearOnly)).toBe('(2020) — Untitled-ish');

    const bare = entry('misc', 'k', []);
    expect(entrySummary(bare)).toBe('(untitled)');

    // A single-token author (no comma, no space) is used as-is.
    const single = entry('misc', 'k', [
      ['author', 'Plato'],
      ['title', 'Republic']
    ]);
    expect(entrySummary(single)).toBe('Plato — Republic');
  });
});

describe('citeCandidates', () => {
  it('maps entries to key + summary candidates', () => {
    const entries = [
      entry('article', 'lovelace1843', [
        ['author', 'Ada Lovelace'],
        ['title', 'Notes']
      ])
    ];
    expect(citeCandidates(entries)).toEqual([{ key: 'lovelace1843', summary: 'Lovelace — Notes' }]);
  });
});
