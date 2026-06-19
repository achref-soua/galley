import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  tauriAssetBackend,
  browserAssetBackend,
  selectAssetBackend
} from '../src/lib/asset-backend';

function fakeWindow(tauri: boolean): Window {
  return (tauri ? { __TAURI_INTERNALS__: {} } : {}) as unknown as Window;
}

beforeEach(() => {
  invoke.mockReset();
});

describe('tauriAssetBackend', () => {
  it('calls copy_asset with root, srcBytes array, and filename', async () => {
    invoke.mockResolvedValueOnce('assets/logo.png');
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await tauriAssetBackend().copyAsset('/project', bytes, 'logo.png');
    expect(invoke).toHaveBeenCalledWith('copy_asset', {
      root: '/project',
      srcBytes: [1, 2, 3, 4],
      filename: 'logo.png'
    });
    expect(result).toBe('assets/logo.png');
  });

  it('calls list_assets with root and returns the list', async () => {
    invoke.mockResolvedValueOnce(['assets/a.png', 'assets/b.jpg']);
    const result = await tauriAssetBackend().listAssets('/project');
    expect(invoke).toHaveBeenCalledWith('list_assets', { root: '/project' });
    expect(result).toEqual(['assets/a.png', 'assets/b.jpg']);
  });
});

describe('browserAssetBackend', () => {
  it('starts with an empty asset list', async () => {
    const backend = browserAssetBackend();
    expect(await backend.listAssets('/project')).toEqual([]);
  });

  it('copyAsset stores bytes and returns the relative path', async () => {
    const backend = browserAssetBackend();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const rel = await backend.copyAsset('/project', bytes, 'figure.png');
    expect(rel).toBe('assets/figure.png');
  });

  it('listAssets returns stored assets sorted', async () => {
    const backend = browserAssetBackend();
    await backend.copyAsset('/p', new Uint8Array([1]), 'z.png');
    await backend.copyAsset('/p', new Uint8Array([2]), 'a.jpg');
    const list = await backend.listAssets('/p');
    expect(list).toEqual(['assets/a.jpg', 'assets/z.png']);
  });

  it('overwriting an existing key updates the bytes', async () => {
    const backend = browserAssetBackend();
    await backend.copyAsset('/p', new Uint8Array([1]), 'img.png');
    await backend.copyAsset('/p', new Uint8Array([2]), 'img.png');
    const list = await backend.listAssets('/p');
    expect(list).toHaveLength(1);
    expect(list[0]).toBe('assets/img.png');
  });
});

describe('selectAssetBackend', () => {
  it('returns the tauri backend in a Tauri window', async () => {
    invoke.mockResolvedValueOnce([]);
    const backend = selectAssetBackend(fakeWindow(true));
    await backend.listAssets('/project');
    expect(invoke).toHaveBeenCalledWith('list_assets', { root: '/project' });
  });

  it('returns the browser backend in a plain window', async () => {
    const backend = selectAssetBackend(fakeWindow(false));
    const list = await backend.listAssets('/project');
    expect(list).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});
