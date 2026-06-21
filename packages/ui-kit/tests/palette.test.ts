import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from '../src/contrast';

/**
 * The contrast baseline (v0.0.2 acceptance). These tests parse the *shipped*
 * token CSS, resolve the `var(--…)` chains to real hex values, and assert that
 * every text/background pairing in both themes clears its WCAG target — so the
 * brand palette can never quietly drift below legibility.
 */

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

/** Strip comments and pull `selector { … }` blocks out of a stylesheet. */
function blocks(css: string): { selector: string; decls: Record<string, string> }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const result: { selector: string; decls: Record<string, string> }[] = [];
  const re = /([^{}]+)\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(clean)) !== null) {
    const decls: Record<string, string> = {};
    for (const line of match[2].split(';')) {
      const idx = line.indexOf(':');
      if (idx === -1) {
        continue;
      }
      decls[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    result.push({ selector: match[1].trim(), decls });
  }
  return result;
}

const tokens = blocks(read('../tokens.css'));
const themes = blocks(read('../themes.css'));

const primitives = tokens.find((b) => b.selector === ':root')!.decls;

function themeVars(selectorIncludes: string): Record<string, string> {
  const block = themes.find((b) => b.selector.includes(selectorIncludes))!;
  return { ...primitives, ...block.decls };
}

/** Resolve a token value to a concrete hex, following `var(--…)` references. */
function resolve(value: string, vars: Record<string, string>): string {
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value.trim());
  if (ref === null) {
    return value.trim();
  }
  return resolve(vars[ref[1]], vars);
}

function ratio(vars: Record<string, string>, fg: string, bg: string): number {
  return contrastRatio(resolve(vars[fg], vars), resolve(vars[bg], vars));
}

describe.each([
  ['Onionskin', "data-theme='onionskin'"],
  ['Carbon', "data-theme='carbon'"],
  ['Onionskin High-Contrast', "data-theme='onionskin-hc'"],
  ['Carbon High-Contrast', "data-theme='carbon-hc'"]
])('%s theme contrast', (_name, selector) => {
  const vars = themeVars(selector);

  it('primary text on the base clears AAA (7:1)', () => {
    expect(ratio(vars, '--fg', '--bg')).toBeGreaterThanOrEqual(7);
  });

  it('primary text on every surface clears AA (4.5:1)', () => {
    expect(ratio(vars, '--fg', '--surface')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(vars, '--fg', '--surface-raised')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(vars, '--fg', '--bg-sunken')).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text on the base clears AA (4.5:1)', () => {
    expect(ratio(vars, '--fg-muted', '--bg')).toBeGreaterThanOrEqual(4.5);
  });

  it('faint text on the base clears the large/UI minimum (3:1)', () => {
    expect(ratio(vars, '--fg-faint', '--bg')).toBeGreaterThanOrEqual(3);
  });

  it('accent text on the base clears AA (4.5:1)', () => {
    expect(ratio(vars, '--accent-text', '--bg')).toBeGreaterThanOrEqual(4.5);
  });

  it('text on an accent fill clears AA (4.5:1)', () => {
    expect(ratio(vars, '--accent-fg', '--accent')).toBeGreaterThanOrEqual(4.5);
  });

  it('the success colour clears the large/UI minimum on the base (3:1)', () => {
    expect(ratio(vars, '--success', '--bg')).toBeGreaterThanOrEqual(3);
  });
});
