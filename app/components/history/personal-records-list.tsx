import { TrophyIcon } from 'lucide-react';
import type { PersonalRecordView } from '~application/use-cases/progress-view';
import { formatMonthDay } from '~shared/format';

import { formatMetricValue } from '~/components/history/chart-utils';

export function PersonalRecordsList({ records }: { records: PersonalRecordView[] }) {
  return (
    <ul className="divide-border flex flex-col divide-y">
      {records.map((record) => (
        <li key={record.exerciseId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="bg-brand-muted text-brand-strong flex size-7 shrink-0 items-center justify-center rounded-full"
              aria-hidden="true"
            >
              <TrophyIcon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{record.exerciseName}</div>
              <div className="text-muted-foreground text-xs">{record.metricLabel}</div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold tabular-nums">
              {formatMetricValue(record.value, record.unit)} {record.unit}
            </div>
            <div className="text-muted-foreground text-xs">{formatMonthDay(record.date)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
