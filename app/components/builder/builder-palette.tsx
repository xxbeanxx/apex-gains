import { SearchIcon } from 'lucide-react';
import * as React from 'react';

import { Input } from '~/components/ui/input';

/**
 * The left column: a search box filtering an already-loaded list, plus
 * whatever "New ..." action the page wants below it. The search itself is a
 * plain client filter - a read, so `useState` here doesn't run afoul of the
 * no-`useFetcher`-for-writes rule the rest of the builder holds to.
 */
function BuilderPalette<T>({
  items,
  getKey,
  getLabel,
  renderItem,
  searchPlaceholder = 'Search…',
  emptyLabel = 'No matches',
  newAction,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  searchPlaceholder?: string;
  emptyLabel?: string;
  newAction?: React.ReactNode;
}) {
  const [query, setQuery] = React.useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle === '' ? items : items.filter((item) => getLabel(item).toLowerCase().includes(needle));

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/[0.03] dark:shadow-black/20">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="pl-8"
        />
      </div>
      <ul className="flex max-h-96 flex-1 flex-col gap-1 overflow-y-auto md:max-h-none">
        {visible.map((item) => (
          <li key={getKey(item)}>{renderItem(item)}</li>
        ))}
        {visible.length === 0 ? <li className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</li> : null}
      </ul>
      {newAction}
    </div>
  );
}

export { BuilderPalette };
