import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Settings from '../src/lib/Settings.svelte';

const base = {
  themePreference: 'onionskin' as const,
  reduceMotion: false,
  onthemechange: () => {},
  onclose: () => {}
};

describe('Settings', () => {
  it('opens on the Appearance section with the theme and motion status', () => {
    render(Settings, { props: base });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByText('Theme')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Onionskin' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(screen.getByText('Off')).toBeTruthy();
  });

  it('reports reduced motion as on when the system asks for it', () => {
    render(Settings, { props: { ...base, reduceMotion: true } });
    expect(screen.getByText(/On \(following your system\)/)).toBeTruthy();
  });

  it('emits a theme change', async () => {
    const onthemechange = vi.fn();
    render(Settings, { props: { ...base, onthemechange } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Carbon' }));
    expect(onthemechange).toHaveBeenCalledWith('carbon');
  });

  it('switches between sections', async () => {
    render(Settings, { props: base });
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(screen.getByText(/Fonts, keymaps/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByText(/local-first LaTeX studio/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByText('Theme')).toBeTruthy();
  });

  it('closes via the close button', async () => {
    const onclose = vi.fn();
    render(Settings, { props: { ...base, onclose } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('closes when the scrim is clicked', async () => {
    const onclose = vi.fn();
    render(Settings, { props: { ...base, onclose } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('closes on Escape but ignores other keys', async () => {
    const onclose = vi.fn();
    render(Settings, { props: { ...base, onclose } });
    await fireEvent.keyDown(window, { key: 'a' });
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
  });
});
