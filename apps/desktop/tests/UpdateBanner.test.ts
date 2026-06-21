import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import UpdateBanner from '../src/lib/UpdateBanner.svelte';

describe('UpdateBanner', () => {
  it('announces the available version', () => {
    render(UpdateBanner, { props: { version: '1.2.3', onupdate: () => {}, ondismiss: () => {} } });
    expect(screen.getByText('Galley 1.2.3 is available.')).toBeTruthy();
  });

  it('fires onupdate and ondismiss', async () => {
    const onupdate = vi.fn();
    const ondismiss = vi.fn();
    render(UpdateBanner, { props: { version: '1.2.3', onupdate, ondismiss } });
    await fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onupdate).toHaveBeenCalledTimes(1);
    expect(ondismiss).toHaveBeenCalledTimes(1);
  });
});
