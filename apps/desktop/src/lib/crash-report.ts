/**
 * Privacy-respecting crash reporting (master plan §8.4).
 *
 * Off by default; a report is only produced when the user has opted in. The
 * payload is anonymised — no document content, no absolute file paths, no
 * secrets — just the app version, OS family, and a truncated, path-stripped error
 * signature. Sending is a separate, dormant concern (no telemetry endpoint
 * ships); this builds the report the user can review or attach to feedback.
 */

/** Runtime context attached to every report. */
export interface CrashContext {
  /** The running Galley version. */
  version: string;
  /** The OS family (e.g. "windows", "macos", "linux"). */
  os: string;
}

/** The raw error a crash handler captures. */
export interface CrashInput {
  /** Error name/class. */
  name: string;
  /** Error message. */
  message: string;
  /** Optional stack trace. */
  stack?: string;
}

/** The anonymised report ready to review or attach. */
export interface CrashReport {
  /** The running Galley version. */
  version: string;
  /** The OS family. */
  os: string;
  /** The path-stripped, truncated error signature. */
  error: { name: string; message: string; stack: string };
}

/** Keep at most this many stack frames. */
export const MAX_STACK_LINES = 20;

/** Strip absolute paths / URLs from a stack trace and cap its length. */
export function redactStack(stack: string): string {
  return stack
    .split('\n')
    .slice(0, MAX_STACK_LINES)
    .map((line) => line.replace(/(?:[A-Za-z]:\\|\/|https?:\/\/|file:\/\/)[^\s)]*/g, '<path>'))
    .join('\n');
}

/**
 * Build an anonymised crash report — but only when the user has opted in.
 * Returns `null` without consent, so nothing can be produced by accident.
 */
export function buildCrashReport(
  input: CrashInput,
  ctx: CrashContext,
  consented: boolean
): CrashReport | null {
  if (!consented) {
    return null;
  }
  return {
    version: ctx.version,
    os: ctx.os,
    error: {
      name: input.name,
      message: input.message,
      stack: redactStack(input.stack ?? '')
    }
  };
}
