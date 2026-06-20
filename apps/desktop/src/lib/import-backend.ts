/**
 * Import / export seam between the wizard UI and the Tauri command layer.
 *
 * {@link ImportBackend} is the interface every caller uses. The packaged app
 * binds {@link tauriImportBackend}; tests and the browser fallback use
 * {@link browserImportBackend}.
 *
 * All archive reads and writes happen in Rust — the frontend only passes
 * absolute file-system paths, so no Tauri fs plugin is needed.
 */

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { type ProjectSnapshot } from './project-backend';

/** Parse-only analysis of an import source as returned by the backend. */
export interface ProjectAnalysis {
  /** Detected root TeX document (e.g. `"main.tex"`). */
  rootFile: string;
  /** Human-readable engine label (e.g. `"Tectonic (embedded)"`). */
  engine: string;
  /** Human-readable bibliography tool (e.g. `"BibTeX"`). */
  bibTool: string;
  /** Detected source encoding (`"utf8"`, `"latin1"`, or `""`). */
  encoding: string;
  /** Sorted, deduplicated list of LaTeX packages detected in the source. */
  packages: string[];
  /** Sorted, deduplicated list of font names detected in the source. */
  fonts: string[];
  /** Human-readable advisory messages about potential compatibility issues. */
  warnings: string[];
  /** Number of files in the import source. */
  fileCount: number;
  /** Cumulative byte count of all files in the import source. */
  totalBytes: number;
}

/** Raw shape returned by the Rust command layer (snake_case). */
interface RawAnalysis {
  root_file: string;
  engine: string;
  bib_tool: string;
  encoding: string;
  packages: string[];
  fonts: string[];
  warnings: string[];
  file_count: number;
  total_bytes: number;
}

function fromRawAnalysis(raw: RawAnalysis): ProjectAnalysis {
  return {
    rootFile: raw.root_file,
    engine: raw.engine,
    bibTool: raw.bib_tool,
    encoding: raw.encoding,
    packages: raw.packages,
    fonts: raw.fonts,
    warnings: raw.warnings,
    fileCount: raw.file_count,
    totalBytes: raw.total_bytes
  };
}

/** Raw shape of a project as returned by the Rust command layer. */
interface RawProject {
  name: string;
  root: string;
  root_document: string;
  documents: Array<{ path: string; kind: string }>;
}

function fromRawProject(raw: RawProject): ProjectSnapshot {
  return {
    name: raw.name,
    root: raw.root,
    rootDocument: raw.root_document,
    documents: raw.documents.map((d) => ({
      path: d.path,
      kind: d.kind as 'tex' | 'bib' | 'asset' | 'other'
    }))
  };
}

/** Operations for importing, analysing, and exporting LaTeX projects. */
export interface ImportBackend {
  /**
   * Ask the user to pick a file. Returns its absolute path and basename,
   * or `null` when the dialog is cancelled.
   */
  pickFile(
    title: string,
    filters: Array<{ name: string; extensions: string[] }>
  ): Promise<{ path: string; name: string } | null>;

  /**
   * Ask the user to pick a directory. Returns its absolute path or `null`
   * when cancelled.
   */
  pickFolder(title: string): Promise<string | null>;

  /**
   * Ask the user to pick a save location. Returns its absolute path or
   * `null` when cancelled.
   */
  pickSavePath(
    defaultFilename: string,
    filters: Array<{ name: string; extensions: string[] }>
  ): Promise<string | null>;

  /**
   * Analyse an archive at `path` (`.zip` or `.tar.gz`) without writing
   * anything to disk. The archive type is inferred from the file extension.
   */
  analyzeArchive(path: string): Promise<ProjectAnalysis>;

  /**
   * Analyse an existing on-disk folder without modifying it.
   */
  analyzeFolder(path: string): Promise<ProjectAnalysis>;

  /**
   * Materialise the archive at `path` as a new project named `name` inside
   * `parent`. Archive type is inferred from the file extension.
   */
  importFromArchive(path: string, parent: string, name: string): Promise<ProjectSnapshot>;

  /**
   * Copy an existing on-disk folder into a new Galley project directory named
   * `name` inside `parent`. The source folder is left untouched.
   */
  importFromFolder(parent: string, name: string, src: string): Promise<ProjectSnapshot>;

  /**
   * Export the current project as a clean `.zip` bundle (`.galley/` stripped)
   * and write it to `dest`. Returns the number of bytes written.
   */
  exportBundleTo(root: string, dest: string): Promise<number>;
}

/** The backend backed by the Tauri command layer (used in the packaged app). */
export function tauriImportBackend(): ImportBackend {
  return {
    async pickFile(title, filters) {
      const result = await open({ title, filters, multiple: false, directory: false });
      if (typeof result !== 'string') return null;
      const parts = result.split(/[\\/]/);
      const name = parts[parts.length - 1];
      return { path: result, name };
    },

    async pickFolder(title) {
      const result = await open({ title, directory: true, multiple: false });
      return typeof result === 'string' ? result : null;
    },

    async pickSavePath(defaultFilename, filters) {
      const result = await save({ defaultPath: defaultFilename, filters });
      return typeof result === 'string' ? result : null;
    },

    async analyzeArchive(path) {
      const raw = await invoke<RawAnalysis>('import_analyze_archive', { path });
      return fromRawAnalysis(raw);
    },

    async analyzeFolder(path) {
      const raw = await invoke<RawAnalysis>('import_analyze_folder', { path });
      return fromRawAnalysis(raw);
    },

    async importFromArchive(path, parent, name) {
      const raw = await invoke<RawProject>('import_from_archive', { path, parent, name });
      return fromRawProject(raw);
    },

    async importFromFolder(parent, name, src) {
      const raw = await invoke<RawProject>('import_from_folder', { parent, name, src });
      return fromRawProject(raw);
    },

    async exportBundleTo(root, dest) {
      return invoke<number>('export_bundle_to', { root, dest });
    }
  };
}

/** A no-op browser backend for tests and dev mode (never touches disk). */
export function browserImportBackend(): ImportBackend {
  return {
    async pickFile() {
      return { path: '/demo/thesis.zip', name: 'thesis.zip' };
    },
    async pickFolder() {
      return '/demo/my-latex-project';
    },
    async pickSavePath(defaultFilename) {
      return `/demo/${defaultFilename}`;
    },
    async analyzeArchive() {
      return demoAnalysis();
    },
    async analyzeFolder() {
      return demoAnalysis();
    },
    async importFromArchive(_path, parent, name) {
      return demoProject(parent, name);
    },
    async importFromFolder(parent, name) {
      return demoProject(parent, name);
    },
    async exportBundleTo() {
      return 0;
    }
  };
}

function demoAnalysis(): ProjectAnalysis {
  return {
    rootFile: 'main.tex',
    engine: 'Tectonic (embedded)',
    bibTool: 'BibTeX',
    encoding: 'utf8',
    packages: ['amsmath', 'graphicx', 'hyperref'],
    fonts: [],
    warnings: [],
    fileCount: 3,
    totalBytes: 4096
  };
}

function demoProject(parent: string, name: string): ProjectSnapshot {
  return {
    name,
    root: `${parent}/${name}`,
    rootDocument: 'main.tex',
    documents: [
      { path: 'main.tex', kind: 'tex' },
      { path: 'references.bib', kind: 'bib' }
    ]
  };
}

/** Whether the app is running inside a Tauri window. */
function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

/** Pick the right import backend for the current runtime. */
export function selectImportBackend(): ImportBackend {
  return isTauri() ? tauriImportBackend() : browserImportBackend();
}
