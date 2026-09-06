import { describe, expect, it } from 'vitest';

import { NAV_ITEMS } from '~/components/shell/nav-items';

describe('NAV_ITEMS', () => {
  it('assigns each bottom-tab slot exactly once', () => {
    const slots = NAV_ITEMS.map((item) => item.tab).filter((tab) => tab !== undefined);
    expect(slots.slice().sort()).toEqual([1, 2, 3, 4]);
  });

  it('every tab item is also reachable from the sidebar', () => {
    const tabItems = NAV_ITEMS.filter((item) => item.tab !== undefined);
    for (const item of tabItems) {
      expect(NAV_ITEMS).toContain(item);
    }
  });
});
