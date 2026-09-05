import { CheckIcon, ClockIcon, MapPinIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/components/ui/command';
import { cn } from '~/lib/utils';

const formatters = new Map<string, Intl.DateTimeFormat>();

/** e.g. "2:32 PM GMT-5". Formatters are cached per zone since they're safe to reuse across calls. */
function timeIn(zone: string, at: Date): string {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
    });
    formatters.set(zone, formatter);
  }
  return formatter.format(at);
}

function regionOf(zone: string): string {
  return zone.includes('/') ? zone.slice(0, zone.indexOf('/')) : zone;
}

/** "America/Argentina/Buenos_Aires" -> "Argentina/Buenos Aires"; "UTC" -> "UTC". */
function labelFor(zone: string): string {
  const region = regionOf(zone);
  return zone === region ? zone : zone.slice(region.length + 1).replaceAll('_', ' ');
}

function groupByRegion(zones: readonly string[]): ReadonlyArray<{ region: string; zones: readonly string[] }> {
  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const list = groups.get(regionOf(zone)) ?? [];
    list.push(zone);
    groups.set(regionOf(zone), list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, zoneList]) => ({ region, zones: zoneList }));
}

/**
 * A dialog timezone picker: search box, grouped by IANA region, each row
 * showing that zone's current local time and UTC offset, plus a "Detect
 * automatically" shortcut reading the browser's own timezone. Renders a
 * hidden `name`d input, so it drops into a plain `<form method="post">` like
 * any other field - there is no client-side submission here.
 */
function TimezonePicker({
  id,
  name,
  zones,
  defaultValue,
  describedBy,
}: {
  id?: string;
  name: string;
  zones: readonly string[];
  defaultValue: string;
  describedBy?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(defaultValue);
  const [now, setNow] = React.useState(() => new Date());
  const groups = React.useMemo(() => groupByRegion(zones), [zones]);

  React.useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  function choose(zone: string) {
    setValue(zone);
    setOpen(false);
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Button
        type="button"
        id={id}
        variant="outline"
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="w-full justify-between font-normal"
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <ClockIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {labelFor(value)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{timeIn(value, now)}</span>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Choose a timezone"
        description="Search or browse timezones by region"
      >
        <CommandInput placeholder="Search timezones..." />
        <CommandList>
          <CommandEmpty>No matching timezone.</CommandEmpty>
          <CommandGroup heading="Suggested">
            <CommandItem value="detect automatically" onSelect={() => choose(Intl.DateTimeFormat().resolvedOptions().timeZone)}>
              <MapPinIcon aria-hidden="true" />
              Detect automatically
            </CommandItem>
          </CommandGroup>
          {groups.map((group) => (
            <CommandGroup key={group.region} heading={group.region}>
              {group.zones.map((zone) => (
                <CommandItem key={zone} value={`${group.region} ${labelFor(zone)}`} onSelect={() => choose(zone)}>
                  <CheckIcon className={cn('shrink-0', zone === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{labelFor(zone)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{timeIn(zone, now)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export { TimezonePicker };
