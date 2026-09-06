import type { Page } from '@playwright/test';

import { expect, newAthlete, signIn, test, uniqueName } from './fixtures';
import { submitForm } from './helpers';

/**
 * One server process serves the whole suite, so /admin's user list holds
 * every athlete every parallel worker has created. Each spec therefore
 * searches for the account it made rather than asserting on the whole table.
 */

test('an ordinary athlete has no admin area', async ({ page, athlete }) => {
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

  // Requested rather than navigated to: the 404 page is rendered by root's
  // ErrorBoundary in place of the whole app, so it has no header for
  // `page.goto`'s hydration wait to find. `page.request` carries this
  // context's session cookie, so it is the signed-in athlete asking.

  const response = await page.request.get('/admin');
  expect(response.status()).toBe(404);
});

test('an administrator reaches the dashboard from the nav', async ({ page, administrator }) => {
  await page.goto('/today');
  await page.getByRole('link', { name: 'Admin' }).click();

  await page.waitForURL('**/admin');
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  await expect(page.getByText('Accounts', { exact: true })).toBeVisible();
  await expect(page.getByText('Sets logged', { exact: true }).first()).toBeVisible();
});

test('the user manager finds an account by email', async ({ page, administrator }) => {
  await page.goto('/admin/users');
  await page.getByLabel('Search').fill(administrator.email);
  await submitForm(page.getByRole('button', { name: 'Search' }));

  const row = page.getByRole('row').filter({ hasText: administrator.email });
  await expect(row).toHaveCount(1);
  await expect(row.getByText('Admin', { exact: true })).toBeVisible();
  await expect(row.getByText('You', { exact: true })).toBeVisible();
});

test('an administrator cannot change their own access', async ({ page, administrator }) => {
  await page.goto('/admin/users');
  await page.getByLabel('Search').fill(administrator.email);
  await submitForm(page.getByRole('button', { name: 'Search' }));

  const row = page.getByRole('row').filter({ hasText: administrator.email });
  await expect(row.getByRole('button', { name: /admin access/ })).toHaveCount(0);

  await page.goto(`/admin/users/${await accountIdFor(page, administrator.email)}?section=account`);
  await expect(page.getByText('Your own account')).toBeVisible();
  await expect(page.getByRole('button', { name: /Delete/ })).toHaveCount(0);
});

test('granting and revoking another athlete’s admin access', async ({ page }) => {
  const subject = await newAthlete(page);
  const admin = await signInAsFreshAdministrator(page);

  await page.goto('/admin/users');
  await page.getByLabel('Search').fill(subject.email);
  await submitForm(page.getByRole('button', { name: 'Search' }));

  const row = page.getByRole('row').filter({ hasText: subject.email });
  await submitForm(row.getByRole('button', { name: /Grant/ }));
  await expect(page.getByText(`Granted admin access to ${subject.name}.`)).toBeVisible();

  await page.getByLabel('Search').fill(subject.email);
  await submitForm(page.getByRole('button', { name: 'Search' }));
  const granted = page.getByRole('row').filter({ hasText: subject.email });
  await expect(granted.getByText('Admin', { exact: true })).toBeVisible();

  await submitForm(granted.getByRole('button', { name: /Revoke/ }));
  await expect(page.getByText(`Revoked admin access from ${subject.name}.`)).toBeVisible();

  // The administrator who made both changes still holds their own access,
  // and the dashboard's audit trail carries both actions, newest first.

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();

  // Scoped to the "Recent actions" section, not just any list item on the
  // page - the newest/busiest account shortlists are `<li>`s too, and the
  // subject's own email appears in those as well.

  const recentActions = page.locator('section', { has: page.getByRole('heading', { name: 'Recent actions' }) });
  const rows = recentActions.getByRole('listitem').filter({ hasText: subject.email });
  await expect(rows.filter({ hasText: 'revoked admin access from' })).toBeVisible();
  await expect(rows.filter({ hasText: 'granted admin access to' })).toBeVisible();
  await expect(rows.first()).toContainText(admin.email);
});

test('an account detail page shows what the athlete has logged', async ({ page }) => {
  const subject = await newAthlete(page);
  await signInAsFreshAdministrator(page);

  await page.goto(`/admin/users/${await accountIdFor(page, subject.email)}`);

  await expect(page.getByRole('heading', { name: subject.name })).toBeVisible();
  await expect(page.getByText(subject.email).first()).toBeVisible();
  await expect(page.getByText('Never')).toBeVisible();

  await page.getByRole('link', { name: 'Admin access' }).click();
  await expect(page.getByRole('button', { name: 'Grant admin access' })).toBeVisible();
});

test('deleting an account requires its email and removes it from the list', async ({ page }) => {
  const subject = await newAthlete(page);
  await signInAsFreshAdministrator(page);

  await page.goto(`/admin/users/${await accountIdFor(page, subject.email)}?section=delete`);

  await page.getByLabel("Type the account's email to confirm").fill('wrong@example.test');
  await submitForm(page.getByRole('button', { name: 'Delete' }));
  await expect(page.getByText("That doesn't match this account's email address.")).toBeVisible();

  await page.getByLabel("Type the account's email to confirm").fill(subject.email);
  await submitForm(page.getByRole('button', { name: 'Delete' }));

  await page.waitForURL('**/admin/users');
  await page.getByLabel('Search').fill(subject.email);
  await submitForm(page.getByRole('button', { name: 'Search' }));
  await expect(page.getByText('No matching accounts')).toBeVisible();

  // The audit trail survives the account it names.

  await page.goto('/admin');
  const recentActions = page.locator('section', { has: page.getByRole('heading', { name: 'Recent actions' }) });

  await expect(
    recentActions
      .getByRole('listitem') //
      .filter({ hasText: 'deleted the account' })
      .filter({ hasText: subject.email }),
  ).toBeVisible();
});

/**
 * Signs in as a brand new administrator, whatever the page was signed in as before.
 */
async function signInAsFreshAdministrator(page: Page) {
  return signIn(page, {
    email: `${uniqueName('admin')}@example.test`,
    name: uniqueName('Admin'),
    asAdministrator: true,
  });
}

/**
 * The id of the account with this email, read off its row's link in the user manager.
 */
async function accountIdFor(page: Page, email: string): Promise<string> {
  await page.goto('/admin/users');
  await page.getByLabel('Search').fill(email);
  await submitForm(page.getByRole('button', { name: 'Search' }));

  const href = await page.getByRole('row').filter({ hasText: email }).getByRole('link').first().getAttribute('href');
  return href!.split('/').pop()!;
}
