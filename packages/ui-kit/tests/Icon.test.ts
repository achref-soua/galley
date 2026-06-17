import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Icon from '../src/Icon.svelte';
import { ICON_PATHS, type IconName } from '../src/icons';

describe('Icon', () => {
  it('draws the path for each named glyph', () => {
    const names: IconName[] = ['panel-left', 'panel-right', 'settings', 'close'];
    for (const name of names) {
      const { container, unmount } = render(Icon, { props: { name } });
      const path = container.querySelector('path');
      expect(path?.getAttribute('d')).toBe(ICON_PATHS[name]);
      unmount();
    }
  });

  it('exposes an accessible name when labelled', () => {
    const { container } = render(Icon, { props: { name: 'close', label: 'Close' } });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Close');
    expect(svg.getAttribute('aria-hidden')).toBe(null);
  });

  it('is hidden from assistive tech when unlabelled', () => {
    const { container } = render(Icon, { props: { name: 'settings', size: 24 } });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('presentation');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('24');
  });
});
