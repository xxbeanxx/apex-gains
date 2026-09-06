import * as React from 'react';
import { useState } from 'react';

import { CirclePlusIcon } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Separator } from '~/components/ui/separator';

export type FacetOption = { value: string; label: string; count: number };

/**
 * A multi-select filter: a trigger showing what's picked as inline badges,
 * a searchable checkbox list, and a "Clear" footer once something is
 * selected. `options` should carry counts computed from the pool the
 * *other* active facets would already narrow to, not the fully-filtered
 * result - otherwise every count converges on the same final number.
 */
function FacetFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FacetOption[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const filtered = needle === '' ? options : options.filter((option) => option.label.toLowerCase().includes(needle));
  const chosen = options.filter((option) => selected.has(option.value));

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 border-dashed">
          <CirclePlusIcon className="size-3.5" aria-hidden="true" />
          {label}
          {chosen.length > 0 ? (
            <>
              <Separator orientation="vertical" className="h-4" />
              {chosen.length > 2 ? (
                <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
                  {chosen.length} selected
                </Badge>
              ) : (
                chosen.map((option) => (
                  <Badge key={option.value} variant="secondary" className="rounded-sm px-1.5 font-normal">
                    {option.label}
                  </Badge>
                ))
              )}
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${label.toLowerCase()}…`}
            aria-label={`Filter ${label.toLowerCase()} options`}
            className="h-8"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {filtered.map((option) => (
            <li key={option.value}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-(--dur-fast) hover:bg-muted">
                <Checkbox checked={selected.has(option.value)} onCheckedChange={() => toggle(option.value)} />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>
              </label>
            </li>
          ))}
          {filtered.length === 0 ? <li className="px-2 py-4 text-center text-sm text-muted-foreground">No matches</li> : null}
        </ul>
        {selected.size > 0 ? (
          <div className="border-t border-border p-1">
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => onChange(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export { FacetFilter };
