import { addEquipment, closeDialog, createExercise, openEquipmentDialog, openExercise, selectOption } from './helpers';
import { expect, test, uniqueName } from './fixtures';

test.describe('exercise library', () => {
  test('starts empty and offers the first exercise', async ({ page, athlete }) => {
    await page.goto('/exercises');

    await expect(page.getByRole('heading', { name: 'Exercise Library' })).toBeVisible();
    await expect(page.getByText('No exercises yet')).toBeVisible();
    await expect(page.getByText('0 movements across 0 pieces of equipment.')).toBeVisible();
  });

  test('creates a strength exercise and shows it in the library', async ({ page, athlete }) => {
    const name = uniqueName('Bench Press');
    await createExercise(page, { name, muscleGroup: 'chest', description: 'Press the handles forward.' });

    await expect(page.getByRole('button', { name })).toBeVisible();
    // Own exercises are badged to separate them from sample rows.
    await expect(page.getByRole('listitem').filter({ hasText: name }).getByText('Yours')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'chest' })).toBeVisible();
  });

  test('groups a cardio exercise under its own bucket', async ({ page, athlete }) => {
    const name = uniqueName('Treadmill Run');
    await createExercise(page, { name, type: 'Cardio' });

    await expect(page.getByRole('heading', { name: 'cardio' })).toBeVisible();
  });

  test('edits an exercise through its editor dialog', async ({ page, athlete }) => {
    const name = uniqueName('Row');
    const renamed = uniqueName('Renamed Row');
    await createExercise(page, { name });

    const dialog = await openExercise(page, name);
    await dialog.getByLabel('Name').fill(renamed);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await closeDialog(page);
    await expect(page.getByRole('button', { name: renamed })).toBeVisible();
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  });

  test('rejects a blank exercise name', async ({ page, athlete }) => {
    await page.goto('/exercises');
    await page.getByRole('button', { name: 'New exercise' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create exercise' }).click();

    // `required` on the input means the browser blocks the submit outright,
    // so the dialog is still open and nothing was created.
    await expect(dialog).toBeVisible();
  });
});

test.describe('equipment', () => {
  test('adds equipment and links it to an exercise', async ({ page, athlete }) => {
    const equipment = uniqueName('Rowing Machine');
    const exercise = uniqueName('Aerobic Rowing');

    await addEquipment(page, equipment, 'Resistance only');
    await createExercise(page, { name: exercise, type: 'Cardio' });

    const dialog = await openExercise(page, exercise);
    const checkbox = dialog.getByRole('checkbox', { name: equipment });
    await checkbox.click();
    await expect(checkbox).toBeChecked();

    await closeDialog(page);
    await page.reload();

    const reopened = await openExercise(page, exercise);
    await expect(reopened.getByRole('checkbox', { name: equipment })).toBeChecked();
  });

  test('removes equipment', async ({ page, athlete }) => {
    const equipment = uniqueName('Kettlebell');
    await addEquipment(page, equipment);

    await openEquipmentDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: `Remove ${equipment}` }).click();

    await expect(dialog.getByRole('listitem').filter({ hasText: equipment })).toHaveCount(0);
  });
});
