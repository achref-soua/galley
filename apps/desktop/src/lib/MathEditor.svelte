<script lang="ts">
  import { realMathFieldSetup, type MathFieldSetup } from './math-field.js';
  import { wrapInline, wrapDisplay } from './math.js';

  interface Props {
    /** Pre-populate the math field with this LaTeX string. */
    initialValue?: string;
    /** Inject a custom math-field factory for tests. */
    setupField?: MathFieldSetup;
    /** Fired with the wrapped LaTeX string when the user confirms. */
    oninsert: (wrapped: string) => void;
    /** Fired when the user cancels without inserting. */
    oncancel: () => void;
  }

  let { initialValue = '', setupField = realMathFieldSetup, oninsert, oncancel }: Props = $props();

  let isDisplay = $state(false);

  // The action runs synchronously on mount before any user interaction can
  // reach confirm(), so the definite-assignment assertion is safe.
  let handle!: ReturnType<MathFieldSetup>;

  function mathMount(node: HTMLElement): void {
    handle = setupField(node, initialValue);
  }

  function confirm() {
    const latex = handle.getValue();
    oninsert(isDisplay ? wrapDisplay(latex) : wrapInline(latex));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      oncancel();
    }
  }
</script>

<div
  class="math-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Equation editor"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="math-panel">
    <h2 class="math-title">Equation editor</h2>

    <div class="math-field-wrap" use:mathMount></div>

    <fieldset class="math-mode">
      <legend class="visually-hidden">Math mode</legend>
      <label class="mode-label">
        <input
          type="radio"
          name="math-mode"
          value="inline"
          checked={!isDisplay}
          onchange={() => {
            isDisplay = false;
          }}
        />
        Inline ($…$)
      </label>
      <label class="mode-label">
        <input
          type="radio"
          name="math-mode"
          value="display"
          checked={isDisplay}
          onchange={() => {
            isDisplay = true;
          }}
        />
        Display (\[…\])
      </label>
    </fieldset>

    <div class="math-actions">
      <button type="button" class="btn btn-primary" onclick={confirm}>Insert</button>
      <button type="button" class="btn" onclick={oncancel}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .math-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .math-panel {
    background: var(--surface);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-lg);
    padding: var(--galley-space-5);
    min-width: 480px;
    max-width: 680px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-4);
  }

  .math-title {
    margin: 0;
    font-size: var(--galley-text-md);
    font-family: var(--galley-font-mono);
    color: var(--fg);
  }

  .math-field-wrap {
    min-height: 56px;
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-md);
    padding: var(--galley-space-2);
    background: var(--bg-sunken);
  }

  .math-mode {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: var(--galley-space-4);
  }

  .mode-label {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
    font-size: var(--galley-text-sm);
    font-family: var(--galley-font-mono);
    color: var(--fg-muted);
    cursor: pointer;
  }

  .math-actions {
    display: flex;
    gap: var(--galley-space-2);
    justify-content: flex-end;
  }

  .btn {
    padding: var(--galley-space-1) var(--galley-space-3);
    border-radius: var(--galley-radius-md);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    cursor: pointer;
    border: var(--galley-border-thin) solid var(--border);
    background: transparent;
    color: var(--fg);
  }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--paper);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
