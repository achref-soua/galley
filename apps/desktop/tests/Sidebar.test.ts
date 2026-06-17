import { describe, it, expect, vi } from 'vitest';
import { type ComponentProps } from 'svelte';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Sidebar from '../src/lib/Sidebar.svelte';
import { type ProjectSnapshot } from '../src/lib/project-backend';
import { type RecentProject } from '../src/lib/recent-projects';

const project: ProjectSnapshot = {
  name: 'Paper',
  root: '/p',
  rootDocument: 'main.tex',
  documents: [
    { path: 'main.tex', kind: 'tex' },
    { path: 'sections/intro.tex', kind: 'tex' }
  ]
};

function setup(over: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const handlers = {
    onopenfile: vi.fn(),
    onnewproject: vi.fn(),
    onopenfolder: vi.fn(),
    onopenrecent: vi.fn()
  };
  const props: ComponentProps<typeof Sidebar> = {
    project: null,
    activePath: null,
    recent: [] as RecentProject[],
    ...handlers,
    ...over
  };
  render(Sidebar, { props });
  return handlers;
}

describe('Sidebar — no project', () => {
  it('shows the empty state and the new/open controls', () => {
    setup();
    expect(screen.getByText('No project open yet.')).toBeTruthy();
    expect(screen.getByLabelText('New project name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open a folder…' })).toBeTruthy();
  });

  it('ignores an empty new-project name but submits a real one', async () => {
    const { onnewproject } = setup();
    const form = screen.getByLabelText('New project name').closest('form') as HTMLFormElement;

    await fireEvent.submit(form);
    expect(onnewproject).not.toHaveBeenCalled();

    await fireEvent.input(screen.getByLabelText('New project name'), {
      target: { value: '  Paper  ' }
    });
    await fireEvent.submit(form);
    expect(onnewproject).toHaveBeenCalledWith('Paper');
  });

  it('opens a folder', async () => {
    const { onopenfolder } = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'Open a folder…' }));
    expect(onopenfolder).toHaveBeenCalledOnce();
  });

  it('does not render a recent section when there are none', () => {
    setup();
    expect(screen.queryByLabelText('Recent projects')).toBeNull();
  });
});

describe('Sidebar — with a project', () => {
  it('renders the file tree, marks the active file, and opens files', async () => {
    const { onopenfile } = setup({ project, activePath: 'main.tex' });
    // Directory header plus both files.
    expect(screen.getByText('sections')).toBeTruthy();
    const main = screen.getByRole('button', { name: 'main.tex' });
    expect(main.getAttribute('aria-current')).toBe('true');

    const intro = screen.getByRole('button', { name: 'intro.tex' });
    expect(intro.getAttribute('aria-current')).toBe('false');
    await fireEvent.click(intro);
    expect(onopenfile).toHaveBeenCalledWith('sections/intro.tex');
  });

  it('lists recent projects and re-opens them', async () => {
    const recent: RecentProject[] = [{ root: '/a', name: 'Alpha' }];
    const { onopenrecent } = setup({ project, activePath: 'main.tex', recent });
    expect(screen.getByLabelText('Recent projects')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onopenrecent).toHaveBeenCalledWith('/a');
  });
});
