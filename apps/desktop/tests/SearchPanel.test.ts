import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import SearchPanel from '../src/lib/SearchPanel.svelte';
import { browserProjectBackend, type ProjectBackend } from '../src/lib/project-backend';

const ROOT = '/project';

function makeBackend(files: Record<string, string> = {}) {
  const b = browserProjectBackend();
  for (const [path, content] of Object.entries(files)) {
    (b as ReturnType<typeof browserProjectBackend> & { _files: Map<string, string> })['_files']
      ?.set(path, content);
  }
  return b;
}

/** Build a backend that has 'main.tex' with the given content, pre-seeded. */
async function seedBackend(content: string) {
  const b = browserProjectBackend();
  // Use the public API: create a project, then save a document.
  await b.createProject('/parent', 'test');
  await b.saveDocument(ROOT, 'main.tex', content);
  return b;
}

const baseProps = (overrides: object = {}) => ({
  root: ROOT,
  backend: browserProjectBackend(),
  activeContent: '',
  activePath: null,
  onclose: vi.fn(),
  onreplace: vi.fn(),
  ...overrides
});

describe('SearchPanel', () => {
  it('renders the search UI with pattern input, options, and replace controls', () => {
    render(SearchPanel, { props: baseProps() });
    expect(screen.getByLabelText('Search pattern')).toBeTruthy();
    expect(screen.getByLabelText('Replacement text')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByText('Replace all')).toBeTruthy();
  });

  it('closes on Escape key', async () => {
    const onclose = vi.fn();
    render(SearchPanel, { props: baseProps({ onclose }) });
    await fireEvent.keyDown(screen.getByLabelText('Search pattern'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('closes via the ✕ button', async () => {
    const onclose = vi.fn();
    render(SearchPanel, { props: baseProps({ onclose }) });
    await fireEvent.click(screen.getByLabelText('Close search'));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('shows no results message after searching with no matches', async () => {
    render(SearchPanel, { props: baseProps({ activeContent: 'hello world' }) });
    const input = screen.getByLabelText('Search pattern');
    await fireEvent.input(input, { target: { value: 'zzz' } });
    await fireEvent.click(screen.getByText('Search'));
    expect(screen.getByText('No matches.')).toBeTruthy();
  });

  it('does nothing on search with empty pattern', async () => {
    render(SearchPanel, { props: baseProps() });
    await fireEvent.click(screen.getByText('Search'));
    expect(screen.queryByText('No matches.')).toBeNull();
  });

  it('shows no-matches when root is null (no project open)', async () => {
    render(SearchPanel, { props: baseProps({ root: null }) });
    const input = screen.getByLabelText('Search pattern');
    await fireEvent.input(input, { target: { value: 'foo' } });
    await fireEvent.click(screen.getByText('Search'));
    // With no project root, results stay empty → "No matches." is shown.
    expect(screen.getByText('No matches.')).toBeTruthy();
  });

  it('fires search on Enter key in the pattern input', async () => {
    render(SearchPanel, { props: baseProps({ activeContent: 'hello' }) });
    const input = screen.getByLabelText('Search pattern');
    await fireEvent.input(input, { target: { value: 'nope' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('No matches.')).toBeTruthy();
  });

  it('toggles the case-sensitive option', async () => {
    const { container } = render(SearchPanel, { props: baseProps() });
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('does not replace-all when pattern is empty', async () => {
    const onreplace = vi.fn();
    render(SearchPanel, { props: baseProps({ onreplace }) });
    await fireEvent.click(screen.getByText('Replace all'));
    expect(onreplace).not.toHaveBeenCalled();
  });

  it('does not replace-all when root is null', async () => {
    const onreplace = vi.fn();
    render(SearchPanel, { props: baseProps({ root: null, onreplace }) });
    const input = screen.getByLabelText('Search pattern');
    await fireEvent.input(input, { target: { value: 'foo' } });
    await fireEvent.click(screen.getByText('Replace all'));
    expect(onreplace).not.toHaveBeenCalled();
  });

  it('calls onreplace when replacing in the active file', async () => {
    const onreplace = vi.fn();
    const backend = await seedBackend('hello world');
    render(SearchPanel, {
      props: baseProps({
        backend,
        activeContent: 'hello world',
        activePath: 'main.tex',
        onreplace
      })
    });
    const patternInput = screen.getByLabelText('Search pattern');
    await fireEvent.input(patternInput, { target: { value: 'hello' } });
    await fireEvent.click(screen.getByText('Search'));
    const replInput = screen.getByLabelText('Replacement text');
    await fireEvent.input(replInput, { target: { value: 'goodbye' } });
    await fireEvent.click(screen.getByText('Replace all'));
    expect(onreplace).toHaveBeenCalledWith('main.tex', 'goodbye world');
  });

  it('shows an error message when searchProject throws an Error', async () => {
    const backend: ProjectBackend = {
      ...browserProjectBackend(),
      searchProject: async () => { throw new Error('network error'); }
    };
    render(SearchPanel, { props: baseProps({ backend }) });
    await fireEvent.input(screen.getByLabelText('Search pattern'), { target: { value: 'foo' } });
    await fireEvent.click(screen.getByText('Search'));
    expect(await screen.findByText('network error')).toBeTruthy();
  });

  it('stringifies a non-Error thrown by searchProject', async () => {
    const backend: ProjectBackend = {
      ...browserProjectBackend(),
      searchProject: async () => { throw 'raw string error'; }
    };
    render(SearchPanel, { props: baseProps({ backend }) });
    await fireEvent.input(screen.getByLabelText('Search pattern'), { target: { value: 'foo' } });
    await fireEvent.click(screen.getByText('Search'));
    expect(await screen.findByText('raw string error')).toBeTruthy();
  });

  it('reads a non-active file via readDocument when replacing', async () => {
    const onreplace = vi.fn();
    const backend: ProjectBackend = {
      ...browserProjectBackend(),
      searchProject: async () => [
        { file: 'other.tex', matches: [{ line: 1, column: 1, lineText: 'hello world', matchStart: 0, matchEnd: 5 }] }
      ],
      readDocument: async () => 'hello world',
      saveDocument: async () => {}
    };
    render(SearchPanel, {
      props: baseProps({ backend, activePath: 'main.tex', activeContent: 'unrelated', onreplace })
    });
    await fireEvent.input(screen.getByLabelText('Search pattern'), { target: { value: 'hello' } });
    await fireEvent.click(screen.getByText('Search'));
    await screen.findByLabelText('Search results');
    await fireEvent.input(screen.getByLabelText('Replacement text'), { target: { value: 'goodbye' } });
    await fireEvent.click(screen.getByText('Replace all'));
    await waitFor(() => expect(onreplace).toHaveBeenCalledWith('other.tex', 'goodbye world'));
  });

  it('shows an error message when readDocument throws an Error during replace-all', async () => {
    const backend: ProjectBackend = {
      ...browserProjectBackend(),
      searchProject: async () => [
        { file: 'other.tex', matches: [{ line: 1, column: 1, lineText: 'hello world', matchStart: 0, matchEnd: 5 }] }
      ],
      readDocument: async () => { throw new Error('read failed'); }
    };
    render(SearchPanel, {
      props: baseProps({ backend, activePath: 'main.tex', activeContent: 'hello world' })
    });
    await fireEvent.input(screen.getByLabelText('Search pattern'), { target: { value: 'hello' } });
    await fireEvent.click(screen.getByText('Search'));
    await screen.findByLabelText('Search results');
    await fireEvent.click(screen.getByText('Replace all'));
    expect(await screen.findByText('read failed')).toBeTruthy();
  });

  it('stringifies a non-Error thrown during replace-all', async () => {
    const backend: ProjectBackend = {
      ...browserProjectBackend(),
      searchProject: async () => [
        { file: 'other.tex', matches: [{ line: 1, column: 1, lineText: 'hello', matchStart: 0, matchEnd: 5 }] }
      ],
      readDocument: async () => { throw 'raw read error'; }
    };
    render(SearchPanel, {
      props: baseProps({ backend, activePath: 'main.tex', activeContent: 'hello' })
    });
    await fireEvent.input(screen.getByLabelText('Search pattern'), { target: { value: 'hello' } });
    await fireEvent.click(screen.getByText('Search'));
    await screen.findByLabelText('Search results');
    await fireEvent.click(screen.getByText('Replace all'));
    expect(await screen.findByText('raw read error')).toBeTruthy();
  });

  it('shows singular match and plural files in the results summary', async () => {
    // 1 match each in 2 files → "2 matches in 2 files" covers the plural-files ('s') branch
    const backend: ProjectBackend = {
      ...browserProjectBackend(),
      searchProject: async () => [
        { file: 'a.tex', matches: [{ line: 1, column: 1, lineText: 'x', matchStart: 0, matchEnd: 1 }] },
        { file: 'b.tex', matches: [{ line: 1, column: 1, lineText: 'x', matchStart: 0, matchEnd: 1 }] }
      ]
    };
    render(SearchPanel, { props: baseProps({ backend }) });
    await fireEvent.input(screen.getByLabelText('Search pattern'), { target: { value: 'x' } });
    await fireEvent.click(screen.getByText('Search'));
    expect(await screen.findByText(/in 2 files/)).toBeTruthy();
  });

  it('shows singular "1 match" in the results summary', async () => {
    const backend: ProjectBackend = {
      ...browserProjectBackend(),
      searchProject: async () => [
        { file: 'a.tex', matches: [{ line: 1, column: 1, lineText: 'x', matchStart: 0, matchEnd: 1 }] }
      ]
    };
    render(SearchPanel, { props: baseProps({ backend }) });
    await fireEvent.input(screen.getByLabelText('Search pattern'), { target: { value: 'x' } });
    await fireEvent.click(screen.getByText('Search'));
    expect(await screen.findByText(/1 match in/)).toBeTruthy();
  });

  it('shows a match count summary after a successful search', async () => {
    render(SearchPanel, {
      props: baseProps({ activeContent: 'foo foo', activePath: 'main.tex', root: '/p' })
    });
    const backend = await seedBackend('foo foo');
    const { rerender } = render(SearchPanel, {
      props: baseProps({
        backend,
        activeContent: 'foo foo',
        activePath: 'main.tex'
      })
    });
    const input = screen.getAllByLabelText('Search pattern')[1];
    await fireEvent.input(input, { target: { value: 'foo' } });
    await fireEvent.click(screen.getAllByText('Search')[1]);
    expect(screen.getByLabelText('Search results')).toBeTruthy();
  });
});
