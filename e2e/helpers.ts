import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { waitForHydration } from './fixtures';

/**
 * Actions a spec needs but is not itself testing - creating the exercise a
 * workout spec then arranges, and so on. Each one drives the real UI rather
 * than seeding through a back door, so a broken create surfaces as a failure
 * in whichever spec depends on it too.
 */

/**
 * Picks an option from a Radix `Select`, which renders a button, not a
 * `<select>`.
 *
 * The dropdown is entirely client-side, so this waits for hydration first:
 * clicked too early the trigger is an inert button and no listbox ever opens.
 */
export async function selectOption(trigger: Locator, option: string): Promise<void> {
  await waitForHydration(trigger.page());
  await trigger.click();
  await trigger.page().getByRole('option', { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
}

/**
 * Picks a zone from the timezone command-dialog picker (`TimezonePicker`),
 * which opens on the trigger button `getByLabel('Timezone')` resolves to.
 *
 * Searches for `zoneQuery` and clicks the row it narrows to. Matching is
 * deliberately not `exact`: each row's accessible name also carries its live
 * local time ("Toronto 2:32 PM GMT-5"), which changes every render, so an
 * exact match on the zone name alone would be flaky.
 */
export async function chooseTimezone(trigger: Locator, zoneQuery: string): Promise<void> {
  await waitForHydration(trigger.page());
  await trigger.click();
  await trigger.page().getByPlaceholder('Search timezones...').fill(zoneQuery);
  await trigger.page().getByRole('option', { name: zoneQuery }).click();
}

/**
 * A `RenameDisclosure`'s `<summary>`, by its label.
 *
 * Scoped to the tag rather than `getByRole('button', { name: label })`: a
 * disclosure whose label matches the field inside it (`plans.$planId.tsx`'s
 * "Anchor date" wraps a `DateField` labelled the same way) resolves that role
 * query to two same-named buttons while it's open, and briefly still does
 * even after a submit that closes it, since the close only lands once
 * React's post-navigation render and effects flush - later than the
 * response `submitForm` waits for.
 */
export function renameDisclosureSummary(page: Page, label: string): Locator {
  return page.locator('summary').filter({ hasText: label });
}

/**
 * Picks a date from the `Calendar` popover a `DateField`'s trigger button
 * opens, navigating however many months separate the month it opens on from
 * the one `dateStr` falls in.
 */
export async function pickDate(trigger: Locator, dateStr: string): Promise<void> {
  const page = trigger.page();
  await waitForHydration(page);
  await trigger.click();

  const [year, month, day] = dateStr.split('-').map(Number);
  const header = page.getByRole('button', { name: 'Next month' }).locator('..');
  const monthLabel = header.getByText(/^[A-Za-z]+ \d{4}$/);

  for (let guard = 0; guard < 60; guard++) {
    const shown = new Date(`1 ${await monthLabel.textContent()}`);
    const diff = (year - shown.getFullYear()) * 12 + (month - 1 - shown.getMonth());
    if (diff === 0) break;
    await page.getByRole('button', { name: diff > 0 ? 'Next month' : 'Previous month' }).click();
  }

  await page.getByRole('button', { name: String(day), exact: true }).click();
}

export type ExerciseType = 'Strength' | 'Cardio';

export async function createExercise(
  page: Page,
  options: { name: string; type?: ExerciseType; muscleGroup?: string; description?: string },
): Promise<void> {
  const { name, type = 'Strength', muscleGroup, description } = options;

  await page.goto('/exercises');
  await waitForHydration(page);
  // Two triggers carry this label once the library is empty - the header
  // action and the empty state's call to action.
  await page.getByRole('button', { name: 'New exercise' }).first().click();

  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'New exercise' }) });
  await dialog.getByLabel('Name').fill(name);
  if (type !== 'Strength') await selectOption(dialog.getByLabel('Type'), type);
  if (muscleGroup) await selectOption(dialog.getByLabel('Muscle group'), muscleGroup);
  if (description) await dialog.getByLabel('Description').fill(description);

  await dialog.getByRole('button', { name: 'Create exercise' }).click();

  // The dialog closes itself only after the fetcher reports success, so this
  // is the signal that the exercise actually exists.
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name, exact: false })).toBeVisible();
}

