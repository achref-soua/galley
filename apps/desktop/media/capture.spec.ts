import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Regenerates the marketing screenshots into docs/assets/. Run with
// `just screenshots`. The web UI uses stub backends, so the preview shows a
// placeholder proof; the editor, chrome, themes, dashboard, and dialogs are real.
const OUT = '../../docs/assets';
mkdirSync(OUT, { recursive: true });

/** Seed localStorage before the app boots (theme, onboarding state). */
async function seed(page: Page, theme: string, onboarded = true): Promise<void> {
  await page.addInitScript(
    ([t, o]) => {
      window.localStorage.setItem('galley:theme', t as string);
      if (o) {
        window.localStorage.setItem('galley:onboarded', 'true');
      } else {
        window.localStorage.removeItem('galley:onboarded');
      }
    },
    [theme, onboarded]
  );
}

/** Open the seeded demo project from the launcher and compile a proof. */
async function openDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Project dashboard' })
    .getByRole('button', { name: 'Open a folder…' })
    .click();
  await expect(page.getByLabel('LaTeX source')).toBeVisible();
  await page.getByRole('button', { name: 'Compile' }).click();
  await expect(page.getByLabel('Proof')).toBeVisible();
}

test('dashboard launcher', async ({ page }) => {
  await seed(page, 'onionskin');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Project dashboard' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/dashboard.png` });
});

test('first-run onboarding tour', async ({ page }) => {
  await seed(page, 'onionskin', false);
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Welcome to Galley' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/onboarding.png` });
});

/** A richer sample document so the editor reads like real work in the hero. */
const SAMPLE = `\\documentclass{article}
\\usepackage{amsmath}
\\title{Pull a Proof}
\\author{Galley}
\\begin{document}
\\maketitle
\\section{Introduction}\\label{sec:intro}
Galley sets your source in type and pulls a live proof. The mass--energy
relation,
\\begin{equation}
  E = mc^2,
\\end{equation}
follows from the postulates of special relativity. See Section~\\ref{sec:intro}.
\\end{document}`;

test('editor — Onionskin (hero)', async ({ page }) => {
  await seed(page, 'onionskin');
  await openDemo(page);
  const editor = page.getByLabel('LaTeX source');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(SAMPLE);
  await page.keyboard.press('ControlOrMeta+Home'); // show the document top
  // Editor-focused shot: hide the preview (the web build renders a stub proof).
  await page.getByRole('button', { name: 'Hide preview' }).click();
  await page.screenshot({ path: `${OUT}/editor-onionskin.png` });
});

test('editor — Carbon', async ({ page }) => {
  await seed(page, 'carbon');
  await openDemo(page);
  await page.getByRole('button', { name: 'Hide preview' }).click();
  await page.screenshot({ path: `${OUT}/editor-carbon.png` });
});

test('editor — Carbon High-Contrast', async ({ page }) => {
  await seed(page, 'carbon-hc');
  await openDemo(page);
  await page.getByRole('button', { name: 'Hide preview' }).click();
  await page.screenshot({ path: `${OUT}/editor-carbon-hc.png` });
});

test('settings — appearance', async ({ page }) => {
  await seed(page, 'onionskin');
  await openDemo(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/settings.png` });
});
