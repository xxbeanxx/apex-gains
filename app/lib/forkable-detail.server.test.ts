import { describe, expect, it, vi } from 'vitest';
import type { Athlete } from '~domain/athlete/athlete';
import { err, ok } from '~domain/shared/result';
import { mock } from '~test/mock';

import { type ForkableDetail, forkableDetail } from '~/lib/forkable-detail';
import { type ForkableUseCases, forkableHandlers } from '~/lib/forkable-detail.server';
import { dispatch } from '~/lib/intent.server';

const page: ForkableDetail = forkableDetail({
  noun: 'Plan',
  indexPath: '/plans',
  pathFor: (id) => `/plans/${id}`,
});

const athlete = mock<Athlete>({ id: 'user-1' });

/**
 * Every use case succeeding in place, for a test to override the one it is about.
 */
function useCases(overrides: Partial<ForkableUseCases> = {}): ForkableUseCases {
  return {
    remove: async () => ok(),
    revert: async () => ok({ forkedFromId: 'sample-1' }),
    duplicate: async () => ok({ id: 'copy-1' }),
    rename: async () => ok({ forkedId: null }),
    ...overrides,
  };
}

/**
 * Submits `fields` through `dispatch` exactly as the route's action does, and
 * returns whatever it answered with - returned or thrown, since a redirect
 * or a 404 is thrown.
 */
async function submit(
  fields: Record<string, string>,
  cases: ForkableUseCases = useCases(),
  log: (message: string) => void = () => {},
  on: ForkableDetail = page,
): Promise<unknown> {
  const body = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }

  const request = new Request('http://localhost/plans/plan-1', {
    method: 'POST',
    body: body,
  });

  try {
    return await dispatch(request, forkableHandlers(on, cases, { athlete: athlete, id: 'plan-1', log: log }));
  } catch (thrown) {
    return thrown;
  }
}

/**
 * A redirect is a `Response`; `data()` is React Router's own wrapper carrying
 * the init it will be turned into.
 */
function statusOf(answer: unknown): number | undefined {
  if (answer instanceof Response) {
    return answer.status;
  }

  if (typeof answer === 'object' && answer !== null && 'init' in answer) {
    return (answer.init as ResponseInit | undefined)?.status;
  }

  return undefined;
}

function locationOf(answer: unknown): string | null | undefined {
  return answer instanceof Response ? answer.headers.get('Location') : undefined;
}

function dataOf(answer: unknown): unknown {
  return typeof answer === 'object' && answer !== null && 'data' in answer ? answer.data : undefined;
}

describe('notFound', () => {
  it('is a 404 naming the thing that is missing', () => {
    let thrown: unknown;
    try {
      page.notFound();
    } catch (caught) {
      thrown = caught;
    }
    expect(statusOf(thrown)).toBe(404);
  });
});

describe('settle', () => {
  it('is ok when the edit applied in place', () => {
    expect(page.settle({ ok: true, value: { forkedId: null } })).toEqual({
      ok: true,
    });
  });

  /**
   * The edit landed on a new row with its own URL. Staying put would show
   * the untouched sample and look to the athlete like the edit was lost.
   */
  it('redirects to the fork the edit landed on', () => {
    let thrown: unknown;
    try {
      page.settle({ ok: true, value: { forkedId: 'fork-1' } });
    } catch (caught) {
      thrown = caught;
    }
    expect(statusOf(thrown)).toBe(302);
    expect(locationOf(thrown)).toBe('/plans/fork-1');
  });
});

