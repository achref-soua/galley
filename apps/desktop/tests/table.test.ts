import { describe, it, expect } from 'vitest';
import { buildTabular, buildBooktabs } from '../src/lib/table.js';
import type { Align } from '../src/lib/table.js';

describe('buildTabular', () => {
  it('emits a tabular environment with hline after first row', () => {
    const align: Align[] = ['l', 'c', 'r'];
    const rows = [
      ['A', 'B', 'C'],
      ['1', '2', '3']
    ];
    const out = buildTabular(align, rows);
    expect(out).toBe(
      '\\begin{tabular}{lcr}\n' +
        '  A & B & C \\\\\n' +
        '  \\hline\n' +
        '  1 & 2 & 3 \\\\\n' +
        '\\end{tabular}'
    );
  });

  it('handles a single row (header only)', () => {
    const out = buildTabular(['c'], [['H']]);
    expect(out).toContain('\\hline');
    expect(out).toContain('  H \\\\\n');
  });

  it('handles empty rows array', () => {
    const out = buildTabular(['l', 'r'], []);
    expect(out).toBe('\\begin{tabular}{lr}\n\\end{tabular}');
  });
});

describe('buildBooktabs', () => {
  it('emits toprule, midrule, bottomrule', () => {
    const align: Align[] = ['l', 'r'];
    const header = ['Name', 'Value'];
    const rows = [
      ['x', '1'],
      ['y', '2']
    ];
    const out = buildBooktabs(align, header, rows);
    expect(out).toBe(
      '\\begin{tabular}{lr}\n' +
        '  \\toprule\n' +
        '  Name & Value \\\\\n' +
        '  \\midrule\n' +
        '  x & 1 \\\\\n' +
        '  y & 2 \\\\\n' +
        '  \\bottomrule\n' +
        '\\end{tabular}'
    );
  });

  it('handles empty data rows', () => {
    const out = buildBooktabs(['c'], ['H'], []);
    expect(out).toContain('\\toprule');
    expect(out).toContain('  H \\\\\n');
    expect(out).toContain('\\midrule');
    expect(out).toContain('\\bottomrule');
    expect(out).not.toContain('undefined');
  });
});
