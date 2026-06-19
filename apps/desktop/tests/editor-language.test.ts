import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import {
  completionStart,
  offsetToPosition,
  completionType,
  toCmCompletions,
  latexCompletionSource,
  latexCiteCompletionSource,
  citeContext,
  latexHoverSource,
  goToDefinitionAt,
  goToDefinitionCommand,
  createLatexEditor,
  type LanguageContext
} from '../src/lib/editor';
import { type CiteCandidate } from '../src/lib/bibliography';
import type {
  CompletionItem,
  CompletionKind,
  DefinitionLocation,
  LanguageBackend
} from '../src/lib/language-backend';

function completion(
  label: string,
  kind: CompletionKind,
  over: Partial<CompletionItem> = {}
): CompletionItem {
  return { label, kind, detail: null, insertText: null, documentation: null, ...over };
}

function fakeBackend(over: Partial<LanguageBackend> = {}): LanguageBackend {
  return {
    completion: vi.fn(async () => [] as CompletionItem[]),
    hover: vi.fn(async () => null),
    definition: vi.fn(async () => null),
    symbols: vi.fn(async () => []),
    diagnostics: vi.fn(async () => []),
    ...over
  };
}

function context(over: Partial<LanguageContext> = {}): LanguageContext {
  return {
    backend: fakeBackend(),
    document: () => ({ root: '/r', rel: 'main.tex' }),
    onDefinition: vi.fn(),
    ...over
  };
}

/** A minimal EditorView stand-in carrying just the state the sources read. */
function viewWith(doc: string, head = 0): EditorView {
  return {
    state: EditorState.create({ doc, selection: { anchor: head } })
  } as unknown as EditorView;
}

describe('completionStart', () => {
  it('scans back over command and key characters, stopping at the backslash', () => {
    // The backslash is not a word char, so a command completes from after it.
    expect(completionStart('\\section', 8)).toBe(1);
    // Reference keys include ':' and '-'.
    expect(completionStart('sec:intro', 9)).toBe(0);
    // Stops at whitespace.
    expect(completionStart('a b', 3)).toBe(2);
    // At the document start there is nothing to scan back over.
    expect(completionStart('hi', 0)).toBe(0);
  });
});

describe('offsetToPosition', () => {
  it('maps an offset to a zero-based line and character', () => {
    const doc = EditorState.create({ doc: 'first\nsecond\nthird' }).doc;
    expect(offsetToPosition(doc, 0)).toEqual({ line: 0, character: 0 });
    // Two chars into the second line.
    expect(offsetToPosition(doc, 'first\n'.length + 2)).toEqual({ line: 1, character: 2 });
  });
});

describe('completionType', () => {
  it('maps every completion kind to a CodeMirror type', () => {
    const kinds: CompletionKind[] = [
      'command',
      'environment',
      'package',
      'class',
      'reference',
      'citation',
      'file',
      'folder',
      'snippet',
      'other'
    ];
    expect(kinds.map(completionType)).toEqual([
      'function',
      'class',
      'namespace',
      'type',
      'variable',
      'variable',
      'text',
      'text',
      'keyword',
      'text'
    ]);
  });
});

describe('toCmCompletions', () => {
  it('applies insertText when present and the label otherwise', () => {
    const options = toCmCompletions([
      completion('frac', 'command', {
        insertText: 'frac{}{}',
        detail: 'math',
        documentation: 'A fraction'
      }),
      completion('alpha', 'command')
    ]);
    expect(options[0]).toEqual({
      label: 'frac',
      detail: 'math',
      info: 'A fraction',
      type: 'function',
      apply: 'frac{}{}'
    });
    // No insertText/detail/documentation → apply is the label, the rest undefined.
    expect(options[1]).toEqual({
      label: 'alpha',
      detail: undefined,
      info: undefined,
      type: 'function',
      apply: 'alpha'
    });
  });
});

describe('latexCompletionSource', () => {
  function ctxAt(doc: string, pos: number, explicit: boolean, ctx: LanguageContext) {
    const state = EditorState.create({ doc });
    return latexCompletionSource(ctx)(new CompletionContext(state, pos, explicit));
  }

  it('returns null when no document is open', async () => {
    const result = await ctxAt('\\sec', 4, false, context({ document: () => null }));
    expect(result).toBeNull();
  });

  it('does not pop up on an empty word unless explicit', async () => {
    // Cursor after a space: nothing typed to complete, and not explicit.
    const result = await ctxAt('a ', 2, false, context());
    expect(result).toBeNull();
  });

  it('queries the backend and maps results from the word start', async () => {
    const ctx = context({
      backend: fakeBackend({ completion: vi.fn(async () => [completion('section', 'command')]) })
    });
    const result = await ctxAt('\\sec', 4, false, ctx);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(1); // just after the backslash
    expect(result!.options[0].label).toBe('section');
    // The backend saw the zero-based position at the cursor.
    expect(ctx.backend.completion).toHaveBeenCalledWith('/r', 'main.tex', '\\sec', 0, 4);
  });

  it('completes on an explicit request even with nothing typed', async () => {
    const ctx = context({
      backend: fakeBackend({ completion: vi.fn(async () => [completion('item', 'snippet')]) })
    });
    const result = await ctxAt('a ', 2, true, ctx);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(2);
  });

  it('returns null when the backend offers nothing', async () => {
    const result = await ctxAt('\\sec', 4, false, context());
    expect(result).toBeNull();
  });

  it('defers to the citation source inside a \\cite argument', async () => {
    const backend = fakeBackend({
      completion: vi.fn(async () => [completion('section', 'command')])
    });
    const doc = '\\cite{key';
    const result = await ctxAt(doc, doc.length, true, context({ backend }));
    expect(result).toBeNull();
    // The language server was never queried for a citation key.
    expect(backend.completion).not.toHaveBeenCalled();
  });
});

