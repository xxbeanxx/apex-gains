import { SearchIcon } from 'lucide-react';
import type * as React from 'react';

import { Input } from '~/components/ui/input';

/**
 * A search box over an already-loaded list - a plain client filter, so the
 * `useState` it implies is a read and doesn't run afoul of the
 * no-`useFetcher`-for-writes rule the rest of the builder holds to. Kept
 * separate from `BuilderPalette` because a page that also facets the list
 * (the workout builder's exercise palette) owns the combined filter state
 * itself and renders this beside its facet chips.
 */
function BuilderPaletteSearch({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8"
      />
    </div>
  );
}

/**
 * The left column: whatever filter UI the page needs (a search box, facet
 * chips, or both) above a scrollable list of addable items, plus whatever
 * "New ..." action the page wants below it. Generic over the item shape -
 * filtering happens before `items` reaches here, since a facet-filtered
 * palette (workouts) and a plain one (a plan's rest-day-and-workouts list)
 * need different filter state entirely.
 */
function BuilderPalette<T>({
  items,
  getKey,
  renderItem,
  filters,
  emptyLabel = 'No matches',
  newAction,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  filters?: React.ReactNode;
  emptyLabel?: string;
  newAction?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/[0.03] dark:shadow-black/20">
      {filters}
      <ul className="flex max-h-96 flex-1 flex-col gap-1 overflow-y-auto md:max-h-none">
        {items.map((item) => (
          <li key={getKey(item)}>{renderItem(item)}</li>
        ))}
        {items.length === 0 ? <li className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</li> : null}
      </ul>
      {newAction}
    </div>
  );
}

export { BuilderPalette, BuilderPaletteSearch };
