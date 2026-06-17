import { createRawSnippet } from 'svelte';

/** A snippet that renders a single `<span>` with the given text — for testing
 *  components that take `children`/`actions` slots. */
export function textSnippet(label: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${label}</span>`
  }));
}
