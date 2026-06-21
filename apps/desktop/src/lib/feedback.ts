/**
 * Feedback channel (master plan §7, v0.8.0).
 *
 * Builds the URL that opens a pre-filled GitHub issue for bug reports and
 * feedback, tagged with the running version and OS so reports are actionable.
 * Nothing is sent automatically — the user reviews and submits the issue.
 */

/** Runtime context stamped into a feedback report. */
export interface FeedbackContext {
  /** The running Galley version. */
  version: string;
  /** The OS family. */
  os: string;
}

/** The default issue tracker for feedback. */
export const FEEDBACK_REPO = 'achref-soua/galley';

/** Build a pre-filled "new issue" URL for feedback against `repo`. */
export function buildFeedbackUrl(ctx: FeedbackContext, repo: string = FEEDBACK_REPO): string {
  const title = encodeURIComponent('Feedback: ');
  const body = encodeURIComponent(`\n\n---\nGalley ${ctx.version} · ${ctx.os}`);
  return `https://github.com/${repo}/issues/new?title=${title}&body=${body}`;
}
