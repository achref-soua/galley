import { describe, it, expect } from 'vitest';
import {
  type Diagnostic,
  type Severity,
  countBySeverity,
  locationLabel,
  problemList,
  severityIcon,
  severityLabel,
  severityRank,
  summaryLabel
} from '../src/lib/diagnostics';

function diag(over: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 'error',
    kind: 'latex-error',
    message: 'boom',
    file: null,
    line: null,
    explanation: 'why',
    ...over
  };
}

describe('severity helpers', () => {
  it('ranks errors above warnings above bad boxes', () => {
    expect(severityRank('error')).toBeGreaterThan(severityRank('warning'));
    expect(severityRank('warning')).toBeGreaterThan(severityRank('badbox'));
  });

  it('labels every severity', () => {
    const labels: Record<Severity, string> = {
      error: severityLabel('error'),
      warning: severityLabel('warning'),
      badbox: severityLabel('badbox')
    };
    expect(labels).toEqual({ error: 'Error', warning: 'Warning', badbox: 'Bad box' });
  });

  it('maps every severity to a distinct icon', () => {
    const icons = [severityIcon('error'), severityIcon('warning'), severityIcon('badbox')];
    expect(icons).toEqual(['diagnostic-error', 'diagnostic-warning', 'diagnostic-badbox']);
    expect(new Set(icons).size).toBe(3);
  });
});

describe('countBySeverity', () => {
  it('tallies each severity', () => {
    const counts = countBySeverity([
      diag({ severity: 'error' }),
      diag({ severity: 'warning' }),
      diag({ severity: 'warning' }),
      diag({ severity: 'badbox' })
    ]);
    expect(counts).toEqual({ error: 1, warning: 2, badbox: 1 });
  });
});

describe('summaryLabel', () => {
  it('reads "No problems" for an empty list', () => {
    expect(summaryLabel([])).toBe('No problems');
  });

  it('pluralises a full mix', () => {
    const summary = summaryLabel([
      diag({ severity: 'error' }),
      diag({ severity: 'error' }),
      diag({ severity: 'warning' }),
      diag({ severity: 'badbox' }),
      diag({ severity: 'badbox' })
    ]);
    expect(summary).toBe('2 errors · 1 warning · 2 bad boxes');
  });

  it('uses singular forms for a single problem of each kind', () => {
    expect(summaryLabel([diag({ severity: 'error' })])).toBe('1 error');
    expect(summaryLabel([diag({ severity: 'badbox' })])).toBe('1 bad box');
  });
});

describe('locationLabel', () => {
  it('combines file and line when both are present', () => {
    expect(locationLabel(diag({ file: 'main.tex', line: 12 }))).toBe('main.tex:12');
  });

  it('shows just the line when there is no file', () => {
    expect(locationLabel(diag({ file: null, line: 7 }))).toBe('line 7');
  });

  it('shows just the file when there is no line', () => {
    expect(locationLabel(diag({ file: 'refs.bib', line: null }))).toBe('refs.bib');
  });

  it('is empty when the log placed it nowhere', () => {
    expect(locationLabel(diag({ file: null, line: null }))).toBe('');
  });
});

describe('problemList', () => {
  it('drops identical repeats', () => {
    const list = problemList([
      diag({ message: 'same', line: 3 }),
      diag({ message: 'same', line: 3 }),
      diag({ message: 'different', line: 3 })
    ]);
    expect(list).toHaveLength(2);
    expect(list.map((d) => d.message)).toEqual(['same', 'different']);
  });

  it('orders by line with unlocated problems last, stably', () => {
    const list = problemList([
      diag({ message: 'no-line', line: null }),
      diag({ message: 'line-five', line: 5 }),
      diag({ message: 'line-two', line: 2 })
    ]);
    expect(list.map((d) => d.message)).toEqual(['line-two', 'line-five', 'no-line']);
  });
});
