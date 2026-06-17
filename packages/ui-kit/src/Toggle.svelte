<script lang="ts">
  let {
    checked = false,
    disabled = false,
    label,
    onchange
  }: {
    checked?: boolean;
    disabled?: boolean;
    /** Accessible name for the switch. */
    label: string;
    onchange?: (checked: boolean) => void;
  } = $props();

  function toggle() {
    onchange?.(!checked);
  }
</script>

<button
  type="button"
  role="switch"
  class="toggle"
  class:on={checked}
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={toggle}
>
  <span class="track"><span class="knob"></span></span>
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .track {
    display: inline-flex;
    align-items: center;
    width: 38px;
    height: 20px;
    padding: 2px;
    border-radius: var(--galley-radius-pill);
    background: var(--bg-sunken);
    border: var(--galley-border-thin) solid var(--border-strong);
    transition: background var(--galley-dur-base) var(--galley-ease-mech);
  }

  .toggle.on .track {
    background: var(--accent);
    border-color: var(--accent);
  }

  .knob {
    width: 14px;
    height: 14px;
    border-radius: var(--galley-radius-pill);
    background: var(--fg);
    transition: transform var(--galley-dur-base) var(--galley-ease-mech);
  }

  .toggle.on .knob {
    background: var(--accent-fg);
    transform: translateX(18px);
  }

  .toggle:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
