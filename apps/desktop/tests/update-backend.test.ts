import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  browserUpdateBackend,
  tauriUpdateBackend,
  selectUpdateBackend
} from '../src/lib/update-backend';

const mockInvoke = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args)
}));

describe('browserUpdateBackend', () => {
  it('never reaches the network', async () => {
    expect(await browserUpdateBackend().checkLatest()).toBeNull();
  });
});

describe('tauriUpdateBackend', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('asks the shell for the latest tag and strips the leading v', async () => {
    mockInvoke.mockResolvedValueOnce('v1.2.3');
    const latest = await tauriUpdateBackend().checkLatest();
    expect(mockInvoke).toHaveBeenCalledWith('check_latest_release');
    expect(latest).toBe('1.2.3');
  });
});

describe('selectUpdateBackend', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('returns the browser backend without Tauri internals', async () => {
    const win = {} as unknown as Window & typeof globalThis;
    expect(await selectUpdateBackend(win).checkLatest()).toBeNull();
  });

  it('returns the tauri backend with Tauri internals', async () => {
    const win = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis;
    mockInvoke.mockResolvedValueOnce('v0.9.2');
    expect(await selectUpdateBackend(win).checkLatest()).toBe('0.9.2');
  });
});
