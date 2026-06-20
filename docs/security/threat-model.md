# Galley threat model

**Version:** v0.7.0 (2026-06-21)  
**Scope:** local desktop application — Tauri 2 + embedded Tectonic + import pipeline

Galley is a local application that processes user-supplied LaTeX documents and
archive bundles. It deliberately runs with no server, no persistent network
connection, and no ambient authority beyond what the user explicitly grants. This
document describes the threats considered, the controls in place, and the residual
risks.

---

## Trust boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│  OS process boundary (Tauri 2 app)                              │
│                                                                 │
│  ┌──────────────────┐      typed Tauri commands      ┌───────┐  │
│  │  WebView (Svelte)│ ─────────────────────────────► │  Rust │  │
│  │  • UI state      │ ◄───────────────────────────── │  core │  │
│  │  • user input    │                                │       │  │
│  └──────────────────┘                                └───┬───┘  │
│                                                          │      │
│  Tauri capability layer (allowlist)                      │      │
│  • only `core:default` + `dialog:default` permitted      │      │
│  • no raw FS/shell access from WebView                   │      │
│                                                          ▼      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  SafeRoot (galley-security)                                │ │
│  │  • all project reads/writes confined to one canonical dir  │ │
│  │  • rejects traversal, absolute paths, symlink escapes      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Tectonic (embedded compile engine, in-process VFS)        │ │
│  │  • shell-escape always off                                 │ │
│  │  • no subprocess spawn; no disk I/O outside VFS            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

  External (opt-in, user-gated):
  • Cloud LLM provider (user key, user consent per project)
  • Reference APIs (Crossref / arXiv / DOI lookups)
  • Tauri updater (signed manifest, off by default)
```

---

## Threat catalogue

### T1 — Shell-escape execution (HIGH)

**Threat:** A crafted `.tex` file uses `\write18`, `\immediate\write18`,
`\ShellEscape`, `\directlua`, `\luaexec`, or pipe-input `\input|` to execute OS
commands during compilation.

**Controls:**

- The embedded Tectonic engine does not implement `\write18` or `\ShellEscape`.
  Shell-escape cannot execute regardless of any flag.
- `CompileRequest` carries `ShellEscapePolicy::Off` explicitly; the engine adapter
  must honour it. The future system-latexmk fallback must default to `--no-shell-escape`.
- `galley-core::sandbox::scan_source` detects all known shell-escape patterns
  before compilation and surfaces them as UI warnings.

**Residual risk:** LOW. Tectonic cannot execute shell-escape. The scanner provides
an additional warning layer.

---

### T2 — Input path traversal (MEDIUM)

**Threat:** A `.tex` file contains `\input{../../etc/passwd}` or an absolute path,
trying to read files outside the project directory.

**Controls:**

- Tectonic's in-process VFS is rooted at `project_root`; `\input` resolution is
  confined to that tree by the engine.
- `galley-core::sandbox::scan_source` extracts `\input`, `\include`, and `\subfile`
  arguments and flags traversal patterns (`..`, `/`, `\`, drive letters, `|`) as
  warnings before compilation.
- The future system-latexmk fallback must set `-output-directory` and
  `-aux-directory` to the project root.

**Residual risk:** LOW for embedded Tectonic; MEDIUM for the latexmk fallback
(not yet implemented — this note must be revisited in ADR-0029).

---

### T3 — Archive path traversal / zip-slip (HIGH)

**Threat:** A crafted `.zip` or `.tar.gz` archive contains entries with `..`
components, absolute paths, null bytes, or Windows drive letters that would
extract files outside the target directory.

**Controls (galley-import::archive):**

- Null bytes in entry paths are rejected.
- Absolute paths (`/…`, `\…`, drive letters `C:\…`) are rejected.
- `..` path components are rejected (zip-slip).
- Symbolic links and hard links are rejected.
- File count, per-file size, and total size limits are enforced (`ArchiveLimits`).
- All bytes land in memory as `FileEntry` values; nothing touches disk until
  `import_from_entries` writes them through `SafeRoot` (which performs a second
  traversal check on disk).

**Residual risk:** LOW. Multiple independent layers guard against path escape.

---

### T4 — Project config execution (HIGH → mitigated)

**Threat:** A `latexmkrc`, `Makefile`, or shell script inside an imported project
is executed automatically, giving the project arbitrary code execution.

**Controls:**

- `galley-core::import::analyze_project` (the `ProjectAnalyzer`) is **parse-only**:
  it reads `latexmkrc` as plain text to extract the engine line, but never executes
  it via a shell.
- The import wizard never runs `make`, `latexmk`, or any script from the project.

**Residual risk:** VERY LOW. The control is a design invariant: the import path has
no subprocess spawn.

---

### T5 — Secrets in plaintext (MEDIUM)

**Threat:** An AI provider key stored in plaintext is exposed via logs, the git
repository, or diagnostic output.

**Controls:**

- Keys are stored via `galley-security`'s file-based secret store at
  `~/.galley/secrets/<provider>` with mode `0o600`, readable only by the owner.
- Keys are never written to log output, compile logs, or diagnostic strings.
- `gitleaks` / `.gitignore` patterns prevent accidental commits.
- The Rust `#[deny(unsafe_code)]` and the no-`console.log` ESLint rule prevent
  accidental key leaks through debug output.

