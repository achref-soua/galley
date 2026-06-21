<script lang="ts">
  let {
    label,
    orientation = 'vertical',
    onresizestart,
    onresize,
    onresizeend,
    onstep
  }: {
    /** Accessible name for the separator. */
    label: string;
    /**
     * `'vertical'` is a vertical bar that resizes a pane's *width* (drag left /
     * right); `'horizontal'` is a horizontal bar that resizes a pane's *height*
     * (drag up / down). Defaults to vertical for the sidebar/preview handles.
     */
    orientation?: 'vertical' | 'horizontal';
    /** Pointer drag begins; capture the current pane size here. */
    onresizestart: () => void;
    /** Pointer moved `delta` px along the resize axis from where the drag began. */
    onresize: (delta: number) => void;
    /** Pointer drag ended. */
    onresizeend: () => void;
    /** Keyboard nudge: −1 (left / up) or +1 (right / down). */
    onstep: (direction: number) => void;
  } = $props();

  const horizontal = $derived(orientation === 'horizontal');
  let start = 0;
  let dragging = $state(false);

  function axis(event: PointerEvent): number {
    return horizontal ? event.clientY : event.clientX;
  }

  function onPointerMove(event: PointerEvent) {
    onresize(axis(event) - start);
  }

  function onPointerUp() {
    dragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    onresizeend();
  }

  function onPointerDown(event: PointerEvent) {
    start = axis(event);
    dragging = true;
    onresizestart();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onKeyDown(event: KeyboardEvent) {
    const back = horizontal ? 'ArrowUp' : 'ArrowLeft';
    const forward = horizontal ? 'ArrowDown' : 'ArrowRight';
    if (event.key === back) {
      event.preventDefault();
      onstep(-1);
    } else if (event.key === forward) {
      event.preventDefault();
      onstep(1);
    }
  }
</script>

<!-- A focusable pane-resize handle: drag with the pointer or nudge with the arrow keys. -->
<button
  type="button"
  class="resizer"
  class:horizontal
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

  .resizer.horizontal {
    width: auto;
    height: 6px;
    cursor: row-resize;
    align-self: auto;
  }

  .resizer:hover,
  .resizer.dragging,
  .resizer:focus-visible {
    background: var(--accent);
  }
</style>
