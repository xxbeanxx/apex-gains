import type { Page } from '@playwright/test';

import {
  addEquipment,
  createExercise,
  createPlan,
  createWorkout,
  linkEquipment,
  orderedRows,
  selectOption,
  submitForm,
} from './helpers';
import { expect, test, uniqueName } from './fixtures';

/** Logged sets render as an `ol`; the two week rails above them are `ul`s. */
function loggedSets(page: Page) {
  return page.locator('ol > li');
}

/** Builds a one-day plan around `exercise` and makes it the active one. */
async function activePlanWith(page: Page, exercise: string, targets?: { sets?: string; reps?: string }) {
  const workout = uniqueName('Day');
  await createWorkout(page, workout);
  await page.getByRole('button', { name: exercise, exact: true }).click();
  const row = orderedRows(page).filter({ hasText: exercise });
  await expect(row).toBeVisible();

  if (targets?.sets || targets?.reps) {
    await row.getByText('Edit target').click();
    if (targets.sets) await row.getByLabel('Sets').fill(targets.sets);
    if (targets.reps) await row.getByLabel('Reps').fill(targets.reps);
    await row.getByRole('button', { name: 'Save target' }).click();
  }

  await createPlan(page, uniqueName('Plan'));
  await page.getByRole('button', { name: workout, exact: true }).click();
  await expect(page.locator('ol > li')).toHaveCount(1);
  await submitForm(page.getByRole('button', { name: 'Set active' }));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  return workout;
}

test('shows no active plan until one is set', async ({ page, athlete }) => {
  await page.goto('/today');

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('No plan is active, so log whatever you like for today.')).toBeVisible();
  // The week rails render twice - once always-expanded for `md:` and up,
  // once behind a mobile-only `<details>` - so `.first()` picks whichever
  // copy this viewport actually shows.
  await expect(page.getByText('Next seven days').first()).toBeVisible();
  await expect(page.getByText('0 workouts scheduled').first()).toBeVisible();
});

test('logs a strength set from the free-form form and removes it', async ({ page, athlete }) => {
  const exercise = uniqueName('Bench Press');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  await page.getByLabel('Reps').fill('8');
  await page.getByLabel(/^Weight \(/).fill('135');
  await page.getByRole('button', { name: 'Log set' }).click();

  const logged = loggedSets(page).filter({ hasText: '135 lb x 8' });
  await expect(logged).toBeVisible();

  // Survives a reload: the set is on the server, not just in the fetcher.
  await page.reload();
  await expect(loggedSets(page).filter({ hasText: '135 lb x 8' })).toBeVisible();

  await page.getByRole('button', { name: /^Remove set 1/ }).click();
  await expect(loggedSets(page).filter({ hasText: '135 lb x 8' })).toHaveCount(0);
});

test('prefills the log form from the last time this exercise was logged', async ({ page, athlete }) => {
  const exercise = uniqueName('Deadlift');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  await page.getByLabel('Reps').fill('5');
  await page.getByLabel(/^Weight \(/).fill('225');
  await page.getByRole('button', { name: 'Log set' }).click();
  await expect(loggedSets(page).filter({ hasText: '225 lb x 5' })).toBeVisible();

  // A fresh mount - not the same fetcher submission - so this exercises the
  // loader's prefill rather than the uncontrolled input just keeping what
  // was typed.
  await page.reload();
  await selectOption(page.getByLabel('Exercise'), exercise);
  await expect(page.getByLabel('Reps')).toHaveValue('5');
  await expect(page.getByLabel(/^Weight \(/)).toHaveValue('225');
});

test('records an RPE and a note alongside a set', async ({ page, athlete }) => {
  const exercise = uniqueName('Front Squat');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  await page.getByLabel('Reps').fill('5');
  await page.getByLabel(/^Weight \(/).fill('185');
  await selectOption(page.getByLabel('RPE'), '8.5');
  await page.getByText('Add a note').click();
  await page.getByLabel('Notes').fill('Rod 4 slipping');
  await page.getByRole('button', { name: 'Log set' }).click();

  await expect(loggedSets(page).filter({ hasText: '185 lb x 5 @ RPE 8.5' })).toBeVisible();
  await expect(loggedSets(page).filter({ hasText: 'Rod 4 slipping' })).toBeVisible();
});

test('logs several sets so pyramids record as they were lifted', async ({ page, athlete }) => {
  const exercise = uniqueName('Squat');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);

  for (const [reps, weight] of [
    ['10', '95'],
    ['8', '115'],
    ['6', '135'],
  ]) {
    await page.getByLabel('Reps').fill(reps);
    await page.getByLabel(/^Weight \(/).fill(weight);
    await page.getByRole('button', { name: 'Log set' }).click();
    await expect(loggedSets(page).filter({ hasText: `${weight} lb x ${reps}` })).toBeVisible();
  }

  await expect(loggedSets(page).filter({ hasText: /lb x \d+/ })).toHaveCount(3);
});

test("surfaces the active plan's workout and tracks set progress", async ({ page, athlete }) => {
  const exercise = uniqueName('Overhead Press');
  await createExercise(page, { name: exercise });
  const workout = await activePlanWith(page, exercise, { sets: '3', reps: '10' });

  await page.goto('/today');
  await expect(page.getByText(workout).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: "Today's session" })).toBeVisible();

  // Matched on the card's title, not on its text: Radix renders a hidden
  // native `<select>` holding every exercise name, so a `hasText` filter
  // would match the free-form logging card as well as this one.
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: exercise }) });
  await expect(card.getByText('0 of 3 sets')).toBeVisible();

  await card.getByLabel('Reps').fill('10');
  await card.getByLabel(/^Weight \(/).fill('65');
  await card.getByRole('button', { name: 'Log set' }).click();

  await expect(card.getByText('1 of 3 sets')).toBeVisible();
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');

  // Two more sets complete the target.
  for (let i = 0; i < 2; i++) {
    await card.getByLabel('Reps').fill('10');
    await card.getByLabel(/^Weight \(/).fill('65');
    await card.getByRole('button', { name: 'Log set' }).click();
  }
  await expect(card.getByText('3 of 3 sets')).toBeVisible();

  // Complete, so the card calls it out and the form collapses behind a
  // disclosure rather than staying open for the now-uncommon "one more set".
  await expect(card).toHaveClass(/border-brand-strong/);
  await expect(card.getByLabel('Reps')).toBeHidden();
  await card.getByText('Log another set').click();
  await card.getByLabel('Reps').fill('8');
  await card.getByLabel(/^Weight \(/).fill('65');
  await card.getByRole('button', { name: 'Log set' }).click();
  await expect(card.getByText('4 of 3 sets')).toBeVisible();
});

test('starts a rest timer after logging a set and counts down to nothing', async ({ page, athlete }) => {
  await page.goto('/settings?section=rest-timer');
  await page.getByLabel('Seconds').fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const exercise = uniqueName('Row');
  await createExercise(page, { name: exercise });
  await activePlanWith(page, exercise);

  // Installed only now, after the setup above ran in real time - the clock
  // is what makes "5 seconds pass" assertable without a real wait.
  await page.clock.install();
  await page.goto('/today');

  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: exercise }) });

  await card.getByLabel('Reps').fill('10');
  await card.getByLabel(/^Weight \(/).fill('50');
  await card.getByRole('button', { name: 'Log set' }).click();

  await expect(card.getByRole('timer')).toHaveText('0:05');

  await page.clock.runFor('00:05');
  await expect(card.getByRole('timer')).toHaveCount(0);
});

