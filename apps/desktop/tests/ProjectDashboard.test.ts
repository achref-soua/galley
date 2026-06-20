import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ProjectDashboard from '../src/lib/ProjectDashboard.svelte';
import { ProjectRegistry, type RegisteredProject } from '../src/lib/project-registry';
import type { WindowBackend } from '../src/lib/window-backend';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    }
  };
}

function makeRegistry(projects: RegisteredProject[] = []): ProjectRegistry {
  const storage = makeStorage();
  const registry = new ProjectRegistry(storage);
  for (const p of projects) {
    registry.upsert(p);
  }
  return registry;
}

function makeWindowBackend(): WindowBackend {
  return { openInNewWindow: vi.fn(() => Promise.resolve()) };
}

const baseProps = () => ({
  registry: makeRegistry(),
  windowBackend: makeWindowBackend(),
  onopen: vi.fn(),
  onopennewwindow: vi.fn(),
  onnew: vi.fn(),
  onimport: vi.fn()
});

// ---------------------------------------------------------------------------
// Empty-state
// ---------------------------------------------------------------------------
describe('ProjectDashboard empty state', () => {
  it('shows the empty-state message when no projects exist', () => {
    const { getByText } = render(ProjectDashboard, { props: baseProps() });
    expect(getByText(/No projects yet/i)).toBeTruthy();
  });

  it('shows "All Projects" heading', () => {
    const { getByText } = render(ProjectDashboard, { props: baseProps() });
    expect(getByText('All Projects')).toBeTruthy();
  });

  it('renders New project, Import, and New window buttons', () => {
    const { getByText } = render(ProjectDashboard, { props: baseProps() });
    expect(getByText('New project…')).toBeTruthy();
    expect(getByText('Import…')).toBeTruthy();
    expect(getByText('New window')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Project cards
// ---------------------------------------------------------------------------
describe('ProjectDashboard project cards', () => {
  const projects: RegisteredProject[] = [
    { root: '/home/user/thesis', name: 'My Thesis', tags: [], lastOpened: 1000 },
    { root: '/home/user/cv', name: 'Curriculum Vitae', tags: ['career'], lastOpened: null }
  ];

  it('renders a card for each project', () => {
    const { getByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects) }
    });
    expect(getByText('My Thesis')).toBeTruthy();
    expect(getByText('Curriculum Vitae')).toBeTruthy();
  });

  it('calls onopen with the correct root when Open is clicked', () => {
    const onopen = vi.fn();
    const { getAllByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects), onopen }
    });
    const openButtons = getAllByText('Open');
    fireEvent.click(openButtons[0]);
    expect(onopen).toHaveBeenCalledWith(projects[0].root); // sorted by lastOpened desc; thesis (1000) is first
  });

  it('removes a project when Remove is clicked', async () => {
    const registry = makeRegistry(projects);
    const { getAllByText, queryByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    const removeButtons = getAllByText('Remove');
    fireEvent.click(removeButtons[0]);
    // The first card in sorted order is 'My Thesis' (lastOpened: 1000 > null)
    expect(registry.all()).toHaveLength(1);
    expect(queryByText('My Thesis')).toBeNull();
  });

  it('shows "Never opened" for null lastOpened', () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { getByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    expect(getByText('Never opened')).toBeTruthy();
  });

  it('shows a formatted date for non-null lastOpened', () => {
    const registry = makeRegistry([
      { root: '/a', name: 'A', tags: [], lastOpened: new Date('2025-01-15').getTime() }
    ]);
    const { container } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    // Should contain a date-like string in the card
    expect(container.textContent).toContain('2025');
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
describe('ProjectDashboard search', () => {
  const projects: RegisteredProject[] = [
    { root: '/a/thesis', name: 'My Thesis', tags: [], lastOpened: 1 },
    { root: '/b/cv', name: 'Curriculum Vitae', tags: [], lastOpened: 2 }
  ];

  it('filters cards by search query', async () => {
    const { getByLabelText, queryByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects) }
    });
    const input = getByLabelText('Search projects');
    await fireEvent.input(input, { target: { value: 'thesis' } });
    expect(queryByText('My Thesis')).toBeTruthy();
    expect(queryByText('Curriculum Vitae')).toBeNull();
  });

  it('shows no-match message when search has no results', async () => {
    const { getByLabelText, getByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects) }
    });
    const input = getByLabelText('Search projects');
    await fireEvent.input(input, { target: { value: 'xyzzy123' } });
    expect(getByText(/No projects match/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tag filters
// ---------------------------------------------------------------------------
describe('ProjectDashboard tag filters', () => {
  const projects: RegisteredProject[] = [
    { root: '/a', name: 'Thesis', tags: ['research', 'phd'], lastOpened: 1 },
    { root: '/b', name: 'CV', tags: ['career'], lastOpened: 2 }
  ];

  it('does not render the tag filter bar when no tags exist', () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { queryByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    expect(queryByLabelText('Filter by tag')).toBeNull();
  });

  it('renders tag filter pills for known tags', () => {
    const { getByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects) }
    });
    expect(getByLabelText('Filter by tag')).toBeTruthy();
  });

  it('filters by tag when a pill is clicked', async () => {
    const { getAllByText, queryByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects) }
    });
    // 'career' tag pill
    const careerPill = getAllByText('career').find((el) => el.tagName.toLowerCase() === 'button');
    await fireEvent.click(careerPill!);
    expect(queryByText('Thesis')).toBeNull();
    expect(queryByText('CV')).toBeTruthy();
  });

  it('clears the tag filter when the same pill is clicked again', async () => {
    const { getAllByText, queryByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects) }
    });
    const careerPill = getAllByText('career').find((el) => el.tagName.toLowerCase() === 'button');
    await fireEvent.click(careerPill!);
    await fireEvent.click(careerPill!); // toggle off
    expect(queryByText('Thesis')).toBeTruthy();
    expect(queryByText('CV')).toBeTruthy();
  });

  it('shows a clear button when a tag filter is active, clears on click', async () => {
    const { getAllByText, getByLabelText, queryByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: makeRegistry(projects) }
    });
    const researchPill = getAllByText('research').find(
      (el) => el.tagName.toLowerCase() === 'button'
    );
    await fireEvent.click(researchPill!);
    const clearBtn = getByLabelText('Clear tag filter');
    expect(clearBtn).toBeTruthy();
    await fireEvent.click(clearBtn);
    expect(queryByLabelText('Clear tag filter')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tag management (add / remove per card)
// ---------------------------------------------------------------------------
describe('ProjectDashboard tag management', () => {
  it('shows existing tags on a card', () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: ['draft'], lastOpened: null }]);
    const { getAllByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    // 'draft' appears in both the tag filter pill and the card chip.
    expect(getAllByText('draft').length).toBeGreaterThanOrEqual(1);
  });

  it('removes a tag via the × button on the tag chip', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: ['draft'], lastOpened: null }]);
    const { getByLabelText, queryByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Remove tag draft'));
    expect(registry.all()[0].tags).toEqual([]);
    expect(queryByText('draft')).toBeNull();
  });

  it('opens the add-tag input when + is clicked', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { getByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    expect(getByLabelText('New tag name')).toBeTruthy();
  });

  it('adds a tag via the confirm (✓) button', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { getByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    const input = getByLabelText('New tag name');
    await fireEvent.input(input, { target: { value: 'phd' } });
    await fireEvent.click(getByLabelText('Confirm tag'));
    expect(registry.all()[0].tags).toEqual(['phd']);
  });

  it('adds a tag via the Enter key', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { getByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    const input = getByLabelText('New tag name');
    await fireEvent.input(input, { target: { value: 'work' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(registry.all()[0].tags).toEqual(['work']);
  });

  it('cancels the tag input via the Escape key', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { getByLabelText, queryByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    const input = getByLabelText('New tag name');
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(queryByLabelText('New tag name')).toBeNull();
    expect(registry.all()[0].tags).toEqual([]);
  });

  it('keeps existing tags visible while the add-tag input is open', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: ['draft'], lastOpened: null }]);
    const { getByLabelText, getAllByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    expect(getByLabelText('New tag name')).toBeTruthy();
    expect(getAllByText('draft').length).toBeGreaterThanOrEqual(1);
  });

  it('removes one tag from a multi-tag project, keeping the rest', async () => {
    const registry = makeRegistry([
      { root: '/a', name: 'A', tags: ['alpha', 'beta'], lastOpened: null }
    ]);
    const { getByLabelText, queryByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Remove tag alpha'));
    expect(registry.all()[0].tags).toEqual(['beta']);
    expect(queryByText('alpha')).toBeNull();
  });

  it('adds a second tag to a project that already has one', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: ['draft'], lastOpened: null }]);
    const { getByLabelText, getAllByText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    const input = getByLabelText('New tag name');
    await fireEvent.input(input, { target: { value: 'phd' } });
    await fireEvent.click(getByLabelText('Confirm tag'));
    expect(registry.all()[0].tags).toEqual(['draft', 'phd']);
    expect(getAllByText('phd').length).toBeGreaterThanOrEqual(1);
  });

  it('cancels the tag input via the cancel (✕) button', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { getByLabelText, queryByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    await fireEvent.click(getByLabelText('Cancel tag'));
    expect(queryByLabelText('New tag name')).toBeNull();
  });

  it('does not add an empty tag', async () => {
    const registry = makeRegistry([{ root: '/a', name: 'A', tags: [], lastOpened: null }]);
    const { getByLabelText } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    await fireEvent.click(getByLabelText('Add tag to A'));
    await fireEvent.click(getByLabelText('Confirm tag'));
    expect(registry.all()[0].tags).toEqual([]);
  });

  it('treats a null-ish tag value as an empty string', () => {
    // Exercise the Svelte-compiler-generated `?? ''` null-safety guard inside
    // the {#each project.tags as tag} card-chip loop. Tags are typed string[],
    // but the compiled reactive path can receive null if localStorage data is
    // corrupted or migrated from an older schema without a null-guard.
    const stub = {
      all: () => [{ root: '/x', name: 'X', tags: [null as unknown as string], lastOpened: null }],
      upsert: () => {},
      remove: () => {},
      addTag: () => {},
      removeTag: () => {}
    } as unknown as ProjectRegistry;

    const { container } = render(ProjectDashboard, {
      props: { ...baseProps(), registry: stub }
    });
    // The tag chip must still render (null coerces to '' via ?? '').
    expect(container.querySelector('.tag-chip.small')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Action buttons (header row)
// ---------------------------------------------------------------------------
describe('ProjectDashboard header actions', () => {
  it('calls onnew when "New project…" is clicked', async () => {
    const onnew = vi.fn();
    const { getByText } = render(ProjectDashboard, {
      props: { ...baseProps(), onnew }
    });
    await fireEvent.click(getByText('New project…'));
    expect(onnew).toHaveBeenCalled();
  });

  it('calls onimport when "Import…" is clicked', async () => {
    const onimport = vi.fn();
    const { getByText } = render(ProjectDashboard, {
      props: { ...baseProps(), onimport }
    });
    await fireEvent.click(getByText('Import…'));
    expect(onimport).toHaveBeenCalled();
  });

  it('calls windowBackend.openInNewWindow and onopennewwindow when "New window" is clicked', async () => {
    const windowBackend = makeWindowBackend();
    const onopennewwindow = vi.fn();
    const { getByText } = render(ProjectDashboard, {
      props: { ...baseProps(), windowBackend, onopennewwindow }
    });
    await fireEvent.click(getByText('New window'));
    expect(windowBackend.openInNewWindow).toHaveBeenCalled();
    expect(onopennewwindow).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// shortRoot formatting
// ---------------------------------------------------------------------------
describe('ProjectDashboard shortRoot', () => {
  it('shows a truncated path for deep roots', () => {
    const registry = makeRegistry([
      { root: '/home/achref/projects/work/deep/thesis', name: 'Thesis', tags: [], lastOpened: null }
    ]);
    const { container } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    // shortRoot should contain '…/' for a path with more than 3 segments
    expect(container.textContent).toContain('…/');
  });

  it('shows the full path for shallow roots', () => {
    const registry = makeRegistry([
      { root: '/home/thesis', name: 'Thesis', tags: [], lastOpened: null }
    ]);
    const { getByTitle } = render(ProjectDashboard, {
      props: { ...baseProps(), registry }
    });
    // title attribute shows the full root
    expect(getByTitle('/home/thesis')).toBeTruthy();
  });
});
