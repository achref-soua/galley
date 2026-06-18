import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StatusBar from '../src/lib/StatusBar.svelte';

describe('StatusBar', () => {
  it('renders a word and char count for the given content', () => {
    render(StatusBar, { props: { content: 'hello world' } });
    expect(screen.getByText(/words/)).toBeTruthy();
    expect(screen.getByText(/chars/)).toBeTruthy();
  });

  it('shows 0 words for empty content', () => {
    render(StatusBar, { props: { content: '' } });
    expect(screen.getByText(/0 words/)).toBeTruthy();
  });

  it('has the document-statistics aria-label', () => {
    render(StatusBar, { props: { content: 'x' } });
    expect(screen.getByLabelText('Document statistics')).toBeTruthy();
  });
});
