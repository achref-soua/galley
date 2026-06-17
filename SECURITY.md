# Security policy

Galley runs locally, but it treats every document and imported project as untrusted input.
Security is a first-class concern and is hardened progressively across releases (the full
sandbox and threat model land in `v0.7.0`).

## Supported versions

Galley is pre-1.0 and under active development. Security fixes target the latest released
version.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue:

- Use GitHub's **private vulnerability reporting** (Security → Report a vulnerability), or
- email **achref.soua@outlook.com**.

Include reproduction steps and the affected version. You will receive an acknowledgement,
and fixes for confirmed issues will be released and credited (if you wish).

## Security posture

- **Local-first.** Nothing leaves your machine unless you explicitly enable a cloud AI
  provider, and then only the data you consent to send.
- **No secrets in the repository.** API keys live in the OS keychain, never in plaintext,
  never in logs or commits.
- **Sandboxing (in progress).** Compilation and project import run with shell-escape
  disabled by default; archive extraction and `\input` handling guard against path
  traversal and symlink escape. Project configuration is parsed, never executed.
- **Supply chain.** Dependencies are pinned and scanned (`cargo audit`, `pnpm audit`) as
  part of the quality gate; release artifacts are checksummed (and signed once certificates
  are configured).
