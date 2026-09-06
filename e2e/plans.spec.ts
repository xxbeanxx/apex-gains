import type { Page } from '@playwright/test';

import { createPlan, createWorkout, orderedRows, submitForm } from './helpers';
import { expect, test, uniqueName } from './fixtures';

/** Adds one day-slot to the open plan detail page by clicking it in the palette. */
async function addDay(page: Page, dayType: string) {
  const before = await orderedRows(page).count();
  await page.getByRole('button', { name: dayType, exact: true }).click();
  await expect(orderedRows(page)).toHaveCount(before + 1);
}

test('creates a plan, inactive and empty', async ({ page, athlete }) => {
  const name = uniqueName('PPL');
  await createPlan(page, name);

  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Inactive')).toBeVisible();
  await expect(page.getByText('No days yet')).toBeVisible();
});

test('adds rest days and workout days in cycle order', async ({ page, athlete }) => {
  const workout = uniqueName('Push');
  await createWorkout(page, workout);

  const plan = uniqueName('Split');
  await createPlan(page, plan);

  await addDay(page, workout);
  await addDay(page, 'Rest day');

  const days = orderedRows(page);
  await expect(days.nth(0)).toContainText(workout);
  await expect(days.nth(1)).toContainText('Rest');
  await expect(page.getByText('A 2-day cycle that repeats from its anchor date.')).toBeVisible();
});

test('reorders and removes day-slots', async ({ page, athlete }) => {
  const workout = uniqueName('Legs');
  await createWorkout(page, workout);

  const plan = uniqueName('Cycle');
  await createPlan(page, plan);
  await addDay(page, workout);
  await addDay(page, 'Rest day');

  const days = orderedRows(page);
  await submitForm(page.getByRole('button', { name: 'Move day 2 up' }));
  await expect(days.nth(0)).toContainText('Rest');
  await expect(days.nth(1)).toContainText(workout);

  await page.getByRole('button', { name: 'Actions for day 1' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await expect(days).toHaveCount(1);
  await expect(days.nth(0)).toContainText(workout);
});

test('renames a plan and re-anchors its cycle', async ({ page, athlete }) => {
  const name = uniqueName('Anchored');
  const renamed = uniqueName('Reanchored');
  await createPlan(page, name);

  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name').fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Anchor date' }).click();
  await page.getByLabel('Anchor date').fill('2026-01-05');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByRole('button', { name: 'Anchor date' }).click();
  await expect(page.getByLabel('Anchor date')).toHaveValue('2026-01-05');
});

test('activates a plan, and activating a second deactivates the first', async ({ page, athlete }) => {
  const first = uniqueName('First');
  const second = uniqueName('Second');

  const firstId = await createPlan(page, first);
  await submitForm(page.getByRole('button', { name: 'Set active' }));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  await createPlan(page, second);
  await submitForm(page.getByRole('button', { name: 'Set active' }));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  // Only one plan may be active at a time, so the first must have been
  // stood down in the same transaction.
  await page.goto(`/plans/${firstId}`);
  await expect(page.getByText('Inactive')).toBeVisible();

  await page.goto('/plans');
  await expect(page.getByRole('listitem').filter({ hasText: second }).getByText('Active')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: first }).getByText('Active')).toHaveCount(0);
});

test('deactivates an active plan', async ({ page, athlete }) => {
  const name = uniqueName('Toggle');
  await createPlan(page, name);

  await submitForm(page.getByRole('button', { name: 'Set active' }));
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  await submitForm(page.getByRole('button', { name: 'Deactivate' }));
  await expect(page.getByText('Inactive')).toBeVisible();
});

test('deletes a plan', async ({ page, athlete }) => {
  const name = uniqueName('Doomed');
  await createPlan(page, name);

  await page.getByRole('button', { name: 'Delete plan' }).click();
  await submitForm(page.getByRole('alertdialog').getByRole('button', { name: 'Delete plan' }));

  await page.waitForURL('/plans');
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

test('points at the workouts page when there are none to add', async ({ page, athlete }) => {
  await createPlan(page, uniqueName('Empty'));

  await expect(page.getByText("You don't have any workouts yet")).toBeVisible();
  await expect(page.getByRole('link', { name: 'create one' })).toBeVisible();
});
