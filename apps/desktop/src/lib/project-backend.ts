/**
 * The seam between the UI and the project filesystem.
 *
 * Everything the UI does to a project — create it, open a folder, read and save
 * files, pick a directory — goes through a {@link ProjectBackend}. In the packaged
 * app that backend forwards to the Rust command layer over Tauri's IPC; in a plain
 * browser (and in tests / Playwright) an in-memory backend stands in, so the whole
 * UI is exercised without a native runtime.
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { type DocumentKind, basename, classifyKind } from './file-tree';

/** A project file as the UI holds it. */
export interface ProjectFile {
  /** Project-relative, forward-slashed path. */
  path: string;
  /** The file's kind. */
  kind: DocumentKind;
}

/** A project snapshot returned by the backend. */
export interface ProjectSnapshot {
  /** Display name. */
  name: string;
  /** Absolute project root path. */
  root: string;
  /** Project-relative path of the root document, or `''` if none. */
  rootDocument: string;
  /** Every file in the project. */
  documents: ProjectFile[];
}

/** The outcome of a compile: whether a PDF was produced, the log, and the bytes. */
export interface CompileOutcome {
  /** Whether the compile produced a PDF. */
  ok: boolean;
  /** The TeX log (or a short message). */
  log: string;
  /** The produced PDF bytes, or `null` when the compile failed. */
  pdf: Uint8Array | null;
}

/** The operations the UI needs to work with projects on disk. */
export interface ProjectBackend {
  /** Create a new project named `name` inside `parent`. */
  createProject(parent: string, name: string): Promise<ProjectSnapshot>;
  /** Open an existing folder as a project. */
  openFolder(path: string): Promise<ProjectSnapshot>;
  /** Read a project file. */
  readDocument(root: string, rel: string): Promise<string>;
  /** Save a project file. */
  saveDocument(root: string, rel: string, contents: string): Promise<void>;
  /** Compile `source` as `rootDocument`, returning the result. */
  compile(source: string, rootDocument: string): Promise<CompileOutcome>;
  /** Ask the user to pick a folder, returning its path or `null` if cancelled. */
  pickFolder(title: string): Promise<string | null>;
}

/** The shape of the project as serialized by the Rust command layer. */
interface RawProject {
  name: string;
  root: string;
  root_document: string;
  documents: ProjectFile[];
}

/** The compile result as serialized by the Rust command layer. */
interface RawCompile {
  ok: boolean;
  log: string;
  pdf: number[] | null;
}

function fromRaw(raw: RawProject): ProjectSnapshot {
  return {
    name: raw.name,
    root: raw.root,
    rootDocument: raw.root_document,
    documents: raw.documents
  };
}

/** The backend backed by the Tauri command layer (used in the packaged app). */
export function tauriProjectBackend(): ProjectBackend {
  return {
    async createProject(parent, name) {
      return fromRaw(await invoke<RawProject>('create_project', { parent, name }));
    },
    async openFolder(path) {
      return fromRaw(await invoke<RawProject>('open_folder', { path }));
    },
    readDocument(root, rel) {
      return invoke<string>('read_document', { root, rel });
    },
    async saveDocument(root, rel, contents) {
      await invoke('save_document', { root, rel, contents });
    },
    async compile(source, rootDocument) {
      const raw = await invoke<RawCompile>('compile_document', { source, rootDocument });
      return {
        ok: raw.ok,
        log: raw.log,
        pdf: raw.pdf === null ? null : new Uint8Array(raw.pdf)
      };
    },
    async pickFolder(title) {
      const selected = await open({ directory: true, multiple: false, title });
      return typeof selected === 'string' ? selected : null;
    }
  };
}

/** The starter document for projects created in the in-memory backend. */
const BROWSER_STARTER =
  '\\documentclass{article}\n\n\\begin{document}\n\nHello from Galley. Pull a proof.\n\n\\end{document}\n';

/** The demo project the in-memory backend seeds, so a plain browser is not empty. */
const DEMO_FILES: ReadonlyArray<[string, string]> = [
  ['main.tex', '\\documentclass{article}\n\\begin{document}\nA Galley demo.\n\\end{document}\n'],
  ['sections/introduction.tex', '\\section{Introduction}\nWelcome to Galley.\n'],
  ['references.bib', '@book{galley, title = {Galley}}\n']
];

/**
 * A tiny, valid one-page PDF (base64) returned by the in-memory compile, so the
 * browser/dev build and the Playwright e2e exercise the real PDF.js preview
 * without a TeX engine. The packaged app compiles for real via the Rust backend.
 */
const DEMO_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMjAwXSAvUmVzb3VyY2VzIDw8ID4+ID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMjAzCiUlRU9G';

/** Decode the embedded demo PDF to bytes. */
function demoPdfBytes(): Uint8Array {
  const binary = atob(DEMO_PDF_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * An in-memory backend for the browser, dev, and tests. It keeps one project's
 * files in a map and seeds a small demo so the UI has something to show.
 */
export function browserProjectBackend(): ProjectBackend {
  const files = new Map<string, string>(DEMO_FILES);

  const snapshot = (name: string, root: string, rootDocument: string): ProjectSnapshot => ({
    name,
    root,
    rootDocument,
    documents: [...files.keys()].map((path) => ({ path, kind: classifyKind(path) }))
  });

  return {
    async createProject(parent, name) {
      files.clear();
      files.set('main.tex', BROWSER_STARTER);
      return snapshot(name, `${parent}/${name}`, 'main.tex');
    },
    async openFolder(path) {
      const name = basename(path) === '' ? 'project' : basename(path);
      return snapshot(name, path, 'main.tex');
    },
    async readDocument(_root, rel) {
      const contents = files.get(rel);
      if (contents === undefined) {
        throw new Error(`no such file: ${rel}`);
      }
      return contents;
    },
    async saveDocument(_root, rel, contents) {
      files.set(rel, contents);
    },
    async compile(source) {
      // A deterministic local proof: a document that closes compiles to the demo
      // PDF; otherwise it "fails" with a message, so both states can be exercised.
      if (source.includes('\\end{document}')) {
        return { ok: true, log: 'Compiled locally (demo).', pdf: demoPdfBytes() };
      }
      return { ok: false, log: 'Missing \\end{document}.', pdf: null };
    },
    async pickFolder() {
      return '/demo/galley-project';
    }
  };
}

/** Whether the app is running inside a Tauri window. */
export function isTauri(win: Window = window): boolean {
  return '__TAURI_INTERNALS__' in win;
}

/** Pick the right backend for the current runtime. */
export function selectBackend(win: Window = window): ProjectBackend {
  return isTauri(win) ? tauriProjectBackend() : browserProjectBackend();
}
