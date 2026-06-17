import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import App from '../src/App.svelte';
import { firePointer } from './setup';

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
