<script lang="ts">
  let {
    label,
    onresizestart,
    onresize,
    onresizeend,
    onstep
  }: {
    /** Accessible name for the separator. */
    label: string;
    /** Pointer drag begins; capture the current pane width here. */
    onresizestart: () => void;
    /** Pointer moved `delta` px from where the drag began. */
    onresize: (delta: number) => void;
    /** Pointer drag ended. */
    onresizeend: () => void;
    /** Keyboard nudge: −1 (left) or +1 (right). */
    onstep: (direction: number) => void;
  } = $props();

  let startX = 0;
  let dragging = $state(false);

  function onPointerMove(event: PointerEvent) {
    onresize(event.clientX - startX);
  }

  function onPointerUp() {
    dragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    onresizeend();
  }

  function onPointerDown(event: PointerEvent) {
    startX = event.clientX;
    dragging = true;
    onresizestart();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onstep(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onstep(1);
    }
  }
</script>

<!-- A focusable pane-resize handle: drag with the pointer or nudge with the arrow keys. -->
<button
  type="button"
  class="resizer"
  class:dragging
  aria-label={label}
  onpointerdown={onPointerDown}
  onkeydown={onKeyDown}
></button>

<style>
  .resizer {
    flex: none;
    width: 6px;
    padding: 0;
    margin: 0;
    cursor: col-resize;
    background: transparent;
    border: none;
    align-self: stretch;
    transition: background var(--galley-dur-fast) var(--galley-ease-mech);
  }

  .resizer:hover,
  .resizer.dragging,
  .resizer:focus-visible {
    background: var(--accent);
  }
</style>
