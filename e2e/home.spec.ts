import { createExercise, createPlan, createWorkout, orderedRows, submitForm } from './helpers';
import { expect, test, uniqueName } from './fixtures';

test('shows zeroed stats and no active plan for a fresh athlete', async ({ page, athlete }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: `Welcome back, ${athlete.name}` })).toBeVisible();
  await expect(page.getByText('Sessions this week')).toBeVisible();
  await expect(page.getByText('None', { exact: true })).toBeVisible();
  await expect(page.getByText('No active plan')).toBeVisible();
  await expect(page.getByText('Nothing logged yet')).toBeVisible();
});

test("reflects a logged set, the active plan, and today's workout", async ({ page, athlete }) => {
  const exercise = uniqueName('Overhead Press');
  const workout = uniqueName('Push Day');
  const plan = uniqueName('PPL');

  await createExercise(page, { name: exercise });
  await createWorkout(page, workout);
  await page.getByRole('button', { name: exercise, exact: true }).click();
  await expect(orderedRows(page).filter({ hasText: exercise })).toBeVisible();

  await createPlan(page, plan);
  await page.getByRole('button', { name: workout, exact: true }).click();
  await expect(orderedRows(page)).toHaveCount(1);
  await submitForm(page.getByRole('button', { name: 'Set active' }));

  await page.goto('/today');
  const exerciseCard = page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: exercise }) });
  await exerciseCard.getByLabel('Reps').fill('10');
  await exerciseCard.getByLabel(/^Weight \(/).fill('65');
  await exerciseCard.getByRole('button', { name: 'Log set' }).click();
  await expect(page.locator('ol > li').filter({ hasText: '65 lb x 10' })).toBeVisible();

  await page.goto('/');

  const stat = (label: string) => page.locator('[data-slot="stat"]').filter({ hasText: label });
  await expect(stat('Sessions this week')).toContainText('1');
  await expect(stat('Sets this week')).toContainText('1');
  await expect(stat('Workouts logged')).toContainText('1');
  await expect(stat('Active plan')).toContainText(plan);

  await expect(page.locator('[data-slot="card-title"]', { hasText: 'Today' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log it →' })).toHaveAttribute('href', '/today');
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: 'Today' }) });
  await expect(card).toContainText(workout);
});
