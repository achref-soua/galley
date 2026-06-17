import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EditorPane from '../src/lib/EditorPane.svelte';

describe('EditorPane', () => {
  it('shows the empty state when no document is open', () => {
    render(EditorPane, {
      props: { documentName: null, content: '', dirty: false, onedit: () => {} }
    });
    expect(screen.getByText('Nothing on the galley yet.')).toBeTruthy();
    expect(screen.queryByLabelText('Source')).toBeNull();
  });

  it('edits the open document and shows the dirty marker', async () => {
    const onedit = vi.fn();
    render(EditorPane, {
      props: { documentName: 'main.tex', content: 'hello', dirty: true, onedit }
    });
    expect(screen.getByText('main.tex')).toBeTruthy();
    expect(screen.getByLabelText('unsaved changes')).toBeTruthy();

    const textarea = screen.getByLabelText('Source') as HTMLTextAreaElement;
    expect(textarea.value).toBe('hello');
    await fireEvent.input(textarea, { target: { value: 'hello world' } });
    expect(onedit).toHaveBeenCalledWith('hello world');
  });

  it('hides the dirty marker when clean', () => {
    render(EditorPane, {
      props: { documentName: 'main.tex', content: 'x', dirty: false, onedit: () => {} }
    });
    expect(screen.queryByLabelText('unsaved changes')).toBeNull();
  });
});
