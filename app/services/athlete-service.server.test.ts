import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { InMemoryAthletesRepository } from '~/repositories/in-memory/athletes-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';

import { AthleteService } from './athlete-service.server';

const NOW = new Date('2026-09-04T12:00:00Z');

const googleIdentity = {
  googleSub: 'google-sub-1',
  email: 'athlete@example.com',
  name: 'Athlete',
  avatarUrl: 'https://example.com/avatar.png',
};

let athletes: InMemoryAthletesRepository;
let service: AthleteService;

beforeEach(() => {
  athletes = new InMemoryAthletesRepository();
  service = new AthleteService(athletes, new InMemoryUnitOfWork(), {
    ids: sequentialIds('athlete'),
    clock: fixedClock(NOW),
    secrets: sequentialSecrets('token'),
  });
});

describe('signing in with Google', () => {
  it('registers an athlete the first time a subject is seen', async () => {
    const { athlete, isNew } = await service.signInWithGoogle(googleIdentity);

    expect(isNew).toBe(true);
    expect(athlete.id).toBe('athlete-1');
    expect(athlete.googleSub).toBe('google-sub-1');
    expect(athlete.email).toBe('athlete@example.com');
    expect(athlete.createdAt).toEqual(NOW);
  });

  it('starts a new athlete on the default preferences', async () => {
    const { athlete } = await service.signInWithGoogle(googleIdentity);

    expect(athlete.preferences.weightUnit).toBe('lb');
    expect(athlete.preferences.distanceUnit).toBe('km');
    expect(athlete.preferences.showSampleData).toBe(true);
  });

  it('persists the newly registered athlete', async () => {
    const { athlete } = await service.signInWithGoogle(googleIdentity);

    await expect(athletes.findById(athlete.id)).resolves.not.toBeNull();
  });

  it('returns the existing athlete on every later sign-in', async () => {
    const first = await service.signInWithGoogle(googleIdentity);
    const second = await service.signInWithGoogle(googleIdentity);

    expect(second.isNew).toBe(false);
    expect(second.athlete.id).toBe(first.athlete.id);
  });

  it('does not mint a second athlete for a returning subject', async () => {
    await service.signInWithGoogle(googleIdentity);
    await service.signInWithGoogle({ ...googleIdentity, name: 'Renamed' });

    const found = await athletes.findByGoogleSub('google-sub-1');
    expect(found?.id).toBe('athlete-1');
    // The identity comes from Google on first login and is not re-synced.
    expect(found?.name).toBe('Athlete');
  });

  it('keeps preferences an athlete has already changed', async () => {
    const { athlete } = await service.signInWithGoogle(googleIdentity);
    await service.changeUnits(athlete, 'kg', 'mi');

    const { athlete: returning } = await service.signInWithGoogle(googleIdentity);
    expect(returning.preferences.weightUnit).toBe('kg');
    expect(returning.preferences.distanceUnit).toBe('mi');
  });
});

describe('signing in by email (test login)', () => {
  it('registers on first use and matches by email afterwards', async () => {
    const identity = {
      googleSub: 'test-login:e2e@example.com',
      email: 'e2e@example.com',
      name: 'E2E',
      avatarUrl: null,
    };

    const first = await service.signInWithEmail(identity);
    const second = await service.signInWithEmail(identity);

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.athlete.id).toBe(first.athlete.id);
  });
});

describe('byId', () => {
  it('resolves a registered athlete', async () => {
    const { athlete } = await service.signInWithGoogle(googleIdentity);

    await expect(service.byId(athlete.id)).resolves.toMatchObject({
      id: athlete.id,
    });
  });

  it('returns null for an unknown id', async () => {
    await expect(service.byId('nobody')).resolves.toBeNull();
  });
});
