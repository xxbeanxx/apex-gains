import { describe, expect, it } from 'vitest';

import { Athlete } from '~domain/athlete/athlete';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { Duration } from '~domain/values/duration';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = { ids: sequentialIds('athlete'), clock: fixedClock(NOW) };

const identity = {
  googleSub: 'google-sub-1',
  email: 'athlete@example.com',
  name: 'Athlete',
  avatarUrl: 'https://example.com/avatar.png',
};

describe('register', () => {
  it('mints an id and stamps createdAt/updatedAt from deps', () => {
    const athlete = Athlete.register(identity, deps);

    expect(athlete.id).toBe('athlete-1');
    expect(athlete.googleSub).toBe('google-sub-1');
    expect(athlete.email).toBe('athlete@example.com');
    expect(athlete.name).toBe('Athlete');
    expect(athlete.avatarUrl).toBe('https://example.com/avatar.png');
    expect(athlete.createdAt).toEqual(NOW);
    expect(athlete.updatedAt).toEqual(NOW);
  });

  it('starts on default preferences', () => {
    const athlete = Athlete.register(identity, deps);

    expect(athlete.preferences.weightUnit).toBe('lb');
    expect(athlete.preferences.distanceUnit).toBe('km');
    expect(athlete.preferences.showSampleData).toBe(true);
    expect(athlete.preferences.timezone).toBe('UTC');
  });
});

describe('snapshot round-trip', () => {
  it('restores the same state via fromSnapshot/toSnapshot', () => {
    const original = Athlete.register(identity, deps);
    const restored = Athlete.fromSnapshot(original.toSnapshot());

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });
});

describe('changeUnits', () => {
  it('updates both units and bumps updatedAt', () => {
    const athlete = Athlete.register(identity, deps);
    const later = new Date('2026-09-04T00:00:00Z');

    athlete.changeUnits('kg', 'mi', 'cm', later);

    expect(athlete.preferences.weightUnit).toBe('kg');
    expect(athlete.preferences.distanceUnit).toBe('mi');
    expect(athlete.preferences.lengthUnit).toBe('cm');
    expect(athlete.updatedAt).toEqual(later);
  });

  it('leaves showSampleData untouched', () => {
    const athlete = Athlete.register(identity, deps);
    athlete.changeSampleDataVisibility(false, NOW);

    athlete.changeUnits('kg', 'mi', 'cm', NOW);

    expect(athlete.preferences.showSampleData).toBe(false);
  });
});

describe('changeAdminAccess', () => {
  it('starts a new athlete without admin access', () => {
    expect(Athlete.register(identity, deps).isAdmin).toBe(false);
  });

  it('grants access and bumps updatedAt', () => {
    const athlete = Athlete.register(identity, deps);
    const later = new Date('2026-09-04T12:00:00Z');

    athlete.changeAdminAccess(true, later);

    expect(athlete.isAdmin).toBe(true);
    expect(athlete.updatedAt).toEqual(later);
  });

  it('withdraws access again', () => {
    const athlete = Athlete.register(identity, deps);
    athlete.changeAdminAccess(true, NOW);

    athlete.changeAdminAccess(false, NOW);

    expect(athlete.isAdmin).toBe(false);
  });

  it('carries through a snapshot round-trip', () => {
    const athlete = Athlete.register(identity, deps);
    athlete.changeAdminAccess(true, NOW);

    expect(Athlete.fromSnapshot(athlete.toSnapshot()).isAdmin).toBe(true);
  });
});

describe('changeSampleDataVisibility', () => {
  it('updates the flag and bumps updatedAt', () => {
    const athlete = Athlete.register(identity, deps);
    const later = new Date('2026-09-04T00:00:00Z');

    athlete.changeSampleDataVisibility(false, later);

    expect(athlete.preferences.showSampleData).toBe(false);
    expect(athlete.updatedAt).toEqual(later);
  });
});

describe('changeTimezone', () => {
  it('updates the timezone and bumps updatedAt', () => {
    const athlete = Athlete.register(identity, deps);
    const later = new Date('2026-09-04T00:00:00Z');

    athlete.changeTimezone('America/Toronto', later);

    expect(athlete.preferences.timezone).toBe('America/Toronto');
    expect(athlete.updatedAt).toEqual(later);
  });

  it('carries through a snapshot round-trip', () => {
    const athlete = Athlete.register(identity, deps);
    athlete.changeTimezone('America/Toronto', NOW);

    expect(Athlete.fromSnapshot(athlete.toSnapshot()).preferences.timezone).toBe('America/Toronto');
  });
});

describe('changeRestDuration', () => {
  it('updates the rest duration and bumps updatedAt', () => {
    const athlete = Athlete.register(identity, deps);
    const later = new Date('2026-09-04T00:00:00Z');

    athlete.changeRestDuration(Duration.seconds(90), later);

    expect(athlete.preferences.restDuration?.inSeconds).toBe(90);
    expect(athlete.updatedAt).toEqual(later);
  });

  it('turns the timer off with null, and that carries through a snapshot round-trip', () => {
    const athlete = Athlete.register(identity, deps);
    athlete.changeRestDuration(Duration.seconds(90), NOW);
    athlete.changeRestDuration(null, NOW);

    expect(Athlete.fromSnapshot(athlete.toSnapshot()).preferences.restDuration).toBeNull();
  });
});
