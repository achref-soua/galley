import { describe, it, expect } from 'vitest';
import {
  IMPORT_PHASES,
  phaseLabel,
  phasePercent,
  type ImportPhase
} from '../src/lib/import-progress';

describe('import-progress — phases', () => {
  it('lists the phases in execution order', () => {
    expect(IMPORT_PHASES).toEqual(['extract', 'analyze', 'copy', 'compile', 'done']);
  });
});

describe('import-progress — phaseLabel', () => {
  it('gives an in-voice label for every phase', () => {
    const labels: Record<ImportPhase, string> = {
      extract: 'Unpacking the archive',
      analyze: 'Reading the project',
      copy: 'Bringing files in',
      compile: 'Pulling a first proof',
      done: 'Ready'
    };
    for (const phase of IMPORT_PHASES) {
      expect(phaseLabel(phase)).toBe(labels[phase]);
    }
  });
});

describe('import-progress — phasePercent', () => {
  it('runs from 0 to 100 across the phases', () => {
    expect(phasePercent('extract')).toBe(0);
    expect(phasePercent('analyze')).toBe(25);
    expect(phasePercent('copy')).toBe(50);
    expect(phasePercent('compile')).toBe(75);
    expect(phasePercent('done')).toBe(100);
  });
});
