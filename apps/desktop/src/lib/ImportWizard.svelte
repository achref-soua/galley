<!--
  Import Wizard — three-step flow for importing a LaTeX project from a ZIP
  archive, a .tar.gz tarball, or an existing local folder.

  Step 1: choose source (ZIP / tarball / folder)
  Step 2: preview the parse-only analysis (root doc, engine, packages, …)
  Step 3: confirm name + destination, then materialise

  All heavy I/O (archive extraction, file reads/writes) happens in Rust via
  path-based Tauri commands — the wizard only passes absolute paths.
-->
<script lang="ts">
  import { Button } from '@galley/ui-kit';
  import { selectImportBackend, type ImportBackend, type ProjectAnalysis } from './import-backend';
  import { type ProjectSnapshot } from './project-backend';

  let {
    backend = selectImportBackend() as ImportBackend,
    onimport,
    oncancel
  }: {
    backend?: ImportBackend;
    /** Called with the newly created project snapshot on a successful import. */
    onimport: (project: ProjectSnapshot) => void;
    oncancel: () => void;
  } = $props();

  // ── Step machine ──────────────────────────────────────────────────────────
  type Step = 'choose' | 'preview' | 'confirm';
  let step = $state<Step>('choose');

  // ── Source ────────────────────────────────────────────────────────────────
  type SourceKind = 'archive' | 'folder';
  let sourceKind = $state<SourceKind>('archive');
  let sourcePath = $state('');
  let sourceLabel = $state('');

  // ── Analysis ──────────────────────────────────────────────────────────────
  let analysis = $state<ProjectAnalysis | null>(null);
  let analysisError = $state('');
  let analysing = $state(false);

  // ── Destination ───────────────────────────────────────────────────────────
  let projectName = $state('');
  let parentDir = $state('');
  let importing = $state(false);
  let importError = $state('');

  // ── Step 1: pick source ───────────────────────────────────────────────────
  async function pickArchive() {
    const result = await backend.pickFile('Select an archive', [
      { name: 'ZIP / Tarball', extensions: ['zip', 'tar.gz', 'tgz'] },
      { name: 'ZIP Archive', extensions: ['zip'] },
      { name: 'Tarball', extensions: ['tar.gz', 'tgz'] }
    ]);
    if (!result) return;
    sourceKind = 'archive';
    sourcePath = result.path;
    sourceLabel = result.name;
    await runAnalysis();
  }

  async function pickFolder() {
    const path = await backend.pickFolder('Select a LaTeX project folder');
    if (!path) return;
    sourceKind = 'folder';
    sourcePath = path;
    const parts = path.split(/[\\/]/);
    sourceLabel = parts[parts.length - 1];
    await runAnalysis();
  }

  // ── Step 2: analysis ──────────────────────────────────────────────────────
  async function runAnalysis() {
    analysing = true;
    analysisError = '';
    analysis = null;
    try {
      if (sourceKind === 'folder') {
        analysis = await backend.analyzeFolder(sourcePath);
      } else {
        analysis = await backend.analyzeArchive(sourcePath);
      }
      if (projectName === '') {
        projectName = stripExtensions(sourceLabel);
      }
      step = 'preview';
    } catch (err) {
      analysisError = String(err);
    } finally {
      analysing = false;
    }
  }

  function stripExtensions(name: string): string {
    return name
      .replace(/\.(tar\.gz|tgz|zip)$/i, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // ── Step 3: pick destination and confirm ──────────────────────────────────
  async function pickParent() {
    const dir = await backend.pickFolder('Choose destination folder');
    if (dir) parentDir = dir;
  }

  async function confirmImport() {
    const name = projectName.trim();
    if (!name || !parentDir.trim()) return;
    importing = true;
    importError = '';
    try {
      let snapshot: ProjectSnapshot;
      if (sourceKind === 'folder') {
        snapshot = await backend.importFromFolder(parentDir, name, sourcePath);
      } else {
        snapshot = await backend.importFromArchive(sourcePath, parentDir, name);
      }
      onimport(snapshot);
    } catch (err) {
      importError = String(err);
    } finally {
      importing = false;
    }
  }

  function back() {
    if (step === 'preview') step = 'choose';
    else if (step === 'confirm') step = 'preview';
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function fileCountLabel(a: ProjectAnalysis): string {
    const s = a.fileCount === 1 ? '' : 's';
    return `${a.fileCount} file${s}`;
  }

  function fileSizeLabel(a: ProjectAnalysis): string {
    return formatBytes(a.totalBytes);
  }

  function pkgHeader(a: ProjectAnalysis): string {
    return `Packages (${a.packages.length})`;
  }

  function warnItem(w: string): string {
    return `⚠ ${w}`;
  }
</script>

<div class="wizard" role="dialog" aria-modal="true" aria-label="Import project">
  <header class="wizard-header">
    <h2>Import project</h2>
    <button class="close-btn" onclick={oncancel} aria-label="Cancel import">✕</button>
  </header>

  <nav class="steps" aria-label="Wizard steps">
    <span class="step" class:active={step === 'choose'} aria-current={step === 'choose'}>
      1. Source
    </span>
    <span class="step-sep">›</span>
    <span class="step" class:active={step === 'preview'} aria-current={step === 'preview'}>
      2. Preview
    </span>
    <span class="step-sep">›</span>
    <span class="step" class:active={step === 'confirm'} aria-current={step === 'confirm'}>
      3. Confirm
    </span>
  </nav>

  <div class="wizard-body">
    <!-- ── Step 1: choose source ─────────────────────────────────────── -->
    {#if step === 'choose'}
      <p class="hint">
        Import a LaTeX project from a ZIP archive, a .tar.gz tarball (e.g. from arXiv or Overleaf),
        or an existing local folder.
      </p>

      <div class="source-grid">
        <button class="source-card" onclick={pickArchive} disabled={analysing}>
          <span class="source-icon" aria-hidden="true">📦</span>
          <strong>Archive</strong>
          <small>ZIP or .tar.gz — Overleaf export, arXiv source, …</small>
        </button>

        <button class="source-card" onclick={pickFolder} disabled={analysing}>
          <span class="source-icon" aria-hidden="true">📁</span>
          <strong>Local folder</strong>
          <small>Copy an existing LaTeX folder as a new Galley project</small>
        </button>
      </div>

      {#if analysing}
        <p class="status" role="status">Analysing source…</p>
      {/if}
      {#if analysisError}
        <p class="error" role="alert">{analysisError}</p>
      {/if}
    {/if}

    <!-- ── Step 2: preview analysis ──────────────────────────────────── -->
    {#if step === 'preview' && analysis}
      <p class="source-info">
        Source: <strong>{sourceLabel}</strong>
        ({fileCountLabel(analysis)}, {fileSizeLabel(analysis)})
      </p>

      <table class="analysis-table" aria-label="Detected project properties">
        <tbody>
          <tr>
            <th scope="row">Root document</th>
            <td><code>{analysis.rootFile || '(none detected)'}</code></td>
          </tr>
          <tr>
            <th scope="row">Compile engine</th>
            <td>{analysis.engine}</td>
          </tr>
          <tr>
            <th scope="row">Bibliography</th>
            <td>{analysis.bibTool}</td>
          </tr>
          {#if analysis.encoding}
            <tr>
              <th scope="row">Encoding</th>
              <td>{analysis.encoding}</td>
            </tr>
          {/if}
          {#if analysis.packages.length > 0}
            <tr>
              <th scope="row">{pkgHeader(analysis)}</th>
              <td class="wrap">{analysis.packages.join(', ')}</td>
            </tr>
          {/if}
          {#if analysis.fonts.length > 0}
            <tr>
              <th scope="row">Fonts</th>
              <td class="wrap">{analysis.fonts.join(', ')}</td>
            </tr>
          {/if}
        </tbody>
      </table>

      {#if analysis.warnings.length > 0}
        <ul class="warnings" role="list" aria-label="Compatibility warnings">
          {#each analysis.warnings as warning (warning)}
            <li>{warnItem(warning)}</li>
          {/each}
        </ul>
      {/if}

      <div class="step-actions">
        <Button size="sm" onclick={back}>Back</Button>
        <Button size="sm" variant="primary" onclick={() => (step = 'confirm')}>Continue →</Button>
      </div>
    {/if}

    <!-- ── Step 3: name + destination ────────────────────────────────── -->
    {#if step === 'confirm'}
      <form
        class="confirm-form"
        onsubmit={(e) => {
          e.preventDefault();
          void confirmImport();
        }}
      >
        <label for="proj-name">Project name</label>
        <input
          id="proj-name"
          class="text-input"
          type="text"
          required
          bind:value={projectName}
          placeholder="my-thesis"
          aria-required="true"
        />

        <label for="parent-dir">Save inside folder</label>
        <div class="dir-row">
          <input
            id="parent-dir"
            class="text-input"
            type="text"
            required
            bind:value={parentDir}
            placeholder="Choose a destination folder…"
            aria-required="true"
            readonly
          />
          <Button size="sm" onclick={pickParent} type="button">Browse…</Button>
        </div>

        {#if importError}
          <p class="error" role="alert">{importError}</p>
        {/if}

        <div class="step-actions">
          <Button size="sm" onclick={back} type="button" disabled={importing}>Back</Button>
          <Button
            size="sm"
            variant="primary"
            type="submit"
            disabled={importing || !projectName.trim() || !parentDir.trim()}
          >
            {importing ? 'Importing…' : 'Import project'}
          </Button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .wizard {
    background: var(--color-surface-raised, #fff);
    border: 1px solid var(--color-border, #d0d0d0);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    max-width: 520px;
    overflow: hidden;
    width: 100%;
  }

  .wizard-header {
    align-items: center;
    border-bottom: 1px solid var(--color-border, #d0d0d0);
    display: flex;
    justify-content: space-between;
    padding: 14px 18px;
  }

  .wizard-header h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-fg-muted, #888);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 2px 6px;
  }

  .close-btn:hover {
    color: var(--color-fg, #222);
  }

  .steps {
    align-items: center;
    border-bottom: 1px solid var(--color-border, #d0d0d0);
    display: flex;
    font-size: 0.8rem;
    gap: 4px;
    padding: 8px 18px;
  }

  .step {
    color: var(--color-fg-muted, #888);
    padding: 2px 6px;
  }

  .step.active {
    color: var(--color-accent, #007aff);
    font-weight: 600;
  }

  .step-sep {
    color: var(--color-fg-muted, #888);
  }

  .wizard-body {
    overflow-y: auto;
    padding: 18px;
  }

  .hint {
    color: var(--color-fg-muted, #888);
    font-size: 0.85rem;
    margin: 0 0 16px;
  }

  .source-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, 1fr);
  }

  .source-card {
    background: var(--color-surface, #f5f5f5);
    border: 1px solid var(--color-border, #d0d0d0);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 20px 14px;
    text-align: center;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .source-card:hover:not(:disabled) {
    background: var(--color-surface-hover, #ebebeb);
    border-color: var(--color-accent, #007aff);
  }

  .source-card:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .source-card strong {
    font-size: 0.9rem;
  }

  .source-card small {
    color: var(--color-fg-muted, #888);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .source-icon {
    font-size: 1.75rem;
  }

  .status {
    color: var(--color-fg-muted, #888);
    font-size: 0.85rem;
    margin-top: 12px;
  }

  .error {
    color: var(--color-error, #c0392b);
    font-size: 0.85rem;
    margin-top: 10px;
  }

  .source-info {
    font-size: 0.85rem;
    margin: 0 0 14px;
  }

  .analysis-table {
    border-collapse: collapse;
    font-size: 0.85rem;
    width: 100%;
  }

  .analysis-table th {
    color: var(--color-fg-muted, #888);
    font-weight: 500;
    padding: 5px 8px 5px 0;
    text-align: left;
    white-space: nowrap;
    width: 38%;
  }

  .analysis-table td {
    padding: 5px 0;
  }

  .analysis-table td.wrap {
    word-break: break-word;
  }

  .warnings {
    background: var(--color-warning-bg, #fff8e1);
    border: 1px solid var(--color-warning-border, #ffe082);
    border-radius: 4px;
    font-size: 0.82rem;
    list-style: none;
    margin: 14px 0 0;
    padding: 10px 12px;
  }

  .warnings li + li {
    margin-top: 6px;
  }

  .confirm-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .confirm-form label {
    font-size: 0.85rem;
    font-weight: 500;
    margin-top: 4px;
  }

  .text-input {
    background: var(--color-input-bg, #fff);
    border: 1px solid var(--color-border, #d0d0d0);
    border-radius: 4px;
    font-size: 0.85rem;
    padding: 6px 10px;
    width: 100%;
  }

  .text-input:focus {
    border-color: var(--color-accent, #007aff);
    outline: none;
  }

  .dir-row {
    align-items: center;
    display: flex;
    gap: 8px;
  }

  .dir-row .text-input {
    flex: 1;
    min-width: 0;
  }

  .step-actions {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 18px;
  }
</style>
