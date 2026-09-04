import type { Page } from '@playwright/test';

import { createRoutine, createTemplate, orderedRows, selectOption, submitForm } from './helpers';
import { expect, test, uniqueName } from './fixtures';

/** Adds one day-slot to the open routine detail page. */
async function addDay(page: Page, dayType: string) {
  const before = await orderedRows(page).count();
  await selectOption(page.getByLabel('Day type'), dayType);
  await submitForm(page.getByRole('button', { name: 'Add', exact: true }));
  await expect(orderedRows(page)).toHaveCount(before + 1);
}

test('creates a routine, inactive and empty', async ({ page, athlete }) => {
  const name = uniqueName('PPL');
  await createRoutine(page, name);

  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Inactive')).toBeVisible();
  await expect(page.getByText('No days yet')).toBeVisible();
});

test('adds rest days and template days in cycle order', async ({ page, athlete }) => {
  const template = uniqueName('Push');
  await createTemplate(page, template);

  const routine = uniqueName('Split');
  await createRoutine(page, routine);

  await addDay(page, template);
  await addDay(page, 'Rest day');

  const days = orderedRows(page);
  await expect(days.nth(0)).toContainText(template);
  await expect(days.nth(1)).toContainText('Rest');
  await expect(page.getByText('A 2-day cycle that repeats from its anchor date.')).toBeVisible();
});

test('reorders and removes day-slots', async ({ page, athlete }) => {
  const template = uniqueName('Legs');
  await createTemplate(page, template);

  const routine = uniqueName('Cycle');
  await createRoutine(page, routine);
  await addDay(page, template);
  await addDay(page, 'Rest day');

  const days = orderedRows(page);
  await submitForm(page.getByRole('button', { name: 'Move day 2 up' }));
  await expect(days.nth(0)).toContainText('Rest');
  await expect(days.nth(1)).toContainText(template);

  await submitForm(page.getByRole('button', { name: 'Remove day 1 from this routine' }));
  await expect(days).toHaveCount(1);
  await expect(days.nth(0)).toContainText(template);
});

test('renames a routine and re-anchors its cycle', async ({ page, athlete }) => {
  const name = uniqueName('Anchored');
  const renamed = uniqueName('Reanchored');
  await createRoutine(page, name);

  await page.getByLabel('Name').fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();

  await page.getByLabel('Anchor date').fill('2026-01-05');
  await submitForm(page.getByRole('button', { name: 'Save', exact: true }).last());
  await expect(page.getByLabel('Anchor date')).toHaveValue('2026-01-05');
});

test('activates a routine, and activating a second deactivates the first', async ({ page, athlete }) => {
  const first = uniqueName('First');
  const second = uniqueName('Second');

  const firstId = await createRoutine(page, first);
  await submitForm(page.getByRole('button', { name: 'Set active' }));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  await createRoutine(page, second);
  await submitForm(page.getByRole('button', { name: 'Set active' }));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  // Only one routine may be active at a time, so the first must have been
  // stood down in the same transaction.
  await page.goto(`/routines/${firstId}`);
  await expect(page.getByText('Inactive')).toBeVisible();

  await page.goto('/routines');
  await expect(page.getByRole('listitem').filter({ hasText: second }).getByText('Active')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: first }).getByText('Active')).toHaveCount(0);
});

test('deactivates an active routine', async ({ page, athlete }) => {
  const name = uniqueName('Toggle');
  await createRoutine(page, name);

  await submitForm(page.getByRole('button', { name: 'Set active' }));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  await submitForm(page.getByRole('button', { name: 'Deactivate' }));
  await expect(page.getByText('Inactive')).toBeVisible();
});

test('deletes a routine', async ({ page, athlete }) => {
  const name = uniqueName('Doomed');
  await createRoutine(page, name);

  await submitForm(page.getByRole('button', { name: 'Delete routine' }));

  await page.waitForURL('/routines');
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

test('points at the templates page when there are none to add', async ({ page, athlete }) => {
  await createRoutine(page, uniqueName('Empty'));

  await expect(page.getByText("You don't have any templates yet")).toBeVisible();
  await expect(page.getByRole('link', { name: 'create one' })).toBeVisible();
});
