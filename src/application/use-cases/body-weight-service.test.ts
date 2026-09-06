import { beforeEach, describe, expect, it } from 'vitest';

import { BodyWeightService } from '~application/use-cases/body-weight-service';
import { Athlete } from '~domain/athlete/athlete';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { sequentialSecrets } from '~domain/shared/secrets';
import { DateOnly } from '~domain/values/date-only';
import { InMemoryBodyWeightRepository } from '~infrastructure/persistence/in-memory/body-weight-repository';
import { InMemoryUnitOfWork } from '~infrastructure/persistence/in-memory/unit-of-work';

const NOW = new Date('2026-09-03T12:00:00Z');

function athlete(weightUnit: 'lb' | 'kg' = 'lb'): Athlete {
  const a = Athlete.fromSnapshot({
    id: 'user-1',
    googleSub: 'google-1',
    email: 'athlete@example.com',
    name: 'Athlete',
    avatarUrl: null,
    weightUnit,
    distanceUnit: 'km',
    lengthUnit: 'in',
    showSampleData: true,
    defaultRestSeconds: null,
    timezone: 'UTC',
    isAdmin: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return a;
}

let entries: InMemoryBodyWeightRepository;
let service: BodyWeightService;

beforeEach(() => {
  entries = new InMemoryBodyWeightRepository();
  service = new BodyWeightService(entries, new InMemoryUnitOfWork(), {
    ids: sequentialIds('entry'),
    clock: fixedClock(NOW),
    secrets: sequentialSecrets('token'),
  });
});

describe('record', () => {
  it('logs a new entry, converting from the athlete unit to canonical pounds', async () => {
    await service.record(athlete('kg'), DateOnly.parse('2026-09-03'), 90);

    const saved = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'));
    expect(saved).not.toBeNull();
    // Rounds through the `numeric(6,2)` storage column (pounds, two decimals).
    expect(saved!.weight.inKilograms).toBeCloseTo(90, 2);
  });

  it('corrects the existing entry rather than creating a second one for the same day', async () => {
    await service.record(athlete(), DateOnly.parse('2026-09-03'), 185);
    await service.record(athlete(), DateOnly.parse('2026-09-03'), 184);

    const recent = await entries.listRecent('user-1', 10);
    expect(recent).toHaveLength(1);
    expect(recent[0].weight.inPounds).toBe(184);
  });

  it('keeps the original id when correcting a day', async () => {
    await service.record(athlete(), DateOnly.parse('2026-09-03'), 185);
    const first = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'));

    await service.record(athlete(), DateOnly.parse('2026-09-03'), 184);
    const second = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'));

    expect(second!.id).toBe(first!.id);
  });
});

describe('remove', () => {
  it('deletes the entry for the given day', async () => {
    await service.record(athlete(), DateOnly.parse('2026-09-03'), 185);
    const entry = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'));

    const outcome = await service.remove(athlete(), DateOnly.parse('2026-09-03'), entry!.id);

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(await entries.findForDate('user-1', DateOnly.parse('2026-09-03'))).toBeNull();
  });

  it('silently ignores a stale entryId for a day with no entry', async () => {
    const outcome = await service.remove(athlete(), DateOnly.parse('2026-09-03'), 'nonexistent');
    expect(outcome).toEqual({ ok: true, value: undefined });
  });

  it("silently ignores an entryId that doesn't match that day's entry", async () => {
    await service.record(athlete(), DateOnly.parse('2026-09-03'), 185);

    const outcome = await service.remove(athlete(), DateOnly.parse('2026-09-03'), 'someone-elses-id');

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(await entries.findForDate('user-1', DateOnly.parse('2026-09-03'))).not.toBeNull();
  });
});
