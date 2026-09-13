import { redirect } from 'react-router';
import type { Athlete } from '~domain/athlete/athlete';
import type { Result } from '~domain/shared/result';

import type { ForkableDetail } from '~/lib/forkable-detail';
import { handled } from '~/lib/intent.server';

/**
 * The use-case methods behind a forkable page's four shared intents -
 * `PlanService` and `WorkoutService` both satisfy it as they stand.
 */
export type ForkableUseCases = {
  remove(athlete: Athlete, id: string): Promise<Result<void, 'not-found' | 'sample'>>;
  revert(athlete: Athlete, id: string): Promise<Result<{ forkedFromId: string }, 'not-found' | 'nothing-to-revert'>>;
  duplicate(athlete: Athlete, id: string): Promise<Result<{ id: string }, 'not-found'>>;
  rename(athlete: Athlete, id: string, name: string): Promise<Result<{ forkedId: string | null }, 'not-found'>>;
};

/**
 * Handlers for `page.intents`, to spread into a route's `dispatch` ahead of
 * its own:
 *
 *  - delete: back to the index, logged; a sample refuses, because it is
 *    shared with everyone and hiding it is what the sample-data preference
 *    is for.
 *  - revert: the copy is discarded and the browser follows the sample, which
 *    reappears in the athlete's list now that nothing forks from it.
 *  - duplicate: the browser follows the new copy, logged.
 *  - rename: `settle`d like any other edit.
 *
 * Any of them is a 404 when the row isn't one the athlete can see.
 */
export function forkableHandlers(
  page: ForkableDetail,
  useCases: ForkableUseCases,
  request: { athlete: Athlete; id: string; log: (message: string) => void },
) {
  const { athlete, id, log } = request;
  const { intents } = page;
  const noun = page.noun.toLowerCase();

  return [
    handled(intents.delete, async () => {
      const outcome = await useCases.remove(athlete, id);
      if (!outcome.ok) {
        if (outcome.error === 'not-found') page.notFound();
        return intents.delete.reject(`Sample ${noun}s can't be deleted.`);
      }
      log(`deleted ${noun} ${id} for user ${athlete.id}`);
      throw redirect(page.indexPath);
    }),

    handled(intents.revert, async () => {
      const outcome = await useCases.revert(athlete, id);
      if (!outcome.ok) {
        if (outcome.error === 'not-found') page.notFound();
        return intents.revert.reject('Nothing to revert');
      }
      throw redirect(page.pathFor(outcome.value.forkedFromId));
    }),

    handled(intents.duplicate, async () => {
      const outcome = await useCases.duplicate(athlete, id);
      if (!outcome.ok) page.notFound();

      log(`duplicated ${noun} ${id} into ${outcome.value.id} for user ${athlete.id}`);
      throw redirect(page.pathFor(outcome.value.id));
    }),

    handled(intents.rename, async ({ name }) => page.settle(await useCases.rename(athlete, id, name))),
  ] as const;
}
