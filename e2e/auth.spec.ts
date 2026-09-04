import { expect, test, uniqueName } from './fixtures';

test.describe('anonymous visitors', () => {
  test('are shown the marketing page at the root', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Every rep, accounted for/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    // Nothing to navigate to until there is a user.
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('are bounced from a protected page to Google, keeping their destination', async ({ page }) => {
    // Deliberately not `page.goto`: following the redirect would have the
    // server perform real OIDC discovery against Google.
    const response = await page.request.get('/routines', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe('/auth/google?redirectTo=%2Froutines');
  });

  test('keep the query string of the page they were headed for', async ({ page }) => {
    const response = await page.request.get('/today?date=2026-01-15', { maxRedirects: 0 });

    expect(response.headers()['location']).toBe('/auth/google?redirectTo=%2Ftoday%3Fdate%3D2026-01-15');
  });

  // The only spec that actually calls `/auth/google` - every test above
  // stops at the redirect *to* it, specifically to avoid the real OIDC
  // discovery call this one deliberately makes. That discovery is exactly
  // where a bundling regression once broke this route in production while
  // every other check (typecheck, unit tests, and every other e2e spec)
  // stayed green, so this is the one place that would have caught it.
  test('really can build a Google authorization URL', async ({ page }) => {
    const response = await page.request.get('/auth/google', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(new URL(response.headers()['location']).hostname).toBe('accounts.google.com');
  });
});

test.describe('test login', () => {
  test('signs in, and the root then redirects to Today', async ({ page, athlete }) => {
    await expect(page).toHaveURL('/today');

    await page.goto('/');
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  });

  test('returns the same athlete on a second sign-in', async ({ page, athlete }) => {
    const exercise = uniqueName('Persisted Lift');

    await page.goto('/exercises');
    await page.getByRole('button', { name: 'New exercise' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(exercise);
    await dialog.getByRole('button', { name: 'Create exercise' }).click();
    await expect(dialog).toBeHidden();

    // Signing in again with the same email must find the existing athlete,
    // not register a second one - the library survives as the proof.
    await page.goto(`/auth/test-login?email=${encodeURIComponent(athlete.email)}`);
    await page.goto('/exercises');

    await expect(page.getByRole('button', { name: exercise })).toBeVisible();
  });

  test('refuses to sign in without an email', async ({ page }) => {
    const response = await page.request.get('/auth/test-login');

    expect(response.status()).toBe(400);
  });
});

test('signing out ends the session', async ({ page, athlete }) => {
  await page.goto('/today');
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.waitForURL('/');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();

  const response = await page.request.get('/today', { maxRedirects: 0 });
  expect(response.status()).toBe(302);
});
