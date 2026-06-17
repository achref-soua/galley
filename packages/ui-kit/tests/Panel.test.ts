import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Panel from '../src/Panel.svelte';
import { textSnippet } from './_helpers';

describe('Panel', () => {
  it('renders a title, actions, and body together', () => {
    const { container } = render(Panel, {
      props: {
        title: 'Files',
        actions: textSnippet('A'),
        children: textSnippet('Body')
      }
    });
    expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy();
    expect(container.querySelector('.panel-actions')).not.toBe(null);
    expect(container.textContent).toContain('Body');
  });

  it('renders a header with only a title', () => {
    const { container } = render(Panel, {
      props: { title: 'Outline', children: textSnippet('Body') }
    });
    expect(screen.getByRole('heading', { name: 'Outline' })).toBeTruthy();
    expect(container.querySelector('.panel-actions')).toBe(null);
  });

  it('renders a header with only actions', () => {
    const { container } = render(Panel, {
      props: { actions: textSnippet('A'), children: textSnippet('Body') }
    });
    expect(container.querySelector('.panel-head')).not.toBe(null);
    expect(container.querySelector('.panel-title')).toBe(null);
    expect(container.querySelector('.panel-actions')).not.toBe(null);
  });

  it('omits the header entirely when there is neither title nor actions', () => {
    const { container } = render(Panel, { props: { children: textSnippet('Body only') } });
    expect(container.querySelector('.panel-head')).toBe(null);
    expect(container.textContent).toContain('Body only');
  });
});
