import { describe, it, expect } from 'vitest';
import {
  createReviewEntry,
  applyReject,
  acceptEntries,
  rejectEntries,
  pendingCount,
  type ReviewEntry
} from '../src/lib/review';

function entry(over: Partial<ReviewEntry> = {}): ReviewEntry {
  return createReviewEntry(
    over.id ?? 'e1',
    over.from ?? 5,
    over.to ?? 10,
    over.before ?? 'OLD',
    over.after ?? 'NEW'
  );
}

describe('createReviewEntry', () => {
  it('constructs an entry with all supplied fields', () => {
    const e = createReviewEntry('x1', 3, 7, 'before', 'after');
    expect(e).toEqual({ id: 'x1', from: 3, to: 7, before: 'before', after: 'after' });
  });

  it('creates distinct entries for different ids', () => {
    const a = createReviewEntry('a', 0, 1, 'x', 'y');
    const b = createReviewEntry('b', 0, 1, 'x', 'y');
    expect(a.id).not.toBe(b.id);
  });
});

describe('applyReject', () => {
  it('replaces [from, to) with the before text', () => {
    const src = 'Hello NEW world';
    const e = createReviewEntry('e1', 6, 9, 'OLD', 'NEW');
    expect(applyReject(src, e)).toBe('Hello OLD world');
  });

  it('handles rejection at the start of the string', () => {
    const src = 'NEW rest';
    const e = createReviewEntry('e1', 0, 3, 'OLD', 'NEW');
    expect(applyReject(src, e)).toBe('OLD rest');
  });

  it('handles rejection at the end of the string', () => {
    const src = 'start NEW';
    const e = createReviewEntry('e1', 6, 9, 'OLD', 'NEW');
    expect(applyReject(src, e)).toBe('start OLD');
  });

  it('handles empty before (deletion of text)', () => {
    const src = 'abcde';
    const e = createReviewEntry('e1', 2, 4, '', 'CD');
    expect(applyReject(src, e)).toBe('abe');
  });
});

describe('acceptEntries', () => {
  it('removes the entry with the matching id', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2' }), entry({ id: 'e3' })];
    const result = acceptEntries(entries, 'e2');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('returns the same array when the id is not found', () => {
    const entries = [entry({ id: 'e1' })];
    const result = acceptEntries(entries, 'missing');
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when the only entry is accepted', () => {
    const entries = [entry({ id: 'e1' })];
    const result = acceptEntries(entries, 'e1');
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2' })];
    acceptEntries(entries, 'e1');
    expect(entries).toHaveLength(2);
  });
});

describe('rejectEntries', () => {
  it('removes the entry and reverts the source change', () => {
    const src = 'Hello NEW world';
    const e = createReviewEntry('e1', 6, 9, 'OLD', 'NEW');
    const { entries, src: newSrc } = rejectEntries([e], 'e1', src);
    expect(entries).toHaveLength(0);
    expect(newSrc).toBe('Hello OLD world');
  });

  it('returns inputs unchanged when the id is not found', () => {
    const src = 'unchanged';
    const e = entry({ id: 'e1' });
    const result = rejectEntries([e], 'missing', src);
    expect(result.entries).toHaveLength(1);
    expect(result.src).toBe('unchanged');
  });

  it('rejects one entry from a multi-entry queue, leaving others intact', () => {
    const src = 'aXXb';
    const e1 = createReviewEntry('e1', 1, 3, 'BC', 'XX');
    const e2 = createReviewEntry('e2', 3, 4, 'C', 'b');
    const { entries, src: newSrc } = rejectEntries([e1, e2], 'e1', src);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('e2');
    expect(newSrc).toBe('aBCb');
  });

  it('src is unchanged when before === after (no-op entry)', () => {
    const src = 'hello';
    const e = createReviewEntry('e1', 0, 5, 'hello', 'hello');
    const { src: newSrc } = rejectEntries([e], 'e1', src);
    expect(newSrc).toBe('hello');
  });
});

describe('pendingCount', () => {
  it('returns 0 for an empty queue', () => {
    expect(pendingCount([])).toBe(0);
  });

  it('returns the length of the queue', () => {
    expect(pendingCount([entry(), entry(), entry()])).toBe(3);
  });
});
