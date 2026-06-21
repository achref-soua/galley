# Privacy

Galley is local-first. Your documents, projects, and keystrokes stay on your
machine. Nothing is collected, and nothing leaves the device unless you
explicitly enable a feature that needs the network.

## What never leaves your machine

- Document content, file paths, and project structure.
- Compile logs and PDFs.
- Any text you type.

## Network features are opt-in

- **AI providers** — only if you configure one and consent per project. The key
  lives in the OS keychain; you always see what would be sent.
- **Reference lookups** (Crossref / arXiv / DOI) — only when you ask for one.
- **Project import from a URL** — only when you provide the URL.

## Crash reporting (opt-in, off by default)

Crash reporting is **off by default** and can be turned on in
**Settings → About → Send anonymous crash reports**. When enabled, a report is
**anonymised**: it contains the Galley version, the OS family, and a
path-stripped, truncated error signature — **never** document content, file
paths, or secrets. The reporting payload is built by `crash-report.ts`; no report
is ever produced without consent.

There is **no telemetry endpoint** in this release — the actual sending of reports
is deferred to a post-beta release (§8.4). The opt-in and the anonymising payload
builder ship now so the consent model is in place first.

## Feedback

**Settings → About → Send feedback…** opens a pre-filled GitHub issue with the
version and OS. Nothing is submitted automatically — you review and post it
yourself.
