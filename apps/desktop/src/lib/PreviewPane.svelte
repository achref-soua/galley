<script lang="ts">
  import { Logo } from '@galley/ui-kit';
  // The PDF-viewer chrome — toolbar + proof surface. PDF.js rendering arrives in
  // v0.1.0; here the chrome is fully themed and shows the empty proof.
</script>

<section class="preview" aria-label="Preview">
  <header class="viewer-bar">
    <span class="status">No proof</span>
    <span class="pages">— / —</span>
    <span class="zoom">100%</span>
  </header>
  <div class="proof">
    <div class="placeholder">
      <Logo size={48} title="" />
      <p class="empty">Nothing to proof yet.</p>
      <p class="hint">Your live galley proof shows here once a document compiles.</p>
    </div>
  </div>
</section>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    background: var(--surface);
  }

  .viewer-bar {
    display: flex;
    align-items: center;
    gap: var(--galley-space-4);
    height: var(--galley-titlebar-height);
    padding: 0 var(--galley-space-4);
    border-bottom: var(--galley-border-thin) solid var(--border);
    font-size: var(--galley-text-xs);
    letter-spacing: var(--galley-tracking-wide);
    color: var(--fg-muted);
  }

  .viewer-bar .status {
    text-transform: uppercase;
    letter-spacing: var(--galley-tracking-caps);
  }

  .viewer-bar .pages {
    margin-left: auto;
  }

  .proof {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    background: var(--bg-sunken);
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--galley-space-2);
    text-align: center;
    opacity: 0.85;
  }

  .empty {
    margin: var(--galley-space-2) 0 0;
    color: var(--fg-muted);
    font-size: var(--galley-text-sm);
  }

  .hint {
    margin: 0;
    max-width: 26ch;
    color: var(--fg-faint);
    font-size: var(--galley-text-xs);
    line-height: var(--galley-leading-normal);
  }
</style>
