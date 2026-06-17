import { test, expect } from '@playwright/test';

test('the workspace shows the wordmark and all three panes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Galley', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Editor', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Preview', { exact: true })).toBeVisible();
  await expect(page.getByText('No project open yet.')).toBeVisible();
});

test('switching the theme repaints the whole app and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Carbon' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carbon');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carbon');
});

test('a pane can be collapsed from the titlebar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide preview' }).click();
  await expect(page.getByLabel('Preview', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show preview' }).click();
  await expect(page.getByLabel('Preview', { exact: true })).toBeVisible();
});

test('open a project, edit a file, and meet the unsaved-changes guard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open a folder…' }).click();

  // The root document opens for editing.
  const editor = page.getByLabel('Source');
  await expect(editor).toBeVisible();
  await editor.fill('an edit that is not saved');

  // Switching files with unsaved edits raises the guard.
  await page.getByRole('button', { name: 'introduction.tex' }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();

  // Discarding moves on to the chosen file.
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
  await expect(page.getByLabel('Source')).toHaveValue(/Introduction/);
});
