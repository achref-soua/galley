import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// Renders docs/assets/install.png from the REAL install-script output (demo mode),
// so the terminal screenshot in the README never drifts from the installer. Run
// via `just install-shot`.
const OUT = '../../docs/assets';
mkdirSync(OUT, { recursive: true });

/** Convert the installer's truecolor ANSI (only `38;2;r;g;b` + reset) to HTML. */
function ansiToHtml(input: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // ESC built from a char code so the source has no control-character literal.
  const re = new RegExp(String.fromCharCode(27) + '\\[(0|38;2;\\d+;\\d+;\\d+)m', 'g');
  let html = '';
  let last = 0;
  let open = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    html += esc(input.slice(last, m.index));
    last = re.lastIndex;
    if (open) {
      html += '</span>';
      open = false;
    }
    if (m[1] !== '0') {
      const parts = m[1].split(';');
      html += `<span style="color:rgb(${parts[2]},${parts[3]},${parts[4]})">`;
      open = true;
    }
  }
  html += esc(input.slice(last));
  if (open) html += '</span>';
  return html;
}

test('installer terminal screenshot', async ({ page }) => {
  const ansi = execFileSync('sh', ['../../scripts/install/install.sh'], {
    encoding: 'utf8',
    env: { ...process.env, GALLEY_INSTALL_DEMO: '1', GALLEY_VERSION: '0.9.2' }
  });

  const body = ansiToHtml(ansi);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#0d0c0a">
    <div class="term" style="display:inline-block;background:#141210;color:#ece3d0;
         padding:22px 26px;border-radius:10px;font-family:'DejaVu Sans Mono','Cascadia Mono',monospace;
         font-size:15px;line-height:1.32;white-space:pre">
      <div style="color:#9a8e7e;margin-bottom:10px">$ curl -fsSL https://github.com/achref-soua/galley/releases/latest/download/install.sh | sh</div>${body}</div>
  </body></html>`);

  await page.locator('.term').screenshot({ path: `${OUT}/install.png` });
});
