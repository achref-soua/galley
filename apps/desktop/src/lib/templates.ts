/**
 * Template gallery catalog and custom-template store.
 *
 * The built-in catalog covers every common LaTeX document type (article, IEEE,
 * ACM, Springer/LNCS, Beamer, moderncv résumé, cover letter, report, thesis,
 * book, poster, exam). User-defined templates are persisted in local storage by
 * {@link CustomTemplateStore}.
 *
 * All decision logic lives in pure helper functions (bottom half of this file),
 * testable without any storage or DOM.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The category a template belongs to. */
export type TemplateCategory =
  | 'Article'
  | 'Conference'
  | 'Thesis & Report'
  | 'Presentation'
  | 'CV & Letter'
  | 'Poster & Exam'
  | 'Book'
  | 'Custom';

/** All available template categories, in display order. */
export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  'Article',
  'Conference',
  'Thesis & Report',
  'Presentation',
  'CV & Letter',
  'Poster & Exam',
  'Book',
  'Custom'
];

/** A single template definition, built-in or user-saved. */
export interface TemplateDefinition {
  /** Unique identifier. Built-in ids are stable slugs; custom ids are timestamps. */
  id: string;
  /** Display name shown in the gallery. */
  name: string;
  /** The category this template belongs to. */
  category: TemplateCategory;
  /** A short description of the document type. */
  description: string;
  /** Complete `main.tex` content — the single file seeded into the new project. */
  body: string;
}

// ---------------------------------------------------------------------------
// Built-in template bodies
// ---------------------------------------------------------------------------

const ARTICLE_BODY = `\\documentclass[12pt,a4paper]{article}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Article Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Abstract text goes here.
\\end{abstract}

\\section{Introduction}
Introduction text.

\\section{Conclusion}
Conclusion text.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

const IEEE_BODY = `\\documentclass[conference]{IEEEtran}

\\usepackage[T1]{fontenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\begin{document}

\\title{Paper Title}

\\author{\\IEEEauthorblockN{Author Name}
\\IEEEauthorblockA{\\textit{Department} \\\\
Institution \\\\
email@example.com}}

\\maketitle

\\begin{abstract}
Abstract text here.
\\end{abstract}

\\begin{IEEEkeywords}
keyword1, keyword2
\\end{IEEEkeywords}

\\section{Introduction}
Introduction text.

\\section{Conclusion}
Conclusion text.

\\end{document}
`;

const ACM_BODY = `\\documentclass[sigconf]{acmart}

\\usepackage[T1]{fontenc}

\\begin{document}

\\title{Paper Title}

\\author{Author Name}
\\email{author@example.com}
\\affiliation{%
  \\institution{Institution}
  \\country{Country}
}

\\begin{abstract}
Abstract text here.
\\end{abstract}

\\keywords{keyword1, keyword2}

\\maketitle

\\section{Introduction}
Introduction text.

\\section{Conclusion}
Conclusion text.

\\bibliographystyle{ACM-Reference-Format}
\\bibliography{references}

\\end{document}
`;

const SPRINGER_BODY = `\\documentclass{llncs}

\\usepackage[T1]{fontenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\begin{document}

\\title{Paper Title}

\\author{Author Name\\inst{1}}

\\institute{Institution Name \\\\ \\email{author@example.com}}

\\maketitle

\\begin{abstract}
Abstract text here.
\\end{abstract}

\\section{Introduction}
Introduction text.

\\section{Conclusion}
Conclusion text.

\\bibliographystyle{splncs04}
\\bibliography{references}

\\end{document}
`;

const BEAMER_BODY = `\\documentclass{beamer}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}

\\usetheme{Madrid}

\\title{Presentation Title}
\\author{Author Name}
\\institute{Institution}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Outline}
  \\tableofcontents
\\end{frame}

\\section{Introduction}

\\begin{frame}{Introduction}
  \\begin{itemize}
    \\item First point.
    \\item Second point.
    \\item Third point.
  \\end{itemize}
\\end{frame}

\\section{Conclusion}

\\begin{frame}{Conclusion}
  Summary of the talk.
\\end{frame}

\\end{document}
`;

const MODERNCV_BODY = `\\documentclass[11pt,a4paper,sans]{moderncv}

\\moderncvstyle{banking}
\\moderncvcolor{blue}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[scale=0.85]{geometry}

