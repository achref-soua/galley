import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Titlebar from '../src/lib/Titlebar.svelte';

const noop = () => {};

describe('Titlebar', () => {
  it('shows the wordmark, document name, and wires the actions when panes are open', async () => {
    const ontogglesidebar = vi.fn();
    const ontogglepreview = vi.fn();
    const onopensettings = vi.fn();
    render(Titlebar, {
      props: {
        documentName: 'thesis.tex',
        sidebarCollapsed: false,
        previewCollapsed: false,
        ontogglesidebar,
        ontogglepreview,
        onopensettings
      }
    });

    expect(screen.getByText('Galley')).toBeTruthy();
    expect(screen.getByText('thesis.tex')).toBeTruthy();

    const sidebar = screen.getByRole('button', { name: 'Hide sidebar' });
    expect(sidebar.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(sidebar);
    expect(ontogglesidebar).toHaveBeenCalledOnce();

    await fireEvent.click(screen.getByRole('button', { name: 'Hide preview' }));
    expect(ontogglepreview).toHaveBeenCalledOnce();

    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onopensettings).toHaveBeenCalledOnce();
  });

  it('offers show-labels when panes are collapsed', () => {
    render(Titlebar, {
      props: {
        documentName: 'x.tex',
        sidebarCollapsed: true,
        previewCollapsed: true,
        ontogglesidebar: noop,
        ontogglepreview: noop,
        onopensettings: noop
      }
    });
    expect(screen.getByRole('button', { name: 'Show sidebar' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByRole('button', { name: 'Show preview' })).toBeTruthy();
  });
});
