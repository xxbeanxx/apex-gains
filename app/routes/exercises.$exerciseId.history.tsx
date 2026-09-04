import { userContext } from '~/auth/user-context';

import { workoutLogServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/exercises.$exerciseId.history';

const RECENT_SETS_LIMIT = 10;

/**
 * Resource route (no default export - fetched with `fetcher.load`, never
 * navigated to) backing the "recent sets" popover on the logging form.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const athlete = context.get(userContext)!;
  const logService = context.get(workoutLogServiceContext);
  const sets = await logService.recentSetsFor(athlete, params.exerciseId, RECENT_SETS_LIMIT);
  return { sets };
}
