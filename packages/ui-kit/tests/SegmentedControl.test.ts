import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SegmentedControl from '../src/SegmentedControl.svelte';

const options = [
  { value: 'onionskin', label: 'Onionskin' },
  { value: 'carbon', label: 'Carbon' },
  { value: 'system', label: 'Match system' }
];

describe('SegmentedControl', () => {
  it('marks the selected option as checked', () => {
    render(SegmentedControl, { props: { options, value: 'carbon', ariaLabel: 'Theme' } });
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Carbon' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Onionskin' }).getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('emits the chosen value', async () => {
    const onchange = vi.fn();
    render(SegmentedControl, {
      props: { options, value: 'onionskin', ariaLabel: 'Theme', onchange }
    });
    await fireEvent.click(screen.getByRole('radio', { name: 'Carbon' }));
    expect(onchange).toHaveBeenCalledWith('carbon');
  });

  it('is safe to click without a handler', async () => {
    render(SegmentedControl, { props: { options, value: 'onionskin', ariaLabel: 'Theme' } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Match system' }));
    expect(screen.getByRole('radio', { name: 'Match system' }).getAttribute('aria-checked')).toBe(
      'false'
    );
  });
});
