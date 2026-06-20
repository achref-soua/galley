/**
 * Window-management seam: opening a new app window.
 *
 * {@link WindowBackend} is the interface callers use. The packaged app uses
 * {@link tauriWindowBackend}, which creates a new {@link WebviewWindow}; the
 * browser fallback ({@link browserWindowBackend}) is a no-op used in tests.
 */

/** Operations for managing additional app windows. */
export interface WindowBackend {
  /**
   * Open a new, independent app window. The new window starts with no project
   * open; the user picks or creates one from the dashboard.
   */
  openInNewWindow(): Promise<void>;
}

/** Label prefix for new windows, incremented to keep labels unique. */
let nextWindowId = 1;

/** The backend backed by the Tauri WebviewWindow API (used in the packaged app). */
export function tauriWindowBackend(): WindowBackend {
  return {
    async openInNewWindow() {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = `galley-${nextWindowId}`;
      nextWindowId += 1;
      const win = new WebviewWindow(label, { url: '/' });
      await win.once('tauri://created', () => {});
    }
  };
}

/** A no-op backend for tests and browser dev mode. */
export function browserWindowBackend(): WindowBackend {
  return {
    async openInNewWindow() {
      // No-op in the browser / test environment.
    }
  };
}

/** Whether the app is running inside a Tauri window. */
function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

/** Pick the right window backend for the current runtime. */
export function selectWindowBackend(): WindowBackend {
  return isTauri() ? tauriWindowBackend() : browserWindowBackend();
}
