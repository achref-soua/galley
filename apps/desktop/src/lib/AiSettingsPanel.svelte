<script lang="ts">
  import { Toggle, Button } from '@galley/ui-kit';
  import { onMount } from 'svelte';
  import {
    type AiBackend,
    type AiConfig,
    type ProviderConfig,
    type ProviderKind
  } from './ai-backend';

  let {
    backend,
    projectRoot = ''
  }: {
    backend: AiBackend;
    projectRoot?: string;
  } = $props();

  // ── State ─────────────────────────────────────────────────────────────────

  let config = $state<AiConfig>({
    local_only: false,
    active_provider: null,
    providers: []
  });
  let consent = $state(false);
  let loading = $state(true);
  let error = $state('');

  /** Per-provider transient UI state. */
  let keyInputs = $state<Record<string, string>>({});
  let testStatus = $state<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  let savingKey = $state<Record<string, boolean>>({});

  // Pre-populate keyInputs for every provider so the value is always a string.
  $effect(() => {
    for (const p of config.providers) {
      if (!(p.id in keyInputs)) keyInputs[p.id] = '';
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  onMount(() => {
    void loadAll();
  });

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [cfg, con] = await Promise.all([
        backend.getConfig(),
        projectRoot ? backend.getConsent(projectRoot) : Promise.resolve(false)
      ]);
      config = cfg;
      consent = con;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const PROVIDER_LABELS: Record<ProviderKind, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama (local)',
    openai_compatible: 'OpenAI-compatible'
  };

  function providerLabel(p: ProviderConfig): string {
    return PROVIDER_LABELS[p.provider];
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function setActive(id: string | null) {
    config = { ...config, active_provider: id };
    await backend.setConfig(config);
  }

  async function setLocalOnly(enabled: boolean) {
    config = { ...config, local_only: enabled };
    await backend.setConfig(config);
  }

  async function setConsent(enabled: boolean) {
    await backend.setConsent(projectRoot, enabled);
    consent = enabled;
  }

  async function saveKey(p: ProviderConfig) {
    const key = keyInputs[p.id].trim();
    savingKey = { ...savingKey, [p.id]: true };
    try {
      await backend.storeKey(p.id, key);
      keyInputs = { ...keyInputs, [p.id]: '' };
      config = {
        ...config,
        providers: config.providers.map((q) => (q.id === p.id ? { ...q, has_key: true } : q))
      };
    } finally {
      savingKey = { ...savingKey, [p.id]: false };
    }
  }

  async function removeKey(p: ProviderConfig) {
    await backend.removeKey(p.id);
    config = {
      ...config,
      providers: config.providers.map((q) => (q.id === p.id ? { ...q, has_key: false } : q))
    };
  }

  async function testProvider(id: string) {
    testStatus = { ...testStatus, [id]: 'testing' };
    try {
      const ok = await backend.testProvider(id);
      testStatus = { ...testStatus, [id]: ok ? 'ok' : 'fail' };
    } catch {
      testStatus = { ...testStatus, [id]: 'fail' };
    }
  }
</script>

<div class="ai-settings" aria-label="AI settings">
  {#if loading}
    <p class="muted">Loading AI configuration…</p>
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {:else}
    <!-- Policy toggles -->
    <h2>AI policy</h2>

    <p class="row">
      <span class="label">Local-only mode</span>
      <Toggle
        label="Local-only mode"
        checked={config.local_only}
        onchange={(checked) => void setLocalOnly(checked)}
      />
    </p>
    <p class="hint">When on, only providers marked as local (e.g. Ollama) can be used.</p>

    {#if projectRoot}
      <p class="row">
        <span class="label">Allow cloud AI for this project</span>
        <Toggle
          label="Allow cloud AI for this project"
          checked={consent}
          onchange={(checked) => void setConsent(checked)}
        />
      </p>
      <p class="hint">
        Content from this project will be sent to the active cloud provider only if enabled here.
      </p>
    {/if}

    <!-- Providers -->
    {#if config.providers.length === 0}
      <h2>Providers</h2>
      <p class="muted">
        No providers configured. Add entries to ai.json in your Galley config dir.
      </p>
    {:else}
      <h2>Providers</h2>
      {#each config.providers as p (p.id)}
        {@const isActive = config.active_provider === p.id}
        {@const status = testStatus[p.id] ?? 'idle'}
        <div class="provider" class:active-provider={isActive} aria-label={`Provider ${p.name}`}>
          <div class="provider-head">
            <div class="provider-info">
              <span class="provider-name">{p.name}</span>
              <span class="provider-kind">{providerLabel(p)}</span>
              {#if p.local}
                <span class="badge">local</span>
              {/if}
            </div>
            <div class="provider-actions">
              <Button
                size="sm"
                variant={isActive ? 'primary' : 'ghost'}
                onclick={() => void setActive(isActive ? null : p.id)}
              >
                {isActive ? 'Active' : 'Set active'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onclick={() => void testProvider(p.id)}
                aria-label={`Test ${p.name}`}
              >
                {status === 'testing'
                  ? 'Testing…'
                  : status === 'ok'
                    ? '✓ OK'
                    : status === 'fail'
                      ? '✗ Failed'
                      : 'Test'}
              </Button>
            </div>
          </div>

          <div class="provider-key">
            {#if p.has_key}
              <span class="key-stored">API key stored</span>
              <Button size="sm" variant="ghost" onclick={() => void removeKey(p)}>Remove key</Button
              >
            {:else}
              <input
                class="key-input"
                type="password"
                placeholder="Paste API key…"
                aria-label={`API key for ${p.name}`}
                bind:value={keyInputs[p.id]}
              />
              <Button
                size="sm"
                variant="primary"
                onclick={() => void saveKey(p)}
                aria-label={`Save key for ${p.name}`}
                disabled={savingKey[p.id] || !keyInputs[p.id]?.trim()}
              >
                {savingKey[p.id] ? 'Saving…' : 'Save'}
              </Button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .ai-settings {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  h2 {
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
    margin: 0 0 var(--galley-space-2);
  }

  .label {
    font-size: var(--galley-text-sm);
  }

  .hint {
    margin: 0 0 var(--galley-space-4);
    font-size: var(--galley-text-xs);
    color: var(--fg-faint);
    line-height: var(--galley-leading-normal);
  }

  .muted {
    margin: 0 0 var(--galley-space-4);
    color: var(--fg-faint);
    font-size: var(--galley-text-sm);
    line-height: var(--galley-leading-normal);
  }

  .error {
    color: var(--error, #e53e3e);
    font-size: var(--galley-text-sm);
    margin: 0 0 var(--galley-space-4);
  }

  .provider {
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-md);
    padding: var(--galley-space-3);
    margin-bottom: var(--galley-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--galley-space-2);
  }

  .active-provider {
    border-color: var(--accent);
  }

  .provider-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--galley-space-2);
  }

  .provider-info {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
  }

  .provider-name {
    font-size: var(--galley-text-sm);
    font-weight: 500;
  }

  .provider-kind {
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
  }

  .badge {
    font-size: var(--galley-text-xs);
    background: var(--bg-sunken);
    color: var(--fg-muted);
    border-radius: var(--galley-radius-sm);
    padding: 1px 6px;
  }

  .provider-actions {
    display: flex;
    gap: var(--galley-space-2);
  }

  .provider-key {
    display: flex;
    align-items: center;
    gap: var(--galley-space-2);
  }

  .key-stored {
    flex: 1;
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
  }

  .key-input {
    flex: 1;
    font-size: var(--galley-text-sm);
    font-family: var(--galley-font-mono);
    background: var(--bg-sunken);
    color: var(--fg);
    border: var(--galley-border-thin) solid var(--border);
    border-radius: var(--galley-radius-sm);
    padding: var(--galley-space-1) var(--galley-space-2);
    outline: none;
  }

  .key-input:focus {
    border-color: var(--accent);
  }
</style>
