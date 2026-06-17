<script lang="ts">
  let {
    tagline = false
  }: {
    /** Show the "Pull a proof." tagline beneath the wordmark. */
    tagline?: boolean;
  } = $props();
</script>

<span class="wordmark">
  <span class="name">Galley</span>
  {#if tagline}
    <span class="tagline">Pull a proof<span class="dot">.</span></span>
  {/if}
</span>

<style>
  .wordmark {
    display: inline-flex;
    flex-direction: column;
    line-height: 1;
    font-family: var(--galley-font-mono);
  }

  .name {
    font-weight: var(--galley-weight-bold);
    letter-spacing: var(--galley-tracking-wide);
    color: var(--fg);
  }

  .tagline {
    margin-top: var(--galley-space-1);
    font-size: var(--galley-text-xs);
    letter-spacing: var(--galley-tracking-caps);
    text-transform: uppercase;
    color: var(--fg-muted);
  }

  .dot {
    color: var(--accent-text);
  }
</style>
