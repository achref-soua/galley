import type { Messages } from '../i18n';

/**
 * The English message catalog — Galley's source-of-truth strings. Keys are
 * dot-namespaced by surface (`onboarding.*`, `app.*`, …). Other locales mirror
 * these keys; missing entries fall back to this catalog.
 */
export const en: Messages = {
  // App shell
  'app.name': 'Galley',
  'app.tagline': 'Pull a proof.',

  // Onboarding tour
  'onboarding.skip': 'Skip',
  'onboarding.back': 'Back',
  'onboarding.next': 'Next',
  'onboarding.done': 'Start typing',
  'onboarding.welcome.title': 'Welcome to Galley',
  'onboarding.welcome.body':
    'A local-first LaTeX studio. Everything here works offline, and nothing leaves your machine unless you ask it to.',
  'onboarding.editor.title': 'Two doors, one room',
  'onboarding.editor.body':
    'Write in the code editor or flip to the visual view — both edit the same source. Switch freely, lose nothing.',
  'onboarding.compile.title': 'Pull a proof',
  'onboarding.compile.body':
    'Galley recompiles as you type and keeps the last proof on screen until the new one is ready. A medium document rebuilds in under a second.',
  'onboarding.import.title': 'Import your Overleaf project',
  'onboarding.import.body':
    'Bring an existing project in from a folder, an Overleaf or arXiv archive, or a git URL — Galley reads it without touching the original and round-trips back out clean.',
  'onboarding.ai.title': 'AI you control',
  'onboarding.ai.body':
    'Bring your own key for any provider, cloud or local. Nothing is branded or on by default, and every change is reversible.',

  // Accessibility
  'a11y.skipToEditor': 'Skip to editor'
};
