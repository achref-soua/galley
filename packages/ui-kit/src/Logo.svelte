<script lang="ts">
  let {
    size = 32,
    title = 'Galley'
  }: {
    /** Square edge length in pixels. */
    size?: number;
    /** Accessible name; pass an empty string for a decorative mark. */
    title?: string;
  } = $props();
</script>

<!--
  The double-strike "G": an ink impression with a faint red ribbon ghost offset
  behind it, on a short platen baseline. Colours follow the active theme.
-->
<svg
  class="logo"
  width={size}
  height={size}
  viewBox="0 0 240 240"
  role={title ? 'img' : 'presentation'}
  aria-label={title || undefined}
  aria-hidden={title ? undefined : 'true'}
>
  <g fill="none" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="var(--accent)" transform="translate(6,6)">
      <path d="M 172 76 A 68 68 0 1 0 172 164" />
      <path d="M 172 120 L 126 120" />
    </g>
    <g stroke="var(--fg)">
      <path d="M 172 76 A 68 68 0 1 0 172 164" />
      <path d="M 172 120 L 126 120" />
    </g>
  </g>
  <rect x="56" y="196" width="128" height="11" rx="5.5" fill="var(--fg)" />
</svg>

<style>
  .logo {
    display: block;
    flex: none;
  }
</style>
