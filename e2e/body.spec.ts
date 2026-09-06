import { submitForm } from './helpers';
import { expect, test } from './fixtures';

test('starts with no weight entries', async ({ page, athlete }) => {
  await page.goto('/body');

  await expect(page.getByRole('heading', { name: 'Body', exact: true })).toBeVisible();
  await expect(page.getByText('No weight entries yet')).toBeVisible();
});

test('logs a weight entry and lists it in history', async ({ page, athlete }) => {
  await page.goto('/body');

  await page.getByLabel('Date').fill('2026-03-01');
  await page.getByLabel(/^Weight \(/).fill('182.5');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Saved.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'March 1' });
  await expect(row).toContainText('182.5 lb');
});

test('keeps the most recent entry for a date rather than duplicating it', async ({ page, athlete }) => {
  await page.goto('/body');

  for (const weight of ['180', '178.4']) {
    await page.getByLabel('Date').fill('2026-03-02');
    await page.getByLabel(/^Weight \(/).fill(weight);
    await submitForm(page.getByRole('button', { name: 'Save' }));
    await expect(page.getByText('Saved.')).toBeVisible();
  }

  const rows = page.getByRole('row').filter({ hasText: 'March 2' });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('178.4 lb');
});

test('removes a weight entry', async ({ page, athlete }) => {
  await page.goto('/body');

  await page.getByLabel('Date').fill('2026-03-03');
  await page.getByLabel(/^Weight \(/).fill('175');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'March 3' })).toBeVisible();

  await page.getByRole('button', { name: /^Remove entry/ }).click();

  await expect(page.getByText('No weight entries yet')).toBeVisible();
});

test('renders weight entries in the athlete unit', async ({ page, athlete }) => {
  await page.goto('/settings');
  await page.getByLabel('Weight').click();
  await page.getByRole('option', { name: 'Kilograms (kg)' }).click();
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/body');
  await expect(page.getByLabel('Weight (kg)')).toBeVisible();

  await page.getByLabel('Date').fill('2026-03-04');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('row').filter({ hasText: 'March 4' })).toContainText('80 kg');
});

test('logs a body measurement on its own tab, independent of weight', async ({ page, athlete }) => {
  await page.goto('/body');

  await page.getByRole('link', { name: 'Waist', exact: true }).click();
  await expect(page).toHaveURL('/body?section=waist');
  await expect(page.getByText('No waist entries yet')).toBeVisible();

  await page.getByLabel('Date').fill('2026-03-05');
  await page.getByLabel(/^Waist \(/).fill('34');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'March 5' })).toContainText('34 in');

  await page.getByRole('link', { name: 'Weight', exact: true }).click();
  await expect(page.getByText('No weight entries yet')).toBeVisible();
});
