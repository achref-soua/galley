import { describe, it, expect } from 'vitest';
import * as kit from '../src/index';

describe('@galley/ui-kit entry point', () => {
  it('re-exports the components', () => {
    for (const name of [
      'Logo',
      'Wordmark',
      'Button',
      'IconButton',
      'Toggle',
      'SegmentedControl',
      'Panel',
      'Icon'
    ]) {
      expect(kit[name as keyof typeof kit]).toBeTypeOf('function');
    }
  });

  it('re-exports the pure helpers and tokens', () => {
    expect(kit.resolveTheme('system', true)).toBe('carbon');
    expect(kit.clamp(5, 0, 3)).toBe(3);
    expect(kit.contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(kit.THEME_PREFERENCES).toContain('onionskin');
    expect(kit.ICON_PATHS.close).toBeTypeOf('string');
    expect(kit.DEFAULT_LAYOUT.sidebarWidth).toBeGreaterThan(0);
  });
});
