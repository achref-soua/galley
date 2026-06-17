/**
 * Pure helpers for turning a project's flat list of file paths into the
 * file-explorer tree the sidebar renders. Kept free of Svelte and Tauri so it
 * carries its coverage with plain unit tests.
 */

/** How a project file is classified, mirroring `galley_core::DocumentKind`. */
export type DocumentKind = 'tex' | 'bib' | 'asset' | 'other';

/** The last path segment (the file or folder name). */
export function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? path : path.slice(slash + 1);
}

/** Classify a project-relative path by its extension. */
export function classifyKind(path: string): DocumentKind {
  const name = basename(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot <= 0 ? '' : name.slice(dot + 1);
  if (ext === 'tex' || ext === 'ltx') {
    return 'tex';
  }
  if (ext === 'bib') {
    return 'bib';
  }
  if (
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'pdf' ||
    ext === 'eps' ||
    ext === 'svg'
  ) {
    return 'asset';
  }
  return 'other';
}

/** A flattened, depth-annotated tree node for rendering. */
export interface TreeNode {
  /** The display name (last path segment). */
  name: string;
  /** The full project-relative path. */
  path: string;
  /** Nesting depth (0 at the project root). */
  depth: number;
  /** Whether this node is a directory header rather than a file. */
  isDir: boolean;
  /** The file's kind (always `'other'` for directories). */
  kind: DocumentKind;
}

/**
 * Build a sorted, flattened file tree from a project's relative paths.
 * Directories appear as headers above their contents; files carry their kind.
 */
export function buildFileTree(paths: string[]): TreeNode[] {
  const sorted = [...paths].sort();
  const nodes: TreeNode[] = [];
  const seenDirs = new Set<string>();

  for (const path of sorted) {
    const segments = path.split('/').filter((segment) => segment.length > 0);
    let prefix = '';
    for (let depth = 0; depth < segments.length - 1; depth += 1) {
      const segment = segments[depth];
      prefix = prefix === '' ? segment : `${prefix}/${segment}`;
      if (!seenDirs.has(prefix)) {
        seenDirs.add(prefix);
        nodes.push({ name: segment, path: prefix, depth, isDir: true, kind: 'other' });
      }
    }
    const name = segments[segments.length - 1];
    nodes.push({ name, path, depth: segments.length - 1, isDir: false, kind: classifyKind(path) });
  }

  return nodes;
}
