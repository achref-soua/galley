import { describe, it, expect } from 'vitest';
import { prefersReducedMotion } from '../src/lib/motion';
import { stubMatchMedia } from './setup';

describe('prefersReducedMotion', () => {
  it('reports true when the injected matcher matches', () => {
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
  });

  it('reports false when the injected matcher does not match', () => {
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it('uses window.matchMedia by default', () => {
    window.matchMedia = stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });
});