describe('delete', () => {
  it('redirects to the index, and logs it', async () => {
    const log = vi.fn();

    const answer = await submit({ intent: 'delete' }, useCases(), log);

    expect(locationOf(answer)).toBe('/plans');
    expect(log).toHaveBeenCalledWith('deleted plan plan-1 for user user-1');
  });

  it('refuses a shared sample, tagged on the delete intent', async () => {
    const answer = await submit({ intent: 'delete' }, useCases({ remove: async () => err('sample' as const) }));

    expect(dataOf(answer)).toEqual({
      error: "Sample plans can't be deleted.",
      intent: 'delete',
    });
    expect(statusOf(answer)).toBe(400);
  });

  it('is a 404 when the row was not there, and logs nothing', async () => {
    const log = vi.fn();

    const answer = await submit({ intent: 'delete' }, useCases({ remove: async () => err('not-found' as const) }), log);

    expect(statusOf(answer)).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('revert', () => {
  it('redirects to the sample, which reappears now that nothing forks from it', async () => {
    expect(locationOf(await submit({ intent: 'revert' }))).toBe('/plans/sample-1');
  });

  it('refuses a row that was never a copy of anything', async () => {
    const answer = await submit({ intent: 'revert' }, useCases({ revert: async () => err('nothing-to-revert' as const) }));

    expect(dataOf(answer)).toEqual({
      error: 'Nothing to revert',
      intent: 'revert',
    });
  });

  it('is a 404 when the row was not there', async () => {
    const answer = await submit({ intent: 'revert' }, useCases({ revert: async () => err('not-found' as const) }));

    expect(statusOf(answer)).toBe(404);
  });
});

describe('duplicate', () => {
  it('redirects to the copy, and logs it', async () => {
    const log = vi.fn();

    const answer = await submit({ intent: 'duplicate' }, useCases(), log);

    expect(locationOf(answer)).toBe('/plans/copy-1');
    expect(log).toHaveBeenCalledWith('duplicated plan plan-1 into copy-1 for user user-1');
  });

  it('is a 404 when the row was not there', async () => {
    const answer = await submit({ intent: 'duplicate' }, useCases({ duplicate: async () => err('not-found' as const) }));

    expect(statusOf(answer)).toBe(404);
  });
});

describe('rename', () => {
  it('renames to the trimmed name, in place', async () => {
    const rename = vi.fn(async () => ok({ forkedId: null }));

    const answer = await submit({ intent: 'rename', name: '  Push pull  ' }, useCases({ rename: rename }));

    expect(answer).toEqual({ ok: true });
    expect(rename).toHaveBeenCalledWith(athlete, 'plan-1', 'Push pull');
  });

  it('follows the fork renaming a sample made', async () => {
    const answer = await submit(
      { intent: 'rename', name: 'Mine' },
      useCases({ rename: async () => ok({ forkedId: 'fork-1' }) }),
    );

    expect(locationOf(answer)).toBe('/plans/fork-1');
  });

  it('refuses a blank name without calling the use case', async () => {
    const rename = vi.fn(async () => ok({ forkedId: null }));

    const answer = await submit({ intent: 'rename', name: '   ' }, useCases({ rename: rename }));

    expect(dataOf(answer)).toEqual({ error: 'Invalid name', intent: 'rename' });
    expect(rename).not.toHaveBeenCalled();
  });
});

describe('another page', () => {
  it('says its own noun, and lands on its own paths', async () => {
    const workouts: ForkableDetail = forkableDetail({
      noun: 'Workout',
      indexPath: '/workouts',
      pathFor: (id) => `/workouts/${id}`,
    });
    const log = vi.fn();

    const refused = await submit({ intent: 'delete' }, useCases({ remove: async () => err('sample' as const) }), log, workouts);
    const deleted = await submit({ intent: 'delete' }, useCases(), log, workouts);
    const duplicated = await submit({ intent: 'duplicate' }, useCases(), log, workouts);

    expect(dataOf(refused)).toEqual({
      error: "Sample workouts can't be deleted.",
      intent: 'delete',
    });
    expect(locationOf(deleted)).toBe('/workouts');
    expect(locationOf(duplicated)).toBe('/workouts/copy-1');
    expect(log).toHaveBeenCalledWith('deleted workout plan-1 for user user-1');
  });
});
