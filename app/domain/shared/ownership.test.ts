import { describe, expect, it } from 'vitest';

import { Ownership } from './ownership';

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

describe('equals', () => {
  it('is equal when both sides are the same sample', () => {
    expect(Ownership.sample().equals(Ownership.sample())).toBe(true);
  });

  it('is equal when both sides are owned by the same user', () => {
    expect(Ownership.of('user-1').equals(Ownership.of('user-1'))).toBe(true);
  });

  it('is not equal across different users, or a user and a sample', () => {
    expect(Ownership.of('user-1').equals(Ownership.of('user-2'))).toBe(false);
    expect(Ownership.of('user-1').equals(Ownership.sample())).toBe(false);
  });
});
