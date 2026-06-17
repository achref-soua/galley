<script lang="ts">
  import { ICON_PATHS, type IconName } from './icons';

  let {
    name,
    size = 18,
    label
  }: {
    /** Which glyph to draw. */
    name: IconName;
    /** Square edge length in pixels. */
    size?: number;
    /** Accessible name. Omit for a purely decorative icon. */
    label?: string;
  } = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : 'presentation'}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <path d={ICON_PATHS[name]} />
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
