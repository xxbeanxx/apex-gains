import { expect, test, uniqueName } from './fixtures';
import { addEquipment, closeDialog, createExercise, openEquipmentDialog, openExercise, selectOption } from './helpers';

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

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible();
    // Own exercises are badged to separate them from sample rows.
    await expect(row.getByText('Mine', { exact: true })).toBeVisible();
    await expect(row.getByText('chest', { exact: true })).toBeVisible();
  });

  test('shows an exercise’s type in its row', async ({ page, athlete }) => {
    const name = uniqueName('Treadmill Run');
    await createExercise(page, { name, type: 'Cardio' });

    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Cardio');
  });

  test('edits an exercise through its editor dialog', async ({ page, athlete }) => {
    const name = uniqueName('Row');
    const renamed = uniqueName('Renamed Row');
    await createExercise(page, { name });

    const dialog = await openExercise(page, name);
    await dialog.getByLabel('Name').fill(renamed);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await closeDialog(page);
    await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`^${name} `) })).toHaveCount(0);
  });

  test('filters by type using the Type facet', async ({ page, athlete }) => {
    const strength = uniqueName('Squat');
    const cardio = uniqueName('Row Erg');
    await createExercise(page, { name: strength });
    await createExercise(page, { name: cardio, type: 'Cardio' });

    await page.goto('/exercises');
    await page.getByRole('button', { name: 'Type' }).click();
    await page.getByRole('checkbox', { name: /Cardio/ }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('row', { name: new RegExp(cardio) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`^${strength} `) })).toHaveCount(0);
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
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(dialog.getByRole('listitem').filter({ hasText: equipment })).toHaveCount(0);
  });
});
