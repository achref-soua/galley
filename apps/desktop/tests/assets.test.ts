import { describe, it, expect } from 'vitest';
import { isImageExt, assetSnippet, needsGraphicspath, insertGraphicspath } from '../src/lib/assets';

describe('isImageExt', () => {
  it('returns true for lowercase image extensions', () => {
    expect(isImageExt('photo.png')).toBe(true);
    expect(isImageExt('image.jpg')).toBe(true);
    expect(isImageExt('image.jpeg')).toBe(true);
    expect(isImageExt('icon.gif')).toBe(true);
    expect(isImageExt('diagram.bmp')).toBe(true);
    expect(isImageExt('logo.svg')).toBe(true);
    expect(isImageExt('scan.tif')).toBe(true);
    expect(isImageExt('scan.tiff')).toBe(true);
  });

  it('returns true for uppercase and mixed-case extensions', () => {
    expect(isImageExt('photo.PNG')).toBe(true);
    expect(isImageExt('img.JPG')).toBe(true);
    expect(isImageExt('Logo.Svg')).toBe(true);
  });

  it('returns false for non-image files', () => {
    expect(isImageExt('main.tex')).toBe(false);
    expect(isImageExt('refs.bib')).toBe(false);
    expect(isImageExt('data.csv')).toBe(false);
    expect(isImageExt('document.pdf')).toBe(false);
  });

  it('returns false when there is no extension', () => {
    expect(isImageExt('noextension')).toBe(false);
  });
});

describe('assetSnippet', () => {
  it('wraps a simple path in includegraphics', () => {
    expect(assetSnippet('assets/fig.png')).toBe(
      '\\includegraphics[width=\\linewidth]{assets/fig.png}'
    );
  });

  it('wraps a nested path correctly', () => {
    expect(assetSnippet('assets/figs/plot.pdf')).toBe(
      '\\includegraphics[width=\\linewidth]{assets/figs/plot.pdf}'
    );
  });
});

describe('needsGraphicspath', () => {
  it('returns false when there is no \\includegraphics', () => {
    expect(needsGraphicspath('\\documentclass{article}\n\\begin{document}\n')).toBe(false);
  });

  it('returns true when \\includegraphics is present but \\graphicspath is not', () => {
    expect(
      needsGraphicspath('\\documentclass{article}\n\\includegraphics[width=\\linewidth]{fig.png}')
    ).toBe(true);
  });

  it('returns false when both \\includegraphics and \\graphicspath are present', () => {
    expect(
      needsGraphicspath('\\graphicspath{{assets/}}\n\\includegraphics[width=\\linewidth]{fig.png}')
    ).toBe(false);
  });
});

describe('insertGraphicspath', () => {
  it('inserts before \\begin{document}', () => {
    const src =
      '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nhello\n\\end{document}';
    const out = insertGraphicspath(src);
    expect(out).toContain('\\graphicspath{{assets/}}\n\\begin{document}');
    expect(out).toContain('\\documentclass{article}');
    expect(out).toContain('\\end{document}');
  });

  it('appends at the end when \\begin{document} is absent', () => {
    const src = '\\documentclass{article}';
    const out = insertGraphicspath(src);
    expect(out).toBe('\\documentclass{article}\n\\graphicspath{{assets/}}\n');
  });
});
