import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browserWindowBackend, selectWindowBackend } from '../src/lib/window-backend';

describe('browserWindowBackend', () => {
  it('openInNewWindow resolves without error', async () => {
    const backend = browserWindowBackend();
    await expect(backend.openInNewWindow()).resolves.toBeUndefined();
  });
});

describe('tauriWindowBackend', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls WebviewWindow constructor and waits for created event', async () => {
    // Mock the Tauri WebviewWindow module before importing the backend.
    const onceSpy = vi.fn(() => Promise.resolve());
    const MockWebviewWindow = vi.fn().mockImplementation(() => ({ once: onceSpy }));
    vi.doMock('@tauri-apps/api/webviewWindow', () => ({
      WebviewWindow: MockWebviewWindow
    }));

    // Import the backend after the mock is set up.
    const mod = await import('../src/lib/window-backend');
    const backend = mod.tauriWindowBackend();
    await backend.openInNewWindow();

    expect(MockWebviewWindow).toHaveBeenCalledWith(expect.stringMatching(/^galley-/), { url: '/' });
    expect(onceSpy).toHaveBeenCalledWith('tauri://created', expect.any(Function));
  });

  it('increments the window label on each call', async () => {
    const onceSpy = vi.fn(() => Promise.resolve());
    const labels: string[] = [];
    const MockWebviewWindow = vi.fn().mockImplementation((label: string) => {
      labels.push(label);
      return { once: onceSpy };
    });
    vi.doMock('@tauri-apps/api/webviewWindow', () => ({
      WebviewWindow: MockWebviewWindow
    }));

    const mod = await import('../src/lib/window-backend');
    const backend = mod.tauriWindowBackend();
    await backend.openInNewWindow();
    await backend.openInNewWindow();

    expect(labels[0]).not.toBe(labels[1]);
  });
});

describe('selectWindowBackend', () => {
  it('returns browserWindowBackend when not in Tauri', () => {
    // In the test environment __TAURI_INTERNALS__ is not defined.
    const backend = selectWindowBackend();
    // Should not throw and should resolve.
    return expect(backend.openInNewWindow()).resolves.toBeUndefined();
  });

  it('returns tauriWindowBackend when inside a Tauri window', () => {
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    const backend = selectWindowBackend();
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    expect(typeof backend.openInNewWindow).toBe('function');
  });
});
