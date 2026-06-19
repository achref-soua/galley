/**
 * Pure bibliography helpers — a tolerant `.bib` parser/serializer and the small
 * functions the citation UI needs. This mirrors `galley_core::bibliography`
 * (Rust) so the project's `.bib` files can be parsed client-side, with no IPC
 * round-trip, exactly the way the include-graph is. Both sides are maintained in
 * parallel; the grammar is small and stable.
 *
 * BibTeX and biblatex share the `@type{key, field = value}` grammar, so both
 * parse unchanged. All functions are I/O-free and fully testable.
 */

/** A single `name = value` field; `name` is lowercased, `value` is verbatim. */
export interface BibField {
  /** The lowercased field name (e.g. `author`, `title`, `year`). */
  name: string;
  /** The field's value, with surrounding braces or quotes stripped. */
  value: string;
}

/** A bibliography entry: its type, citation key, and ordered fields. */
export interface BibEntry {
  /** The lowercased entry type without the `@` (e.g. `article`). */
  entryType: string;
  /** The citation key used by `\cite{…}` (case preserved). */
  key: string;
  /** The entry's fields, in source order. */
  fields: BibField[];
}

/** A citation candidate for the editor's completion and the bibliography panel. */
export interface CiteCandidate {
  /** The citation key inserted into `\cite{…}`. */
  key: string;
  /** A one-line human summary (author, year, title). */
  summary: string;
}