test('skips the rest timer', async ({ page, athlete }) => {
  await page.goto('/settings?section=rest-timer');
  await page.getByLabel('Seconds').fill('90');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const exercise = uniqueName('Row');
  await createExercise(page, { name: exercise });
  await activePlanWith(page, exercise);

  await page.goto('/today');
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: exercise }) });

  await card.getByLabel('Reps').fill('10');
  await card.getByLabel(/^Weight \(/).fill('50');
  await card.getByRole('button', { name: 'Log set' }).click();

  await expect(card.getByRole('timer')).toBeVisible();
  await card.getByRole('button', { name: 'Skip' }).click();
  await expect(card.getByRole('timer')).toHaveCount(0);
});

test('marks a rest day but still allows logging', async ({ page, athlete }) => {
  await createPlan(page, uniqueName('Rest Cycle'));
  await page.getByRole('button', { name: 'Rest day', exact: true }).click();
  await expect(page.locator('ol > li')).toHaveCount(1);
  await submitForm(page.getByRole('button', { name: 'Set active' }));

  await page.goto('/today');
  await expect(page.getByText('Rest day').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Log a session anyway' })).toBeVisible();
});

test('offers only the cardio fields the equipment supports', async ({ page, athlete }) => {
  const rower = uniqueName('Rower');
  const exercise = uniqueName('Aerobic Rowing');

  await addEquipment(page, rower, 'Resistance only');
  await createExercise(page, { name: exercise, type: 'Cardio' });
  await linkEquipment(page, exercise, rower);

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);

  await expect(page.getByLabel('Minutes')).toBeVisible();
  await expect(page.getByLabel('Resistance')).toBeVisible();
  // Resistance-only equipment records no speed.
  await expect(page.getByLabel(/^Speed/)).toHaveCount(0);
  await expect(page.getByLabel('Reps')).toHaveCount(0);

  await page.getByLabel('Minutes').fill('20');
  await page.getByLabel('Resistance').fill('5');
  await page.getByRole('button', { name: 'Log set' }).click();

  await expect(loggedSets(page).filter({ hasText: '20 min' })).toBeVisible();
});

test('walks back to an earlier day and logs against it', async ({ page, athlete }) => {
  const exercise = uniqueName('Curl');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await page
    .getByRole('link', { name: /^Go to / })
    .first()
    .click();

  await expect(page.getByRole('heading', { name: 'Log a session' })).toBeVisible();
  await expect(page).toHaveURL(/\/today\?date=\d{4}-\d{2}-\d{2}/);

  await selectOption(page.getByLabel('Exercise'), exercise);
  await page.getByLabel('Reps').fill('12');
  await page.getByLabel(/^Weight \(/).fill('25');
  await page.getByRole('button', { name: 'Log set' }).click();
  await expect(loggedSets(page).filter({ hasText: '25 lb x 12' })).toBeVisible();

  // Yesterday's set belongs to yesterday, not to today.
  await page.goto('/today');
  await expect(loggedSets(page).filter({ hasText: '25 lb x 12' })).toHaveCount(0);
});

test('refuses a future date by falling back to today', async ({ page, athlete }) => {
  await page.goto('/today?date=2099-01-01');

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});
