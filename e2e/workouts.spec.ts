import type { Page } from '@playwright/test';

import { createExercise, createWorkout, orderedRows, selectOption, submitForm } from './helpers';
import { expect, test, uniqueName } from './fixtures';

/** Adds an exercise to the open workout builder by clicking it in the palette. */
async function addExercise(page: Page, exercise: string): Promise<void> {
  await page.getByRole('button', { name: exercise, exact: true }).click();
  await expect(orderedRows(page).filter({ hasText: exercise })).toBeVisible();
}

/** Opens a canvas row's "Edit target" disclosure and saves the given fields. */
async function setTarget(
  page: Page,
  exercise: string,
  targets: { sets?: string; reps?: string; weight?: string; minutes?: string; speed?: string; resistance?: string },
): Promise<void> {
  const row = orderedRows(page).filter({ hasText: exercise });
  await row.getByText('Edit target').click();
  if (targets.sets) await row.getByLabel('Sets').fill(targets.sets);
  if (targets.reps) await row.getByLabel('Reps').fill(targets.reps);
  if (targets.weight) await row.getByLabel(/^Weight \(/).fill(targets.weight);
  if (targets.minutes) await row.getByLabel('Minutes').fill(targets.minutes);
  if (targets.speed) await row.getByLabel(/^Speed \(/).fill(targets.speed);
  if (targets.resistance) await row.getByLabel('Resistance').fill(targets.resistance);
  await row.getByRole('button', { name: 'Save target' }).click();
}

test('creates a workout and lands on its detail page', async ({ page, athlete }) => {
  const name = uniqueName('Push Day');
  await createWorkout(page, name);

  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('No exercises yet')).toBeVisible();
});

test('lists a new workout back on the index', async ({ page, athlete }) => {
  const name = uniqueName('Pull Day');
  await createWorkout(page, name);

  await page.goto('/workouts');
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('0 exercises');
});

test('adds an exercise with targets, which show as a summary', async ({ page, athlete }) => {
  const exercise = uniqueName('Bench Press');
  const workout = uniqueName('Chest Day');

  await createExercise(page, { name: exercise, muscleGroup: 'chest' });
  await createWorkout(page, workout);
  await addExercise(page, exercise);
  await setTarget(page, exercise, { sets: '3', reps: '10', weight: '135' });

  const row = orderedRows(page).filter({ hasText: exercise });
  await expect(row).toContainText('3 sets');
  await expect(row).toContainText('10 reps');
  await expect(row).toContainText('135 lb');

  await page.goto('/workouts');
  await expect(page.getByRole('listitem').filter({ hasText: workout })).toContainText('1 exercise');
});

test('renames a workout', async ({ page, athlete }) => {
  const name = uniqueName('Leg Day');
  const renamed = uniqueName('Lower Body');
  await createWorkout(page, name);

  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name').fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
});

test('reorders exercises and closes the gap when one is removed', async ({ page, athlete }) => {
  const first = uniqueName('Squat');
  const second = uniqueName('Deadlift');
  const workout = uniqueName('Strength Day');

  await createExercise(page, { name: first });
  await createExercise(page, { name: second });
  await createWorkout(page, workout);
  await addExercise(page, first);
  await addExercise(page, second);

  const rows = orderedRows(page);
  await expect(rows.nth(0)).toContainText(first);
  await expect(rows.nth(1)).toContainText(second);

  await submitForm(page.getByRole('button', { name: `Move ${second} up` }));
  await expect(rows.nth(0)).toContainText(second);
  await expect(rows.nth(1)).toContainText(first);

  // The first row's "move up" is disabled - position 0 has nowhere to go.
  await expect(page.getByRole('button', { name: `Move ${second} up` })).toBeDisabled();

  await page.getByRole('button', { name: `Actions for ${second}` }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await expect(orderedRows(page).filter({ hasText: second })).toHaveCount(0);
  await expect(rows.nth(0)).toContainText(first);
});

test('deletes a workout', async ({ page, athlete }) => {
  const name = uniqueName('Throwaway');
  await createWorkout(page, name);

  await page.getByRole('button', { name: 'Delete workout' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete workout' }).click();

  await page.waitForURL('/workouts');
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

/** YYYY-MM-DD for `daysAgo` days before today, in UTC - matches a fresh athlete's default timezone. */
function dateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

/** Logs three identical sets for `exercise` on the free-form /today form, on the given date. */
async function logThreeSets(page: Page, date: string, exercise: string, reps: string, weight: string): Promise<void> {
  await page.goto(`/today?date=${date}`);
  await selectOption(page.getByLabel('Exercise'), exercise);
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Reps').fill(reps);
    await page.getByLabel(/^Weight \(/).fill(weight);
    await page.getByRole('button', { name: 'Log set' }).click();
  }
  await expect(page.locator('ol > li').filter({ hasText: `${weight} lb x ${reps}` })).toHaveCount(3);
}

test('suggests raising the weight after two strong sessions, and applying it updates the target', async ({ page, athlete }) => {
  const exercise = uniqueName('Bench Press');
  const workout = uniqueName('Push Day');

  await createExercise(page, { name: exercise });
  const workoutId = await createWorkout(page, workout);
  await addExercise(page, exercise);
  await setTarget(page, exercise, { sets: '3', reps: '8', weight: '100' });

  await logThreeSets(page, dateDaysAgo(2), exercise, '8', '100');
  await logThreeSets(page, dateDaysAgo(1), exercise, '8', '100');

  await page.goto(`/workouts/${workoutId}`);
  const row = orderedRows(page).filter({ hasText: exercise });
  await expect(row).toContainText('Suggested: 3 x 8, 105 lb — you hit 3 x 8 twice');

  await row.getByRole('button', { name: 'Apply' }).click();
  await expect(row).toContainText('105 lb');
  // The just-applied target is heavier than any set on record, so there is
  // nothing left to suggest until the athlete trains at the new weight.
  await expect(row.getByText('Suggested:')).toHaveCount(0);
});

test('offers cardio targets instead of sets and reps', async ({ page, athlete }) => {
  const exercise = uniqueName('Treadmill Walk');
  const workout = uniqueName('Cardio Day');

  await createExercise(page, { name: exercise, type: 'Cardio' });
  await createWorkout(page, workout);
  await addExercise(page, exercise);

  const row = orderedRows(page).filter({ hasText: exercise });
  await row.getByText('Edit target').click();

  await expect(row.getByLabel('Minutes')).toBeVisible();
  await expect(row.getByLabel('Sets')).toHaveCount(0);
  await expect(row.getByLabel('Reps')).toHaveCount(0);
});
