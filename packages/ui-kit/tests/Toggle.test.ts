import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Toggle from '../src/Toggle.svelte';

describe('Toggle', () => {
  it('renders an off switch by default', () => {
    render(Toggle, { props: { label: 'Sound' } });
    const sw = screen.getByRole('switch', { name: 'Sound' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.className).not.toContain('on');
  });

  it('reflects the checked state', () => {
    render(Toggle, { props: { label: 'Sound', checked: true } });
    const sw = screen.getByRole('switch', { name: 'Sound' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.className).toContain('on');
  });

  it('emits the negated value on click', async () => {
    const onchange = vi.fn();
    render(Toggle, { props: { label: 'Sound', checked: false, onchange } });
    await fireEvent.click(screen.getByRole('switch', { name: 'Sound' }));
    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('is safe to click without a handler', async () => {
    render(Toggle, { props: { label: 'Sound' } });
    await fireEvent.click(screen.getByRole('switch', { name: 'Sound' }));
    expect(screen.getByRole('switch', { name: 'Sound' })).toBeTruthy();
  });

  it('respects the disabled state', () => {
    render(Toggle, { props: { label: 'Sound', disabled: true } });
    expect((screen.getByRole('switch', { name: 'Sound' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
