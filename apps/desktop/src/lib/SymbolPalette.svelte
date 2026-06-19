<script lang="ts">
  interface SymbolItem {
    label: string;
    code: string;
  }

  interface SymbolGroup {
    group: string;
    items: SymbolItem[];
  }

  const SYMBOL_GROUPS: SymbolGroup[] = [
    {
      group: 'Greek',
      items: [
        { label: 'α', code: '\\alpha' },
        { label: 'β', code: '\\beta' },
        { label: 'γ', code: '\\gamma' },
        { label: 'δ', code: '\\delta' },
        { label: 'ε', code: '\\epsilon' },
        { label: 'θ', code: '\\theta' },
        { label: 'λ', code: '\\lambda' },
        { label: 'μ', code: '\\mu' },
        { label: 'π', code: '\\pi' },
        { label: 'σ', code: '\\sigma' },
        { label: 'φ', code: '\\phi' },
        { label: 'ω', code: '\\omega' },
        { label: 'Γ', code: '\\Gamma' },
        { label: 'Δ', code: '\\Delta' },
        { label: 'Σ', code: '\\Sigma' },
        { label: 'Ω', code: '\\Omega' }
      ]
    },
    {
      group: 'Operators',
      items: [
        { label: '∑', code: '\\sum' },
        { label: '∏', code: '\\prod' },
        { label: '∫', code: '\\int' },
        { label: '√', code: '\\sqrt{}' },
        { label: '±', code: '\\pm' },
        { label: '×', code: '\\times' },
        { label: '÷', code: '\\div' },
        { label: '∞', code: '\\infty' },
        { label: '∂', code: '\\partial' },
        { label: '∇', code: '\\nabla' }
      ]
    },
    {
      group: 'Relations',
      items: [
        { label: '≤', code: '\\leq' },
        { label: '≥', code: '\\geq' },
        { label: '≠', code: '\\neq' },
        { label: '≈', code: '\\approx' },
        { label: '≡', code: '\\equiv' },
        { label: '∈', code: '\\in' },
        { label: '∉', code: '\\notin' },
        { label: '⊂', code: '\\subset' },
        { label: '⊆', code: '\\subseteq' }
      ]
    },
    {
      group: 'Arrows',
      items: [
        { label: '→', code: '\\to' },
        { label: '←', code: '\\leftarrow' },
        { label: '↔', code: '\\leftrightarrow' },
        { label: '⇒', code: '\\Rightarrow' },
        { label: '⇐', code: '\\Leftarrow' },
        { label: '⇔', code: '\\Leftrightarrow' },
        { label: '↦', code: '\\mapsto' }
      ]
    }
  ];

  interface Props {
    /** Fired with the LaTeX command string when a symbol is clicked. */
    oninsert: (code: string) => void;
  }

  let { oninsert }: Props = $props();

  // All groups start open.
  let openGroups = $state<Set<string>>(new Set(SYMBOL_GROUPS.map((g) => g.group)));

  function toggle(group: string) {
    const next = new Set(openGroups);
    if (next.has(group)) {
      next.delete(group);
    } else {
      next.add(group);
    }
    openGroups = next;
  }
</script>

<div class="symbol-palette">
  <div class="palette-header">Symbols</div>
  {#each SYMBOL_GROUPS as { group, items }}
    <div class="symbol-group">
      <button
        type="button"
        class="group-header"
        aria-expanded={openGroups.has(group)}
        onclick={() => toggle(group)}
      >
        <span class="group-name">{group}</span>
        <span class="chevron" class:open={openGroups.has(group)}>▾</span>
      </button>
      {#if openGroups.has(group)}
        <div class="symbol-grid" role="group" aria-label={group}>
          {#each items as { label, code }}
            <button type="button" class="symbol-btn" title={code} onclick={() => oninsert(code)}>
              {label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .symbol-palette {
    border-top: var(--galley-border-thin) solid var(--border);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
  }

  .palette-header {
    padding: var(--galley-space-2) var(--galley-space-3);
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    color: var(--fg-muted);
  }

  .symbol-group {
    border-top: var(--galley-border-thin) solid var(--border);
  }

  .group-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--galley-space-1) var(--galley-space-3);
    background: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-xs);
    text-align: left;
  }

  .group-header:hover {
    background: var(--bg-sunken);
  }

  .group-name {
    font-weight: var(--galley-weight-bold);
  }

  .chevron {
    transition: transform 0.15s;
    display: inline-block;
  }

  .chevron.open {
    transform: rotate(0deg);
  }

  .chevron:not(.open) {
    transform: rotate(-90deg);
  }

  .symbol-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: var(--galley-space-2) var(--galley-space-3);
  }

  .symbol-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-sm);
    color: var(--fg);
    cursor: pointer;
    font-size: 14px;
    font-family: serif;
  }

  .symbol-btn:hover {
    background: var(--accent);
    color: var(--paper);
    border-color: var(--accent);
  }
</style>
