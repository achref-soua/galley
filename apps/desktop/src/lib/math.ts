/** Wrap `latex` as an inline math expression: `$...$`. */
export function wrapInline(latex: string): string {
  return `$${latex}$`;
}

/** Wrap `latex` as a display-mode math expression: `\[\n...\n\]`. */
export function wrapDisplay(latex: string): string {
  return `\\[\n${latex}\n\\]`;
}
