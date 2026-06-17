# ADR-0005: The project model and the sandboxed file store

- **Status:** Accepted
- **Date:** 2026-06-17

## Context

`v0.0.3` introduces the first real domain logic and the first filesystem access: Galley
must create projects, open existing on-disk LaTeX folders, and read and save their files.
Three things needed deciding: where the domain logic lives, how Galley stores its own
per-project metadata without disturbing a user's project, and how filesystem access is
confined so a malicious path or symlink cannot escape the project directory.

## Decision

**Domain logic lives in covered crates; the Tauri layer stays thin (per ADR-0002).**

- `galley-core` holds the pure model — `Project`, `Document`/`DocumentKind`, the
  `Manifest`, root-document detection, and a small dependency-free timestamp formatter. It
  has no I/O and is unit-tested to 100%.
- `galley-security` holds `SafeRoot`, the sandboxed `FileStore`: every read, write, and
  listing is confined to a single canonical project root.
- `galley-import` composes the two into `create_project` and `open_folder` (the minimal
  importer), tested against a real temporary filesystem.
- `apps/desktop/src-tauri` only converts arguments, calls a crate, and maps the result. It
  is excluded from coverage as bootstrap glue.

**Galley's metadata is non-intrusive and lives in `.galley/`.** A project's only Galley
footprint is a `.galley/project.toml` manifest. It never affects compilation, is safe to
delete, and is excluded from file listings. Opening a folder re-creates the manifest when
it is missing and preserves the project name from an existing one, so deleting `.galley/`
never breaks a project and an imported folder still builds anywhere.

**The manifest format is a dependency-free `key = "value"` subset of TOML.** Rather than
pull a general TOML parser (and its transitive supply-chain surface) into the otherwise
dependency-free core, the manifest is rendered and parsed by hand. The schema is tiny and
stable, the format stays human-readable and hand-editable, and the parser is trivially
driven to full coverage. If the manifest grows substantially, this decision is cheap to
revisit by adopting `toml`.

**The sandbox confines by construction, with layered checks.** `SafeRoot` canonicalises
the project root once. Each operation then:

1. rejects absolute paths, backslash separators, and `.`/`..` components lexically;
2. resolves the target under the canonical root and, for reads, canonicalises it and
   verifies it still begins with the root (catching symlinked components that escape);
3. for writes, checks every existing ancestor directory the same way before creating
   anything, and refuses to write through a symlink.

Listing never follows symlinks and never descends into `.galley/`.

## Consequences

- The security-critical confinement logic is small, in one place, and exhaustively tested
  (including `..`, absolute, symlink-escape, and unreadable-directory cases) against a real
  filesystem.
- Keeping `galley-core` dependency-free preserves fast, surprise-free 100% coverage and a
  minimal supply chain — at the cost of a small hand-written manifest reader.
- The thin command layer means a bug in the project logic is caught by crate tests, not
  hidden in the uncovered shell.
