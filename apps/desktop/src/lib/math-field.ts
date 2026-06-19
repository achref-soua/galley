/** A thin handle returned by a math-field setup function. */
export interface MathFieldHandle {
  /** Read the current LaTeX value from the math field. */
  getValue(): string;
}

/**
 * A factory that mounts a math input into `container`, pre-filled with
 * `initial`, and returns a handle for reading the current value.
 *
 * The injectable seam lets tests supply a plain `<input>` backed fake without
 * loading MathLive, keeping the unit-test suite fast and jsdom-safe.
 */
export type MathFieldSetup = (container: HTMLElement, initial: string) => MathFieldHandle;

/**
 * The real setup: appends a `<math-field>` custom element from MathLive and
 * returns a handle that reads its `value` property.
 *
 * MathLive is imported dynamically (fire-and-forget) so the module-level
 * import never blocks the main bundle or the test suite.
 */
export function realMathFieldSetup(container: HTMLElement, initial: string): MathFieldHandle {
  void import('mathlive');
  const field = document.createElement('math-field') as HTMLElement & { value: string };
  container.appendChild(field);
  field.value = initial;
  return { getValue: () => field.value };
}
