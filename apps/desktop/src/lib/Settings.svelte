<script lang="ts">
  import {
    SegmentedControl,
    Toggle,
    IconButton,
    Icon,
    THEME_PREFERENCES,
    THEME_LABELS,
    type ThemePreference
  } from '@galley/ui-kit';
  import { type KeymapMode } from './keymap-prefs';

  let {
    themePreference,
    reduceMotion,
    autoCompile,
    soundOnSuccess,
    keymapMode,
    spellCheck,
    syncScroll,
    onthemechange,
    onautocompilechange,
    onsoundchange,
    onkeymapchange,
    onspellcheckchange,
    onsyncscrollchange,
    onclose
  }: {
    themePreference: ThemePreference;
    reduceMotion: boolean;
    autoCompile: boolean;
    soundOnSuccess: boolean;
    keymapMode: KeymapMode;
    spellCheck: boolean;
    syncScroll: boolean;
    onthemechange: (pref: ThemePreference) => void;
    onautocompilechange: (enabled: boolean) => void;
    onsoundchange: (enabled: boolean) => void;
    onkeymapchange: (mode: KeymapMode) => void;
    onspellcheckchange: (enabled: boolean) => void;
    onsyncscrollchange: (enabled: boolean) => void;
    onclose: () => void;
  } = $props();

  type Section = 'appearance' | 'editor' | 'compilation' | 'preview' | 'about';
  let active = $state<Section>('appearance');

  const sections: { id: Section; label: string }[] = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'editor', label: 'Editor' },
    { id: 'compilation', label: 'Compilation' },
    { id: 'preview', label: 'Preview' },
    { id: 'about', label: 'About' }
  ];

  const themeOptions = THEME_PREFERENCES.map((value) => ({ value, label: THEME_LABELS[value] }));

  const keymapOptions: { value: KeymapMode; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'vim', label: 'Vim' }
  ];

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="overlay">
  <button class="scrim" aria-label="Close settings" onclick={onclose}></button>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Settings">
    <header class="head">
      <h1>Settings</h1>
      <IconButton label="Close" title="Close settings" onclick={onclose}>
        <Icon name="close" />
      </IconButton>
    </header>

    <div class="body">
      <nav class="sections" aria-label="Settings sections">
        {#each sections as section (section.id)}
          <button
            class="section"
            class:active={active === section.id}
            aria-current={active === section.id}
            onclick={() => (active = section.id)}
          >
            {section.label}
          </button>
        {/each}
      </nav>

      <div class="panel">
        {#if active === 'appearance'}
          <h2>Theme</h2>
          <p class="row">
            <span class="label">Two-tone ribbon</span>
            <SegmentedControl
              options={themeOptions}
              value={themePreference}
              ariaLabel="Theme"
              onchange={(value) => onthemechange(value as ThemePreference)}
            />
          </p>
          <p class="row">
            <span class="label">Reduced motion</span>
            <span class="value">{reduceMotion ? 'On (following your system)' : 'Off'}</span>
          </p>
        {:else if active === 'editor'}
          <h2>Editor</h2>
          <p class="row">
            <span class="label">Key-map mode</span>
            <SegmentedControl
              options={keymapOptions}
              value={keymapMode}
              ariaLabel="Key-map mode"
              onchange={(value) => onkeymapchange(value as KeymapMode)}
            />
          </p>
          <p class="row">
            <span class="label">Spell-check</span>
            <Toggle
              label="Spell-check"
              checked={spellCheck}
              onchange={(checked) => onspellcheckchange(checked)}
            />
          </p>
        {:else if active === 'compilation'}
          <h2>Compilation</h2>
          <p class="row">
            <span class="label">Compile as you type</span>
            <Toggle
              label="Compile as you type"
              checked={autoCompile}
              onchange={(checked) => onautocompilechange(checked)}
            />
          </p>
          <p class="row">
            <span class="label">Bell on success</span>
            <Toggle
              label="Bell on success"
              checked={soundOnSuccess}
              onchange={(checked) => onsoundchange(checked)}
            />
          </p>
        {:else if active === 'preview'}
          <h2>Preview</h2>
          <p class="row">
            <span class="label">Sync scroll</span>
            <Toggle
              label="Sync scroll"
              checked={syncScroll}
              onchange={(checked) => onsyncscrollchange(checked)}
            />
          </p>
        {:else}
          <h2>About</h2>
          <p class="muted">Galley — a local-first LaTeX studio. Pull a proof.</p>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--galley-z-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scrim {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background: var(--overlay);
    cursor: default;
  }

  .dialog {
    position: relative;
    width: min(640px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--surface-raised);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border-strong);
    border-radius: var(--galley-radius-lg);
    box-shadow: var(--shadow-raised);
    overflow: hidden;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--galley-space-3) var(--galley-space-4);
    border-bottom: var(--galley-border-thin) solid var(--border);
  }

  .head h1 {
    margin: 0;
    font-size: var(--galley-text-lg);
    letter-spacing: var(--galley-tracking-wide);
  }

  .body {
    display: flex;
    min-height: 0;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-1);
    padding: var(--galley-space-3);
    border-right: var(--galley-border-thin) solid var(--border);
    min-width: 160px;
  }

  .section {
    text-align: left;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    font-family: var(--galley-font-mono);
    font-size: var(--galley-text-sm);
    padding: var(--galley-space-2) var(--galley-space-3);
    border-radius: var(--galley-radius-md);
    cursor: pointer;
  }

  .section:hover {
    color: var(--fg);
    background: var(--bg-sunken);
  }

  .section.active {
    color: var(--fg);
    background: var(--bg-sunken);
    box-shadow: inset 2px 0 0 var(--accent);
  }

  .panel {
    flex: 1 1 auto;
    padding: var(--galley-space-4);
    overflow: auto;
  }

  .panel h2 {
    margin: 0 0 var(--galley-space-3);
    font-size: var(--galley-text-xs);
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
    color: var(--fg-muted);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--galley-space-4);
    margin: 0 0 var(--galley-space-4);
  }

  .label {
    font-size: var(--galley-text-sm);
  }

  .value {
    font-size: var(--galley-text-sm);
    color: var(--fg-muted);
  }

  .muted {
    margin: 0;
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
    line-height: var(--galley-leading-normal);
  }
</style>
