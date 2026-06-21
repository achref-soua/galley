import { test, expect, type Page } from '@playwright/test';

// Records the demo walkthrough as a video. Playwright writes the .webm into
// test-results/; `just demo` copies it to docs/assets/ and renders a GIF. The web
// build's in-memory compile returns a real pre-rendered proof of the sample
// below, so the preview is a genuine PDF.js rendering; the packaged app compiles
// every document for real with the embedded Tectonic engine.
test.use({
  video: { mode: 'on', size: { width: 1280, height: 800 } }
});

const SAMPLE = `\\documentclass{article}
\\title{Pull a Proof}
\\author{Galley}
\\date{}
\\begin{document}
\\maketitle
\\section{Introduction}\\label{sec:intro}
Galley sets your source in type and pulls a live proof. The mass--energy
relation,
\\begin{equation}
  E = mc^2,
\\end{equation}
follows from the postulates of special relativity. See Section~\\ref{sec:intro}.
\\section{Method}
Edit on the left; the proof on the right refreshes as you type.
\\end{document}`;

async function beat(page: Page, ms = 900): Promise<void> {
  await page.waitForTimeout(ms);
}

test('galley demo walkthrough', async ({ page }) => {
  // Returning user (skip the tour) so the walkthrough goes straight to work.
  await page.addInitScript(() => window.localStorage.setItem('galley:onboarded', 'true'));
  await page.goto('/');

  // 1. The launcher.
  await expect(page.getByRole('region', { name: 'Project dashboard' })).toBeVisible();
  await beat(page);

  // 2. Open the demo project.
  await page
    .getByRole('region', { name: 'Project dashboard' })
    .getByRole('button', { name: 'Open a folder…' })
    .click();
  await expect(page.getByLabel('LaTeX source')).toBeVisible();
  await beat(page);

  // 3. Write a document — typed live for the recording.
  const editor = page.getByLabel('LaTeX source');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(SAMPLE, { delay: 12 });
  await beat(page);

  // 4. Compile and show the proof + the populated structure outline.
  await page.getByRole('button', { name: 'Compile' }).click();
  await expect(page.getByLabel('Proof')).toBeVisible();
  await beat(page);

  // 5. Switch the theme to Carbon from Settings.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await beat(page, 600);
  await page.getByRole('radio', { name: 'Carbon', exact: true }).click();
  await beat(page, 600);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
  await beat(page);

  // 6. Settle on the editor in the dark theme.
  await editor.click();
  await beat(page, 1200);
});
