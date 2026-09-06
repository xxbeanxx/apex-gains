import { beforeEach, describe, expect, it } from 'vitest';

import { BodyMeasurementsService } from '~application/use-cases/body-measurements-service';
import { Athlete } from '~domain/athlete/athlete';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { sequentialSecrets } from '~domain/shared/secrets';
import { DateOnly } from '~domain/values/date-only';
import { InMemoryBodyMeasurementsRepository } from '~infrastructure/persistence/in-memory/body-measurements-repository';
import { InMemoryUnitOfWork } from '~infrastructure/persistence/in-memory/unit-of-work';

const NOW = new Date('2026-09-03T12:00:00Z');

function athlete(lengthUnit: 'cm' | 'in' = 'in'): Athlete {
  return Athlete.fromSnapshot({
    id: 'user-1',
    googleSub: 'google-1',
    email: 'athlete@example.com',
    name: 'Athlete',
    avatarUrl: null,
    weightUnit: 'lb',
    distanceUnit: 'km',
    lengthUnit,
    showSampleData: true,
    defaultRestSeconds: null,
    timezone: 'UTC',
    isAdmin: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

let entries: InMemoryBodyMeasurementsRepository;
let service: BodyMeasurementsService;

beforeEach(() => {
  entries = new InMemoryBodyMeasurementsRepository();
  service = new BodyMeasurementsService(entries, new InMemoryUnitOfWork(), {
    ids: sequentialIds('entry'),
    clock: fixedClock(NOW),
    secrets: sequentialSecrets('token'),
  });
});

describe('record', () => {
  it('logs a new entry, converting from the athlete unit to canonical centimetres', async () => {
    await service.record(athlete('in'), DateOnly.parse('2026-09-03'), 'waist', 34);

    const saved = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'), 'waist');
    expect(saved).not.toBeNull();
    expect(saved!.value.inCentimetres).toBeCloseTo(86.36, 2);
  });

  it('corrects the existing entry rather than creating a second one for the same day and metric', async () => {
    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 86);
    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 85);

    const recent = await entries.listRecent('user-1', 'waist', 10);
    expect(recent).toHaveLength(1);
    expect(recent[0].value.inCentimetres).toBe(85);
  });

  it('keeps different metrics on the same day as separate entries', async () => {
    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 86);
    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'chest', 102);

    expect(await entries.listRecent('user-1', 'waist', 10)).toHaveLength(1);
    expect(await entries.listRecent('user-1', 'chest', 10)).toHaveLength(1);
  });

  it('keeps the original id when correcting a day', async () => {
    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 86);
    const first = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'), 'waist');

    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 85);
    const second = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'), 'waist');

    expect(second!.id).toBe(first!.id);
  });
});

describe('remove', () => {
  it('deletes the entry for the given day and metric', async () => {
    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 86);
    const entry = await entries.findForDate('user-1', DateOnly.parse('2026-09-03'), 'waist');

    const outcome = await service.remove(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', entry!.id);

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(await entries.findForDate('user-1', DateOnly.parse('2026-09-03'), 'waist')).toBeNull();
  });

  it('silently ignores a stale entryId for a day with no entry', async () => {
    const outcome = await service.remove(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 'nonexistent');
    expect(outcome).toEqual({ ok: true, value: undefined });
  });

  it("silently ignores an entryId that doesn't match that day's entry", async () => {
    await service.record(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 86);

    const outcome = await service.remove(athlete('cm'), DateOnly.parse('2026-09-03'), 'waist', 'someone-elses-id');

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(await entries.findForDate('user-1', DateOnly.parse('2026-09-03'), 'waist')).not.toBeNull();
  });
});
