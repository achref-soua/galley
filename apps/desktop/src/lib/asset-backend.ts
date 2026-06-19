/**
 * The seam between the UI and the asset filesystem.
 *
 * Copying image files into the project and listing them goes through an
 * {@link AssetBackend}. In the packaged app the backend forwards to the Rust
 * command layer; in a plain browser and in tests an in-memory backend stands in.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './project-backend';

/** The operations needed to manage project assets. */
export interface AssetBackend {
  /**
   * Copy `bytes` as `filename` into the project's `assets/` folder.
   * Returns the project-relative path (e.g. `"assets/figure.png"`).
   */
  copyAsset(root: string, bytes: Uint8Array, filename: string): Promise<string>;
  /**
   * List all files under `assets/` in the project. Returns project-relative
   * paths. Returns an empty array when the folder does not exist yet.
   */
  listAssets(root: string): Promise<string[]>;
}

/** The backend backed by the Tauri command layer (used in the packaged app). */
export function tauriAssetBackend(): AssetBackend {
  return {
    copyAsset(root, bytes, filename) {
      return invoke<string>('copy_asset', {
        root,
        srcBytes: Array.from(bytes),
        filename
      });
    },
    listAssets(root) {
      return invoke<string[]>('list_assets', { root });
    }
  };
}

/** An in-memory backend for the browser, dev builds, and tests. */
export function browserAssetBackend(): AssetBackend {
  const store = new Map<string, Uint8Array>();

  return {
    async copyAsset(_root, bytes, filename) {
      const rel = `assets/${filename}`;
      store.set(rel, bytes);
      return rel;
    },
    async listAssets() {
      return Array.from(store.keys()).sort();
    }
  };
}

/** Pick the right backend for the current runtime. */
export function selectAssetBackend(win: Window = window): AssetBackend {
  return isTauri(win) ? tauriAssetBackend() : browserAssetBackend();
}
