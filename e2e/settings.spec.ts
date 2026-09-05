import { createExercise, selectOption } from './helpers';
import { expect, test, uniqueName } from './fixtures';

test('defaults to pounds and kilometres', async ({ page, athlete }) => {
  await page.goto('/settings');

  await expect(page.getByLabel('Weight')).toContainText('Pounds (lb)');
  await expect(page.getByLabel('Distance & speed')).toContainText('Kilometers (km, km/h)');
});

test('changing the weight unit re-labels the logging form', async ({ page, athlete }) => {
  const exercise = uniqueName('Press');
  await createExercise(page, { name: exercise });

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  await expect(page.getByLabel('Weight (lb)')).toBeVisible();

  await page.goto('/settings');
  await selectOption(page.getByLabel('Weight'), 'Kilograms (kg)');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/today');
  await selectOption(page.getByLabel('Exercise'), exercise);
  await expect(page.getByLabel('Weight (kg)')).toBeVisible();
  await expect(page.getByLabel('Weight (lb)')).toHaveCount(0);
});

test('the unit choice survives a reload', async ({ page, athlete }) => {
  await page.goto('/settings');
  await selectOption(page.getByLabel('Distance & speed'), 'Miles (mi, mph)');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Distance & speed')).toContainText('Miles (mi, mph)');
});

test('defaults to UTC and the timezone choice survives a reload', async ({ page, athlete }) => {
  await page.goto('/settings');

  const timezone = page.getByLabel('Timezone');
  await expect(timezone).toHaveValue('UTC');

  await timezone.selectOption('America/Toronto');
  await page.locator('form', { has: timezone }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Timezone')).toHaveValue('America/Toronto');
});

test('toggles sample data visibility', async ({ page, athlete }) => {
  await page.goto('/settings');

  const checkbox = page.getByRole('checkbox', { name: 'Show sample data' });
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  await page.getByRole('button', { name: 'Save' }).last().click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Show sample data' })).not.toBeChecked();
});
