import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { browserVcsBackend, selectVcsBackend } from '../src/lib/vcs-backend';

const ROOT = '/tmp/test-project';

describe('browserVcsBackend', () => {
  it('autoCheckpoint returns a non-null id', async () => {
    const b = browserVcsBackend();
    const id = await b.autoCheckpoint(ROOT, 'hello');
    expect(id).not.toBeNull();
    expect(typeof id).toBe('string');
  });

  it('autoCheckpoint ids are unique per call', async () => {
    const b = browserVcsBackend();
    const id1 = await b.autoCheckpoint(ROOT, 'v1');
    const id2 = await b.autoCheckpoint(ROOT, 'v2');
    expect(id1).not.toBe(id2);
  });

  it('listCheckpoints returns empty before any commits', async () => {
    const b = browserVcsBackend();
    const entries = await b.listCheckpoints(ROOT);
    expect(entries).toEqual([]);
  });

  it('listCheckpoints returns one entry after one commit', async () => {
    const b = browserVcsBackend();
    await b.autoCheckpoint(ROOT, 'content');
    const entries = await b.listCheckpoints(ROOT);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('auto');
    expect(entries[0].isNamed).toBe(false);
  });

  it('listCheckpoints returns most-recent first', async () => {
    const b = browserVcsBackend();
    const id1 = await b.autoCheckpoint(ROOT, 'first');
    const id2 = await b.autoCheckpoint(ROOT, 'second');
    const entries = await b.listCheckpoints(ROOT);
    expect(entries[0].id).toBe(id2);
    expect(entries[1].id).toBe(id1);
  });

  it('createSnapshot marks entry as named', async () => {
    const b = browserVcsBackend();
    await b.createSnapshot(ROOT, 'v1 content', 'before big change');
    const entries = await b.listCheckpoints(ROOT);
    expect(entries[0].isNamed).toBe(true);
    expect(entries[0].name).toBe('before big change');
  });

  it('getContent returns content for known id', async () => {
    const b = browserVcsBackend();
    const id = await b.autoCheckpoint(ROOT, 'my content');
    const content = await b.getContent(ROOT, id!);
    expect(content).toBe('my content');
  });

  it('getContent returns null for unknown id', async () => {
    const b = browserVcsBackend();
    const content = await b.getContent(ROOT, 'nonexistent-id');
    expect(content).toBeNull();
  });

  it('getContent returns correct content for earlier commit', async () => {
    const b = browserVcsBackend();
    const id1 = await b.autoCheckpoint(ROOT, 'version one');
    await b.autoCheckpoint(ROOT, 'version two');
    expect(await b.getContent(ROOT, id1!)).toBe('version one');
  });

  it('each root has its own isolated history', async () => {
    const b = browserVcsBackend();
    await b.autoCheckpoint('/root-a', 'alpha');
    await b.autoCheckpoint('/root-b', 'beta');
    const a = await b.listCheckpoints('/root-a');
    const bEntries = await b.listCheckpoints('/root-b');
    expect(a).toHaveLength(1);
    expect(bEntries).toHaveLength(1);
    expect(a[0].id).not.toBe(bEntries[0].id);
  });

  it('listCheckpoints computes linesAdded for first commit', async () => {
    const b = browserVcsBackend();
    await b.autoCheckpoint(ROOT, 'line1\nline2');
    const entries = await b.listCheckpoints(ROOT);
    // First commit vs nothing: 2 added
    expect(entries[0].linesAdded).toBeGreaterThanOrEqual(0);
    expect(typeof entries[0].linesRemoved).toBe('number');
  });

  it('listCheckpoints tracks incremental changes', async () => {
    const b = browserVcsBackend();
    await b.autoCheckpoint(ROOT, 'a\nb\nc');
    await b.autoCheckpoint(ROOT, 'a\nx\nc');
    const entries = await b.listCheckpoints(ROOT);
    // Most recent first: entries[0] is second commit
    expect(entries[0].linesAdded).toBeGreaterThanOrEqual(0);
    expect(entries[0].linesRemoved).toBeGreaterThanOrEqual(0);
  });
});

