import type { Page } from '@playwright/test';

import { createExercise, createRoutine, createTemplate, orderedRows, selectOption, submitForm } from './helpers';
import { expect, newAthlete, signIn, test, uniqueName, waitForHydration } from './fixtures';

/**
 * Sharing a routine, and taking one somebody shared.
 *
 * Isolation is per-athlete, as everywhere here, so a spec that needs two
 * people signs the same browser in as a second one - a share link is
 * deliberately not scoped to a session, which is what makes that work.
 */

/** Builds a routine of one template day and one rest day, and returns its share link. */
async function shareARoutine(page: Page, names: { exercise: string; template: string; routine: string }): Promise<string> {
  await createExercise(page, { name: names.exercise, muscleGroup: 'chest' });

  await createTemplate(page, names.template);
  await selectOption(page.getByLabel('Exercise'), names.exercise);
  await page.getByLabel('Sets').fill('3');
  await page.getByLabel('Reps').fill('10');
  await page.getByLabel(/^Weight \(/).fill('135');
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await expect(orderedRows(page).filter({ hasText: names.exercise })).toBeVisible();

  await createRoutine(page, names.routine);
  await selectOption(page.getByLabel('Day type'), names.template);
  await submitForm(page.getByRole('button', { name: 'Add', exact: true }));
  await expect(orderedRows(page)).toHaveCount(1);
  await selectOption(page.getByLabel('Day type'), 'Rest day');
  await submitForm(page.getByRole('button', { name: 'Add', exact: true }));
  await expect(orderedRows(page)).toHaveCount(2);

  await submitForm(page.getByRole('button', { name: 'Share', exact: true }));

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog.getByLabel('Share link').inputValue();
}

function uniqueNames() {
  return { exercise: uniqueName('Bench'), template: uniqueName('Push'), routine: uniqueName('Split') };
}

test('shares a routine, showing a link and a scannable QR code', async ({ page, athlete }) => {
  const names = uniqueNames();
  const link = await shareARoutine(page, names);

  expect(link).toMatch(/^http:\/\/localhost:3100\/routines\/import\/[\w-]+$/);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: `QR code linking to the shared routine ${names.routine}` })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stop sharing' })).toBeVisible();
});

test('hands the same link back on a second share, so one already sent still works', async ({ page, athlete }) => {
  const names = uniqueNames();
  const first = await shareARoutine(page, names);

  await page.keyboard.press('Escape');
  await submitForm(page.getByRole('button', { name: 'Show link' }));

  expect(await page.getByRole('dialog').getByLabel('Share link').inputValue()).toBe(first);
});

test('revoking a link leaves it resolving to nothing', async ({ page, athlete }) => {
  const link = await shareARoutine(page, uniqueNames());

  await submitForm(page.getByRole('dialog').getByRole('button', { name: 'Stop sharing' }));
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();

  await newAthlete(page);
  expect((await page.request.get(link)).status()).toBe(404);
});

