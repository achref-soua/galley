import { describe, it, expect } from 'vitest';
import {
  createCheckpoint,
  applyCheckpoint,
  newLoopState,
  canContinueLoop,
  advanceLoop,
  isNetworkTool,
  networkPermissionMessage,
  type CheckpointEntry
} from '../src/lib/autonomous';

// ── createCheckpoint ──────────────────────────────────────────────────────────

describe('createCheckpoint', () => {
  it('stores name and content', () => {
    const cp = createCheckpoint('step-1', '\\section{Intro}');
    expect(cp.name).toBe('step-1');
    expect(cp.content).toBe('\\section{Intro}');
  });

  it('uses Date.now() as timestamp when not supplied', () => {
    const before = Date.now();
    const cp = createCheckpoint('x', 'y');
    const after = Date.now();
    expect(cp.timestamp).toBeGreaterThanOrEqual(before);
    expect(cp.timestamp).toBeLessThanOrEqual(after);
  });

  it('uses the supplied timestamp for deterministic tests', () => {
    const cp = createCheckpoint('a', 'b', 42);
    expect(cp.timestamp).toBe(42);
  });
});

// ── applyCheckpoint ───────────────────────────────────────────────────────────

describe('applyCheckpoint', () => {
  const makeStore = (...pairs: [string, string][]): CheckpointEntry[] =>
    pairs.map(([n, c]) => createCheckpoint(n, c, 0));

  it('returns null for an empty list', () => {
    expect(applyCheckpoint([], 'any')).toBeNull();
  });

  it('returns null when name is not found', () => {
    const cps = makeStore(['cp-1', 'a']);
    expect(applyCheckpoint(cps, 'cp-99')).toBeNull();
  });

  it('returns the content of a matching checkpoint', () => {
    const cps = makeStore(['cp-1', 'draft one']);
    expect(applyCheckpoint(cps, 'cp-1')).toBe('draft one');
  });

  it('returns the most-recent content when the name is duplicated', () => {
    const cps = makeStore(['step', 'first'], ['step', 'second']);
    expect(applyCheckpoint(cps, 'step')).toBe('second');
  });

  it('does not mutate the input array', () => {
    const cps = makeStore(['cp', 'text']);
    const copy = [...cps];
    applyCheckpoint(cps, 'cp');
    expect(cps).toEqual(copy);
  });
});

// ── newLoopState ──────────────────────────────────────────────────────────────

describe('newLoopState', () => {
  it('starts at iteration 0 with the default limit of 3', () => {
    const s = newLoopState();
    expect(s.iteration).toBe(0);
    expect(s.maxIterations).toBe(3);
  });

  it('respects a custom maxIterations', () => {
    const s = newLoopState(5);
    expect(s.maxIterations).toBe(5);
  });
});

// ── canContinueLoop ───────────────────────────────────────────────────────────

describe('canContinueLoop', () => {
  it('returns true when iteration < maxIterations', () => {
    expect(canContinueLoop({ iteration: 0, maxIterations: 3 })).toBe(true);
    expect(canContinueLoop({ iteration: 2, maxIterations: 3 })).toBe(true);
  });

  it('returns false when iteration === maxIterations', () => {
    expect(canContinueLoop({ iteration: 3, maxIterations: 3 })).toBe(false);
  });

  it('returns false when iteration > maxIterations', () => {
    expect(canContinueLoop({ iteration: 4, maxIterations: 3 })).toBe(false);
  });
});

// ── advanceLoop ───────────────────────────────────────────────────────────────

describe('advanceLoop', () => {
  it('increments the iteration by one', () => {
    const s0 = newLoopState(3);
    const s1 = advanceLoop(s0);
    expect(s1.iteration).toBe(1);
    expect(s1.maxIterations).toBe(3);
  });

  it('does not mutate the original state', () => {
    const s0 = newLoopState(2);
    advanceLoop(s0);
    expect(s0.iteration).toBe(0);
  });

  it('can be chained to reach the limit', () => {
    let s = newLoopState(2);
    s = advanceLoop(s);
    expect(canContinueLoop(s)).toBe(true);
    s = advanceLoop(s);
    expect(canContinueLoop(s)).toBe(false);
  });
});

// ── isNetworkTool ─────────────────────────────────────────────────────────────

describe('isNetworkTool', () => {
  it('returns true for lookup_reference', () => {
    expect(isNetworkTool('lookup_reference')).toBe(true);
  });

  it('returns false for all other tool names', () => {
    for (const name of [
      'compile',
      'read_file',
      'search_project',
      'read_diagnostics',
      'apply_patch',
      'list_assets'
    ]) {
      expect(isNetworkTool(name)).toBe(false);
    }
  });

  it('returns false for an empty string', () => {
    expect(isNetworkTool('')).toBe(false);
  });
});

// ── networkPermissionMessage ──────────────────────────────────────────────────

describe('networkPermissionMessage', () => {
  it('contains the tool name and argument', () => {
    const msg = networkPermissionMessage('lookup_reference', 'Smith 2023');
    expect(msg).toContain('lookup_reference');
    expect(msg).toContain('Smith 2023');
  });

  it('returns a non-empty string for empty arg', () => {
    const msg = networkPermissionMessage('lookup_reference', '');
    expect(msg.length).toBeGreaterThan(0);
  });
});
