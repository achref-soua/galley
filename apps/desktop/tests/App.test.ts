import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';

describe('App', () => {
  it('renders the Galley wordmark and tagline', () => {
    render(App);
    expect(screen.getByRole('heading', { name: 'Galley' })).toBeTruthy();
    expect(screen.getByText('Pull a proof.')).toBeTruthy();
  });

  it('shows the empty-state hint in the editor voice', () => {
    render(App);
    expect(screen.getByText('Nothing on the galley yet. Start typing.')).toBeTruthy();
  });
});
