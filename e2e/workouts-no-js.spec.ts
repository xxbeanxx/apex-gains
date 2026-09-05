import { expect, test } from '@playwright/test';

import { createExercise, createWorkout } from './helpers';
import { newAthlete, uniqueName } from './fixtures';

/**
 * The workout builder's palette add and edit-target `<details>` disclosure
 * are both plain `<form method="post">`s specifically so they keep working
 * with JavaScript disabled - this is the regression guard for that decision.
 *
 * `./fixtures`'s `page` fixture waits for React to hydrate after every
 * navigation, which a JavaScript-disabled page never does, so this spec
 * builds its own two contexts instead of using it: one ordinary context to
 * sign in and create the exercise/workout through the normal (JS-dependent)
 * dialogs, and a second with `javaScriptEnabled: false` - carrying over the
 * first context's `storageState` so it starts already signed in - that does
 * the actual add-exercise/edit-target flow under test.
 */
test('adds an exercise and edits its target with JavaScript disabled', async ({ browser }) => {
  const exercise = uniqueName('Bench Press');
  const workout = uniqueName('Chest Day');

  const setupContext = await browser.newContext();
  const setupPage = await setupContext.newPage();
  await newAthlete(setupPage);
  await createExercise(setupPage, { name: exercise, muscleGroup: 'chest' });
  await createWorkout(setupPage, workout);
  const workoutUrl = setupPage.url();
  const storageState = await setupContext.storageState();
  await setupContext.close();

  const noJsContext = await browser.newContext({ javaScriptEnabled: false, storageState });
  const page = await noJsContext.newPage();

  await page.goto(workoutUrl);
  // `dispatchEvent`, not `click`: a plain form submit navigates the whole
  // document, detaching the clicked button mid-action. `click()`'s
  // actionability retry treats that detachment as ambiguous and re-resolves
  // the same-named button on the post-navigation page, where it's now
  // permanently `disabled` (already added) - so it waits forever for it to
  // become enabled. Dispatching the event directly submits the form without
  // that retry loop; the row assertion below is what waits for the
  // navigation to land.
  await page.getByRole('button', { name: exercise, exact: true }).dispatchEvent('click');

  const row = page.locator('ol > li').filter({ hasText: exercise });
  await expect(row).toBeVisible();

  await row.getByText('Edit target').click();
  await row.getByLabel('Sets').fill('3');
  await row.getByLabel('Reps').fill('10');
  await row.getByLabel(/^Weight \(/).fill('135');
  await row.getByRole('button', { name: 'Save target' }).dispatchEvent('click');

  await expect(row).toContainText('3 sets');
  await expect(row).toContainText('10 reps');
  await expect(row).toContainText('135 lb');

  await noJsContext.close();
});