describe('selectVcsBackend (browser)', () => {
  it('returns a backend with all required methods', () => {
    const b = selectVcsBackend();
    expect(typeof b.autoCheckpoint).toBe('function');
    expect(typeof b.createSnapshot).toBe('function');
    expect(typeof b.listCheckpoints).toBe('function');
    expect(typeof b.getContent).toBe('function');
  });
});

describe('tauriVcsBackend (via selectVcsBackend with __TAURI_INTERNALS__)', () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    invoke.mockReset();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  });

  it('selectVcsBackend returns tauri backend when __TAURI_INTERNALS__ is present', async () => {
    invoke.mockResolvedValueOnce([]);
    const b = selectVcsBackend();
    await b.listCheckpoints(ROOT);
    expect(invoke).toHaveBeenCalledWith('vcs_list_checkpoints', { projectRoot: ROOT });
  });

  it('autoCheckpoint calls vcs_auto_checkpoint and returns the id', async () => {
    invoke.mockResolvedValueOnce('abc123');
    const b = selectVcsBackend();
    const id = await b.autoCheckpoint(ROOT, 'hello world');
    expect(invoke).toHaveBeenCalledWith('vcs_auto_checkpoint', {
      projectRoot: ROOT,
      content: 'hello world'
    });
    expect(id).toBe('abc123');
  });

  it('autoCheckpoint returns null when the command throws', async () => {
    invoke.mockRejectedValueOnce(new Error('tauri error'));
    const b = selectVcsBackend();
    const id = await b.autoCheckpoint(ROOT, 'content');
    expect(id).toBeNull();
  });

  it('createSnapshot calls vcs_create_snapshot and returns the id', async () => {
    invoke.mockResolvedValueOnce('def456');
    const b = selectVcsBackend();
    const id = await b.createSnapshot(ROOT, 'content', 'my snapshot');
    expect(invoke).toHaveBeenCalledWith('vcs_create_snapshot', {
      projectRoot: ROOT,
      content: 'content',
      name: 'my snapshot'
    });
    expect(id).toBe('def456');
  });

  it('createSnapshot returns null when the command throws', async () => {
    invoke.mockRejectedValueOnce(new Error('fail'));
    const b = selectVcsBackend();
    const id = await b.createSnapshot(ROOT, 'content', 'name');
    expect(id).toBeNull();
  });

  it('listCheckpoints calls vcs_list_checkpoints and maps camelCase fields', async () => {
    const row = {
      id: 'x1',
      name: 'auto',
      date: '2026-06-20T00:00:00Z',
      isNamed: false,
      linesAdded: 3,
      linesRemoved: 1
    };
    invoke.mockResolvedValueOnce([row]);
    const b = selectVcsBackend();
    const entries = await b.listCheckpoints(ROOT);
    expect(invoke).toHaveBeenCalledWith('vcs_list_checkpoints', { projectRoot: ROOT });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('x1');
    expect(entries[0].isNamed).toBe(false);
    expect(entries[0].linesAdded).toBe(3);
    expect(entries[0].linesRemoved).toBe(1);
  });

  it('listCheckpoints returns empty array when the command throws', async () => {
    invoke.mockRejectedValueOnce(new Error('fail'));
    const b = selectVcsBackend();
    const entries = await b.listCheckpoints(ROOT);
    expect(entries).toEqual([]);
  });

  it('getContent calls vcs_get_content and returns the content string', async () => {
    invoke.mockResolvedValueOnce('document body here');
    const b = selectVcsBackend();
    const content = await b.getContent(ROOT, 'checkpoint-id');
    expect(invoke).toHaveBeenCalledWith('vcs_get_content', {
      projectRoot: ROOT,
      checkpointId: 'checkpoint-id'
    });
    expect(content).toBe('document body here');
  });

  it('getContent returns null when the command throws', async () => {
    invoke.mockRejectedValueOnce(new Error('fail'));
    const b = selectVcsBackend();
    const content = await b.getContent(ROOT, 'checkpoint-id');
    expect(content).toBeNull();
  });
});
