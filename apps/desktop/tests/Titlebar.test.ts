import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Titlebar from '../src/lib/Titlebar.svelte';

const noop = () => {};

const base = {
  documentName: 'thesis.tex',
  dirty: false,
  canSave: false,
  canCompile: true,
  compiling: false,
  sidebarCollapsed: false,
  previewCollapsed: false,
  oncompile: noop,
  onsave: noop,
  ontogglesidebar: noop,
  ontogglepreview: noop,
  onopensettings: noop
};

describe('Titlebar', () => {
  it('shows the wordmark, document name, and wires the actions when panes are open', async () => {
    const ontogglesidebar = vi.fn();
    const ontogglepreview = vi.fn();
    const onopensettings = vi.fn();
    render(Titlebar, {
      props: { ...base, ontogglesidebar, ontogglepreview, onopensettings }
    });

    expect(screen.getByText('Galley')).toBeTruthy();
    expect(screen.getByText('thesis.tex')).toBeTruthy();
    // Clean document: no unsaved marker, save disabled.
    expect(screen.queryByLabelText('unsaved changes')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);

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
      props: { ...base, documentName: 'x.tex', sidebarCollapsed: true, previewCollapsed: true }
    });
    expect(screen.getByRole('button', { name: 'Show sidebar' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByRole('button', { name: 'Show preview' })).toBeTruthy();
  });

  it('marks unsaved changes and enables saving', async () => {
    const onsave = vi.fn();
    render(Titlebar, { props: { ...base, dirty: true, canSave: true, onsave } });
    expect(screen.getByLabelText('unsaved changes')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(false);
    await fireEvent.click(save);
    expect(onsave).toHaveBeenCalledOnce();
  });

  it('compiles from the Compile button when a document is open', async () => {
    const oncompile = vi.fn();
    render(Titlebar, { props: { ...base, canCompile: true, compiling: false, oncompile } });
    const compile = screen.getByRole('button', { name: 'Compile' });
    expect(compile.hasAttribute('disabled')).toBe(false);
    await fireEvent.click(compile);
    expect(oncompile).toHaveBeenCalledOnce();
  });

  it('disables Compile when there is nothing to build', () => {
    render(Titlebar, { props: { ...base, canCompile: false } });
    expect(screen.getByRole('button', { name: 'Compile' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows a compiling state and disables the button while it runs', () => {
    render(Titlebar, { props: { ...base, canCompile: true, compiling: true } });
    const compile = screen.getByRole('button', { name: 'Compiling…' });
    expect(compile.hasAttribute('disabled')).toBe(true);
  });
});
