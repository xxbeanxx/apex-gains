import { describe, expect, it, vi } from 'vitest';

import { type ForkableDetail, forkableDetail } from '~/lib/forkable-detail';
import { intent } from '~/lib/intent';

const page: ForkableDetail = forkableDetail({
  noun: 'Plan',
  indexPath: '/plans',
  pathFor: (id) => `/plans/${id}`,
});

const remove = intent('delete');
const revert = intent('revert');

/** Runs `work` and returns whatever it threw, which is how a route answers a redirect. */
function thrownBy(work: () => unknown): unknown {
  try {
    work();
  } catch (thrown) {
    return thrown;
  }
  throw new Error('expected the call to throw');
}

/**
 * A thrown redirect is a `Response`; a thrown `data()` is React Router's own
 * wrapper carrying the init it will be turned into.
 */
function statusOf(thrown: unknown): number | undefined {
  if (thrown instanceof Response) return thrown.status;
  if (typeof thrown === 'object' && thrown !== null && 'init' in thrown) {
    return (thrown.init as ResponseInit | undefined)?.status;
  }
  return undefined;
}

function locationOf(thrown: unknown): string | null | undefined {
  return thrown instanceof Response ? thrown.headers.get('Location') : undefined;
}

describe('notFound', () => {
  it('is a 404 naming the thing that is missing', () => {
    expect(statusOf(thrownBy(() => page.notFound()))).toBe(404);
  });
});

describe('settle', () => {
  it('is ok when the edit applied in place', () => {
    expect(page.settle({ ok: true, value: { forkedId: null } })).toEqual({ ok: true });
  });

  /**
   * The edit landed on a new row with its own URL. Staying put would show
   * the untouched sample and look to the athlete like the edit was lost.
   */
  it('redirects to the fork the edit landed on', () => {
    const thrown = thrownBy(() => page.settle({ ok: true, value: { forkedId: 'fork-1' } }));

    expect(statusOf(thrown)).toBe(302);
    expect(locationOf(thrown)).toBe('/plans/fork-1');
  });

  it('is a 404 when the row was not there', () => {
    expect(statusOf(thrownBy(() => page.settle({ ok: false })))).toBe(404);
  });
});

describe('deleted', () => {
  it('redirects to the index, after letting the caller log it', () => {
    const log = vi.fn();

    const thrown = thrownBy(() => page.deleted(remove, { ok: true }, log));

    expect(locationOf(thrown)).toBe('/plans');
    expect(log).toHaveBeenCalledOnce();
  });

  it('refuses a shared sample, tagged on the intent that asked', () => {
    const rejection = page.deleted(remove, { ok: false, error: 'sample' });

    expect(rejection.data).toEqual({ error: "Sample plans can't be deleted.", intent: 'delete' });
    expect(rejection.init?.status).toBe(400);
  });

  it('is a 404 when the row was not there, and does not log', () => {
    const log = vi.fn();

    expect(statusOf(thrownBy(() => page.deleted(remove, { ok: false, error: 'not-found' }, log)))).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('reverted', () => {
  it('redirects to the sample, which reappears now that nothing forks from it', () => {
    const thrown = thrownBy(() => page.reverted(revert, { ok: true, value: { forkedFromId: 'sample-1' } }));

    expect(locationOf(thrown)).toBe('/plans/sample-1');
  });

  it('refuses a row that was never a copy of anything', () => {
    const rejection = page.reverted(revert, { ok: false, error: 'nothing-to-revert' });

    expect(rejection.data).toEqual({ error: 'Nothing to revert', intent: 'revert' });
  });

  it('is a 404 when the row was not there', () => {
    expect(statusOf(thrownBy(() => page.reverted(revert, { ok: false, error: 'not-found' })))).toBe(404);
  });
});

describe('another page', () => {
  it('says its own noun and lands on its own index', () => {
    const workouts: ForkableDetail = forkableDetail({
      noun: 'Workout',
      indexPath: '/workouts',
      pathFor: (id) => `/workouts/${id}`,
    });

    expect(workouts.deleted(remove, { ok: false, error: 'sample' }).data.error).toBe("Sample workouts can't be deleted.");
    expect(locationOf(thrownBy(() => workouts.deleted(remove, { ok: true })))).toBe('/workouts');
  });
});
