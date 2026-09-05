import { createExercise, selectOption } from './helpers';
import { expect, test, uniqueName } from './fixtures';

/**
 * The shell swaps its whole navigation surface by viewport rather than
 * hiding pieces of one - a sidebar rail at `md:` and up, a fixed bottom tab
 * bar below it.
 */

test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the bottom tab bar and not the sidebar', async ({ page, athlete }) => {
    await page.goto('/today');

    await expect(page.getByRole('navigation', { name: 'Bottom tabs' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  });

  test('never covers the day’s last control', async ({ page, athlete }) => {
    const exercise = uniqueName('Curl');
    await createExercise(page, { name: exercise });

    await page.goto('/today');
    await selectOption(page.getByLabel('Exercise'), exercise);
    await page.getByLabel('Reps').fill('10');
    await page.getByLabel(/^Weight \(/).fill('25');
    // Playwright's click refuses an element another element overlaps at its
    // click point, so this alone is the regression guard: a fixed bar
    // drawn on top of the form would fail this rather than mis-click it.
    await page.getByRole('button', { name: 'Log set' }).click();

    await expect(page.locator('ol > li').filter({ hasText: '25 lb x 10' })).toBeVisible();
  });
});

test.describe('at a desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows the sidebar and not the bottom tab bar', async ({ page, athlete }) => {
    await page.goto('/today');

    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Bottom tabs' })).toBeHidden();
  });

  test('collapsing the sidebar survives a reload', async ({ page, athlete }) => {
    await page.goto('/today');
    const sidebar = page.getByRole('navigation', { name: 'Main' }).locator('..');

    const expanded = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect.poll(() => sidebar.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(expanded);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await expect.poll(() => sidebar.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(expanded);
  });
});
