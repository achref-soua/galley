/**
 * A tiny, pure progress model for the import wizard (master plan §4.7, §8.2):
 * the ordered phases of bringing a project in, an in-voice label for each, and
 * the overall completion percent — so the wizard can report progress while a
 * large project is unpacked, analysed, copied, and proofed.
 */

/** The ordered phases of an import. */
export type ImportPhase = 'extract' | 'analyze' | 'copy' | 'compile' | 'done';

/** Every phase, in execution order. */
export const IMPORT_PHASES: readonly ImportPhase[] = [
  'extract',
  'analyze',
  'copy',
  'compile',
  'done'
];

/** A human, in-voice label for a phase. */
export function phaseLabel(phase: ImportPhase): string {
  switch (phase) {
    case 'extract':
      return 'Unpacking the archive';
    case 'analyze':
      return 'Reading the project';
    case 'copy':
      return 'Bringing files in';
    case 'compile':
      return 'Pulling a first proof';
    case 'done':
      return 'Ready';
  }
}

/** Overall completion percent (0–100) for a phase, rounded to the nearest whole. */
export function phasePercent(phase: ImportPhase): number {
  const index = IMPORT_PHASES.indexOf(phase);
  return Math.round((index / (IMPORT_PHASES.length - 1)) * 100);
}
