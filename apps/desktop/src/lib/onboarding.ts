/**
 * The first-run onboarding tour model (master plan §7, v0.7.2). Pure: the
 * ordered steps (each referencing i18n keys), first-run persistence, and step
 * navigation helpers. The component renders these; this stays testable.
 */

/** One step of the onboarding tour. */
export interface TourStep {
  /** Stable id for the step. */
  id: string;
  /** i18n key for the step title. */
  titleKey: string;
  /** i18n key for the step body. */
  bodyKey: string;
}

/** The onboarding steps, in order. Includes "import your Overleaf project". */
export const ONBOARDING_STEPS: readonly TourStep[] = [
  { id: 'welcome', titleKey: 'onboarding.welcome.title', bodyKey: 'onboarding.welcome.body' },
  { id: 'editor', titleKey: 'onboarding.editor.title', bodyKey: 'onboarding.editor.body' },
  { id: 'compile', titleKey: 'onboarding.compile.title', bodyKey: 'onboarding.compile.body' },
  { id: 'import', titleKey: 'onboarding.import.title', bodyKey: 'onboarding.import.body' },
  { id: 'ai', titleKey: 'onboarding.ai.title', bodyKey: 'onboarding.ai.body' }
];

/** localStorage key recording that the tour has been completed or skipped. */
export const ONBOARDING_STORAGE_KEY = 'galley:onboarded';

/** Whether the user has already finished or skipped the tour. */
export function hasOnboarded(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
}

/** Record that the tour is done so it never shows again. */
export function markOnboarded(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(ONBOARDING_STORAGE_KEY, 'true');
}

/** Whether `index` is the last step. */
export function isLastStep(index: number): boolean {
  return index >= ONBOARDING_STEPS.length - 1;
}

/** Clamp `index` into the valid step range. */
export function clampStep(index: number): number {
  if (index < 0) {
    return 0;
  }
  const last = ONBOARDING_STEPS.length - 1;
  return index > last ? last : index;
}
