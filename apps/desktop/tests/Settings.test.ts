import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Settings from '../src/lib/Settings.svelte';

const base = {
  themePreference: 'onionskin' as const,
  reduceMotion: false,
  autoCompile: true,
  soundOnSuccess: false,
  keymapMode: 'default' as const,
  spellCheck: false,
  onthemechange: () => {},
  onautocompilechange: () => {},
  onsoundchange: () => {},
  onkeymapchange: () => {},
  onspellcheckchange: () => {},
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
    await fireEvent.click(screen.getByRole('button', { name: 'Compilation' }));
    expect(screen.getByText('Compile as you type')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByText(/local-first LaTeX studio/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByText('Theme')).toBeTruthy();
  });

  it('reflects and toggles the compilation preferences', async () => {
    const onautocompilechange = vi.fn();
    const onsoundchange = vi.fn();
    render(Settings, {
      props: { ...base, soundOnSuccess: false, onautocompilechange, onsoundchange }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Compilation' }));

    const autoSwitch = screen.getByRole('switch', { name: 'Compile as you type' });
    const bellSwitch = screen.getByRole('switch', { name: 'Bell on success' });
    expect(autoSwitch.getAttribute('aria-checked')).toBe('true');
    expect(bellSwitch.getAttribute('aria-checked')).toBe('false');

    await fireEvent.click(autoSwitch); // currently on → turning off
    expect(onautocompilechange).toHaveBeenCalledWith(false);
    await fireEvent.click(bellSwitch); // currently off → turning on
    expect(onsoundchange).toHaveBeenCalledWith(true);
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

describe('Settings — Editor section', () => {
  it('shows the Editor section with keymap and spell-check controls', async () => {
    render(Settings, { props: base });
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(screen.getByText('Key-map mode')).toBeTruthy();
    expect(screen.getByText('Spell-check')).toBeTruthy();
  });

  it('reflects the current keymapMode', async () => {
    render(Settings, { props: { ...base, keymapMode: 'vim' as const } });
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(screen.getByRole('radio', { name: 'Vim' }).getAttribute('aria-checked')).toBe('true');
  });

  it('emits onkeymapchange when the keymap mode is changed', async () => {
    const onkeymapchange = vi.fn();
    render(Settings, { props: { ...base, onkeymapchange } });
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Vim' }));
    expect(onkeymapchange).toHaveBeenCalledWith('vim');
  });

  it('emits onspellcheckchange when the spell-check toggle is clicked', async () => {
    const onspellcheckchange = vi.fn();
    render(Settings, { props: { ...base, onspellcheckchange } });
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    const toggle = screen.getByRole('switch', { name: 'Spell-check' });
    await fireEvent.click(toggle);
    expect(onspellcheckchange).toHaveBeenCalledWith(true);
  });

  it('reflects spellCheck: true in the toggle', async () => {
    render(Settings, { props: { ...base, spellCheck: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(screen.getByRole('switch', { name: 'Spell-check' }).getAttribute('aria-checked')).toBe('true');
  });
});
