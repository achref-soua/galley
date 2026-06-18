import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  tauriSyncTexBackend,
  browserSyncTexBackend,
  selectSyncTexBackend,
  type SyncTexBox,
  type SyncTexLocation
} from '../src/lib/synctex-backend';

function fakeWindow(tauri: boolean): Window {
  return (tauri ? { __TAURI_INTERNALS__: {} } : {}) as unknown as Window;
}

beforeEach(() => {
  invoke.mockReset();
});

describe('tauriSyncTexBackend', () => {
  it('calls synctex_forward with file and line', async () => {
    const box: SyncTexBox = { page: 1, h: 10000, v: 30000, w: 40000, d: 1000, page_height: 200000 };
    invoke.mockResolvedValueOnce(box);

    const result = await tauriSyncTexBackend().forward('/project/main.tex', 5);
    expect(invoke).toHaveBeenCalledWith('synctex_forward', { file: '/project/main.tex', line: 5 });
    expect(result).toEqual(box);
  });

  it('returns null when forward finds no record', async () => {
    invoke.mockResolvedValueOnce(null);
    const result = await tauriSyncTexBackend().forward('main.tex', 999);
    expect(result).toBeNull();
  });

  it('calls synctex_inverse with page, x, y', async () => {
    const loc: SyncTexLocation = { file: '/project/main.tex', line: 5 };
    invoke.mockResolvedValueOnce(loc);

    const result = await tauriSyncTexBackend().inverse(1, 10.5, 200.3);
    expect(invoke).toHaveBeenCalledWith('synctex_inverse', { page: 1, x: 10.5, y: 200.3 });
    expect(result).toEqual(loc);
  });

  it('returns null when inverse finds no record', async () => {
    invoke.mockResolvedValueOnce(null);
    const result = await tauriSyncTexBackend().inverse(99, 0, 0);
    expect(result).toBeNull();
  });
});

describe('browserSyncTexBackend', () => {
  it('forward always returns null', async () => {
    expect(await browserSyncTexBackend().forward('main.tex', 1)).toBeNull();
  });

  it('inverse always returns null', async () => {
    expect(await browserSyncTexBackend().inverse(1, 0, 0)).toBeNull();
  });
});

describe('selectSyncTexBackend', () => {
  it('returns the tauri backend in a Tauri window', async () => {
    invoke.mockResolvedValueOnce(null);
    const backend = selectSyncTexBackend(fakeWindow(true));
    // A null invoke result is still a resolved promise from the tauri backend.
    await expect(backend.forward('main.tex', 1)).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledWith('synctex_forward', { file: 'main.tex', line: 1 });
  });

  it('returns the browser backend in a plain window', async () => {
    const backend = selectSyncTexBackend(fakeWindow(false));
    await expect(backend.forward('main.tex', 1)).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
