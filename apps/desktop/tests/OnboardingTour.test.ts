import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import OnboardingTour from '../src/lib/OnboardingTour.svelte';
import { ONBOARDING_STEPS } from '../src/lib/onboarding';
import { en } from '../src/lib/locales/en';

describe('OnboardingTour', () => {
  it('renders nothing when closed', () => {
    render(OnboardingTour, { props: { open: false, onclose: () => {} } });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on the welcome step with Back disabled', () => {
    render(OnboardingTour, { props: { open: true, onclose: () => {} } });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(en['onboarding.welcome.title'])).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('walks forward to the last step and finishes', async () => {
    const onclose = vi.fn();
    render(OnboardingTour, { props: { open: true, onclose } });
    // Advance through every step but the last.
    for (let i = 0; i < ONBOARDING_STEPS.length - 1; i++) {
      await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    // On the last step the primary button finishes the tour.
    const done = screen.getByRole('button', { name: en['onboarding.done'] });
    await fireEvent.click(done);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('steps back', async () => {
    render(OnboardingTour, { props: { open: true, onclose: () => {} } });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(en['onboarding.editor.title'])).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(en['onboarding.welcome.title'])).toBeTruthy();
  });

  it('skips on the Skip button', async () => {
    const onclose = vi.fn();
    render(OnboardingTour, { props: { open: true, onclose } });
    await fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onclose = vi.fn();
    render(OnboardingTour, { props: { open: true, onclose } });
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', async () => {
    const onclose = vi.fn();
    render(OnboardingTour, { props: { open: true, onclose } });
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'a' });
    expect(onclose).not.toHaveBeenCalled();
  });
});