test('another athlete imports the routine, its templates and its exercises', async ({ page, athlete }) => {
  const names = uniqueNames();
  const link = await shareARoutine(page, names);
  const sharer = athlete.name;

  await newAthlete(page);
  await page.goto(link);

  // The confirmation page says who shared it and what taking it will add.
  await expect(page.getByRole('heading', { name: names.routine, exact: true })).toBeVisible();
  await expect(page.getByText(`${sharer} shared this 2-day routine with you.`)).toBeVisible();
  await expect(page.getByText('This also adds 1 template and 1 exercise to your library.')).toBeVisible();
  await expect(orderedRows(page).nth(0)).toContainText(names.template);
  await expect(orderedRows(page).nth(1)).toContainText('Rest');

  await submitForm(page.getByRole('button', { name: 'Import', exact: true }));
  await page.waitForURL(/\/routines\/[0-9a-f-]+$/);
  await waitForHydration(page);

  // Their own routine now, not the sharer's - inactive, and theirs to delete.
  await expect(page.getByRole('heading', { name: names.routine, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Delete routine` })).toBeVisible();
  await expect(orderedRows(page).nth(0)).toContainText(names.template);

  // The template came with it, targets intact...
  await page.goto('/templates');
  await page.getByRole('link', { name: names.template }).click();
  await waitForHydration(page);
  await expect(orderedRows(page).filter({ hasText: names.exercise })).toContainText('3 x 10, 135 lb');

  // ...and so did the exercise it needs.
  await page.goto('/exercises');
  await expect(page.getByRole('button', { name: names.exercise, exact: false })).toBeVisible();
});

test('the anchor date starts on the original and can be moved before importing', async ({ page, athlete }) => {
  const names = uniqueNames();
  await createRoutine(page, names.routine);
  await page.getByLabel('Anchor date').fill('2026-01-05');
  await submitForm(page.getByRole('button', { name: 'Save', exact: true }).last());
  await expect(page.getByLabel('Anchor date')).toHaveValue('2026-01-05');

  await submitForm(page.getByRole('button', { name: 'Share', exact: true }));
  const link = await page.getByRole('dialog').getByLabel('Share link').inputValue();

  await newAthlete(page);
  await page.goto(link);

  await expect(page.getByLabel('Anchor date')).toHaveValue('2026-01-05');
  await page.getByLabel('Anchor date').fill('2026-03-09');
  await submitForm(page.getByRole('button', { name: 'Import', exact: true }));

  await page.waitForURL(/\/routines\/[0-9a-f-]+$/);
  await waitForHydration(page);
  await expect(page.getByLabel('Anchor date')).toHaveValue('2026-03-09');
});

test('reuses an exercise the importer already has under the same name', async ({ page, athlete }) => {
  const names = uniqueNames();
  const link = await shareARoutine(page, names);

  await newAthlete(page);
  await createExercise(page, { name: names.exercise, muscleGroup: 'chest' });

  await page.goto(link);
  await expect(page.getByText('This also adds 1 template to your library.')).toBeVisible();

  await submitForm(page.getByRole('button', { name: 'Import', exact: true }));
  await page.waitForURL(/\/routines\/[0-9a-f-]+$/);

  // One exercise, not two - a second under that name is a constraint
  // violation, so a same-named one has to be treated as the same movement.
  await page.goto('/exercises');
  await expect(page.getByRole('button', { name: names.exercise, exact: false })).toHaveCount(1);
});

test('sends the sharer to their own routine rather than offering them a copy', async ({ page, athlete }) => {
  const names = uniqueNames();
  const link = await shareARoutine(page, names);
  const routineUrl = page.url().split('?')[0]!;

  await page.goto(link);

  await expect(page).toHaveURL(routineUrl);
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
});

test('answers 404 for a link that was never minted', async ({ page, athlete }) => {
  expect((await page.request.get('/routines/import/never-minted-this')).status()).toBe(404);
});

test.describe('signing in on the way to a shared routine', () => {
  test('bounces an anonymous visitor to Google, keeping the link as the destination', async ({ page, athlete }) => {
    const link = await shareARoutine(page, uniqueNames());
    const path = new URL(link).pathname;

    await page.goto('/today');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('/');

    // Deliberately not `page.goto`: following the redirect would have the
    // server perform real OIDC discovery against Google.
    const response = await page.request.get(path, { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe(`/auth/google?redirectTo=${encodeURIComponent(path)}`);
  });

  /**
   * The other half of that round-trip. A real sign-in carries `redirectTo`
   * in the OIDC state cookie and the callback follows it through
   * `safeRedirect`; the test-login route reads the same parameter through
   * the same helper, so this exercises the landing a scanned QR code depends
   * on - including for an account that did not exist when the link was sent.
   */
  test('lands a newly registered athlete back on the import page', async ({ page, athlete }) => {
    const names = uniqueNames();
    const link = await shareARoutine(page, names);
    const path = new URL(link).pathname;

    const email = `${uniqueName('scanner')}@example.test`;
    await page.goto(`/auth/test-login?email=${encodeURIComponent(email)}&redirectTo=${encodeURIComponent(path)}`);

    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { name: names.routine, exact: true })).toBeVisible();

    await submitForm(page.getByRole('button', { name: 'Import', exact: true }));
    await page.waitForURL(/\/routines\/[0-9a-f-]+$/);
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: names.routine, exact: true })).toBeVisible();
  });

  test('refuses to be sent off-site by a tampered link', async ({ page }) => {
    await signIn(page, { email: `${uniqueName('redirect')}@example.test`, name: 'Redirect' });

    const response = await page.request.get(
      `/auth/test-login?email=${encodeURIComponent('a@example.test')}&redirectTo=https%3A%2F%2Fevil.example`,
      { maxRedirects: 0 },
    );

    expect(response.headers()['location']).toBe('/today');
  });
});
