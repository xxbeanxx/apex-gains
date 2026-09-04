import { createExercise, createTemplate, orderedRows, selectOption, submitForm } from './helpers';
import { expect, test, uniqueName } from './fixtures';

/** Adds an exercise to the open template detail page, with optional targets. */
async function addExercise(
  page: import('@playwright/test').Page,
  exercise: string,
  targets?: { sets?: string; reps?: string; weight?: string },
) {
  await selectOption(page.getByLabel('Exercise'), exercise);
  if (targets?.sets) await page.getByLabel('Sets').fill(targets.sets);
  if (targets?.reps) await page.getByLabel('Reps').fill(targets.reps);
  if (targets?.weight) await page.getByLabel(/^Weight \(/).fill(targets.weight);
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await expect(orderedRows(page).filter({ hasText: exercise })).toBeVisible();
}

test('creates a template and lands on its detail page', async ({ page, athlete }) => {
  const name = uniqueName('Push Day');
  await createTemplate(page, name);

  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('No exercises yet')).toBeVisible();
});

test('lists a new template back on the index', async ({ page, athlete }) => {
  const name = uniqueName('Pull Day');
  await createTemplate(page, name);

  await page.goto('/templates');
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('0 exercises');
});

test('adds an exercise with targets, which show as a summary', async ({ page, athlete }) => {
  const exercise = uniqueName('Bench Press');
  const template = uniqueName('Chest Day');

  await createExercise(page, { name: exercise, muscleGroup: 'chest' });
  await createTemplate(page, template);
  await addExercise(page, exercise, { sets: '3', reps: '10', weight: '135' });

  const row = orderedRows(page).filter({ hasText: exercise });
  await expect(row).toContainText('3 x 10, 135 lb');

  await page.goto('/templates');
  await expect(page.getByRole('listitem').filter({ hasText: template })).toContainText('1 exercise');
});

test('renames a template', async ({ page, athlete }) => {
  const name = uniqueName('Leg Day');
  const renamed = uniqueName('Lower Body');
  await createTemplate(page, name);

  await page.getByLabel('Name').fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
});

test('reorders exercises and closes the gap when one is removed', async ({ page, athlete }) => {
  const first = uniqueName('Squat');
  const second = uniqueName('Deadlift');
  const template = uniqueName('Strength Day');

  await createExercise(page, { name: first });
  await createExercise(page, { name: second });
  await createTemplate(page, template);
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

  await submitForm(page.getByRole('button', { name: `Remove ${second} from this template` }));
  await expect(orderedRows(page).filter({ hasText: second })).toHaveCount(0);
  await expect(rows.nth(0)).toContainText(first);
});

test('deletes a template', async ({ page, athlete }) => {
  const name = uniqueName('Throwaway');
  await createTemplate(page, name);

  await page.getByRole('button', { name: 'Delete template' }).click();

  await page.waitForURL('/templates');
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

test('offers cardio targets instead of sets and reps', async ({ page, athlete }) => {
  const exercise = uniqueName('Treadmill Walk');
  const template = uniqueName('Cardio Day');

  await createExercise(page, { name: exercise, type: 'Cardio' });
  await createTemplate(page, template);
  await selectOption(page.getByLabel('Exercise'), exercise);

  await expect(page.getByLabel('Minutes')).toBeVisible();
  await expect(page.getByLabel('Sets')).toHaveCount(0);
  await expect(page.getByLabel('Reps')).toHaveCount(0);
});
