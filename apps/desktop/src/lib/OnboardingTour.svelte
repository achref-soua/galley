<!--
  Onboarding Tour — a first-run, keyboard-navigable walkthrough of Galley's core
  ideas (offline-first, dual editor, instant proofs, Overleaf import, AI you
  control). Steps and copy come from the pure `onboarding` model and the i18n
  catalog; this component only renders and navigates them.
-->
<script lang="ts">
  import { Button } from '@galley/ui-kit';
  import { ONBOARDING_STEPS, isLastStep, clampStep } from './onboarding';
  import { t } from './i18n-store';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let index = $state(0);

  const step = $derived(ONBOARDING_STEPS[index]);
  const last = $derived(isLastStep(index));

  function next() {
    if (last) {
      onclose();
    } else {
      index = clampStep(index + 1);
    }
  }

  function back() {
    index = clampStep(index - 1);
  }
</script>

{#if open}
  <div
    class="tour-overlay"
    role="dialog"
    aria-modal="true"
    aria-label={t('onboarding.welcome.title')}
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape') onclose();
    }}
  >
    <div class="tour-card">
      <div class="tour-progress" aria-hidden="true">
        {#each ONBOARDING_STEPS as s}
          <span class="dot" class:active={s.id === step.id}></span>
        {/each}
      </div>

      <h2 class="tour-title">{t(step.titleKey)}</h2>
      <p class="tour-body">{t(step.bodyKey)}</p>

      <div class="tour-actions">
        <Button size="sm" onclick={onclose}>{t('onboarding.skip')}</Button>
        <div class="tour-nav">
          <Button size="sm" onclick={back} disabled={index === 0}>{t('onboarding.back')}</Button>
          <Button size="sm" variant="primary" onclick={next}>
            {last ? t('onboarding.done') : t('onboarding.next')}
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay, rgba(0, 0, 0, 0.5));
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 400;
  }

  .tour-card {
    background: var(--surface-raised, var(--surface));
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    width: 460px;
    max-width: 92vw;
    padding: 1.5rem 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: var(--shadow-raised);
  }

  .tour-progress {
    display: flex;
    gap: 0.4rem;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--border);
  }

  .dot.active {
    background: var(--accent);
  }

  .tour-title {
    font-family: var(--font-mono, monospace);
    font-size: 1.1rem;
    color: var(--fg);
    margin: 0;
  }

  .tour-body {
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--fg-muted);
    margin: 0;
  }

  .tour-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.5rem;
  }

  .tour-nav {
    display: flex;
    gap: 0.5rem;
  }
</style>
