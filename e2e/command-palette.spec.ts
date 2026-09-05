import { expect, test } from './fixtures';

test('opens on ⌘K, navigates on a typed match plus Enter', async ({ page, athlete }) => {
  await page.goto('/today');

  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();

  await page.keyboard.type('plans');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL('/plans');
  await expect(dialog).toBeHidden();
});

test('does not open while typing in a text field', async ({ page, athlete }) => {
  await page.goto('/plans');
  await page.getByRole('button', { name: 'New plan' }).first().click();
  await page.getByLabel('Name').fill('a');

  await page.keyboard.press('ControlOrMeta+k');

  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
});
