import { describe, it, expect } from 'vitest';
import { parseVersion, compareVersions, isUpdateAvailable } from '../src/lib/update-check';

describe('update-check — parseVersion', () => {
  it('parses a well-formed version', () => {
    expect(parseVersion(' 1.2.3 ')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('rejects anything malformed', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('v1.2.3')).toBeNull();
    expect(parseVersion('x')).toBeNull();
  });
});

describe('update-check — compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(
      compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 })
    ).toBeGreaterThan(0);
    expect(
      compareVersions({ major: 1, minor: 1, patch: 0 }, { major: 1, minor: 2, patch: 0 })
    ).toBeLessThan(0);
    expect(
      compareVersions({ major: 1, minor: 1, patch: 5 }, { major: 1, minor: 1, patch: 5 })
    ).toBe(0);
    expect(
      compareVersions({ major: 1, minor: 1, patch: 6 }, { major: 1, minor: 1, patch: 5 })
    ).toBeGreaterThan(0);
  });
});

describe('update-check — isUpdateAvailable', () => {
  it('is true only when latest is strictly newer', () => {
    expect(isUpdateAvailable('0.7.2', '0.7.3')).toBe(true);
    expect(isUpdateAvailable('0.7.3', '0.7.3')).toBe(false);
    expect(isUpdateAvailable('0.8.0', '0.7.9')).toBe(false);
  });

  it('is false when either version is unparseable', () => {
    expect(isUpdateAvailable('bad', '0.7.3')).toBe(false);
    expect(isUpdateAvailable('0.7.2', 'bad')).toBe(false);
  });
});
