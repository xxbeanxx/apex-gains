import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { sequentialIds } from '../shared/ids';
import { AdminAction } from './admin-action';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = { ids: sequentialIds('action'), clock: fixedClock(NOW) };

const actor = { id: 'admin-1', email: 'admin@example.com' };
const target = { id: 'athlete-1', email: 'athlete@example.com' };

describe('record', () => {
  it('mints an id and stamps createdAt from deps', () => {
    const action = AdminAction.record('grant-admin', actor, target, deps);

    expect(action.id).toBe('action-1');
    expect(action.actorId).toBe('admin-1');
    expect(action.actorEmail).toBe('admin@example.com');
    expect(action.targetId).toBe('athlete-1');
    expect(action.targetEmail).toBe('athlete@example.com');
    expect(action.action).toBe('grant-admin');
    expect(action.createdAt).toEqual(NOW);
  });
});

describe('snapshot round-trip', () => {
  it('restores the same state via fromSnapshot/toSnapshot', () => {
    const original = AdminAction.record('remove-account', actor, target, deps);
    const restored = AdminAction.fromSnapshot(original.toSnapshot());

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });

  it('round-trips a null actor or target - the account it named is gone', () => {
    const original = AdminAction.record('remove-account', { id: '', email: 'gone@example.com' }, target, deps);
    const snapshot = { ...original.toSnapshot(), actorId: null };

    const restored = AdminAction.fromSnapshot(snapshot);

    expect(restored.actorId).toBeNull();
    expect(restored.actorEmail).toBe('gone@example.com');
  });
});
