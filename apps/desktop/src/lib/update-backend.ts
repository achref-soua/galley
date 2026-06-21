/**
 * Update-check seam (master plan §4.8). The webview's strict CSP forbids direct
 * cross-origin calls, so the Tauri adapter asks the Rust shell (which queries the
 * GitHub releases API) for the latest published version. The browser stub returns
 * `null` so dev/test never reach the network.
 */
import { invoke } from '@tauri-apps/api/core';
import { tagToVersion } from './update-check';

/** Reports the latest published Galley release. */
export interface UpdateBackend {
  /** The latest release version (no leading `v`), or `null` if unknown. */
  checkLatest(): Promise<string | null>;
}

/** Tauri adapter: the shell fetches the latest release tag from GitHub. */
export function tauriUpdateBackend(): UpdateBackend {
  return {
    async checkLatest() {
      const tag = await invoke<string>('check_latest_release');
      return tagToVersion(tag);
    }
  };
}

/** Browser/test stub: never checks the network. */
export function browserUpdateBackend(): UpdateBackend {
  return {
    checkLatest: async () => null
  };
}

/** Pick the right backend for the current runtime. */
export function selectUpdateBackend(win: Window & typeof globalThis): UpdateBackend {
  return '__TAURI_INTERNALS__' in win ? tauriUpdateBackend() : browserUpdateBackend();
}
