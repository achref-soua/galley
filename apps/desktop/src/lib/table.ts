/** Column alignment for a tabular environment. */
export type Align = 'l' | 'c' | 'r';

/** Table style: plain `tabular` or `booktabs`. */
export type TableStyle = 'tabular' | 'booktabs';

/**
 * Build a `tabular` environment.
 *
 * The first row is treated as the header and is followed by `\hline`.
 */
export function buildTabular(align: Align[], rows: string[][]): string {
  const spec = align.join('');
  let out = `\\begin{tabular}{${spec}}\n`;
  for (let i = 0; i < rows.length; i++) {
    out += `  ${rows[i].join(' & ')} \\\\\n`;
    if (i === 0) {
      out += `  \\hline\n`;
    }
  }
  out += `\\end{tabular}`;
  return out;
}

/**
 * Build a `booktabs`-style table with `\toprule`, `\midrule`, and `\bottomrule`.
 *
 * `header` is a separate array; `rows` are the data rows.
 */
export function buildBooktabs(align: Align[], header: string[], rows: string[][]): string {
  const spec = align.join('');
  let out = `\\begin{tabular}{${spec}}\n`;
  out += `  \\toprule\n`;
  out += `  ${header.join(' & ')} \\\\\n`;
  out += `  \\midrule\n`;
  for (const row of rows) {
    out += `  ${row.join(' & ')} \\\\\n`;
  }
  out += `  \\bottomrule\n`;
  out += `\\end{tabular}`;
  return out;
}
