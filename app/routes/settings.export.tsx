import { requireAthlete } from '~/auth/user-context';
import { exportServiceContext } from '~/router/load-context';
import { DateOnly } from '~domain/values/date-only';

import type { Route } from './+types/settings.export';

/**
 * Resource route (no default export) - a link on `/settings?section=account`
 * downloads the athlete's own data through this. `?format=csv` gets logged
 * sets as a spreadsheet; anything else gets the full JSON snapshot.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const exportService = context.get(exportServiceContext);

  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const stamp = DateOnly.today(new Date(), athlete.preferences.timezone).value;

  if (format === 'csv') {
    const csv = await exportService.toCsv(athlete);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="apex-gains-${stamp}.csv"`,
      },
    });
  }

  const snapshot = await exportService.snapshot(athlete);
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="apex-gains-${stamp}.json"`,
    },
  });
}
