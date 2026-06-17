<script lang="ts">
  import { NAME, TAGLINE } from './lib/brand';
</script>

<main class="hello">
  <svg class="mark" viewBox="0 0 240 240" aria-label="Galley">
    <g fill="none" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
      <g stroke="var(--ribbon)" transform="translate(6,6)">
        <path d="M 172 76 A 68 68 0 1 0 172 164" />
        <path d="M 172 120 L 126 120" />
      </g>
      <g stroke="var(--ink)">
        <path d="M 172 76 A 68 68 0 1 0 172 164" />
        <path d="M 172 120 L 126 120" />
      </g>
    </g>
    <rect x="56" y="196" width="128" height="11" rx="5.5" fill="var(--ink)" />
  </svg>

  <h1>{NAME}</h1>
  <p class="tagline">{TAGLINE}</p>
  <p class="hint">Nothing on the galley yet. Start typing.</p>
</main>

<style>
  .hello {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 0.25rem;
    text-align: center;
    padding: 2rem;
  }

  .mark {
    width: 128px;
    height: 128px;
  }

  h1 {
    margin: 0.5rem 0 0;
    font-size: 3rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .tagline {
    margin: 0.25rem 0 0;
    color: var(--graphite);
    font-size: 0.8rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
  }

  .hint {
    margin-top: 1.75rem;
    color: var(--muted);
    font-size: 0.95rem;
  }
</style>
