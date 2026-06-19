/**
 * The seam between the bibliography UI and reference lookups.
 *
 * Resolving a DOI or an arXiv id into a bibliography entry is network I/O against
 * an external service, so — like the language server and the compiler — it lives
 * behind a backend. In the packaged app the backend forwards to a Rust command
 * (which does the HTTP and parses the response into a {@link BibEntry} via
 * `galley_core::bibliography`, keeping egress in the core); in a plain browser
 * and in tests an in-memory backend returns a deterministic stub, so the whole
 * add-a-reference flow is exercised without a network.
 */

import { invoke } from '@tauri-apps/api/core';
import { type BibEntry } from './bibliography';
import { isTauri } from './project-backend';

/** The kind of identifier being looked up. */
export type LookupKind = 'doi' | 'arxiv';

/** The operations the bibliography UI needs from a reference service. */
export interface BibBackend {
  /**
   * Resolve `query` (a DOI or arXiv id, per `kind`) into a bibliography entry.
   * Rejects when the reference cannot be found or the service is unreachable.
   */
  lookupReference(query: string, kind: LookupKind): Promise<BibEntry>;
}

/** A bibliography entry as serialized by the Rust command layer (snake_case). */
interface RawBibEntry {
  entry_type: string;
  key: string;
  fields: { name: string; value: string }[];
}

function fromRaw(raw: RawBibEntry): BibEntry {
  return {
    entryType: raw.entry_type,
    key: raw.key,
    fields: raw.fields.map((f) => ({ name: f.name, value: f.value }))
  };
}

/** The backend backed by the Tauri command layer (does the real HTTP in Rust). */
export function tauriBibBackend(): BibBackend {
  return {
    async lookupReference(query, kind) {
      return fromRaw(await invoke<RawBibEntry>('lookup_reference', { query, kind }));
    }
  };
}

/** Reduce a query to a safe, lowercased key fragment. */
function slug(query: string): string {
  return query.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * An in-memory backend for the browser, dev, and tests: it fabricates a
 * deterministic entry from the query so the add-a-reference flow can be driven
 * without a network. The packaged app resolves real references via Rust.
 */
export function browserBibBackend(): BibBackend {
  return {
    async lookupReference(query, kind) {
      const fragment = slug(query);
      return {
        entryType: 'article',
        key: fragment === '' ? `${kind}ref` : fragment,
        fields: [
          { name: 'author', value: 'Demo Author' },
          { name: 'title', value: `Demo ${kind} reference for ${query || '(empty)'}` },
          { name: 'year', value: '2024' }
        ]
      };
    }
  };
}

/** Pick the right bibliography backend for the current runtime. */
export function selectBibBackend(win: Window = window): BibBackend {
  return isTauri(win) ? tauriBibBackend() : browserBibBackend();
}
