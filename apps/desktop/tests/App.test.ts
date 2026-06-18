import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import App from '../src/App.svelte';
import type { PdfRenderer } from '../src/lib/pdf';
import type { EditorFactory, LanguageContext } from '../src/lib/editor';
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
