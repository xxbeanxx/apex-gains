import { submitForm } from './helpers';
import { expect, test } from './fixtures';

test('starts with no weigh-ins', async ({ page, athlete }) => {
  await page.goto('/weight');

  await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible();
  await expect(page.getByText('No weigh-ins yet')).toBeVisible();
});

test('logs a weigh-in and lists it in history', async ({ page, athlete }) => {
  await page.goto('/weight');

  await page.getByLabel('Date').fill('2026-03-01');
  await page.getByLabel(/^Weight \(/).fill('182.5');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Saved.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'March 1' });
  await expect(row).toContainText('182.5 lb');
});

test('keeps the most recent entry for a date rather than duplicating it', async ({ page, athlete }) => {
  await page.goto('/weight');

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

test('removes a weigh-in', async ({ page, athlete }) => {
  await page.goto('/weight');

  await page.getByLabel('Date').fill('2026-03-03');
  await page.getByLabel(/^Weight \(/).fill('175');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'March 3' })).toBeVisible();

  await page.getByRole('button', { name: /^Remove weigh-in/ }).click();

  await expect(page.getByText('No weigh-ins yet')).toBeVisible();
});

test('renders weigh-ins in the athlete unit', async ({ page, athlete }) => {
  await page.goto('/settings');
  await page.getByLabel('Weight').click();
  await page.getByRole('option', { name: 'Kilograms (kg)' }).click();
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/weight');
  await expect(page.getByLabel('Weight (kg)')).toBeVisible();

  await page.getByLabel('Date').fill('2026-03-04');
  await page.getByLabel('Weight (kg)').fill('80');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('row').filter({ hasText: 'March 4' })).toContainText('80 kg');
});
