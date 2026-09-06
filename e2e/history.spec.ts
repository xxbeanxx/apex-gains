import { expect, test, uniqueName } from './fixtures';
import { createExercise, selectOption } from './helpers';

/** The dated session cards, as opposed to the Trends charts above them. */
function timeline(page: import('@playwright/test').Page) {
  return page.getByRole('region');
}

test('starts with nothing recorded', async ({ page, athlete }) => {
  await page.goto('/history');

  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(page.getByText('No history yet')).toBeVisible();
  await expect(page.getByText('Every session you record shows up here, rest days included.')).toBeVisible();
  // Trends need at least one recorded day before there is anything to plot.
  await expect(page.getByRole('heading', { name: 'Trends' })).toHaveCount(0);
});

test('shows a logged session, its sets, and the running totals', async ({ page, athlete }) => {
  const exercise = uniqueName('Deadlift');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  for (const [reps, weight] of [
    ['5', '225'],
    ['5', '245'],
  ]) {
    await page.getByLabel('Reps').fill(reps);
    await page.getByLabel(/^Weight \(/).fill(weight);
    await page.getByRole('button', { name: 'Log set' }).click();
    await expect(page.locator('ol > li').filter({ hasText: `${weight} lb x ${reps}` })).toBeVisible();
  }

  await page.goto('/history');

  await expect(page.getByText('1 workout and 2 sets across 1 recorded day')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();

  // Month groups are the only `<section>`s with an aria-label, so they are
  // the only regions - which keeps this off the Trends cards above them.
  // The row itself carries only the day's totals; per-set detail lives at
  // the /today?date=... it links to.
  const session = timeline(page).getByRole('link');
  await expect(session).toContainText('2 sets');
  await expect(session).toContainText('2350 lb');
});

test("shows an exercise's recent sets in the Today popover", async ({ page, athlete }) => {
  const exercise = uniqueName('Lat Pulldown');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  await page.getByLabel('Reps').fill('12');
  await page.getByLabel(/^Weight \(/).fill('90');
  await page.getByRole('button', { name: 'Log set' }).click();
  await expect(page.locator('ol > li').filter({ hasText: '90 lb x 12' })).toBeVisible();

  // The popover pulls `/exercises/:id/history` as a resource route on first
  // open - there is no page at that URL to navigate to.
  await page.getByRole('button', { name: `Show recent history for ${exercise}` }).click();

  const popover = page.getByText(`${exercise}: recent sets`);
  await expect(popover).toBeVisible();
  await expect(page.getByText('Today · 90 lb x 12')).toBeVisible();
});

test('reports an exercise with nothing logged against it', async ({ page, athlete }) => {
  const exercise = uniqueName('Untouched');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  await page.getByRole('button', { name: `Show recent history for ${exercise}` }).click();

  await expect(page.getByText('Nothing logged for this exercise yet.')).toBeVisible();
});
