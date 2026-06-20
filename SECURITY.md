# Security policy

Galley runs locally, but it treats every document and imported project as untrusted input.
Security is a first-class concern and is hardened progressively across releases.

## Supported versions

Galley is pre-1.0 and under active development. Security fixes target the latest released
version.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue:

- Use GitHub's **private vulnerability reporting** (Security → Report a vulnerability), or
- email **achref.soua@outlook.com**.

Include reproduction steps and the affected version. You will receive an acknowledgement,
and fixes for confirmed issues will be released and credited (if you wish).

## Security posture (v0.7.0)

### Local-first, no ambient authority

Nothing leaves your machine unless you explicitly enable a cloud AI provider, and then only
the data you consent to send. The application has no server, no persistent network
connection, and no background daemon.

### Compile sandbox

- **Shell-escape is always off.** The embedded Tectonic engine does not implement `\write18`,
  `\ShellEscape`, or `\directlua`. Shell-escape cannot execute regardless of any flag.
- `CompileRequest` carries `ShellEscapePolicy::Off` explicitly; the type system enforces the
  invariant. The future system-latexmk fallback adapter must honour it with `--no-shell-escape`.
- A pre-compile scanner (`galley-core::sandbox::scan_source`) detects all known shell-escape
  patterns and `\input`/`\include` traversal paths before compilation, surfacing them as UI
  warnings. The scanner is exposed via the `scan_document_source` Tauri command.

### Input path confinement

- Tectonic's in-process VFS is rooted at the `project_root`; `\input` resolution is confined
  to that tree by the engine itself.
- `SafeRoot` (galley-security) confines all project reads, writes, and listings to a single
  canonical project root. Absolute paths, `..` traversal, and symlinks resolving outside the
  project are refused.

### Archive import hardening

Archive extraction (`.zip` / `.tar.gz`) applies multiple independent guards:

- **Null bytes** in entry paths are rejected.
- **Absolute paths** (Unix `/…`, Windows `\…`, drive letters `C:\…`) are rejected.
- **`..` path components** (zip-slip) are rejected.
- **Symbolic links and hard links** are rejected.
- File count, per-file size, and total size limits are enforced via `ArchiveLimits`.
- All bytes land in memory as `FileEntry` values before any disk I/O; they are then written
  through `SafeRoot`, which performs a second traversal check on disk.

### Project configuration — parsed, never executed

The import pipeline reads `latexmkrc` as plain text to extract an engine hint, but never
executes it or any script found in the imported project.

### Secrets handling

- AI provider keys are stored via `galley-security`'s file-based secret store at
  `~/.galley/secrets/<provider>` with mode `0o600`, readable only by the owner.
- Keys are never written to compile logs, structured logs, error strings, or diagnostic output.
- `.gitignore` and `gitleaks` patterns prevent accidental commits.

### Update integrity

- The Tauri updater is **off by default**; the user must explicitly enable it in Settings.
- Update manifests are signed; the updater verifies the signature before applying any binary.
- Until signing certificates are configured, the updater is documented as a no-op.
- Tracked for formal signing setup in v0.7.3 (packaging & signing milestone).

### Tauri capability surface

- The Tauri capability configuration grants only `core:default` (IPC) and `dialog:default`
  (file picker). No `fs`, `shell`, `http`, or other plugins are enabled.
- Every Tauri command is typed and explicitly registered; no `allowlist: all`.
- CSP is enforced by the OS WebView.

### Supply chain

- `cargo audit` and `pnpm audit` run as part of `just ci`.
- Dependencies are pinned in `Cargo.lock` and `pnpm-lock.yaml`.
- SBOM generation: `syft` (or `cargo cyclonedx`) can be run manually and the output attached
  to release artifacts.
- Release artifacts are checksummed (`SHA256SUMS.txt`); code signing is wired and documented
  but awaits signing certificates.

## Threat model

The full threat catalogue, trust boundary diagram, and residual-risk assessment live in
[`docs/security/threat-model.md`](docs/security/threat-model.md). It covers eight threat
categories (T1–T8): shell-escape, input traversal, archive zip-slip, config execution,
secrets in plaintext, malicious update payload, Tauri WebView authority, and cloud LLM
data egress.

The threat model is versioned and reviewed before each beta / release candidate and whenever
a new external data path is introduced.
