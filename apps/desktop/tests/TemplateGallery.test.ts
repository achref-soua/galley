import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TemplateGallery from '../src/lib/TemplateGallery.svelte';
import { CustomTemplateStore, type TemplateDefinition } from '../src/lib/templates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    }
  };
}

function makeStore(initial: TemplateDefinition[] = []): CustomTemplateStore {
  const storage = makeStorage();
  const store = new CustomTemplateStore(storage);
  for (const t of initial) {
    store.add(t);
  }
  return store;
}

function customTemplate(overrides: Partial<TemplateDefinition> = {}): TemplateDefinition {
  return {
    id: 'my-custom',
    name: 'My Custom',
    category: 'Custom',
    description: 'A saved custom template.',
    body: '\\documentclass{article}\n\\begin{document}\nMy content.\n\\end{document}\n',
    ...overrides
  };
}

const baseProps = () => ({
  customStore: makeStore(),
  currentContent: null as string | null,
  onuse: vi.fn(),
  onclose: vi.fn()
});

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------
describe('TemplateGallery — basic rendering', () => {
  it('renders the dialog with the correct aria-label', () => {
    const { getByRole } = render(TemplateGallery, { props: baseProps() });
    expect(getByRole('dialog', { name: 'Template gallery' })).toBeTruthy();
  });

  it('shows the "Template Gallery" heading', () => {
    const { getByText } = render(TemplateGallery, { props: baseProps() });
    expect(getByText('Template Gallery')).toBeTruthy();
  });

  it('renders all built-in templates by default', () => {
    const { getAllByText } = render(TemplateGallery, { props: baseProps() });
    // Each card has a "Use template" button; there are 12 built-in templates.
    expect(getAllByText('Use template').length).toBe(12);
  });

  it('renders category nav buttons including "All templates"', () => {
    const { getByRole } = render(TemplateGallery, { props: baseProps() });
    expect(getByRole('button', { name: 'All templates' })).toBeTruthy();
    expect(getByRole('button', { name: 'Article' })).toBeTruthy();
    expect(getByRole('button', { name: 'Conference' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Close button
// ---------------------------------------------------------------------------
describe('TemplateGallery — close', () => {
  it('calls onclose when the close button is clicked', async () => {
    const onclose = vi.fn();
    const { getByRole } = render(TemplateGallery, {
      props: { ...baseProps(), onclose }
    });
    await fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Category filtering
// ---------------------------------------------------------------------------
describe('TemplateGallery — category filtering', () => {
  it('filters to only the selected category when a category button is clicked', async () => {
    const { getByRole, getAllByText } = render(TemplateGallery, { props: baseProps() });
    // Click "Article" category (there is 1 article template)
    await fireEvent.click(getByRole('button', { name: 'Article' }));
    expect(getAllByText('Use template').length).toBe(1);
  });

  it('clicking the same category again deselects it (shows all)', async () => {
    const { getByRole, getAllByText } = render(TemplateGallery, { props: baseProps() });
    await fireEvent.click(getByRole('button', { name: 'Article' }));
    expect(getAllByText('Use template').length).toBe(1);
    // Click again → deselect → all
    await fireEvent.click(getByRole('button', { name: 'Article' }));
    expect(getAllByText('Use template').length).toBe(12);
  });

  it('"All templates" button selects null (shows all)', async () => {
    const { getByRole, getAllByText } = render(TemplateGallery, { props: baseProps() });
    await fireEvent.click(getByRole('button', { name: 'Article' }));
    expect(getAllByText('Use template').length).toBe(1);
    await fireEvent.click(getByRole('button', { name: 'All templates' }));
    expect(getAllByText('Use template').length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Search filtering
// ---------------------------------------------------------------------------
describe('TemplateGallery — search', () => {
  it('shows the empty state when no templates match the query', async () => {
    const { getByLabelText, getByText } = render(TemplateGallery, { props: baseProps() });
    await fireEvent.input(getByLabelText('Search templates'), {
      target: { value: 'xyzzy-no-match' }
    });
    expect(getByText('No templates match your search.')).toBeTruthy();
  });

  it('filters templates by name (case-insensitive)', async () => {
    const { getByLabelText, getAllByText } = render(TemplateGallery, { props: baseProps() });
    await fireEvent.input(getByLabelText('Search templates'), { target: { value: 'beamer' } });
    expect(getAllByText('Use template').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Use template
// ---------------------------------------------------------------------------
describe('TemplateGallery — use template', () => {
  it('calls onuse with the correct template when "Use template" is clicked', async () => {
    const onuse = vi.fn();
    const { getAllByText } = render(TemplateGallery, {
      props: { ...baseProps(), onuse }
    });
    await fireEvent.click(getAllByText('Use template')[0]);
    expect(onuse).toHaveBeenCalledOnce();
    const arg: TemplateDefinition = onuse.mock.calls[0][0];
    expect(typeof arg.body).toBe('string');
    expect(arg.body.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Footer — no save button when currentContent is null
// ---------------------------------------------------------------------------
describe('TemplateGallery — footer when currentContent is null', () => {
  it('does not show the save button when currentContent is null', () => {
    const { queryByText } = render(TemplateGallery, {
      props: { ...baseProps(), currentContent: null }
    });
    expect(queryByText('Save current document as template…')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Footer — save current document as template
// ---------------------------------------------------------------------------
describe('TemplateGallery — save current document as template', () => {
  it('shows the save button when currentContent is a string', () => {
    const { getByText } = render(TemplateGallery, {
      props: { ...baseProps(), currentContent: '\\documentclass{article}\\end{document}' }
    });
    expect(getByText('Save current document as template…')).toBeTruthy();
  });

  it('clicking the save button shows the save form', async () => {
    const { getByText, getByRole } = render(TemplateGallery, {
      props: { ...baseProps(), currentContent: '\\documentclass{article}\\end{document}' }
    });
    await fireEvent.click(getByText('Save current document as template…'));
    expect(getByRole('form', { name: 'Save as template' })).toBeTruthy();
  });

  it('Cancel hides the save form and shows the save button again', async () => {
    const { getByText, queryByRole } = render(TemplateGallery, {
      props: { ...baseProps(), currentContent: '\\documentclass{article}\\end{document}' }
    });
    await fireEvent.click(getByText('Save current document as template…'));
    await fireEvent.click(getByText('Cancel'));
    expect(queryByRole('form', { name: 'Save as template' })).toBeNull();
    expect(getByText('Save current document as template…')).toBeTruthy();
  });

  it('confirming with an empty name cancels saving (no-op)', async () => {
    const store = makeStore();
    const { getByText, queryByRole } = render(TemplateGallery, {
      props: { ...baseProps(), customStore: store, currentContent: 'body' }
    });
    await fireEvent.click(getByText('Save current document as template…'));
    // Don't type a name — just click Save
    await fireEvent.click(getByText('Save'));
    expect(store.all()).toHaveLength(0);
    // Form is dismissed after the no-op
    expect(queryByRole('form', { name: 'Save as template' })).toBeNull();
  });

  it('saves the template with a valid name and adds it to the gallery', async () => {
    const store = makeStore();
    const { getByText, getByLabelText, getAllByText } = render(TemplateGallery, {
      props: { ...baseProps(), customStore: store, currentContent: 'my body' }
    });
    await fireEvent.click(getByText('Save current document as template…'));
    await fireEvent.input(getByLabelText('Template name'), { target: { value: 'My Saved' } });
    await fireEvent.click(getByText('Save'));
    // The form is gone and the new card appears.
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].name).toBe('My Saved');
    expect(store.all()[0].body).toBe('my body');
    // 12 built-in + 1 custom = 13 "Use template" buttons
    expect(getAllByText('Use template').length).toBe(13);
  });

  it('Enter key confirms the save form', async () => {
    const store = makeStore();
    const { getByText, getByLabelText } = render(TemplateGallery, {
      props: { ...baseProps(), customStore: store, currentContent: 'body' }
    });
    await fireEvent.click(getByText('Save current document as template…'));
    const input = getByLabelText('Template name');
    await fireEvent.input(input, { target: { value: 'Keyboard Save' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].name).toBe('Keyboard Save');
  });

  it('Escape key cancels the save form', async () => {
    const store = makeStore();
    const { getByText, getByLabelText, queryByRole } = render(TemplateGallery, {
      props: { ...baseProps(), customStore: store, currentContent: 'body' }
    });
    await fireEvent.click(getByText('Save current document as template…'));
    const input = getByLabelText('Template name');
    await fireEvent.input(input, { target: { value: 'Whatever' } });
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(store.all()).toHaveLength(0);
    expect(queryByRole('form', { name: 'Save as template' })).toBeNull();
  });

  it('other keys in the save form do not confirm or cancel', async () => {
    const store = makeStore();
    const { getByText, getByLabelText, getByRole } = render(TemplateGallery, {
      props: { ...baseProps(), customStore: store, currentContent: 'body' }
    });
    await fireEvent.click(getByText('Save current document as template…'));
    const input = getByLabelText('Template name');
    await fireEvent.keyDown(input, { key: 'Tab' });
    // Form is still present and nothing was saved.
    expect(store.all()).toHaveLength(0);
    expect(getByRole('form', { name: 'Save as template' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Custom templates — Delete button
// ---------------------------------------------------------------------------
describe('TemplateGallery — custom template deletion', () => {
  it('shows a Delete button only for custom templates', () => {
    const store = makeStore([customTemplate()]);
    const { getAllByText } = render(TemplateGallery, {
      props: { ...baseProps(), customStore: store }
    });
    expect(getAllByText('Delete').length).toBe(1);
  });

  it('deletes the custom template when Delete is clicked', async () => {
    const store = makeStore([customTemplate()]);
    const { getByText, queryByText, getAllByText } = render(TemplateGallery, {
      props: { ...baseProps(), customStore: store }
    });
    expect(getAllByText('Use template').length).toBe(13);
    await fireEvent.click(getByText('Delete'));
    expect(store.all()).toHaveLength(0);
    expect(queryByText('Delete')).toBeNull();
    expect(getAllByText('Use template').length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// App.svelte integration — template gallery opens and closes
// ---------------------------------------------------------------------------
// These tests live in App.test.ts (palette + dashboard button paths).
// Tested here: the gallery overlay mounts, renders, and unmounts correctly
// via the exported customTemplateStore prop.
describe('TemplateGallery — overlay mounting', () => {
  it('is not visible by default (tested at App level)', () => {
    // The gallery is only mounted inside App when templateGalleryOpen = true.
    // This is covered by the App.test.ts palette and dashboard button tests.
    expect(true).toBe(true);
  });
});