**Residual risk:** LOW. A future enhancement is OS keychain integration.

---

### T6 — Malicious update payload (MEDIUM)

**Threat:** A tampered update binary is downloaded and executed, replacing the
legitimate Galley binary with malware.

**Controls:**

- The Tauri updater is **off by default**; the user must explicitly enable it.
- Update manifests are signed; the updater verifies the signature before applying.
- The `just sign` recipe documents where to configure the signing key.
- Until signing certs are configured, the updater is a documented no-op.

**Residual risk:** LOW when signing is configured; MEDIUM in the interim (no
signing certs yet). Tracked for v0.7.3 (packaging & signing).

---

### T7 — Tauri WebView authority / XSS (LOW)

**Threat:** JavaScript running in the WebView gains unexpected access to the host
OS via Tauri commands.

**Controls:**

- The Tauri capability configuration grants only `core:default` (IPC) and
  `dialog:default` (file picker); no `fs`, `shell`, `http`, or other plugins are
  enabled.
- Every Tauri command is typed and explicitly registered; no `allowlist: all`.
- CSP is enforced by the OS WebView (no inline scripts, no remote script sources).

**Residual risk:** VERY LOW. The capability set is the minimum required.

---

### T8 — Cloud LLM data egress (LOW → user-controlled)

**Threat:** Document content is sent to a cloud AI provider without the user's
knowledge.

**Controls:**

- No AI provider is enabled by default; the user must configure a key.
- A per-project consent gate (`ProjectAiConsent`) must be set before any content
  is sent for a new project.
- A `local-only` switch hard-disables all cloud egress.
- The `LlmProvider` port abstracts the provider; users can point it at a local
  Ollama/llama.cpp endpoint and never send data off-device.

**Residual risk:** NONE when local-only is set; LOW when a cloud provider is used
(the user has explicitly consented).

---

## Supply chain

- `cargo audit` and `pnpm audit` run as part of `just ci`.
- Dependency versions are pinned in `Cargo.lock` and `pnpm-lock.yaml`.
- SBOM generation: `syft` (or `cargo cyclonedx`) can be run manually and the
  output attached to release artifacts.
- Release artifacts are checksummed (`SHA256SUMS.txt`); code signing is wired and
  documented but awaits signing certificates.

---

## Out of scope (post-v1.0)

- Multi-user / networked environments (Galley is single-user, local-first).
- Browser-based attack surface (not a web app).
- Side-channel attacks on compile timing.
- Formal verification of the sandbox.

---

## Review schedule

This threat model should be reviewed and updated:

- Before each beta / release candidate milestone.
- Whenever a new external data path is added (new LLM provider, new import
  source, network features).
- When a significant vulnerability is reported.
