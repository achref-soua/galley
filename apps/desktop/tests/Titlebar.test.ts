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
  onopensettings: noop,
  onopenmatch: noop,
  onopentable: noop
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

  it('fires onopenmatch when the equation button is clicked', async () => {
    const onopenmatch = vi.fn();
    render(Titlebar, { props: { ...base, canCompile: true, onopenmatch } });
    await fireEvent.click(screen.getByTitle('Insert equation'));
    expect(onopenmatch).toHaveBeenCalledOnce();
  });

  it('fires onopentable when the table button is clicked', async () => {
    const onopentable = vi.fn();
    render(Titlebar, { props: { ...base, canCompile: true, onopentable } });
    await fireEvent.click(screen.getByTitle('Insert table'));
    expect(onopentable).toHaveBeenCalledOnce();
  });

  it('disables equation and table buttons when canCompile is false', () => {
    render(Titlebar, { props: { ...base, canCompile: false } });
    expect(screen.getByTitle('Insert equation').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTitle('Insert table').hasAttribute('disabled')).toBe(true);
  });

  it('shows the visual toggle button with ¶ label in code mode', () => {
    render(Titlebar, { props: { ...base, viewMode: 'code' } });
    const btn = screen.getByTitle('Switch to visual view');
    expect(btn.textContent?.trim()).toBe('¶');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the visual toggle button with <> label in visual mode', () => {
    render(Titlebar, { props: { ...base, viewMode: 'visual' } });
    const btn = screen.getByTitle('Switch to code view');
    expect(btn.textContent?.trim()).toBe('<>');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('fires ontoggleviewmode when the toggle is clicked', async () => {
    const ontoggleviewmode = vi.fn();
    render(Titlebar, { props: { ...base, canCompile: true, ontoggleviewmode } });
    await fireEvent.click(screen.getByTitle('Switch to visual view'));
    expect(ontoggleviewmode).toHaveBeenCalledOnce();
  });

  it('disables the view-mode toggle when canCompile is false', () => {
    render(Titlebar, { props: { ...base, canCompile: false } });
    const btn = screen.getByTitle('Switch to visual view');
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
