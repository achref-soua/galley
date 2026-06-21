import { describe, it, expect } from 'vitest';
import { redactStack, buildCrashReport, MAX_STACK_LINES } from '../src/lib/crash-report';

describe('crash-report — redactStack', () => {
  it('strips absolute paths and URLs from frames', () => {
    const stack = [
      'Error: boom',
      '    at render (/home/user/galley/src/App.svelte:42:7)',
      '    at fn (https://localhost:1420/assets/index.js:10:3)',
      '    at g (C:\\Users\\me\\app\\main.js:1:1)'
    ].join('\n');
    const out = redactStack(stack);
    expect(out).not.toContain('/home/user');
    expect(out).not.toContain('https://localhost');
    expect(out).not.toContain('C:\\Users');
    expect(out).toContain('<path>');
  });

  it('truncates to the maximum number of frames', () => {
    const stack = Array.from({ length: MAX_STACK_LINES + 10 }, (_, i) => `line ${i}`).join('\n');
    expect(redactStack(stack).split('\n')).toHaveLength(MAX_STACK_LINES);
  });
});

describe('crash-report — buildCrashReport', () => {
  const ctx = { version: '0.8.0', os: 'linux' };

  it('returns null without consent', () => {
    expect(buildCrashReport({ name: 'Error', message: 'x' }, ctx, false)).toBeNull();
  });

  it('builds an anonymised report with consent', () => {
    const report = buildCrashReport(
      { name: 'TypeError', message: 'bad', stack: 'at f (/abs/path.js:1:1)' },
      ctx,
      true
    );
    expect(report).not.toBeNull();
    expect(report!.version).toBe('0.8.0');
    expect(report!.os).toBe('linux');
    expect(report!.error.name).toBe('TypeError');
    expect(report!.error.stack).toContain('<path>');
  });

  it('tolerates a missing stack', () => {
    const report = buildCrashReport({ name: 'Error', message: 'x' }, ctx, true);
    expect(report!.error.stack).toBe('');
  });
});
