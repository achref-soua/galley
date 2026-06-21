<!--
  Update banner — shown when a newer Galley release is available. Offers to open
  the download page (or run `galley update` from a terminal) and can be dismissed.
  Detection lives in the app shell; this only presents the offer.
-->
<script lang="ts">
  import { Button } from '@galley/ui-kit';

  interface Props {
    /** The newer version available (no leading `v`). */
    version: string;
    /** Take the update (open the download page). */
    onupdate: () => void;
    /** Dismiss the banner for this session. */
    ondismiss: () => void;
  }

  let { version, onupdate, ondismiss }: Props = $props();

  const message = $derived(`Galley ${version} is available.`);
</script>

<div class="update-banner" role="status">
  <span class="msg">{message}</span>
  <div class="actions">
    <Button size="sm" variant="primary" onclick={onupdate}>Update</Button>
    <Button size="sm" onclick={ondismiss}>Dismiss</Button>
  </div>
</div>

<style>
  .update-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--galley-space-3);
    padding: var(--galley-space-2) var(--galley-space-4);
    background: var(--surface-raised);
    border-bottom: var(--galley-border-thin) solid var(--accent);
    color: var(--fg);
    font-size: var(--galley-text-sm);
  }

  .msg {
    font-family: var(--font-mono, monospace);
  }

  .actions {
    display: flex;
    gap: var(--galley-space-2);
  }
</style>
