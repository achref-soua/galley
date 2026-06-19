import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AssetPanel from '../src/lib/AssetPanel.svelte';
import { browserAssetBackend, type AssetBackend } from '../src/lib/asset-backend';

function makeBackend(assets: string[] = []): AssetBackend {
  return {
    async copyAsset(_root, _bytes, filename) {
      return `assets/${filename}`;
    },
    async listAssets() {
      return assets;
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssetPanel', () => {
  it('shows "No assets yet." when the list is empty', async () => {
    const { getByText } = render(AssetPanel, {
      props: {
        root: '/project',
        backend: makeBackend([]),
        oninsert: vi.fn()
      }
    });
    await waitFor(() => expect(getByText('No assets yet.')).toBeTruthy());
  });

  it('lists asset filenames when assets are present', async () => {
    const { getByText } = render(AssetPanel, {
      props: {
        root: '/project',
        backend: makeBackend(['assets/fig.png', 'assets/data.csv']),
        oninsert: vi.fn()
      }
    });
    await waitFor(() => {
      expect(getByText('fig.png')).toBeTruthy();
      expect(getByText('data.csv')).toBeTruthy();
    });
  });

  it('shows img-tag label for image files and not for others', async () => {
    const { container } = render(AssetPanel, {
      props: {
        root: '/project',
        backend: makeBackend(['assets/photo.png', 'assets/data.csv']),
        oninsert: vi.fn()
      }
    });
    await waitFor(() => {
      const imgTags = container.querySelectorAll('.img-tag');
      expect(imgTags).toHaveLength(1);
    });
  });

  it('calls oninsert with the correct snippet when an asset is clicked', async () => {
    const oninsert = vi.fn();
    const { getByText } = render(AssetPanel, {
      props: {
        root: '/project',
        backend: makeBackend(['assets/figure.png']),
        oninsert
      }
    });
    await waitFor(() => getByText('figure.png'));
    fireEvent.click(getByText('figure.png'));
    expect(oninsert).toHaveBeenCalledWith(
      '\\includegraphics[width=\\linewidth]{assets/figure.png}'
    );
  });

  it('toggles open/closed when the header button is clicked', async () => {
    const { container, getByText } = render(AssetPanel, {
      props: {
        root: '/project',
        backend: makeBackend(['assets/fig.png']),
        oninsert: vi.fn()
      }
    });
    // Panel is open by default; asset list and + button are visible.
    await waitFor(() => expect(getByText('fig.png')).toBeTruthy());
    const toggle = container.querySelector('.toggle') as HTMLButtonElement;
    fireEvent.click(toggle);
    // After closing, the asset list and + button are gone.
    expect(container.querySelector('.asset-list')).toBeNull();
    expect(container.querySelector('.add-btn')).toBeNull();
    // Re-open.
    fireEvent.click(toggle);
    await waitFor(() => expect(container.querySelector('.asset-list')).toBeTruthy());
  });

  it('shows empty state when root is null', async () => {
    const { getByText } = render(AssetPanel, {
      props: {
        root: null,
        backend: makeBackend(['assets/fig.png']),
        oninsert: vi.fn()
      }
    });
    await waitFor(() => expect(getByText('No assets yet.')).toBeTruthy());
  });

  it('picks a file via the hidden input, copies it, and calls oninsert', async () => {
    const oninsert = vi.fn();
    let copiedFilename = '';
    const backend: AssetBackend = {
      async copyAsset(_root, _bytes, filename) {
        copiedFilename = filename;
        return `assets/${filename}`;
      },
      async listAssets() {
        return copiedFilename ? [`assets/${copiedFilename}`] : [];
      }
    };

    const { container } = render(AssetPanel, {
      props: { root: '/project', backend, oninsert }
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    // jsdom File doesn't implement arrayBuffer() — provide a plain object with the method.
    const file = {
      name: 'logo.png',
      arrayBuffer: async () => bytes.buffer as ArrayBuffer
    } as unknown as File;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    await fireEvent.change(input);
    await waitFor(() => {
      expect(copiedFilename).toBe('logo.png');
      expect(oninsert).toHaveBeenCalledWith(
        '\\includegraphics[width=\\linewidth]{assets/logo.png}'
      );
    });
  });

  it('skips copyAsset when handlePick fires with an empty FileList', async () => {
    const oninsert = vi.fn();
    const backend = makeBackend([]);
    const { container } = render(AssetPanel, {
      props: { root: '/project', backend, oninsert }
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    // length === 0 → guard returns early
    Object.defineProperty(input, 'files', { value: { length: 0 }, configurable: true });
    await fireEvent.change(input);
    expect(oninsert).not.toHaveBeenCalled();
  });

  it('skips copyAsset when handlePick fires with null root', async () => {
    const oninsert = vi.fn();
    const backend: AssetBackend = {
      async copyAsset() {
        return 'assets/img.png';
      },
      async listAssets() {
        return [];
      }
    };
    const { container, rerender } = render(AssetPanel, {
      props: { root: '/project', backend, oninsert }
    });
    await rerender({ root: null, backend, oninsert });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = {
      name: 'img.png',
      arrayBuffer: async () => new ArrayBuffer(1)
    } as unknown as File;
    // root is null → guard returns early even with a valid file
    Object.defineProperty(input, 'files', { value: [fakeFile], configurable: true });
    await fireEvent.change(input);
    expect(oninsert).not.toHaveBeenCalled();
  });

  it('opens the file picker when the add button is clicked', async () => {
    const { container } = render(AssetPanel, {
      props: {
        root: '/project',
        backend: makeBackend([]),
        oninsert: vi.fn()
      }
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const addBtn = container.querySelector('.add-btn') as HTMLButtonElement;
    fireEvent.click(addBtn);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('uses the real browser backend', async () => {
    const backend = browserAssetBackend();
    await backend.copyAsset('/p', new Uint8Array([1, 2]), 'test.png');
    const list = await backend.listAssets('/p');
    expect(list).toContain('assets/test.png');
  });
});
