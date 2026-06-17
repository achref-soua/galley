import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Wordmark from '../src/Wordmark.svelte';

describe('Wordmark', () => {
  it('renders the Galley wordmark without a tagline by default', () => {
    const { container } = render(Wordmark);
    expect(screen.getByText('Galley')).toBeTruthy();
    expect(container.textContent).not.toContain('Pull a proof');
  });

  it('shows the tagline when requested', () => {
    const { container } = render(Wordmark, { props: { tagline: true } });
    expect(container.textContent).toContain('Pull a proof.');
  });
});
