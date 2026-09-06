import * as React from 'react';
import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router';

import { CalendarCheckIcon, ClipboardListIcon, DumbbellIcon, MoonIcon, RepeatIcon, SearchIcon } from 'lucide-react';

import { toggleTheme } from '~/components/theme-toggle';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/components/ui/command';

import { type NavUser, navItemsFor } from './nav-items';

/**
 * ⌘K / Ctrl-K, navigation and a handful of actions, no server calls. A v2
 * that searches plans/workouts/exercises by name is a read, so it can use a
 * fetcher without breaking the no-`useFetcher`-for-writes rule this shell
 * otherwise holds to - it just is not built yet.
 */
function CommandPalette({ user }: { user: NavUser }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setOpen((value) => !value);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function go(to: string) {
    setOpen(false);
    navigate(to);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground sm:w-48 sm:justify-between sm:px-3"
      >
        <span className="flex items-center gap-2">
          <SearchIcon className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Search...</span>
        </span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-xs sm:inline">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search or run a command..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {navItemsFor(user).map((item) => (
              <CommandItem key={item.to} value={item.label} onSelect={() => go(item.to)}>
                <item.icon aria-hidden="true" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem value="New plan" onSelect={() => go('/plans')}>
              <RepeatIcon aria-hidden="true" />
              New plan
            </CommandItem>
            <CommandItem value="New workout" onSelect={() => go('/workouts')}>
              <ClipboardListIcon aria-hidden="true" />
              New workout
            </CommandItem>
            <CommandItem value="New exercise" onSelect={() => go('/exercises')}>
              <DumbbellIcon aria-hidden="true" />
              New exercise
            </CommandItem>
            <CommandItem value="Log today" onSelect={() => go('/today')}>
              <CalendarCheckIcon aria-hidden="true" />
              Log today
            </CommandItem>
            <CommandItem
              value="Toggle theme"
              onSelect={() => {
                setOpen(false);
                toggleTheme();
              }}
            >
              <MoonIcon aria-hidden="true" />
              Toggle theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

export { CommandPalette };
