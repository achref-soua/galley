import { describe, it, expect } from 'vitest';
import { buildFeedbackUrl, FEEDBACK_REPO } from '../src/lib/feedback';

describe('feedback — buildFeedbackUrl', () => {
  it('targets the default repo and stamps version and OS', () => {
    const url = buildFeedbackUrl({ version: '0.8.0', os: 'linux' });
    expect(url.startsWith(`https://github.com/${FEEDBACK_REPO}/issues/new?`)).toBe(true);
    expect(decodeURIComponent(url)).toContain('Galley 0.8.0 · linux');
  });

  it('honours a custom repo', () => {
    const url = buildFeedbackUrl({ version: '1.0.0', os: 'macos' }, 'me/fork');
    expect(url).toContain('https://github.com/me/fork/issues/new?');
  });
});
