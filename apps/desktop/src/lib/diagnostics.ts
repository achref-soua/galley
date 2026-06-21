/**
 * The frontend view of compile diagnostics.
 *
 * The parsing, classification, and plain-language explanations all live in
 * `galley_core::diagnostics` (pure, fixture-tested Rust) and reach the UI already
 * structured, on the compile result. This module holds only the small *display*
 * decisions — how to count and summarise problems, how to label a location, and
 * how to order and de-duplicate them for the problems panel — kept here, out of
 * the components, so they carry their own coverage.
 */

import type { IconName } from '@galley/ui-kit';

/** How serious a diagnostic is — mirrors `galley_core::diagnostics::Severity`. */
export type Severity = 'error' | 'warning' | 'badbox';

/** A structured problem, as produced by the core parser and sent over IPC. */
export interface Diagnostic {
  /** How serious it is. */
  severity: Severity;
  /** The category identifier (e.g. `undefined-control-sequence`). */
  kind: string;
  /** The cleaned message from the log. */
  message: string;
  /** The source file the log named, or `null`. */
  file: string | null;
  /** The 1-based source line, or `null` when the log gives none. */
  line: number | null;
  /** A friendly, in-voice explanation and fix tip. */
  explanation: string;
}

/** A weight for a severity, so the worst one wins a tie and sorts first. */
export function severityRank(severity: Severity): number {
  switch (severity) {
    case 'error':
      return 3;
    case 'warning':
      return 2;
    case 'badbox':
      return 1;
  }
}

/** A human label for a severity, for tooltips and screen readers. */
export function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'badbox':
      return 'Bad box';
  }
}

/** The UI-kit icon that stands for a severity. */
export function severityIcon(severity: Severity): IconName {
  switch (severity) {
    case 'error':
      return 'diagnostic-error';
    case 'warning':
      return 'diagnostic-warning';
    case 'badbox':
      return 'diagnostic-badbox';
  }
}

/** Counts of each severity in a diagnostic list. */
export interface SeverityCounts {
  /** Number of errors. */
  error: number;
  /** Number of warnings. */
  warning: number;
  /** Number of bad boxes. */
  badbox: number;
}

/** Tally diagnostics by severity. */
export function countBySeverity(diagnostics: Diagnostic[]): SeverityCounts {
  const counts: SeverityCounts = { error: 0, warning: 0, badbox: 0 };
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
  }
  return counts;
}

/** Format a count with its noun, pluralising when needed. */
function plural(count: number, singular: string, pluralForm?: string): string {
  const noun = count === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${count} ${noun}`;
}

/** A short, in-voice summary of a diagnostic list for the panel header. */
export function summaryLabel(diagnostics: Diagnostic[]): string {
  const counts = countBySeverity(diagnostics);
  const parts: string[] = [];
  if (counts.error > 0) {
    parts.push(plural(counts.error, 'error'));
  }
  if (counts.warning > 0) {
    parts.push(plural(counts.warning, 'warning'));
  }
  if (counts.badbox > 0) {
    parts.push(plural(counts.badbox, 'bad box', 'bad boxes'));
  }
  return parts.length === 0 ? 'No problems' : parts.join(' · ');
}

/** A location label for a diagnostic, or `''` when the log placed it nowhere. */
export function locationLabel(diagnostic: Diagnostic): string {
  if (diagnostic.line !== null && diagnostic.file !== null) {
    return `${diagnostic.file}:${diagnostic.line}`;
  }
  if (diagnostic.line !== null) {
    return `line ${diagnostic.line}`;
  }
  if (diagnostic.file !== null) {
    return diagnostic.file;
  }
  return '';
}

/**
 * A stable key for a diagnostic — its severity, line, and message. Used both to
 * de-duplicate the merged list and to track a row's expansion in the panel.
 */
export function diagnosticKey(diagnostic: Diagnostic): string {
  return `${diagnostic.severity}|${diagnostic.line ?? ''}|${diagnostic.message}`;
}

/**
 * Merge the compile log's diagnostics with the language server's (ChkTeX and its
 * own analysis) into a single list for the gutter and the problems panel. The log
 * diagnostics come first; a server diagnostic that exactly repeats a log one
 * (same severity, line, and message) is dropped, so the two sources never
 * double-report the same problem.
 */
export function mergeDiagnostics(log: Diagnostic[], lsp: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];
  for (const diagnostic of [...log, ...lsp]) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(diagnostic);
  }
  return merged;
}

/** A line value that sorts unlocated diagnostics last. */
function lineOrder(line: number | null): number {
  return line === null ? Number.MAX_SAFE_INTEGER : line;
}

/**
 * The diagnostics to show in the problems panel: identical repeats removed, then
 * ordered by source line (those without a line last). Sort is stable, so equal
 * lines keep their original order.
 */
export function problemList(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const unique: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(diagnostic);
  }
  return unique.sort((a, b) => lineOrder(a.line) - lineOrder(b.line));
}
