# Migration & import

Bring an existing LaTeX project into Galley without touching the original, and
round-trip it back out clean. Galley analyses by parsing — it never executes the
project.

## Sources

- **A local folder** — open in place or copy in.
- **An Overleaf project** — download the source `.zip` (Menu → Download → Source)
  and import it, or paste the Overleaf **git URL**.
- **An arXiv paper** — import the `.tar.gz` source tarball.
- **Any editor's folder** — TeXstudio, VS Code, etc.

Archives are extracted with zip-slip / path-traversal / symlink / size / file-count
guards (see [security](../SECURITY.md)).

## What the wizard does

1. **Analyse** (parse-only) — detect the root/main file (`\documentclass` +
   `\begin{document}`, `%!TEX root`, `main.tex` conventions, include graph), the
   engine (`%!TEX program`, `latexmkrc`, heuristics like `fontspec` ⇒ XeLaTeX),
   the bib tool (BibTeX / Biber), the encoding, and packages/fonts.
2. **Preview & confirm** — shows the detected root, engine, bib tool, and any
   warnings; you can override the main file and engine.
3. **Bring it in** — copies files preserving structure, encoding, and line
   endings; writes a throwaway `.galley/project.toml` that never affects
   compilation.
4. **Initialise history** — `git init` (or detect an existing repo) and an
   "Imported" checkpoint.
5. **Validate** — a first compile; failures route to the problems panel.

The wizard reports its phase as it works, so a large import is never a silent
spinner.

## Round-trip back out

**Export → Source Bundle** produces a clean ZIP with `.galley/` stripped — it
re-uploads to Overleaf and compiles unchanged. No lock-in, either direction.

## If a project needs system TeX

The embedded Tectonic engine covers the vast majority of documents. When a project
needs a package or engine Tectonic can't serve, the importer suggests the opt-in
`latexmk` / system TeX Live fallback for that project; the default stays embedded
Tectonic.
