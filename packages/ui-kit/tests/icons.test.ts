import { describe, it, expect } from 'vitest';
import { ICON_PATHS, type IconName } from '../src/icons';

describe('ICON_PATHS', () => {
  it('defines a non-empty path for every named icon', () => {
    const names: IconName[] = ['panel-left', 'panel-right', 'settings', 'close'];
    for (const name of names) {
      expect(ICON_PATHS[name]).toMatch(/^[Mm]/);
    }
  });
});
