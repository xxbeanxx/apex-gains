import { TrophyIcon } from 'lucide-react';

import type { PersonalRecordView } from '~application/use-cases/progress-view';
import { formatMonthDay } from '~shared/format';

import { formatMetricValue } from './chart-utils';

export function PersonalRecordsList({ records }: { records: PersonalRecordView[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {records.map((record) => (
        <li key={record.exerciseId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand-strong"
              aria-hidden="true"
            >
              <TrophyIcon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{record.exerciseName}</div>
              <div className="text-xs text-muted-foreground">{record.metricLabel}</div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold tabular-nums">
              {formatMetricValue(record.value, record.unit)} {record.unit}
            </div>
            <div className="text-xs text-muted-foreground">{formatMonthDay(record.date)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
