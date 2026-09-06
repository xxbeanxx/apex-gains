import { describe, expect, it } from 'vitest';

import { LibraryVisibility, Ownership } from '~domain/shared/ownership';

describe('Ownership.sample', () => {
  it('has a null userId and is a sample', () => {
    const ownership = Ownership.sample();

    expect(ownership.userId).toBeNull();
    expect(ownership.isSample).toBe(true);
  });
});

describe('Ownership.of', () => {
  it('is owned by the given user and is not a sample', () => {
    const ownership = Ownership.of('user-1');

    expect(ownership.userId).toBe('user-1');
    expect(ownership.isSample).toBe(false);
    expect(ownership.isOwnedBy('user-1')).toBe(true);
    expect(ownership.isOwnedBy('user-2')).toBe(false);
  });
});

describe('Ownership.fromUserId', () => {
  it('reads a null userId as a sample', () => {
    expect(Ownership.fromUserId(null).isSample).toBe(true);
  });

  it('reads a non-null userId as owned by that user', () => {
    const ownership = Ownership.fromUserId('user-1');

    expect(ownership.isSample).toBe(false);
    expect(ownership.isOwnedBy('user-1')).toBe(true);
  });
});

describe('isVisibleTo', () => {
  it('is visible to everyone when it is a sample', () => {
    const ownership = Ownership.sample();

    expect(ownership.isVisibleTo('user-1')).toBe(true);
    expect(ownership.isVisibleTo('user-2')).toBe(true);
  });

  it('is visible only to the owner when it is owned', () => {
    const ownership = Ownership.of('user-1');

    expect(ownership.isVisibleTo('user-1')).toBe(true);
    expect(ownership.isVisibleTo('user-2')).toBe(false);
  });
});

describe('LibraryVisibility', () => {
  const own = { id: 'own-1', userId: 'user-1', forkedFromId: null };
  const sample = { id: 'sample-1', userId: null, forkedFromId: null };
  const otherSample = { id: 'sample-2', userId: null, forkedFromId: null };
  const fork = { id: 'fork-1', userId: 'user-1', forkedFromId: 'sample-1' };
  const someoneElses = { id: 'theirs-1', userId: 'user-2', forkedFromId: null };

  it("shows only the user's own rows when samples are excluded", () => {
    const visible = LibraryVisibility.for('user-1', false).selectFrom([own, sample, fork, someoneElses]);

    expect(visible).toEqual([own, fork]);
  });

  it('shows own rows plus unforked samples when samples are included', () => {
    const visible = LibraryVisibility.for('user-1', true).selectFrom([own, sample, otherSample, someoneElses]);

    expect(visible).toEqual([own, sample, otherSample]);
  });

  it('hides a sample the user has already forked, so it is not listed twice', () => {
    const visible = LibraryVisibility.for('user-1', true).selectFrom([sample, otherSample, fork]);

    expect(visible).toEqual([otherSample, fork]);
  });

  it('ignores forks belonging to someone else', () => {
    const theirFork = { id: 'fork-2', userId: 'user-2', forkedFromId: 'sample-1' };
    const visible = LibraryVisibility.for('user-1', true).selectFrom([sample, theirFork]);

    expect(visible).toEqual([sample]);
  });

  it("never shows another user's rows, sample data on or off", () => {
    for (const showSamples of [true, false]) {
      expect(LibraryVisibility.for('user-1', showSamples).selectFrom([someoneElses])).toEqual([]);
    }
  });

  it('preserves the order it was given, so the caller still sorts', () => {
    const visible = LibraryVisibility.for('user-1', true).selectFrom([sample, own, otherSample]);

    expect(visible.map((record) => record.id)).toEqual(['sample-1', 'own-1', 'sample-2']);
  });

  describe('forkedSampleIds', () => {
    it("collects the samples this user has forked, and no one else's", () => {
      const theirFork = { id: 'fork-2', userId: 'user-2', forkedFromId: 'sample-2' };
      const ids = LibraryVisibility.for('user-1', true).forkedSampleIds([fork, theirFork, own]);

      expect([...ids]).toEqual(['sample-1']);
    });
  });
});