\\name{First}{Last}
\\title{R\\'{e}sum\\'{e}}
\\email{you@example.com}
\\homepage{yourwebsite.com}

\\begin{document}

\\makecvtitle

\\section{Experience}
\\cventry{2020--present}{Job Title}{Company}{City}{}{Description of role.}

\\section{Education}
\\cventry{2016--2020}{Degree}{University}{City}{}{}

\\section{Skills}
\\cvitem{Languages}{Python, Rust, TypeScript}

\\end{document}
`;

const LETTER_BODY = `\\documentclass[12pt,a4paper]{letter}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}

\\signature{Your Name}
\\address{Your Address \\\\ City, Country}

\\begin{document}

\\begin{letter}{Recipient Name \\\\ Company \\\\ City, Country}

\\opening{Dear Hiring Manager,}

Body of the cover letter.

\\closing{Sincerely,}

\\end{letter}

\\end{document}
`;

const REPORT_BODY = `\\documentclass[12pt,a4paper]{report}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Report Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle
\\tableofcontents

\\chapter{Introduction}
Introduction text.

\\chapter{Background}
Background text.

\\chapter{Conclusion}
Conclusion text.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

const THESIS_BODY = `\\documentclass[12pt,a4paper]{report}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{setspace}

\\doublespacing

\\title{Thesis Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Abstract text here.
\\end{abstract}

\\tableofcontents
\\listoffigures
\\listoftables

\\chapter{Introduction}
\\label{ch:intro}
Introduction text.

\\chapter{Literature Review}
\\label{ch:lit}
Review text.

\\chapter{Methodology}
\\label{ch:method}
Methodology text.

\\chapter{Results}
\\label{ch:results}
Results text.

\\chapter{Conclusion}
\\label{ch:conc}
Conclusion text.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

const BOOK_BODY = `\\documentclass[12pt,a4paper]{book}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Book Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\frontmatter
\\maketitle
\\tableofcontents

\\mainmatter

\\part{Part One}

\\chapter{Opening Chapter}
Chapter text.

\\backmatter

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

const POSTER_BODY = `\\documentclass[25pt,a0paper,portrait]{tikzposter}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Poster Title}
\\author{Author Name}
\\institute{Institution}

\\begin{document}

\\maketitle

\\begin{columns}
  \\column{0.5}
  \\block{Introduction}{
    Introduction text.
  }
  \\block{Methods}{
    Methods text.
  }

  \\column{0.5}
  \\block{Results}{
    Results text.
  }
  \\block{Conclusion}{
    Conclusion text.
  }
\\end{columns}

\\end{document}
`;

const EXAM_BODY = `\\documentclass{exam}

\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}

\\title{Exam Title}
\\author{Course Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{center}
  \\fbox{\\fbox{\\parbox{5.5in}{\\centering
    Answer in the spaces provided.
  }}}
\\end{center}

\\begin{questions}

\\question[10] First question.
\\begin{solution}
  Solution here.
\\end{solution}

\\question[15] Second question.
\\begin{parts}
  \\part[5] First part.
  \\part[10] Second part.
\\end{parts}

\\end{questions}

\\end{document}
`;

// ---------------------------------------------------------------------------
// Built-in catalog
// ---------------------------------------------------------------------------