/**
 * Cardio kind decides which fields the log form offers for this equipment.
 */
export type CardioKind = 'Speed & resistance' | 'Speed only' | 'Resistance only';

export async function addEquipment(page: Page, name: string, cardioKind: CardioKind = 'Speed & resistance'): Promise<void> {
  await page.goto('/exercises');
  await openEquipmentDialog(page);

  const dialog = equipmentDialog(page);
  await dialog.getByLabel('Add equipment').fill(name);
  if (cardioKind !== 'Speed & resistance') await selectOption(dialog.getByLabel('Cardio fields'), cardioKind);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(dialog.getByRole('listitem').filter({ hasText: name })).toBeVisible();
  await closeDialog(page);
}

export function equipmentDialog(page: Page): Locator {
  return page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Equipment', exact: true }) });
}

export async function openEquipmentDialog(page: Page): Promise<void> {
  await waitForHydration(page);
  await page.getByRole('button', { name: 'Manage equipment' }).click();
  await expect(equipmentDialog(page)).toBeVisible();
}

/**
 * Opens an exercise's editor from its row in the library list.
 */
export function exerciseDialog(page: Page, name: string): Locator {
  return page.getByRole('dialog').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

export async function openExercise(page: Page, name: string): Promise<Locator> {
  await waitForHydration(page);
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const dialog = exerciseDialog(page, name);
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Ticks an equipment checkbox inside an open exercise editor.
 */
export async function linkEquipment(page: Page, exerciseName: string, equipmentName: string): Promise<void> {
  await page.goto('/exercises');
  const dialog = await openExercise(page, exerciseName);
  const checkbox = dialog.getByRole('checkbox', { name: equipmentName });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await closeDialog(page);
}

export async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * Creates a workout and lands on its detail page, returning its id.
 */
export async function createWorkout(page: Page, name: string): Promise<string> {
  await page.goto('/workouts');
  // Two triggers carry this label once the list isn't empty - the header
  // action and the dashed "New workout" grid cell.
  await page.getByRole('button', { name: 'New workout' }).first().click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/workouts\/[0-9a-f-]+$/);
  await waitForHydration(page);
  return page.url().split('/').pop()!;
}

/**
 * Creates a plan and lands on its detail page, returning its id.
 */
export async function createPlan(page: Page, name: string): Promise<string> {
  await page.goto('/plans');
  // Two triggers carry this label once the list isn't empty - the header
  // action and the dashed "New plan" grid cell.
  await page.getByRole('button', { name: 'New plan' }).first().click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/plans\/[0-9a-f-]+$/);
  await waitForHydration(page);
  return page.url().split('/').pop()!;
}

/**
 * The rows of a detail page's ordered list - a workout's exercises, or a
 * plan's day-slots.
 *
 * Scoped to `ol` on purpose: the main nav is a `ul` of list items, so a bare
 * `getByRole('listitem')` would count "Today", "Exercises" and the rest as
 * rows and throw the indexes off.
 */
export function orderedRows(page: Page): Locator {
  return page.locator('ol > li');
}

/**
 * Clicks a control that submits a `<Form>` (`method="post"` or the default
 * `"get"`, as the plan/workout builders' own filters use).
 *
 * `<Form>` submits over `fetch` rather than a real document navigation, so
 * `Locator.click()` returns as soon as the click fires - it does not wait for
 * that request to land the way a plain form's full-page navigation would.
 * A caller that immediately depends on the submission having taken effect - a
 * same-page assertion tolerates the lag by retrying, but a `page.goto`
 * elsewhere does not, and can abort the fetch outright mid-flight - needs
 * that guarantee, so this waits for its response before returning.
 *
 * Waiting for hydration first still matters on a freshly loaded document:
 * React attaches its click handler a beat after the document is live, and a
 * click fired inside that window can be lost outright.
 */
export async function submitForm(control: Locator): Promise<void> {
  const page = control.page();
  await waitForHydration(page);
  await Promise.all([
    page.waitForResponse((response) => ['fetch', 'xhr', 'document'].includes(response.request().resourceType())),
    control.click(),
  ]);
}

/**
 * Signs out through the top bar's account menu, present at every viewport.
 */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}
