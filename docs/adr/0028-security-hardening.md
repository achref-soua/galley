# ADR-0028 — Security hardening (v0.7.0)

**Status:** Accepted  
**Date:** 2026-06-21  
**Deciders:** Achref Soua

---

## Context

Galley accepts user-supplied LaTeX source files and imports archive bundles from
potentially untrusted sources. Before the beta release (v0.8.0), the compile and
import sandboxes need to be explicitly finalised, documented, and verified. The
following threat categories are in scope for v0.7.0:

1. **Shell-escape** — LaTeX constructs (`\write18`, `\immediate\write18`,
   `\ShellEscape`, `\directlua`, `\luaexec`, pipe-input `\input|`) that ask the
   TeX engine to execute arbitrary OS commands.
2. **Input path traversal** — `\input{../../etc/passwd}` or similar constructs
   that try to read files outside the project directory.
3. **Archive path traversal** — zip-slip and related attacks in `.zip`/`.tar.gz`
   imports: `..` components, absolute paths, null bytes, Windows drive letters.
4. **Secrets handling** — AI provider keys in the OS keychain, never in logs or
   the repository.
5. **Update integrity** — the optional Tauri updater must verify signatures before
   applying any update.
6. **Supply chain** — pinned dependencies, `cargo audit`, `pnpm audit` run as
   part of `just ci`.

---

## Decisions

### 1. Shell-escape is always off for the embedded Tectonic engine

Tectonic does not implement `\write18` or `\ShellEscape`; shell-escape cannot
execute in the embedded engine regardless of any flag. The `ShellEscapePolicy`
field on `CompileRequest` is therefore informational for now: it is threaded
through the request so the future system-latexmk fallback adapter can honour it.
The default is `ShellEscapePolicy::Off` and must never be changed without an
explicit, confirmed user action.

### 2. Pre-compile source scanner in `galley-core::sandbox`

A pure, I/O-free `scan_source(source: &str) -> SandboxReport` function is added
to the `galley-core::sandbox` module. It reports:

- **Shell-escape occurrences** — all needles (`\write18`, `\immediate\write18`,
  `\ShellEscape`, `\directlua`, `\luaexec`, `\input|`) with byte offsets.
- **Input path traversal** — arguments of `\input{…}`, `\include{…}`, and
  `\subfile{…}` that are absolute paths, `..`-relative, backslash-prefixed, or
  pipe inputs.

The scanner does not block compilation; it surfaces findings the UI can show as
pre-compile warnings. The Tectonic VFS already enforces the boundary at the
engine level — the scanner is a diagnostic layer on top.

The scanner is exposed to the frontend via a new `scan_document_source` Tauri
command and a `scan-backend.ts` seam (browser stub returns an empty report).

### 3. Archive extraction hardened with three additional guards

The existing `reject_traversal` helper in `galley-import::archive` already
blocks `..` components. Three new checks are added:

- **Null bytes** in archive entry paths (`path.contains('\0')`).
- **Unix absolute paths** (starts with `/`).
- **Windows absolute paths** (starts with `\`) and **drive letters** (second
  byte is `:`).

These are rejected as zip-slip via the existing `ArchiveError::ZipSlip` variant
so no new error type is needed.

### 4. `CompileRequest` carries the shell-escape policy explicitly

A `shell_escape: ShellEscapePolicy` field is added to `CompileRequest` with a
`with_shell_escape(policy)` builder. The default is `ShellEscapePolicy::Off`.
The Tauri `compile_document` command sets this explicitly.

### 5. Update signatures are wired, off by default

The Tauri updater plugin is present in the dependency graph. Update manifests
are signed (or will be, once the signing key is configured). The updater is
`off` by default; the user must enable it in Settings. The `just sign` recipe
documents where to configure signing.

### 6. Supply-chain scanning is part of `just ci`

`cargo audit` and `pnpm audit` already run as part of `just ci` via
`scripts/ci/audit.sh`. SBOM generation is noted in `SECURITY.md`; `syft` or
`cargo cyclonedx` can be run manually and the output attached to releases.

### 7. Secrets never in plaintext

AI provider keys are stored via `galley-security`'s file-based secret store at
`~/.galley/secrets/` with mode `0o600`. They are never written to logs, commits,
or diagnostic output. The `galley-ai::ProviderGateway` reads keys only at call
time and does not cache them in memory beyond the request.

---

## Consequences

- Every compile request now explicitly carries `ShellEscapePolicy::Off`, making
  the no-shell-escape guarantee visible in the type system rather than implicit.
- The `scan_source` function gives the UI a way to warn authors about potentially
  dangerous constructs before they hit the engine.
- Archive imports reject four additional hostile path patterns.
- The threat model (see `docs/security/threat-model.md`) is now documented and
  versioned.
- A future system-latexmk adapter must honour `CompileRequest::shell_escape`.
- High-Contrast mode and full WCAG review are deferred to v0.7.2; this ADR
  covers only the security hardening scope.
