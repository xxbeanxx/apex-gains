import * as React from 'react';
import { useEffect, useState } from 'react';

import { Link, NavLink } from 'react-router';

import { ChevronsLeftIcon, DumbbellIcon } from 'lucide-react';

import type { NavItem } from '~/components/shell/nav-items';
import { setSidebarCollapsed } from '~/components/shell/shell-init';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/utils';

const GROUP_LABEL: Record<NavItem['group'], string | null> = {
  primary: null,
  training: 'Training',
  account: 'Account',
};

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          className={({ isActive }) =>
            cn(
              'relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-(--dur-fast)',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand-strong transition-opacity duration-(--dur)',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
              <span data-sidebar-label className="truncate">
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarGroup({ label, items }: { label: string | null; items: NavItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {label ? (
        <span data-sidebar-label className="px-2.5 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}
      {items.map((item) => (
        <SidebarLink key={item.to} item={item} />
      ))}
    </div>
  );
}

function CollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.getAttribute('data-sidebar') === 'collapsed');
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    setSidebarCollapsed(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="shrink-0"
    >
      <ChevronsLeftIcon className={cn('transition-transform duration-(--dur)', collapsed && 'rotate-180')} />
    </Button>
  );
}

/** Desktop rail. Hidden below `md:`, where the bottom tab bar takes over. */
function Sidebar({ items }: { items: NavItem[] }) {
  const groups = (['primary', 'training', 'account'] as const).map((group) => ({
    group,
    label: GROUP_LABEL[group],
    items: items.filter((item) => item.group === group),
  }));

  return (
    <aside className="sticky top-0 hidden h-dvh w-(--sidebar-w) shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-(--dur) md:flex">
      <div className="flex h-(--header-h) items-center gap-2 px-3">
        <Link
          to="/"
          className="flex min-w-0 flex-1 items-center gap-2 font-heading text-base font-semibold tracking-tight text-sidebar-foreground"
        >
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground"
          >
            <DumbbellIcon className="size-4" />
          </span>
          <span data-sidebar-label className="truncate">
            Apex Gains
          </span>
        </Link>
        <CollapseToggle />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.map(({ group, label, items: groupItems }) => (
          <SidebarGroup key={group} label={label} items={groupItems} />
        ))}
      </nav>
    </aside>
  );
}

export { Sidebar };
