const STORAGE_KEY = 'sidebar';

/**
 * Applied before first paint so a collapsed sidebar does not flash open on
 * load. Same shape as `theme-toggle.tsx`'s `themeInitScript`: client-only,
 * localStorage, no cookie, no loader change - the server renders
 * width-agnostic markup and this script sets the attribute CSS keys off.
 */
export const sidebarInitScript = `(function(){try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="collapsed"){document.documentElement.setAttribute("data-sidebar","collapsed");}}catch(_){}})();`;

export function isSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(STORAGE_KEY, 'collapsed');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can throw (private browsing, quota) - the toggle still flips
    // the attribute for this load, it just will not survive a reload.
  }
  document.documentElement.setAttribute('data-sidebar', collapsed ? 'collapsed' : '');
}
