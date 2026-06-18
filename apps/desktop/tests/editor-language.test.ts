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
  latexHoverSource,
  goToDefinitionAt,
  goToDefinitionCommand,
  createLatexEditor,
  type LanguageContext
} from '../src/lib/editor';
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
