import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ImportWizard from '../src/lib/ImportWizard.svelte';
import { browserImportBackend, type ImportBackend } from '../src/lib/import-backend';

function makeBackend(overrides: Partial<ImportBackend> = {}): ImportBackend {
  return { ...browserImportBackend(), ...overrides };
}

describe('ImportWizard — step 1 (choose)', () => {
  it('renders step 1 with archive and folder source cards', () => {
    render(ImportWizard, {
      backend: makeBackend(),
      onimport: vi.fn(),
      oncancel: vi.fn()
    });
    expect(screen.getByRole('dialog', { name: 'Import project' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Archive/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Local folder/i })).toBeTruthy();
    expect(screen.getByText('1. Source')).toBeTruthy();
  });

  it('calls oncancel when the close button is clicked', async () => {
    const oncancel = vi.fn();
    render(ImportWizard, { backend: makeBackend(), onimport: vi.fn(), oncancel });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
    expect(oncancel).toHaveBeenCalledOnce();
  });

  it('shows an analysis error when pickFile returns a path but analyzeArchive rejects', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/bad/file.zip', name: 'file.zip' }),
      analyzeArchive: async () => {
        throw new Error('corrupted archive');
      }
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toContain('corrupted archive');
  });

  it('does nothing when archive file dialog is cancelled', async () => {
    const backend = makeBackend({ pickFile: async () => null });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    // No dialog, still on step 1.
    expect(screen.getByText('1. Source')).toBeTruthy();
    expect(screen.queryByText('2. Preview')).toBeTruthy();
  });

  it('does nothing when folder dialog is cancelled', async () => {
    const backend = makeBackend({ pickFolder: async () => null });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Local folder/i }));
    expect(screen.getByText('1. Source')).toBeTruthy();
  });
});

describe('ImportWizard — archive path', () => {
  async function goToPreviewViaArchive(
    backendOverrides: Partial<ImportBackend> = {}
  ): Promise<ReturnType<typeof render>> {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/thesis.zip', name: 'thesis.zip' }),
      ...backendOverrides
    });
    const result = render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => expect(screen.queryByText(/2\. Preview/)).toBeTruthy());
    return result;
  }

  it('moves to preview step after a successful archive analysis', async () => {
    await goToPreviewViaArchive();
    expect(screen.getByRole('table', { name: 'Detected project properties' })).toBeTruthy();
    expect(screen.getByText('Tectonic (embedded)')).toBeTruthy();
    // Pre-fills name from the archive filename.
    const nameInput = screen.queryByLabelText('Project name');
    expect(nameInput).toBeNull(); // not on confirm step yet
  });

  it('shows warnings when analysis returns them', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/thesis.zip', name: 'thesis.zip' }),
      analyzeArchive: async () => ({
        rootFile: 'main.tex',
        engine: 'latexmk / TeX Live',
        bibTool: 'None',
        encoding: '',
        packages: [],
        fonts: [],
        warnings: ['XeLaTeX detected — latexmk required'],
        fileCount: 1,
        totalBytes: 1024
      })
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByRole('list', { name: 'Compatibility warnings' }));
    expect(screen.getByRole('list', { name: 'Compatibility warnings' }).textContent).toContain(
      'XeLaTeX detected'
    );
  });

  it('navigates back from preview to choose step', async () => {
    await goToPreviewViaArchive();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: /Archive/i })).toBeTruthy();
  });

  it('moves to confirm step when Continue is clicked', async () => {
    await goToPreviewViaArchive();
    await fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText('Project name'));
    expect(screen.getByLabelText('Project name')).toBeTruthy();
    expect(screen.getByLabelText('Save inside folder')).toBeTruthy();
  });

  it('strips extensions from the archive name to pre-fill the project name', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/my_thesis.tar.gz', name: 'my_thesis.tar.gz' })
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByRole('button', { name: /Continue/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText('Project name'));
    expect((screen.getByLabelText('Project name') as HTMLInputElement).value).toBe('my_thesis');
  });

  it('calls onimport with the project snapshot after a successful archive import', async () => {
    const onimport = vi.fn();
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/thesis.zip', name: 'thesis.zip' }),
      pickFolder: async () => '/home/user/projects',
      importFromArchive: async (_path, parent, name) => ({
        name,
        root: `${parent}/${name}`,
        rootDocument: 'main.tex',
        documents: [{ path: 'main.tex', kind: 'tex' as const }]
      })
    });
    render(ImportWizard, { backend, onimport, oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByRole('button', { name: /Continue/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText('Project name'));
    // Pick destination.
    await fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => {
      const input = screen.getByLabelText('Save inside folder') as HTMLInputElement;
      expect(input.value).toBe('/home/user/projects');
    });
    await fireEvent.submit(screen.getByLabelText('Save inside folder').closest('form')!);
    await waitFor(() => expect(onimport).toHaveBeenCalledOnce());
    expect(onimport.mock.calls[0][0].rootDocument).toBe('main.tex');
  });

  it('shows an import error when importFromArchive rejects', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/thesis.zip', name: 'thesis.zip' }),
      pickFolder: async () => '/home/user/projects',
      importFromArchive: async () => {
        throw new Error('disk full');
      }
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByRole('button', { name: /Continue/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText('Project name'));
    await fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => {
      const input = screen.getByLabelText('Save inside folder') as HTMLInputElement;
      expect(input.value).toBe('/home/user/projects');
    });
    await fireEvent.submit(screen.getByLabelText('Save inside folder').closest('form')!);
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toContain('disk full');
  });
});

