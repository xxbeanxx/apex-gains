import { expect, test, uniqueName } from './fixtures';
import { chooseTimezone, createExercise, selectOption } from './helpers';

test('defaults to pounds and kilometres', async ({ page, athlete }) => {
  await page.goto('/settings');

  await expect(page.getByLabel('Weight')).toContainText('Pounds (lb)');
  await expect(page.getByLabel('Distance & speed')).toContainText('Kilometers (km, km/h)');
});

test('the sub-nav switches sections, and a save stays on the section that made it', async ({ page, athlete }) => {
  await page.goto('/settings');

  await expect(page.getByLabel('Weight')).toBeVisible();
  await expect(page.getByLabel('Timezone')).toHaveCount(0);

  await page.getByRole('link', { name: 'Timezone' }).click();
  await expect(page).toHaveURL(/\?section=timezone$/);
  await expect(page.getByLabel('Timezone')).toBeVisible();
  await expect(page.getByLabel('Weight')).toHaveCount(0);

  await chooseTimezone(page.getByLabel('Timezone'), 'Toronto');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(/\?section=timezone$/);
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByLabel('Timezone')).toContainText('Toronto');
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
  await page.goto('/settings?section=timezone');

  const timezone = page.getByLabel('Timezone');
  await expect(timezone).toContainText('UTC');

  await chooseTimezone(timezone, 'Toronto');
  await page.locator('form', { has: timezone }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Timezone')).toContainText('Toronto');
});

test('sets a default rest duration and it survives a reload', async ({ page, athlete }) => {
  await page.goto('/settings?section=rest-timer');

  await page.getByLabel('Seconds').fill('90');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Seconds')).toHaveValue('90');
});

test('toggles sample data visibility', async ({ page, athlete }) => {
  await page.goto('/settings?section=sample-data');

  const checkbox = page.getByRole('checkbox', { name: 'Show sample data' });
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  await page.getByRole('button', { name: 'Save' }).last().click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Show sample data' })).not.toBeChecked();
});

test('downloads a JSON and a CSV export of the athlete’s own data', async ({ page, athlete }) => {
  await page.goto('/settings?section=account');

  const jsonResponse = await page.request.get('/settings/export?format=json');
  expect(jsonResponse.status()).toBe(200);
  expect(jsonResponse.headers()['content-type']).toContain('application/json');
  expect(jsonResponse.headers()['content-disposition']).toContain('attachment');
  const snapshot = await jsonResponse.json();
  expect(snapshot.athlete.email).toBe(athlete.email);

  const csvResponse = await page.request.get('/settings/export?format=csv');
  expect(csvResponse.status()).toBe(200);
  expect(csvResponse.headers()['content-type']).toContain('text/csv');
  expect(csvResponse.headers()['content-disposition']).toContain('attachment');
  expect((await csvResponse.text()).split('\n')[0]).toContain('exercise_name');
});

test('closes an athlete’s own account, ending the session', async ({ page, athlete }) => {
  await page.goto('/settings?section=account');

  await page.getByLabel('Type your email to confirm').fill('wrong@example.test');
  await page.getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close account' }).click();
  await expect(page.getByText("That doesn't match your account's email address.")).toBeVisible();

  await page.getByLabel('Type your email to confirm').fill(athlete.email);
  await page.getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close account' }).click();

  await page.waitForURL('/');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();

  const response = await page.request.get('/today', { maxRedirects: 0 });
  expect(response.status()).toBe(302);
});