describe('citeContext', () => {
  it('detects the cite argument and the current key start', () => {
    expect(citeContext('\\cite{', 6)).toEqual({ from: 6 });
    expect(citeContext('\\cite{key', 9)).toEqual({ from: 6 });
    // Multiple keys: the second key begins after the comma and space.
    expect(citeContext('\\cite{a, bcd', 12)).toEqual({ from: 9 });
    // biblatex commands and starred forms are recognised.
    expect(citeContext('\\autocite{x', 11)).toEqual({ from: 10 });
    expect(citeContext('\\nocite*{', 9)).toEqual({ from: 9 });
  });

  it('returns null outside a cite argument', () => {
    expect(citeContext('plain text', 5)).toBeNull();
    // A non-cite command's braces.
    expect(citeContext('\\section{x', 10)).toBeNull();
    // The group is already closed before the cursor.
    expect(citeContext('\\cite{a} ', 9)).toBeNull();
    // A newline breaks out of the group.
    expect(citeContext('\\cite{\nkey', 10)).toBeNull();
    // At the very start of the document.
    expect(citeContext('', 0)).toBeNull();
  });
});

describe('latexCiteCompletionSource', () => {
  function run(doc: string, pos: number, candidates: CiteCandidate[]) {
    const state = EditorState.create({ doc });
    return latexCiteCompletionSource(() => candidates)(new CompletionContext(state, pos, true));
  }

  const candidates: CiteCandidate[] = [
    { key: 'lovelace1843', summary: 'Lovelace (1843) — Notes' },
    { key: 'turing1936', summary: 'Turing (1936) — Computability' }
  ];

  it('offers bibliography keys inside a cite argument', () => {
    const result = run('\\cite{', 6, candidates);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(6);
    expect(result!.options.map((o) => o.label)).toEqual(['lovelace1843', 'turing1936']);
    expect(result!.options[0].detail).toBe('Lovelace (1843) — Notes');
    expect(result!.options[0].apply).toBe('lovelace1843');
  });

  it('returns null outside a cite argument', () => {
    expect(run('plain', 5, candidates)).toBeNull();
  });

  it('returns null when there are no candidates', () => {
    expect(run('\\cite{', 6, [])).toBeNull();
  });

  it('returns null when no citation provider is configured', () => {
    const state = EditorState.create({ doc: '\\cite{' });
    const result = latexCiteCompletionSource(undefined)(new CompletionContext(state, 6, true));
    expect(result).toBeNull();
  });
});

describe('latexHoverSource', () => {
  it('returns null when no document is open', async () => {
    const tip = await latexHoverSource(context({ document: () => null }))(viewWith('x'), 0);
    expect(tip).toBeNull();
  });

  it('returns null for empty or absent hover text', async () => {
    const none = await latexHoverSource(context())(viewWith('x'), 0);
    expect(none).toBeNull();
    const empty = await latexHoverSource(
      context({ backend: fakeBackend({ hover: vi.fn(async () => '') }) })
    )(viewWith('x'), 0);
    expect(empty).toBeNull();
  });

  it('builds a tooltip with the hover text', async () => {
    const tip = await latexHoverSource(
      context({ backend: fakeBackend({ hover: vi.fn(async () => 'a section') }) })
    )(viewWith('x'), 0);
    expect(tip).not.toBeNull();
    expect(tip!.pos).toBe(0);
    const dom = tip!.create({} as EditorView).dom;
    expect(dom.className).toBe('cm-galley-hover');
    expect(dom.textContent).toBe('a section');
  });
});

describe('goToDefinitionAt', () => {
  it('returns false when no document is open', async () => {
    expect(await goToDefinitionAt(viewWith('x'), context({ document: () => null }))).toBe(false);
  });

  it('returns false when there is no definition', async () => {
    expect(await goToDefinitionAt(viewWith('x'), context())).toBe(false);
  });

  it('reports the resolved location and returns true', async () => {
    const location: DefinitionLocation = { file: 'main.tex', line: 3, character: 0 };
    const onDefinition = vi.fn();
    const ctx = context({
      backend: fakeBackend({ definition: vi.fn(async () => location) }),
      onDefinition
    });
    expect(await goToDefinitionAt(viewWith('hello', 2), ctx)).toBe(true);
    expect(onDefinition).toHaveBeenCalledWith(location);
  });
});

describe('goToDefinitionCommand', () => {
  it('always reports the keystroke handled', () => {
    const run = goToDefinitionCommand(context());
    expect(run(viewWith('x'))).toBe(true);
  });
});

describe('createLatexEditor with a language context', () => {
  it('builds an editor wired to the language server and tears it down', () => {
    const parent = document.createElement('div');
    const editor = createLatexEditor({
      parent,
      doc: '\\section{x}',
      onChange: () => {},
      language: context()
    });
    // The editor mounted with the language extensions present.
    expect(parent.querySelector('.cm-content')).not.toBeNull();
    editor.destroy();
  });
});
