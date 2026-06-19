import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EditorPane from '../src/lib/EditorPane.svelte';
import type { EditorFactory } from '../src/lib/editor';
import { fakeEditorFactory } from './setup';

/** An editor factory that records the calls the pane makes against it. */
function spyEditor() {
  const calls = {
    setDoc: [] as string[],
    setDiagnostics: 0,
    gotoLine: [] as number[],
    setKeymapMode: [] as string[],
    setSpellChecker: [] as unknown[],
    setViewMode: [] as string[]
  };
  const factory: EditorFactory = () => ({
    setDoc: (value) => calls.setDoc.push(value),
    setDiagnostics: () => {
      calls.setDiagnostics += 1;
    },
    gotoLine: (line) => calls.gotoLine.push(line),
    currentLine: () => 1,
    setKeymapMode: (mode) => calls.setKeymapMode.push(mode),
    setSpellChecker: (checker) => calls.setSpellChecker.push(checker),
    insertAtCursor: () => {},
    setViewMode: (mode) => calls.setViewMode.push(mode),
    toggleBold: () => {},
    toggleItalic: () => {},
    promoteHeading: () => {},
    demoteHeading: () => {},
    destroy: () => {}
  });
  return { factory, calls };
}

describe('EditorPane', () => {
  it('shows the empty state when no document is open', () => {
    render(EditorPane, {
      props: { documentName: null, content: '', dirty: false, onedit: () => {} }
    });
    expect(screen.getByText('Nothing on the galley yet.')).toBeTruthy();
    expect(screen.queryByLabelText('Source')).toBeNull();
  });

  it('mounts the editor, reports edits, and shows the dirty marker', async () => {
    const onedit = vi.fn();
    render(EditorPane, {
      props: {
        documentName: 'main.tex',
        content: 'hello',
        dirty: true,
        onedit,
        createEditor: fakeEditorFactory()
      }
    });
    expect(screen.getByText('main.tex')).toBeTruthy();
    expect(screen.getByLabelText('unsaved changes')).toBeTruthy();

    const surface = screen.getByLabelText('Source') as HTMLTextAreaElement;
    expect(surface.value).toBe('hello');
    await fireEvent.input(surface, { target: { value: 'hello world' } });
    expect(onedit).toHaveBeenCalledWith('hello world');
  });

  it('hides the dirty marker when clean', () => {
    render(EditorPane, {
      props: {
        documentName: 'main.tex',
        content: 'x',
        dirty: false,
        onedit: () => {},
        createEditor: fakeEditorFactory()
      }
    });
    expect(screen.queryByLabelText('unsaved changes')).toBeNull();
  });

  it('pushes external content changes into the editor and tears it down', async () => {
    const { rerender, unmount } = render(EditorPane, {
      props: {
        documentName: 'main.tex',
        content: 'first',
        dirty: false,
        onedit: () => {},
        createEditor: fakeEditorFactory()
      }
    });
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toBe('first');

    await rerender({
      documentName: 'main.tex',
      content: 'second',
      dirty: false,
      onedit: () => {},
      createEditor: fakeEditorFactory()
    });
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toBe('second');

    unmount();
    expect(screen.queryByLabelText('Source')).toBeNull();
  });

  it('pushes diagnostics into the editor and jumps to a freshly-requested line', async () => {
    const { factory, calls } = spyEditor();
    const base = {
      documentName: 'main.tex',
      content: 'a\nb\nc',
      dirty: false,
      diagnostics: [],
      onedit: () => {},
      createEditor: factory
    };
    const { rerender } = render(EditorPane, { props: { ...base, reveal: null } });

    expect(calls.setDiagnostics).toBe(1);
    expect(calls.gotoLine).toEqual([]);

    await rerender({ ...base, reveal: { line: 2, nonce: 1 } });
    expect(calls.gotoLine).toEqual([2]);

    await rerender({ ...base, content: 'a\nb\nc\nd', reveal: { line: 2, nonce: 1 } });
    expect(calls.gotoLine).toEqual([2]);
    expect(calls.setDoc).toContain('a\nb\nc\nd');
  });

  it('passes keymapMode and spellChecker to the editor on mount and updates on change', async () => {
    const { factory, calls } = spyEditor();
    const fakeChecker = { correct: () => true };
    const base = {
      documentName: 'main.tex',
      content: 'x',
      dirty: false,
      keymapMode: 'default' as const,
      spellChecker: null as { correct(w: string): boolean } | null,
      onedit: () => {},
      createEditor: factory
    };
    const { rerender } = render(EditorPane, { props: base });

    await rerender({ ...base, keymapMode: 'vim' as const });
    expect(calls.setKeymapMode).toContain('vim');

    await rerender({ ...base, keymapMode: 'vim' as const, spellChecker: fakeChecker });
    expect(calls.setSpellChecker).toContain(fakeChecker);
  });

  it('calls setViewMode when viewMode prop changes', async () => {
    const { factory, calls } = spyEditor();
    const base = {
      documentName: 'main.tex',
      content: 'x',
      dirty: false,
      viewMode: 'code' as const,
      onedit: () => {},
      createEditor: factory
    };
    const { rerender } = render(EditorPane, { props: base });

    await rerender({ ...base, viewMode: 'visual' as const });
    expect(calls.setViewMode).toContain('visual');

    await rerender({ ...base, viewMode: 'code' as const });
    expect(calls.setViewMode).toContain('code');
  });
});
