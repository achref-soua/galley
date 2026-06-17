import { test, expect } from '@playwright/test';

test('the hello window shows the Galley wordmark and tagline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Galley' })).toBeVisible();
  await expect(page.getByText('Pull a proof.')).toBeVisible();
});
