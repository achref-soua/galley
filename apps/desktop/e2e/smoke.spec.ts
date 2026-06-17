import { test, expect } from '@playwright/test';

test('the workspace shows the wordmark and all three panes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Galley')).toBeVisible();
  await expect(page.getByLabel('Editor')).toBeVisible();
  await expect(page.getByLabel('Preview')).toBeVisible();
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
  await expect(page.getByLabel('Preview')).toBeHidden();
  await page.getByRole('button', { name: 'Show preview' }).click();
  await expect(page.getByLabel('Preview')).toBeVisible();
});
