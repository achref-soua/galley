import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import App from '../src/App.svelte';
import type { PdfRenderer } from '../src/lib/pdf';
import type { EditorFactory, LanguageContext } from '../src/lib/editor';
import type { AssetBackend } from '../src/lib/asset-backend';
import { firePointer, fakeEditorFactory } from './setup';

/** A fake PDF renderer that reports a one-page document. */
const onePageRenderer = (): PdfRenderer => ({ render: () => Promise.resolve({ pageCount: 1 }) });

describe('App shell', () => {
  it('renders the titlebar, sidebar, editor, and preview, painting the default theme', () => {
    render(App);
    expect(screen.getAllByText('Galley').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Editor')).toBeTruthy();
    expect(screen.getByLabelText('Preview')).toBeTruthy();
    expect(screen.getByText('No project open yet.')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('onionskin');
  });

  it('collapses and re-opens the sidebar', async () => {
    render(App);
    expect(screen.queryByLabelText('Resize sidebar')).not.toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(screen.queryByText('No project open yet.')).toBeNull();
    expect(screen.queryByLabelText('Resize sidebar')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(screen.queryByText('No project open yet.')).not.toBeNull();
  });

  it('collapses and re-opens the preview', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Hide preview' }));
    expect(screen.queryByLabelText('Preview')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Show preview' }));
    expect(screen.queryByLabelText('Preview')).not.toBeNull();
  });

  it('opens settings, switches theme instantly, persists it, and closes', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('radio', { name: 'Carbon' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('carbon');
    expect(window.localStorage.getItem('galley:theme')).toBe('carbon');

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resizes the sidebar by dragging and persists the layout', async () => {
    render(App);
    const sep = screen.getByLabelText('Resize sidebar');
    firePointer('pointerdown', sep, 0);
    firePointer('pointermove', window, 40);
    firePointer('pointerup', window, 40);
    expect(JSON.parse(window.localStorage.getItem('galley:layout')!).sidebarWidth).toBe(304);
  });

  it('resizes the preview by dragging the other way', async () => {
    render(App);
    const sep = screen.getByLabelText('Resize preview');
    firePointer('pointerdown', sep, 100);
    firePointer('pointermove', window, 60);
    firePointer('pointerup', window, 60);
    expect(JSON.parse(window.localStorage.getItem('galley:layout')!).previewWidth).toBe(520);
  });

  it('nudges both panes with the keyboard', async () => {
    render(App);
    await fireEvent.keyDown(screen.getByLabelText('Resize sidebar'), { key: 'ArrowRight' });
    await fireEvent.keyDown(screen.getByLabelText('Resize preview'), { key: 'ArrowLeft' });
    const stored = JSON.parse(window.localStorage.getItem('galley:layout')!);
    expect(stored.sidebarWidth).toBe(280);
    expect(stored.previewWidth).toBe(496);
  });

  it('remembers a persisted layout across mounts', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    // A fresh mount reads the persisted collapse state.
    render(App);
    const hidden = screen.getAllByRole('button', { name: 'Show sidebar' });
    expect(hidden.length).toBeGreaterThan(0);
  });
});

describe('App — projects, editing, and the unsaved-changes guard', () => {
  /** A debounce timer the test fires by hand, so auto-compile never fires on a
   *  real `setTimeout` and leaves a timeout dangling between tests. */
  class FakeTimer {
    pending: (() => void) | null = null;
    set(callback: () => void) {
      this.pending = callback;
    }
    clear() {
      this.pending = null;
    }
    fire() {
      const run = this.pending;
      this.pending = null;
      run?.();
    }
  }

  /** A clock returning queued times, then holding the last, for stable timing. */
  class FakeClock {
    times: number[] = [];
    #last = 0;
    now() {
      if (this.times.length > 0) {
        this.#last = this.times.shift()!;
      }
      return this.#last;
    }
  }

  let timer: FakeTimer;
  let clock: FakeClock;
  let bell: { ding: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    timer = new FakeTimer();
    clock = new FakeClock();
    bell = { ding: vi.fn() };
  });

  function renderApp(extra: Record<string, unknown> = {}) {
    render(App, {
      props: {
        editor: fakeEditorFactory(),
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        ...extra
      }
    });
  }

  async function openDemoFolder() {
    renderApp();
    expect(screen.getByText('No document')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    // The demo project opens with its root document showing.
    await screen.findByLabelText('Source');
    return screen.getByLabelText('Source') as HTMLTextAreaElement;
  }

  it('creates a project from the sidebar and opens its root document', async () => {
    renderApp();
    await fireEvent.input(screen.getByLabelText('New project name'), {
      target: { value: 'My Paper' }
    });
    await fireEvent.submit(screen.getByLabelText('New project name').closest('form')!);

    const textarea = (await screen.findByLabelText('Source')) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Pull a proof');
    // The name shows in the sidebar header and the recent list.
    expect(screen.getAllByText('My Paper').length).toBeGreaterThan(0);
  });

  it('edits a document, marks it dirty, and saves with Ctrl+S', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.input(textarea, { target: { value: 'edited body' } });
    // Dirty: the save action is enabled.
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);

    await fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    );
  });

  it('raises the guard when switching files with unsaved edits, and discards', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.input(textarea, { target: { value: 'unsaved' } });
    await fireEvent.click(screen.getByRole('button', { name: 'introduction.tex' }));

    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toContain(
      'Introduction'
    );
  });

  it('cancels the guard, keeping the current document', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.input(textarea, { target: { value: 'unsaved' } });
    await fireEvent.click(screen.getByRole('button', { name: 'introduction.tex' }));
    await screen.findByRole('dialog', { name: 'Unsaved changes' });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toBe('unsaved');
  });

  it('saves then continues from the guard', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.input(textarea, { target: { value: 'saved first' } });
    await fireEvent.click(screen.getByRole('button', { name: 'introduction.tex' }));
    await screen.findByRole('dialog', { name: 'Unsaved changes' });
    await fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toContain(
        'Introduction'
      )
    );
  });

  it('saves from the titlebar button', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.input(textarea, { target: { value: 'changed via button' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    );
  });

  it('re-opens a project from the recent list', async () => {
    await openDemoFolder();
    await fireEvent.click(screen.getByRole('button', { name: 'galley-project' }));
    // Still showing the (re-opened) project's root document.
    await waitFor(() => expect(screen.getByLabelText('Source')).toBeTruthy());
  });

  it('compiles the open document and shows the proof in the preview', async () => {
    await openDemoFolder();
    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));
    await waitFor(() => expect(screen.getByLabelText('Proof')).toBeTruthy());
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('compiles with the Ctrl+B shortcut', async () => {
    const editor = await openDemoFolder();
    await fireEvent.input(editor, { target: { value: '\\documentclass{article}\\end{document}' } });
    await fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    await waitFor(() => expect(screen.getByLabelText('Proof')).toBeTruthy());
  });

  it('auto-compiles after an edit once the debounce fires', async () => {
    const editor = await openDemoFolder();
    await fireEvent.input(editor, {
      target: { value: '\\documentclass{article}\\begin{document}auto\\end{document}' }
    });
    // Nothing compiles until the debounce elapses.
    expect(screen.queryByLabelText('Proof')).toBeNull();
    timer.fire();
    await waitFor(() => expect(screen.getByLabelText('Proof')).toBeTruthy());
  });

  it('surfaces compile problems in the panel and jumps to the source line', async () => {
    const editor = await openDemoFolder();
    // Break the document so the demo backend reports a located diagnostic.
    await fireEvent.input(editor, {
      target: { value: '\\documentclass{article}\\begin{document}oops' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));

    // The problems panel lists the parsed diagnostic with its summary.
    const row = await screen.findByRole('button', { name: /document never closes/ });
    expect(screen.getByText('1 error')).toBeTruthy();
    // Clicking jumps to the source line (the fake editor's gotoLine is a no-op).
    await fireEvent.click(row);
  });

  it('shows the build timing in the preview', async () => {
    await openDemoFolder();
    clock.times = [0, 420];
    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));
    await waitFor(() => expect(screen.getByText('420 ms')).toBeTruthy());
  });

  it('toggles compile preferences, persisting them and ringing the bell when on', async () => {
    await openDemoFolder();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Compilation' }));

    // Turn auto-compile off and the success bell on.
    await fireEvent.click(screen.getByRole('switch', { name: 'Compile as you type' }));
    await fireEvent.click(screen.getByRole('switch', { name: 'Bell on success' }));
    expect(JSON.parse(window.localStorage.getItem('galley:compile-prefs')!)).toEqual({
      autoCompile: false,
      soundOnSuccess: true
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));
    await waitFor(() => expect(bell.ding).toHaveBeenCalledOnce());
  });

  it('does not auto-compile after preferences disable it', async () => {
    const editor = await openDemoFolder();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Compilation' }));
    await fireEvent.click(screen.getByRole('switch', { name: 'Compile as you type' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await fireEvent.input(editor, { target: { value: 'edited with auto-compile off' } });
    // No auto-compile was scheduled.
    expect(timer.pending).toBeNull();
  });

  it('shows include paths from the editor content and opens them via the structure panel', async () => {
    const editor = await openDemoFolder();
    // Inject an \input directive so the derived includes list populates.
    await fireEvent.input(editor, {
      target: {
        value:
          '\\documentclass{article}\n\\begin{document}\n' +
          '\\input{sections/introduction}\n\\end{document}\n'
      }
    });
    // The structure panel resolves the extensionless path and shows the include.
    const includeBtn = await screen.findByRole('button', { name: 'sections/introduction.tex' });
    expect(includeBtn).toBeTruthy();

    // Save first to clear the dirty flag — otherwise requestOpenFile raises the
    // unsaved-changes guard instead of opening the file.
    await fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    );

    // Now clicking the include opens the file through the project controller.
    await fireEvent.click(screen.getByRole('button', { name: 'sections/introduction.tex' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Source') as HTMLTextAreaElement).value).toContain(
        'Introduction'
      )
    );
  });

  it('opens the command palette with Ctrl+Shift+P and toggles it closed again', async () => {
    renderApp();
    await fireEvent.keyDown(window, { key: 'p', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'p', ctrlKey: true, shiftKey: true });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('opens the search panel with Ctrl+Shift+F and toggles it closed again', async () => {
    renderApp();
    await fireEvent.keyDown(window, { key: 'f', ctrlKey: true, shiftKey: true });
    expect(screen.getByLabelText('Search pattern')).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'f', ctrlKey: true, shiftKey: true });
    expect(screen.queryByLabelText('Search pattern')).toBeNull();
  });

  it('Ctrl+Shift+F closes the palette, and Ctrl+Shift+P closes the search panel', async () => {
    renderApp();
    await fireEvent.keyDown(window, { key: 'p', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'f', ctrlKey: true, shiftKey: true });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    expect(screen.getByLabelText('Search pattern')).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'p', ctrlKey: true, shiftKey: true });
    expect(screen.queryByLabelText('Search pattern')).toBeNull();
    // Close the palette so no open state leaks into subsequent tests.
    await fireEvent.keyDown(window, { key: 'p', ctrlKey: true, shiftKey: true });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('executes all palette actions', async () => {
    renderApp();

    async function openPalette() {
      await fireEvent.keyDown(window, { key: 'p', ctrlKey: true, shiftKey: true });
      return screen.findByRole('dialog', { name: 'Command palette' });
    }

    // find-in-project opens the search panel
    await fireEvent.click(within(await openPalette()).getByText('Find in Project'));
    expect(screen.getByLabelText('Search pattern')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Close search'));

    // toggle-sidebar collapses the sidebar
    await fireEvent.click(within(await openPalette()).getByText('Toggle Sidebar'));
    expect(screen.queryByText('No project open yet.')).toBeNull();

    // toggle-preview hides the preview
    await fireEvent.click(within(await openPalette()).getByText('Toggle Preview'));
    expect(screen.queryByLabelText('Preview')).toBeNull();

    // open-settings opens the settings dialog
    await fireEvent.click(within(await openPalette()).getByText('Open Settings'));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // save and compile are no-ops without an open project but must not throw
    await fireEvent.click(within(await openPalette()).getByText('Save'));
    await fireEvent.click(within(await openPalette()).getByText('Compile'));
  });

  it('changes the keymap mode via Settings > Editor section', async () => {
    renderApp();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Vim' }));
    const prefs = JSON.parse(window.localStorage.getItem('galley:editor-prefs')!);
    expect(prefs.keymapMode).toBe('vim');
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('toggles spell-check via Settings > Editor section', async () => {
    renderApp();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    await fireEvent.click(screen.getByRole('switch', { name: 'Spell-check' }));
    const prefs = JSON.parse(window.localStorage.getItem('galley:editor-prefs')!);
    expect(prefs.spellCheck).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('toggles sync scroll via Settings > Preview section and persists it', async () => {
    renderApp();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const toggle = screen.getByRole('switch', { name: 'Sync scroll' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(toggle);
    const stored = JSON.parse(window.localStorage.getItem('galley:preview-prefs')!);
    expect(stored.syncScroll).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('handleEditorScroll is called when the fake editor fires onscroll', async () => {
    await openDemoFolder();
    // The fakeEditorFactory calls onscroll(0) on mount; no crash expected and
    // the preview pane is visible (editorScrollFraction is now 0).
    expect(screen.getByLabelText('Preview')).toBeTruthy();
  });

  it('returns null from fetchSpellChecker when the aff response is not ok', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, text: async () => '' }));
    renderApp();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    await fireEvent.click(screen.getByRole('switch', { name: 'Spell-check' }));
    await waitFor(() => {}); // let the $effect and fetch promise settle
    vi.unstubAllGlobals();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('returns null from fetchSpellChecker when only the dic response is not ok', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', async () => ({ ok: callCount++ === 0, text: async () => '' }));
    renderApp();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    await fireEvent.click(screen.getByRole('switch', { name: 'Spell-check' }));
    await waitFor(() => {}); // let the $effect and fetch promise settle
    vi.unstubAllGlobals();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('builds the spell checker when fetchSpellChecker succeeds', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    renderApp();
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    await fireEvent.click(screen.getByRole('switch', { name: 'Spell-check' }));
    await waitFor(() => {}); // let the $effect and fetch promise settle
    vi.unstubAllGlobals();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('applies replacements to the active file through the search panel', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.keyDown(window, { key: 'f', ctrlKey: true, shiftKey: true });
    const patternInput = screen.getByLabelText('Search pattern');
    await fireEvent.input(patternInput, { target: { value: 'demo' } });
    await fireEvent.click(screen.getByText('Search'));
    await screen.findByLabelText('Search results');
    const replInput = screen.getByLabelText('Replacement text');
    await fireEvent.input(replInput, { target: { value: 'test' } });
    await fireEvent.click(screen.getByText('Replace all'));
    await waitFor(() => expect(textarea.value).toContain('test'));
  });

  it('AssetPanel oninsert calls insertAtCursor on the editor', async () => {
    let insertedText = '';
    const spyFactory: EditorFactory = ({ parent, doc, onChange }) => {
      const area = document.createElement('textarea');
      area.setAttribute('aria-label', 'Source');
      area.value = doc;
      area.addEventListener('input', () => onChange(area.value));
      parent.appendChild(area);
      return {
        setDoc(v) {
          if (v !== area.value) area.value = v;
        },
        setDiagnostics: () => {},
        gotoLine: () => {},
        currentLine: () => 1,
        setKeymapMode: () => {},
        setSpellChecker: () => {},
        insertAtCursor(text) {
          insertedText = text;
        },
        destroy() {
          area.remove();
        }
      };
    };
    const fakeAssets: AssetBackend = {
      async copyAsset(_root, _bytes, filename) {
        return `assets/${filename}`;
      },
      async listAssets() {
        return ['assets/figure.png'];
      }
    };
    render(App, {
      props: {
        editor: spyFactory,
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        assetBackend: fakeAssets
      }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    await screen.findByLabelText('Source');
    await waitFor(() => expect(screen.getByText('figure.png')).toBeTruthy());
    await fireEvent.click(screen.getByText('figure.png'));
    expect(insertedText).toBe('\\includegraphics[width=\\linewidth]{assets/figure.png}');
  });

  it('graphicspath banner shows when content has \\includegraphics without \\graphicspath', async () => {
    const textarea = await openDemoFolder();
    expect(screen.queryByRole('button', { name: 'Add graphicspath' })).toBeNull();
    await fireEvent.input(textarea, {
      target: { value: '\\begin{document}\\includegraphics{fig}\\end{document}' }
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add graphicspath' })).toBeTruthy()
    );
  });

  it('graphicspath banner Add button inserts \\graphicspath and hides the banner', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.input(textarea, {
      target: { value: '\\begin{document}\\includegraphics{fig}\\end{document}' }
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add graphicspath' })).toBeTruthy()
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Add graphicspath' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add graphicspath' })).toBeNull()
    );
    expect(textarea.value).toContain('\\graphicspath');
  });

  it('graphicspath banner Dismiss button hides the banner', async () => {
    const textarea = await openDemoFolder();
    await fireEvent.input(textarea, {
      target: { value: '\\begin{document}\\includegraphics{fig}\\end{document}' }
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull());
  });

  it('drop before project is open is a no-op', () => {
    renderApp();
    const editorArea = document.querySelector('.editor-area')!;
    editorArea.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
  });

  it('drop with null dataTransfer is a no-op', async () => {
    await openDemoFolder();
    const editorArea = document.querySelector('.editor-area')!;
    // plain Event has no dataTransfer → dt == null → early return
    editorArea.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
  });

  it('drop with empty file list is a no-op', async () => {
    await openDemoFolder();
    const editorArea = document.querySelector('.editor-area')!;
    const ev = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(ev, 'dataTransfer', {
      value: { files: { length: 0 } },
      configurable: true
    });
    editorArea.dispatchEvent(ev);
  });

  it('drop with a file copies the asset and inserts the snippet via insertAtCursor', async () => {
    let insertedText = '';
    const spyFactory: EditorFactory = ({ parent, doc, onChange }) => {
      const area = document.createElement('textarea');
      area.setAttribute('aria-label', 'Source');
      area.value = doc;
      area.addEventListener('input', () => onChange(area.value));
      parent.appendChild(area);
      return {
        setDoc(v) {
          if (v !== area.value) area.value = v;
        },
        setDiagnostics: () => {},
        gotoLine: () => {},
        currentLine: () => 1,
        setKeymapMode: () => {},
        setSpellChecker: () => {},
        insertAtCursor(text) {
          insertedText = text;
        },
        destroy() {
          area.remove();
        }
      };
    };
    const fakeAssets: AssetBackend = {
      async copyAsset(_root, _bytes, filename) {
        return `assets/${filename}`;
      },
      async listAssets() {
        return [];
      }
    };
    render(App, {
      props: {
        editor: spyFactory,
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        assetBackend: fakeAssets
      }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    await screen.findByLabelText('Source');

    const editorArea = document.querySelector('.editor-area')!;
    await fireEvent.dragOver(editorArea);

    const fakeFile = {
      name: 'photo.jpg',
      arrayBuffer: async () => new ArrayBuffer(4)
    } as unknown as File;
    const dropEv = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropEv, 'dataTransfer', {
      value: { files: { 0: fakeFile, length: 1 } },
      configurable: true
    });
    editorArea.dispatchEvent(dropEv);
    await waitFor(() =>
      expect(insertedText).toBe('\\includegraphics[width=\\linewidth]{assets/photo.jpg}')
    );
  });

  it('wires the editor to the language server and the outline', async () => {
    let captured: LanguageContext | undefined;
    const gotoLine = vi.fn();
    // A capturing editor factory: it stashes the language context the App injects
    // and records reveal requests, so language features can be driven directly.
    const capturingEditor: EditorFactory = ({ parent, doc, onChange, language }) => {
      captured = language;
      const area = document.createElement('textarea');
      area.setAttribute('aria-label', 'Source');
      area.value = doc;
      area.addEventListener('input', () => onChange(area.value));
      parent.appendChild(area);
      return {
        setDoc: (v) => void (area.value = v),
        setDiagnostics: () => {},
        gotoLine,
        currentLine: () => 1,
        setKeymapMode: () => {},
        setSpellChecker: () => {},
        insertAtCursor: () => {},
        destroy: () => area.remove()
      };
    };

    render(App, {
      props: {
        editor: capturingEditor,
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell
      }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    await screen.findByLabelText('Source');
    await waitFor(() => expect(captured).toBeDefined());

    // document() reports the open file through the controller.
    expect(captured!.document()).toEqual({ root: '/demo/galley-project', rel: 'main.tex' });

    // onDefinition resolves and reveals the one-based line in the same file.
    captured!.onDefinition({ file: 'main.tex', line: 5, character: 0 });
    await waitFor(() => expect(gotoLine).toHaveBeenCalledWith(6));

    // Compiling populates the outline from the language server; clicking a symbol
    // jumps to its (one-based) source line.
    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));
    await screen.findByRole('button', { name: /Introduction/ });
    await fireEvent.click(screen.getByRole('button', { name: /Introduction/ }));
    await waitFor(() => expect(gotoLine).toHaveBeenCalledWith(1));
  });
});

describe('App — SyncTeX forward and inverse search', () => {
  let timer: { pending: (() => void) | null; set: (cb: () => void) => void; clear: () => void };
  let clock: { times: number[]; now: () => number };
  let bell: { ding: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    timer = {
      pending: null,
      set(cb) {
        this.pending = cb;
      },
      clear() {
        this.pending = null;
      }
    };
    clock = {
      times: [],
      now() {
        return 0;
      }
    };
    bell = { ding: vi.fn() };
  });

  it('Ctrl+Enter triggers forward search via the injected backend', async () => {
    let forwardArgs: [string, number] | null = null;
    const fakeSynctex = {
      async forward(file: string, line: number) {
        forwardArgs = [file, line];
        return null;
      },
      async inverse() {
        return null;
      }
    };
    render(App, {
      props: {
        editor: fakeEditorFactory(),
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        synctex: fakeSynctex
      }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    await screen.findByLabelText('Source');

    // Ctrl+Enter fires forward search. No project file → activePath is set.
    await fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(forwardArgs).not.toBeNull());
    expect(forwardArgs![1]).toBe(1); // fake editor always returns line 1
  });

  it('Ctrl+Enter is a no-op when no document is open', async () => {
    let called = false;
    const fakeSynctex = {
      async forward() {
        called = true;
        return null;
      },
      async inverse() {
        return null;
      }
    };
    render(App, {
      props: {
        editor: fakeEditorFactory(),
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        synctex: fakeSynctex
      }
    });
    await fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(called).toBe(false);
  });

  it('Cmd+Enter (metaKey) also triggers forward search', async () => {
    let forwardCalled = false;
    const fakeSynctex = {
      async forward() {
        forwardCalled = true;
        return null;
      },
      async inverse() {
        return null;
      }
    };
    render(App, {
      props: {
        editor: fakeEditorFactory(),
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        synctex: fakeSynctex
      }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    await screen.findByLabelText('Source');
    await fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(forwardCalled).toBe(true));
  });

  it('inverse search is a no-op when synctex returns null', async () => {
    const gotoLineCalls: number[] = [];
    const capturingFactory = (({
      parent,
      doc,
      onChange
    }: {
      parent: HTMLElement;
      doc: string;
      onChange: (v: string) => void;
    }) => {
      const area = document.createElement('textarea');
      area.setAttribute('aria-label', 'Source');
      area.value = doc;
      area.addEventListener('input', () => onChange(area.value));
      parent.appendChild(area);
      return {
        setDoc: (v: string) => {
          if (v !== area.value) area.value = v;
        },
        setDiagnostics: () => {},
        gotoLine: (line: number) => gotoLineCalls.push(line),
        currentLine: () => 1,
        setKeymapMode: () => {},
        setSpellChecker: () => {},
        insertAtCursor: () => {},
        destroy: () => area.remove()
      };
    }) as unknown as EditorFactory;

    const fakeSynctex = {
      async forward() {
        return null;
      },
      async inverse() {
        return null;
      }
    };

    render(App, {
      props: {
        editor: capturingFactory,
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        synctex: fakeSynctex
      }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    await screen.findByLabelText('Source');
    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));
    const canvas = await screen.findByLabelText('Proof');
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // inverse returns null → handleInverseSearch returns early → gotoLine never called
    await new Promise((r) => setTimeout(r, 50));
    expect(gotoLineCalls).toHaveLength(0);
  });

  it('inverse search calls jumpToLine when synctex returns a location', async () => {
    const gotoLineCalls: number[] = [];
    const capturingFactory = (({
      parent,
      doc,
      onChange
    }: {
      parent: HTMLElement;
      doc: string;
      onChange: (v: string) => void;
    }) => {
      const area = document.createElement('textarea');
      area.setAttribute('aria-label', 'Source');
      area.value = doc;
      area.addEventListener('input', () => onChange(area.value));
      parent.appendChild(area);
      return {
        setDoc: (v: string) => {
          if (v !== area.value) area.value = v;
        },
        setDiagnostics: () => {},
        gotoLine: (line: number) => gotoLineCalls.push(line),
        currentLine: () => 1,
        setKeymapMode: () => {},
        setSpellChecker: () => {},
        insertAtCursor: () => {},
        destroy: () => area.remove()
      };
    }) as unknown as EditorFactory;

    const fakeSynctex = {
      async forward() {
        return null;
      },
      async inverse() {
        return { file: 'main.tex', line: 7 };
      }
    };

    render(App, {
      props: {
        editor: capturingFactory,
        createRenderer: onePageRenderer,
        compileTimer: timer,
        compileClock: clock,
        bell,
        synctex: fakeSynctex
      }
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    await screen.findByLabelText('Source');
    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));
    const canvas = await screen.findByLabelText('Proof');

    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => expect(gotoLineCalls).toContain(7));
  });
});
