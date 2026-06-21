import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  hasOnboarded,
  markOnboarded,
  isLastStep,
  clampStep
} from '../src/lib/onboarding';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map
  };
}

describe('onboarding — steps', () => {
  it('includes the Overleaf import step', () => {
    expect(ONBOARDING_STEPS.some((s) => s.id === 'import')).toBe(true);
    expect(ONBOARDING_STEPS[0].id).toBe('welcome');
  });
});

describe('onboarding — first-run persistence', () => {
  it('starts not-onboarded and records completion', () => {
    const storage = fakeStorage();
    expect(hasOnboarded(storage)).toBe(false);
    markOnboarded(storage);
    expect(storage.map.get(ONBOARDING_STORAGE_KEY)).toBe('true');
    expect(hasOnboarded(storage)).toBe(true);
  });
});

describe('onboarding — navigation', () => {
  it('detects the last step', () => {
    expect(isLastStep(ONBOARDING_STEPS.length - 1)).toBe(true);
    expect(isLastStep(0)).toBe(false);
  });

  it('clamps an index into range', () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(0)).toBe(0);
    expect(clampStep(2)).toBe(2);
    expect(clampStep(999)).toBe(ONBOARDING_STEPS.length - 1);
  });
});