describe('ImportWizard — folder path', () => {
  async function goToPreviewViaFolder(
    backendOverrides: Partial<ImportBackend> = {}
  ): Promise<void> {
    const backend = makeBackend({
      pickFolder: async () => '/home/user/old-project',
      ...backendOverrides
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Local folder/i }));
    await waitFor(() => expect(screen.queryByText(/2\. Preview/)).toBeTruthy());
  }

  it('moves to preview step after a successful folder analysis', async () => {
    await goToPreviewViaFolder();
    expect(screen.getByRole('table', { name: 'Detected project properties' })).toBeTruthy();
  });

  it('shows the package list when packages are detected', async () => {
    await goToPreviewViaFolder();
    // Browser backend returns ['amsmath', 'graphicx', 'hyperref'].
    expect(screen.getByText(/amsmath/)).toBeTruthy();
  });

  it('navigates back from confirm to preview to choose', async () => {
    await goToPreviewViaFolder();
    await fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText('Project name'));
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => screen.getByRole('button', { name: /Continue/i }));
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: /Archive/i })).toBeTruthy();
  });

  it('does not submit when name is empty (early-return guard)', async () => {
    const onimport = vi.fn();
    let callCount = 0;
    const backend = makeBackend({
      pickFolder: async () => {
        callCount += 1;
        return callCount === 1 ? '/home/user/old-project' : '/home/user/projects';
      }
    });
    render(ImportWizard, { backend, onimport, oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Local folder/i }));
    await waitFor(() => screen.getByRole('button', { name: /Continue/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText('Project name'));
    // Clear the pre-filled name to leave it empty.
    await fireEvent.input(screen.getByLabelText('Project name'), { target: { value: '' } });
    // Fill parent dir.
    await fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => {
      const input = screen.getByLabelText('Save inside folder') as HTMLInputElement;
      expect(input.value).toBe('/home/user/projects');
    });
    // Submit the form with an empty name — the guard should bail early.
    await fireEvent.submit(screen.getByLabelText('Save inside folder').closest('form')!);
    // Import was not called.
    expect(onimport).not.toHaveBeenCalled();
  });

  it('calls onimport with the project snapshot after a successful folder import', async () => {
    const onimport = vi.fn();
    let callCount = 0;
    const backend = makeBackend({
      pickFolder: async () => {
        callCount += 1;
        return callCount === 1 ? '/home/user/old-project' : '/home/user/projects';
      },
      importFromFolder: async (parent, name) => ({
        name,
        root: `${parent}/${name}`,
        rootDocument: 'main.tex',
        documents: [{ path: 'main.tex', kind: 'tex' as const }]
      })
    });
    render(ImportWizard, { backend, onimport, oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Local folder/i }));
    await waitFor(() => screen.getByRole('button', { name: /Continue/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => screen.getByLabelText('Project name'));
    await fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => {
      const input = screen.getByLabelText('Save inside folder') as HTMLInputElement;
      expect(input.value).toBe('/home/user/projects');
    });
    await fireEvent.submit(screen.getByLabelText('Save inside folder').closest('form')!);
    await waitFor(() => expect(onimport).toHaveBeenCalledOnce());
  });
});

describe('ImportWizard — formatBytes', () => {
  it('shows file size in KB for medium archives', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/a.zip', name: 'a.zip' }),
      analyzeArchive: async () => ({
        rootFile: 'main.tex',
        engine: 'Tectonic (embedded)',
        bibTool: 'None',
        encoding: '',
        packages: [],
        fonts: [],
        warnings: [],
        fileCount: 2,
        totalBytes: 2048
      })
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByText(/2\.0 KB/));
  });

  it('shows file size in MB for large archives', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/a.zip', name: 'a.zip' }),
      analyzeArchive: async () => ({
        rootFile: 'main.tex',
        engine: 'Tectonic (embedded)',
        bibTool: 'None',
        encoding: '',
        packages: [],
        fonts: [],
        warnings: [],
        fileCount: 1,
        totalBytes: 2 * 1024 * 1024
      })
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByText(/2\.0 MB/));
  });

  it('shows file size in B for tiny archives and covers singular file / empty root', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/a.zip', name: 'a.zip' }),
      analyzeArchive: async () => ({
        rootFile: '',
        engine: 'Tectonic (embedded)',
        bibTool: 'None',
        encoding: '',
        packages: [],
        fonts: [],
        warnings: [],
        fileCount: 1,
        totalBytes: 512
      })
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByText(/512 B/));
    // Singular 'file' branch and "(none detected)" root file branch.
    expect(screen.getByText(/1 file,/)).toBeTruthy();
    expect(screen.getByText('(none detected)')).toBeTruthy();
  });

  it('shows font names when analysis detects fonts', async () => {
    const backend = makeBackend({
      pickFile: async () => ({ path: '/home/user/a.zip', name: 'a.zip' }),
      analyzeArchive: async () => ({
        rootFile: 'main.tex',
        engine: 'latexmk / TeX Live',
        bibTool: 'None',
        encoding: '',
        packages: [],
        fonts: ['Computer Modern', 'Times New Roman'],
        warnings: [],
        fileCount: 2,
        totalBytes: 1024
      })
    });
    render(ImportWizard, { backend, onimport: vi.fn(), oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
    await waitFor(() => screen.getByText(/Computer Modern/));
    expect(screen.getByText(/Times New Roman/)).toBeTruthy();
  });
});
