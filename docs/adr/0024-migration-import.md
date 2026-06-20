# ADR-0024 — Migration import: ZIP/tarball/folder ingestion pipeline

**Status:** Accepted  
**Date:** 2026-06-20

## Context

Galley projects live on disk as plain directories. Users coming from Overleaf, arXiv, or an existing
local tree need a first-class way to bring their work in without manually copying files. The import
must be:

- **Safe** — archives from the internet are attacker-controlled; zip-slip, symlinks, and oversized
  payloads must be rejected before anything reaches the filesystem.
- **Informative** — the user should see detected engine, root document, packages, and warnings
  before committing to the import.
- **Testable** — all security branches must be exercised in unit tests; 100 % LLVM region coverage
  is required.

## Decision

### Crate layer (`galley-import`)

**`galley-import::archive`** provides two public extractors:

- `extract_zip(bytes, limits)` — validates and extracts `.zip` files in memory, rejecting symlinks,
  path-traversal (`..` in any component), oversized files, and too many entries.
- `extract_tarball(bytes, limits)` — same guarantees for gzip-compressed tarballs.

Both return `Vec<FileEntry>` (path + content pairs from `galley-core`). No bytes touch disk.

The internal `extract_from_archive(archive: Archive<Box<dyn Read + '_>>, limits)` helper uses a
**boxed trait object** rather than a generic `<R: Read>`. This is a deliberate coverage design
decision: a generic function produces one LLVM coverage record per monomorphisation; error-path
regions that are unreachable in one instantiation (e.g. `read_to_end` failure via `GzDecoder`)
can never be covered if the "primary" instantiation is counted separately by `llvm-cov report`,
even when the merged maximum is > 0. The single `Box<dyn Read + '_>` instantiation collapses all
monomorphisations into one record, making every branch reachable from a single test set.

**`galley-import::lib`** provides:

- `import_from_entries(parent, name, entries, version, created)` — materialises `Vec<FileEntry>`
  into a new project directory via `SafeRoot`, writes the `.galley/project.toml` manifest, and
  returns an `ImportedWorkspace` that includes the pure `analyze_project` profile.
- `open_folder(path, version, created)` — opens an existing directory as a Galley project,
  detecting the root document and (re-)writing the manifest.
- `create_project(parent, name, version, created)` — creates a fresh project with a starter
  `main.tex`.
- `export_clean_bundle(workspace)` — zips project files, stripping `.galley/` metadata, for direct
  re-upload to Overleaf.

`export_clean_bundle` uses a **concrete** `Cursor<Vec<u8>>` rather than a generic writer, and
calls `.expect()` for `ZipWriter::start_file` / `finish` operations. Since `Cursor<Vec<u8>>`
grows on demand and never returns `io::Error`, these calls are provably infallible. This is
preferable to `?` + unreachable error handlers, which would introduce uncoverable regions in the
"Cursor" monomorphisation while adding no safety value.

### Frontend layer (`apps/desktop`)

**`import-backend.ts`** — `ImportBackend` interface with six async methods:

- `pickFile`, `pickFolder`, `pickSavePath` — OS file-picker wrappers.
- `analyzeArchive(path)`, `analyzeFolder(path)` — read-only Tauri IPC that returns a
  `ProjectAnalysis` (root file, engine, bibtool, encoding, package list, fonts, warnings).
- `importFromArchive(archivePath, parentDir, name)`, `importFromFolder(folderPath, parentDir, name)` — mutating Tauri IPC that materialises the project and returns a `ProjectSnapshot`.
- `exportBundleTo(rootDir, savePath)` — calls the export Tauri command and saves the zip.

`tauriImportBackend()`, `browserImportBackend()`, and `selectImportBackend()` follow the exact
same seam pattern used by every other backend in Galley (`VcsBackend`, `CompileBackend`, etc.).

**`ImportWizard.svelte`** — three-step modal (`choose → preview → confirm`):

1. **Choose** — two source cards (Archive, Local folder); triggers analysis immediately on pick.
2. **Preview** — analysis results table (root doc, engine, bibtool, encoding, packages, fonts,
   warnings); pre-fills the project name from the filename.
3. **Confirm** — editable name field + Browse destination; calls `importFromArchive` or
   `importFromFolder`.

Svelte 5 reactive update guards (`$if` branches in templates) generate "phantom" coverage branches
that are never exercisable from JavaScript. To avoid inflating the missed-branch count,
`fileCountLabel`, `fileSizeLabel`, `pkgHeader`, and `warnItem` are plain functions called from
the template rather than inline `$derived` expressions.

## Consequences

- All archive extraction is in-memory with hard limits (`max_files=2000`, `max_file_bytes=50 MiB`,
  `max_total_bytes=256 MiB`). Large projects that exceed these limits will be rejected with a
  clear error message.
- The Tauri commands for `analyzeArchive` / `analyzeFolder` are read-only; they extract or scan
  into an in-memory `Vec<FileEntry>` without writing to disk.
- `galley-import` reaches **100 % LLVM region / function / line coverage** via a combination of
  crafted archive helpers (symlink, hard-link, traversal, invalid-size, read-failure tarballs;
  corrupted-deflate ZIP), the `FailAfterHeaderRead` reader mock, and the `Box<dyn Read>` /
  concrete-Cursor approach described above.
