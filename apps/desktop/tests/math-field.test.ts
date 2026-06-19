import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock mathlive so the dynamic import is a no-op in jsdom.
vi.mock('mathlive', () => ({}));

import { realMathFieldSetup } from '../src/lib/math-field.js';

// Register a minimal <math-field> stub once per suite.
beforeAll(() => {
  if (!customElements.get('math-field')) {
    class MathFieldStub extends HTMLElement {
      value = '';
    }
    customElements.define('math-field', MathFieldStub);
  }
});

describe('realMathFieldSetup', () => {
  it('appends a math-field element and pre-fills the initial value', () => {
    const container = document.createElement('div');
    const handle = realMathFieldSetup(container, 'x^2');

    const field = container.querySelector('math-field') as HTMLElement & { value: string };
    expect(field).not.toBeNull();
    expect(field.value).toBe('x^2');
    expect(handle.getValue()).toBe('x^2');
  });

  it('returns the current value from the element (reflecting mutations)', () => {
    const container = document.createElement('div');
    const handle = realMathFieldSetup(container, '');

    expect(handle.getValue()).toBe('');

    // Simulate the user typing: mutate the element's value property.
    const field = container.querySelector('math-field') as HTMLElement & { value: string };
    field.value = 'y = mx + b';
    expect(handle.getValue()).toBe('y = mx + b');
  });
});
