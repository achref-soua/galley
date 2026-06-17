import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EditorPane from '../src/lib/EditorPane.svelte';
import { fakeEditorFactory } from './setup';

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

    // A new document content syncs into the surface (the action's update path).
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
});
