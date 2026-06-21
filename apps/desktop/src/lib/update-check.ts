/**
 * Update-availability logic for the optional auto-updater (master plan §4.8).
 *
 * Pure semantic-version comparison so the UI can decide whether a newer release
 * exists and offer a skippable prompt. The actual download / signature-verify /
 * apply is the Tauri updater's job, enabled when a signing key is configured.
 */

/** A parsed `MAJOR.MINOR.PATCH` version. */
export interface Version {
  /** Major version. */
  major: number;
  /** Minor version. */
  minor: number;
  /** Patch version. */
  patch: number;
}

/** Parse `MAJOR.MINOR.PATCH`; returns `null` for anything else. */
export function parseVersion(value: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (match === null) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Compare two versions: negative if `a < b`, positive if `a > b`, else 0. */
export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

/** Whether `latest` is a strictly newer release than `current`. */
export function isUpdateAvailable(current: string, latest: string): boolean {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  if (c === null || l === null) {
    return false;
  }
  return compareVersions(l, c) > 0;
}