/** All built-in templates, in display order within each category. */
export const BUILT_IN_TEMPLATES: readonly TemplateDefinition[] = [
  {
    id: 'article',
    name: 'Article',
    category: 'Article',
    description: 'Standard LaTeX article with abstract, sections, and bibliography.',
    body: ARTICLE_BODY
  },
  {
    id: 'ieee',
    name: 'IEEE Conference Paper',
    category: 'Conference',
    description: 'Two-column IEEE conference paper using the IEEEtran class.',
    body: IEEE_BODY
  },
  {
    id: 'acm',
    name: 'ACM Conference Paper',
    category: 'Conference',
    description: 'ACM sigconf paper using the acmart class.',
    body: ACM_BODY
  },
  {
    id: 'springer-lncs',
    name: 'Springer LNCS Paper',
    category: 'Conference',
    description: 'Springer Lecture Notes in Computer Science (LNCS/llncs) paper.',
    body: SPRINGER_BODY
  },
  {
    id: 'report',
    name: 'Report',
    category: 'Thesis & Report',
    description: 'Multi-chapter technical report with table of contents.',
    body: REPORT_BODY
  },
  {
    id: 'thesis',
    name: 'PhD Thesis',
    category: 'Thesis & Report',
    description: 'Double-spaced thesis with abstract, multiple chapters, and bibliography.',
    body: THESIS_BODY
  },
  {
    id: 'beamer',
    name: 'Beamer Presentation',
    category: 'Presentation',
    description: 'Slide deck using Beamer with Madrid theme and itemised frames.',
    body: BEAMER_BODY
  },
  {
    id: 'moderncv',
    name: 'moderncv Résumé',
    category: 'CV & Letter',
    description: 'Professional résumé using the moderncv class (banking style).',
    body: MODERNCV_BODY
  },
  {
    id: 'letter',
    name: 'Cover Letter',
    category: 'CV & Letter',
    description: 'Formal cover letter using the standard LaTeX letter class.',
    body: LETTER_BODY
  },
  {
    id: 'poster',
    name: 'Conference Poster',
    category: 'Poster & Exam',
    description: 'A0 portrait poster using tikzposter with two-column layout.',
    body: POSTER_BODY
  },
  {
    id: 'exam',
    name: 'Exam',
    category: 'Poster & Exam',
    description: 'Exam paper using the exam class with questions and solutions.',
    body: EXAM_BODY
  },
  {
    id: 'book',
    name: 'Book',
    category: 'Book',
    description: 'Multi-part book with front matter, main matter, and back matter.',
    body: BOOK_BODY
  }
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Filter `templates` by `category` (all categories when `null`) and by `query`
 * (substring match on name or description, case-insensitive; all when empty).
 */
export function filterTemplates(
  templates: TemplateDefinition[],
  category: TemplateCategory | null,
  query: string
): TemplateDefinition[] {
  const q = query.trim().toLowerCase();
  return templates.filter((t) => {
    if (category !== null && t.category !== category) {
      return false;
    }
    if (q === '') {
      return true;
    }
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
  });
}

// ---------------------------------------------------------------------------
// Custom template persistence
// ---------------------------------------------------------------------------

/** Storage key for the persisted custom template list. */
export const CUSTOM_TEMPLATES_KEY = 'galley:custom-templates';

/** Validate that `value` is a well-formed {@link TemplateDefinition}. */
function isCustomTemplate(value: unknown): value is TemplateDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    typeof v['category'] === 'string' &&
    (TEMPLATE_CATEGORIES as readonly string[]).includes(v['category']) &&
    typeof v['description'] === 'string' &&
    typeof v['body'] === 'string'
  );
}

/** Parse a persisted custom-template list, tolerating absent or invalid data. */
export function parseCustomTemplates(raw: string | null): TemplateDefinition[] {
  if (raw === null) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(isCustomTemplate);
}

/** Serialise a custom-template list for storage. */
export function serializeCustomTemplates(list: TemplateDefinition[]): string {
  return JSON.stringify(list);
}

/** Add `entry` to `list`, replacing any existing entry with the same id. */
export function addCustomTemplate(
  list: TemplateDefinition[],
  entry: TemplateDefinition
): TemplateDefinition[] {
  const without = list.filter((t) => t.id !== entry.id);
  return [...without, entry];
}

/** Remove the template with `id` from `list`. No-op when not found. */
export function removeCustomTemplate(list: TemplateDefinition[], id: string): TemplateDefinition[] {
  return list.filter((t) => t.id !== id);
}

// ---------------------------------------------------------------------------
// Stateful store
// ---------------------------------------------------------------------------

/** Persists user-defined templates and exposes read/write operations. */
export class CustomTemplateStore {
  #storage: Pick<Storage, 'getItem' | 'setItem'>;
  #list: TemplateDefinition[];

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.#storage = storage;
    this.#list = parseCustomTemplates(storage.getItem(CUSTOM_TEMPLATES_KEY));
  }

  #save(): void {
    this.#storage.setItem(CUSTOM_TEMPLATES_KEY, serializeCustomTemplates(this.#list));
  }

  /** All custom templates in the order they were saved. */
  all(): TemplateDefinition[] {
    return this.#list;
  }

  /** Add or replace an entry, then persist. */
  add(entry: TemplateDefinition): void {
    this.#list = addCustomTemplate(this.#list, entry);
    this.#save();
  }

  /** Remove by id, then persist. */
  remove(id: string): void {
    this.#list = removeCustomTemplate(this.#list, id);
    this.#save();
  }
}
