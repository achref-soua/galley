# ADR-0026 — Template gallery: curated starters and user-saved templates

**Status:** Accepted  
**Date:** 2026-06-20

## Context

Every LaTeX project starts from a blank file. New users—and experienced ones switching document
types—routinely copy-paste boilerplate from past projects, online forums, or documentation just to
get the right `\documentclass` and preamble structure. This friction is unnecessary and, for
newcomers, a real barrier to getting started.

Galley needed a first-class way to begin a new project from a correct, ready-to-compile starting
point, without leaving the app.

## Decision

Ship a **template gallery** with two layers:

1. **Built-in catalog** — 12 curated templates covering the most common LaTeX document types:
   plain Article, IEEE Conference Paper, ACM Conference Paper (acmart), Springer LNCS, Beamer
   presentation, moderncv résumé, Cover Letter, Report, PhD Thesis, Book, tikzposter Poster, and
   Exam. Each is a complete, compilable document with instructive comments.

2. **User-saved templates** — any open document can be saved into the gallery with a custom name
   and category. Saved templates are persisted to `localStorage` under the key
   `galley:custom-templates` and survive app restarts.

### Entry points

- **Dashboard → "From template…" button** — available without a project open; closes the
  dashboard and opens the gallery.
- **Command palette → "New from Template"** — available at any time via Ctrl+Shift+P.

### "New from template" flow

1. User picks a template and clicks "Use template".
2. `ProjectController.pickAndCreateFromTemplate(name, body)` presents the OS folder picker.
3. A new project is created in the chosen parent directory.
4. The template body overwrites the default `main.tex`.
5. The project loads with the seeded content open in the editor.

### Data model

`TemplateDefinition` is a pure, serializable object:

```ts
{
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  body: string;
}
```

`TEMPLATE_CATEGORIES` is the ordered union of all valid category labels. `CustomTemplateStore`
wraps `localStorage` using the same pure-helper + class pattern established by `ProjectRegistry`
in ADR-0025, keeping the domain logic testable in isolation.

## Consequences

- Every built-in template is regression-tested: the test suite asserts that each body contains
  `\documentclass`, `\begin{document}`, and `\end{document}`, so a stale or broken body is caught
  at CI time.
- The "save current document as template" feature gives power users a lightweight snippet
  system without introducing a separate persistence mechanism.
- The gallery is stateless beyond `localStorage` — no new backend commands or Rust code needed.
- `pickAndCreateFromTemplate` extends the existing `#run` / `#load` plumbing, keeping the
  controller's single-owner invariant intact.
