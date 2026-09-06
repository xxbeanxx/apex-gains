import {
  CalendarCheckIcon,
  ClipboardListIcon,
  DumbbellIcon,
  HistoryIcon,
  type LucideIcon,
  RepeatIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Bottom-tab slot; items without one live under "More". */
  tab?: 1 | 2 | 3 | 4;
  group: 'primary' | 'training' | 'account';
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { to: '/today', label: 'Today', icon: CalendarCheckIcon, group: 'primary', tab: 1 },
  { to: '/history', label: 'History', icon: HistoryIcon, group: 'primary', tab: 4 },
  { to: '/plans', label: 'Plans', icon: RepeatIcon, group: 'training', tab: 2 },
  { to: '/workouts', label: 'Workouts', icon: ClipboardListIcon, group: 'training', tab: 3 },
  { to: '/exercises', label: 'Exercises', icon: DumbbellIcon, group: 'training' },
  { to: '/body', label: 'Body', icon: ScaleIcon, group: 'training' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, group: 'account' },
  { to: '/admin', label: 'Admin', icon: ShieldCheckIcon, group: 'account', adminOnly: true },
];

export type NavUser = { id: string; name: string | null; avatarUrl: string | null; isAdmin: boolean };

export function navItemsFor(user: NavUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || user.isAdmin);
}
