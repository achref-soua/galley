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

function baseProps(extra: Record<string, unknown> = {}) {
  return {
    root: '/project' as string | null,
    backend: makeBackend([]),
    content: '',
    oninsert: vi.fn(),
    onresize: vi.fn(),
    ...extra
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssetPanel', () => {
  it('shows "No assets yet." when the list is empty', async () => {
    const { getByText } = render(AssetPanel, { props: baseProps() });
    await waitFor(() => expect(getByText('No assets yet.')).toBeTruthy());
  });

  it('lists asset filenames when assets are present', async () => {
    const { getByText } = render(AssetPanel, {
      props: baseProps({ backend: makeBackend(['assets/fig.png', 'assets/data.csv']) })
    });
    await waitFor(() => {
      expect(getByText('fig.png')).toBeTruthy();
      expect(getByText('data.csv')).toBeTruthy();
    });
  });

  it('shows img-tag label for image files and not for others', async () => {
    const { container } = render(AssetPanel, {
      props: baseProps({ backend: makeBackend(['assets/photo.png', 'assets/data.csv']) })
    });
    await waitFor(() => {
      const imgTags = container.querySelectorAll('.img-tag');
      expect(imgTags).toHaveLength(1);
    });
  });

  it('calls oninsert with the correct snippet when an asset is clicked', async () => {
    const oninsert = vi.fn();
    const { getByText } = render(AssetPanel, {
      props: baseProps({ backend: makeBackend(['assets/figure.png']), oninsert })
    });
    await waitFor(() => getByText('figure.png'));
    fireEvent.click(getByText('figure.png'));
    expect(oninsert).toHaveBeenCalledWith(
      '\\includegraphics[width=\\linewidth]{assets/figure.png}'
    );
  });

  it('toggles open/closed when the header button is clicked', async () => {
    const { container, getByText } = render(AssetPanel, {
      props: baseProps({ backend: makeBackend(['assets/fig.png']) })
    });
    await waitFor(() => expect(getByText('fig.png')).toBeTruthy());
    const toggle = container.querySelector('.toggle') as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(container.querySelector('.asset-list')).toBeNull();
    expect(container.querySelector('.add-btn')).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() => expect(container.querySelector('.asset-list')).toBeTruthy());
  });

  it('shows empty state when root is null', async () => {
    const { getByText } = render(AssetPanel, { props: baseProps({ root: null }) });
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

    const { container } = render(AssetPanel, { props: baseProps({ backend, oninsert }) });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
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
    const { container } = render(AssetPanel, { props: baseProps({ oninsert }) });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
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
      props: baseProps({ backend, oninsert })
    });
    await rerender({ root: null, backend, content: '', oninsert, onresize: vi.fn() });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = {
      name: 'img.png',
      arrayBuffer: async () => new ArrayBuffer(1)
    } as unknown as File;
    Object.defineProperty(input, 'files', { value: [fakeFile], configurable: true });
    await fireEvent.change(input);
    expect(oninsert).not.toHaveBeenCalled();
  });

  it('opens the file picker when the add button is clicked', async () => {
    const { container } = render(AssetPanel, { props: baseProps() });
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

  it('shows resize section for images already in content', async () => {
    const content = '\\includegraphics{figs/chart.png}';
    const { getByText } = render(AssetPanel, { props: baseProps({ content }) });
    expect(getByText('Resize inserted images')).toBeTruthy();
    expect(getByText('chart.png')).toBeTruthy();
  });

  it('calls onresize with spec and preset value when a resize button is clicked', async () => {
    const onresize = vi.fn();
    const content = '\\includegraphics{fig.png}';
    const { getAllByRole } = render(AssetPanel, { props: baseProps({ content, onresize }) });
    // Three width preset buttons are rendered per image
    const btns = getAllByRole('button', { name: /Set fig.png width to/ });
    expect(btns).toHaveLength(3);
    await fireEvent.click(btns[0]); // ½
    expect(onresize).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'fig.png' }),
      '0.5\\linewidth'
    );
  });

  it('does not show resize section when content has no images', async () => {
    const { container } = render(AssetPanel, {
      props: baseProps({ content: 'plain text without images' })
    });
    expect(container.querySelector('.resize-section')).toBeNull();
  });

  it('does not show resize section when panel is closed', async () => {
    const content = '\\includegraphics{fig.png}';
    const { container } = render(AssetPanel, { props: baseProps({ content }) });
    const toggle = container.querySelector('.toggle') as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(container.querySelector('.resize-section')).toBeNull();
  });
});