const FIELD_NAME_PUNCT = new Set(['_', '-', '+', ':', '.']);

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isAlphanumeric(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

/** A cursor over the characters of a `.bib` document. */
class BibParser {
  private readonly chars: string[];
  private pos = 0;

  constructor(input: string) {
    this.chars = Array.from(input);
  }

  private peek(): string | null {
    return this.pos < this.chars.length ? this.chars[this.pos] : null;
  }

  private bump(): string | null {
    const current = this.peek();
    if (current !== null) {
      this.pos += 1;
    }
    return current;
  }

  private consume(expected: string): boolean {
    if (this.peek() === expected) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  private skipWs(): void {
    for (let c = this.peek(); c !== null; c = this.peek()) {
      if (isWhitespace(c)) {
        this.pos += 1;
      } else {
        break;
      }
    }
  }

  /** Advance past the next `@`, consuming it. Returns `false` at end of input. */
  advanceToAt(): boolean {
    for (let c = this.peek(); c !== null; c = this.peek()) {
      this.pos += 1;
      if (c === '@') {
        return true;
      }
    }
    return false;
  }

  private readIdentifier(): string {
    let out = '';
    for (let c = this.peek(); c !== null; c = this.peek()) {
      if (isAlphanumeric(c) || c === '_') {
        out += c;
        this.pos += 1;
      } else {
        break;
      }
    }
    return out;
  }

  private readKey(): string {
    let out = '';
    for (let c = this.peek(); c !== null; c = this.peek()) {
      if (c === ',' || c === '}') {
        break;
      }
      out += c;
      this.pos += 1;
    }
    return out.trim();
  }

  private readFieldName(): string {
    let out = '';
    for (let c = this.peek(); c !== null; c = this.peek()) {
      if (isAlphanumeric(c) || FIELD_NAME_PUNCT.has(c)) {
        out += c;
        this.pos += 1;
      } else {
        break;
      }
    }
    return out;
  }

  /** Parse one entry; the cursor sits just past the `@`. */
  parseEntry(): BibEntry | null {
    const entryType = this.readIdentifier().toLowerCase();
    if (entryType === '') {
      return null;
    }
    this.skipWs();
    if (!this.consume('{')) {
      return null;
    }
    if (entryType === 'comment' || entryType === 'string' || entryType === 'preamble') {
      this.skipEntryBody();
      return null;
    }
    const key = this.readKey();
    const fields: BibField[] = [];
    for (;;) {
      this.skipWs();
      if (!this.consume(',')) {
        break;
      }
      this.skipWs();
      const field = this.readField();
      if (field !== null) {
        fields.push(field);
      }
    }
    this.skipWs();
    this.consume('}');
    return { entryType, key, fields };
  }

  private readField(): BibField | null {
    const name = this.readFieldName().toLowerCase();
    if (name === '') {
      return null;
    }
    this.skipWs();
    if (!this.consume('=')) {
      return null;
    }
    this.skipWs();
    const value = this.readValue();
    return { name, value };
  }

  private readValue(): string {
    const c = this.peek();
    if (c === '{') {
      return this.readBraced();
    }
    if (c === '"') {
      return this.readQuoted();
    }
    return this.readBare();
  }

  private readBraced(): string {
    this.pos += 1; // consume the opening '{'
    let depth = 1;
    let out = '';
    for (let c = this.bump(); c !== null; c = this.bump()) {
      if (c === '{') {
        depth += 1;
        out += c;
      } else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
        out += c;
      } else {
        out += c;
      }
    }
    return out;
  }

  private readQuoted(): string {
    this.pos += 1; // consume the opening '"'
    let out = '';
    for (let c = this.bump(); c !== null; c = this.bump()) {
      if (c === '"') {
        break;
      }
      out += c;
    }
    return out;
  }

  private readBare(): string {
    let out = '';
    for (let c = this.peek(); c !== null; c = this.peek()) {
      if (c === ',' || c === '}') {
        break;
      }
      out += c;
      this.pos += 1;
    }
    return out.trim();
  }

  private skipEntryBody(): void {
    let depth = 1;
    for (let c = this.bump(); c !== null; c = this.bump()) {
      if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }
  }
}

/** Parse a `.bib` document into its entries, skipping special blocks. */
export function parseBib(input: string): BibEntry[] {
  const parser = new BibParser(input);
  const entries: BibEntry[] = [];
  while (parser.advanceToAt()) {
    const entry = parser.parseEntry();
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}

/** The value of `entry`'s field named `name`, matched case-insensitively. */
export function entryField(entry: BibEntry, name: string): string | null {
  const lower = name.toLowerCase();
  const match = entry.fields.find((f) => f.name.toLowerCase() === lower);
  return match === undefined ? null : match.value;
}

/** Serialize one entry to canonical `.bib` text (one field per indented line). */
export function serializeEntry(entry: BibEntry): string {
  let out = `@${entry.entryType}{${entry.key},\n`;
  for (const field of entry.fields) {
    out += `  ${field.name} = {${field.value}},\n`;
  }
  out += '}\n';
  return out;
}

/** Serialize a list of entries, separated by a blank line. */
export function serializeBib(entries: BibEntry[]): string {
  return entries.map(serializeEntry).join('\n');
}

/** The first author's surname from a BibTeX `author` field. */
function firstAuthor(author: string): string {
  const andIdx = author.indexOf(' and ');
  const first = (andIdx >= 0 ? author.slice(0, andIdx) : author).trim();
  const comma = first.indexOf(',');
  if (comma >= 0) {
    return first.slice(0, comma).trim();
  }
  const space = first.lastIndexOf(' ');
  return space >= 0 ? first.slice(space + 1) : first;
}

/** A one-line summary `Surname (Year) — Title`, degrading when fields are absent. */
export function entrySummary(entry: BibEntry): string {
  const title = entryField(entry, 'title') ?? '(untitled)';
  let lead = '';
  const author = entryField(entry, 'author');
  if (author !== null) {
    lead += firstAuthor(author);
  }
  const year = entryField(entry, 'year');
  if (year !== null) {
    if (lead !== '') {
      lead += ' ';
    }
    lead += `(${year})`;
  }
  return lead === '' ? title : `${lead} — ${title}`;
}

/** Map entries to citation candidates for completion and the panel. */
export function citeCandidates(entries: BibEntry[]): CiteCandidate[] {
  return entries.map((entry) => ({ key: entry.key, summary: entrySummary(entry) }));
}
