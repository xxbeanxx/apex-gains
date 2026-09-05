import { expect, test } from './fixtures';

const PAGES = [
  { link: 'Today', url: '/today', heading: 'Today' },
  { link: 'Exercises', url: '/exercises', heading: 'Exercise Library' },
  { link: 'Workouts', url: '/workouts', heading: 'Workouts' },
  { link: 'Plans', url: '/plans', heading: 'Plans' },
  { link: 'History', url: '/history', heading: 'History' },
  { link: 'Weight', url: '/weight', heading: 'Weight' },
  { link: 'Settings', url: '/settings', heading: 'Settings' },
] as const;

test('reaches every page from the main nav', async ({ page, athlete }) => {
  await page.goto('/today');
  const nav = page.getByRole('navigation', { name: 'Main' });

  for (const { link, url, heading } of PAGES) {
    await nav.getByRole('link', { name: link, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
  }
});

test('marks the current page in the nav', async ({ page, athlete }) => {
  await page.goto('/plans');

  const current = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans', exact: true });
  await expect(current).toHaveAttribute('aria-current', 'page');
});

test('serves a 404 for an unknown route', async ({ page, athlete }) => {
  const response = await page.request.get('/no-such-page');

  expect(response.status()).toBe(404);
});

test('404s on a detail page belonging to nobody', async ({ page, athlete }) => {
  // A well-formed id that is not this athlete's - authorization scopes every
  // query by userId before it decides the row does not exist.
  const response = await page.request.get('/plans/00000000-0000-4000-8000-000000000000');

  expect(response.status()).toBe(404);
});

test('offers a skip link ahead of the nav', async ({ page, athlete }) => {
  await page.goto('/today');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});
