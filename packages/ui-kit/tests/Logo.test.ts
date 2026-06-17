import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Logo from '../src/Logo.svelte';

describe('Logo', () => {
  it('renders the double-strike mark with an accessible name by default', () => {
    const { container } = render(Logo);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Galley');
    // Two ghost strokes + two ink strokes for the G.
    expect(container.querySelectorAll('path').length).toBe(4);
  });

  it('honours a custom size', () => {
    const { container } = render(Logo, { props: { size: 64 } });
    expect(container.querySelector('svg')!.getAttribute('width')).toBe('64');
  });

  it('is decorative when given an empty title', () => {
    const { container } = render(Logo, { props: { title: '' } });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('presentation');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-label')).toBe(null);
  });
});
