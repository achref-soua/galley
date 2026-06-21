import { test, expect, type Page } from '@playwright/test';

// The feature flows run as a returning user; the first-run onboarding tour is a
// modal overlay that intercepts clicks until dismissed, and is covered by its own
// test below. Mark onboarding done before each navigation.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('galley:onboarded', 'true'));
});

/**
 * The real first-run entry point is the project dashboard launcher. Open the
 * seeded demo project from it and wait for the editor — this also dismisses the
 * dashboard overlay so the titlebar becomes interactive.
 */
async function openDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Project dashboard' })
    .getByRole('button', { name: 'Open a folder…' })
    .click();
  await expect(page.getByLabel('LaTeX source')).toBeVisible();
}

test('first load shows the wordmark and the project dashboard launcher', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Galley', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Project dashboard' })).toBeVisible();
});

test('opening a project from the dashboard reveals all three panes', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByLabel('Editor', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Preview', { exact: true })).toBeVisible();
});

test('switching the theme repaints the whole app and persists', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Carbon', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carbon');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carbon');
});

test('a pane can be collapsed from the titlebar', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Hide preview' }).click();
  await expect(page.getByLabel('Preview', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show preview' }).click();
  await expect(page.getByLabel('Preview', { exact: true })).toBeVisible();
});

test('edit in the CodeMirror editor and meet the unsaved-changes guard', async ({ page }) => {
  await openDemo(page);
  const editor = page.getByLabel('LaTeX source');
  await editor.click();
  await page.keyboard.type(' an unsaved edit');

  // Switching files with unsaved edits raises the guard.
  await page.getByRole('button', { name: 'introduction.tex' }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();

  // Discarding moves on to the chosen file.
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
  await expect(page.getByLabel('LaTeX source')).toContainText('Introduction');
});

test('compile the open document and see the proof in the preview', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Compile' }).click();

  // The PDF.js preview renders the proof onto a canvas and reports one page.
  await expect(page.getByLabel('Proof')).toBeVisible();
  await expect(page.getByText('1 / 1')).toBeVisible();
});

test('a failed build lists a friendly problem you can jump to', async ({ page }) => {
  await openDemo(page);

  // Replace the document with one that never closes, so the build fails.
  const editor = page.getByLabel('LaTeX source');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('\\documentclass{article}\\begin{document}oops');
  await page.getByRole('button', { name: 'Compile' }).click();

  // The problems panel surfaces a plain-language diagnostic, not a raw log.
  const problem = page.getByRole('button', { name: /document never closes/ });
  await expect(problem).toBeVisible();
  await expect(page.getByText('1 error')).toBeVisible();

  // Jumping to the problem keeps the editor in view (the cursor moves there).
  await problem.click();
  await expect(editor).toBeVisible();
});

test('editing auto-compiles and shows a fresh proof', async ({ page }) => {
  await openDemo(page);
  const editor = page.getByLabel('LaTeX source');
  await editor.click();
  await page.keyboard.type(' edited');

  // No Compile click — the debounced auto-compile produces the proof on its own.
  await expect(page.getByLabel('Proof')).toBeVisible();
});

test('the language server drives completion and the document outline', async ({ page }) => {
  await openDemo(page);
  const editor = page.getByLabel('LaTeX source');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('\\se');

  // The autocomplete popup offers context-aware command completions.
  await expect(page.getByRole('option', { name: /section/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Compiling populates the outline from the language server; a symbol jumps.
  await page.getByRole('button', { name: 'Compile' }).click();
  const symbol = page.getByRole('button', { name: /Introduction/ });
  await expect(symbol).toBeVisible();
  await symbol.click();
  await expect(editor).toBeVisible();
});

test('first run shows the onboarding tour and Skip dismisses it', async ({ page }) => {
  // Undo the returning-user flag from beforeEach so the first-run tour appears.
  await page.addInitScript(() => window.localStorage.removeItem('galley:onboarded'));
  await page.goto('/');

  const tour = page.getByRole('dialog', { name: 'Welcome to Galley' });
  await expect(tour).toBeVisible();

  // Walk one step, then skip; the dashboard launcher is usable afterwards.
  await tour.getByRole('button', { name: 'Next' }).click();
  await tour.getByRole('button', { name: 'Skip' }).click();
  await expect(tour).toBeHidden();
  await expect(page.getByRole('region', { name: 'Project dashboard' })).toBeVisible();
});
