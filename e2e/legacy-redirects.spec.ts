import { createPlan, signOut, submitForm } from './helpers';
import { expect, test, uniqueName } from './fixtures';

/**
 * A link minted before the plan/workout rename - printed on a QR code,
 * already sent by text - has to keep resolving. `legacy-redirect.tsx`
 * covers the old `/routines` and `/templates` paths permanently.
 */

test('redirects /routines and a routine detail path permanently to /plans', async ({ page, athlete }) => {
  const base = await page.request.get('/routines', { maxRedirects: 0 });
  expect(base.status()).toBe(301);
  expect(base.headers()['location']).toBe('/plans');

  const detail = await page.request.get('/routines/some-id', { maxRedirects: 0 });
  expect(detail.status()).toBe(301);
  expect(detail.headers()['location']).toBe('/plans/some-id');
});

test('redirects /templates and a template detail path permanently to /workouts', async ({ page, athlete }) => {
  const base = await page.request.get('/templates', { maxRedirects: 0 });
  expect(base.status()).toBe(301);
  expect(base.headers()['location']).toBe('/workouts');

  const detail = await page.request.get('/templates/some-id', { maxRedirects: 0 });
  expect(detail.status()).toBe(301);
  expect(detail.headers()['location']).toBe('/workouts/some-id');
});

/**
 * The highest-value case: a shared routine link scanned by a signed-out
 * stranger has to survive both the path rename and the OIDC round-trip -
 * `requireUserMiddleware` must see the already-rewritten `/plans/import/...`
 * destination, not the legacy one, since that is what the state cookie
 * carries back from Google.
 */
test('a routine share link still lands a signed-out scanner on the import page', async ({ page, athlete }) => {
  const planName = uniqueName('Split');
  await createPlan(page, planName);
  await submitForm(page.getByRole('button', { name: 'Share', exact: true }));
  const link = await page.getByRole('dialog').getByLabel('Share link').inputValue();
  const token = new URL(link).pathname.split('/').pop();
  const legacyPath = `/routines/import/${token}`;

  await page.goto('/today');
  await signOut(page);
  await page.waitForURL('/');

  const redirected = await page.request.get(legacyPath, { maxRedirects: 0 });
  expect(redirected.status()).toBe(301);
  expect(redirected.headers()['location']).toBe(`/plans/import/${token}`);

  const email = `${uniqueName('scanner')}@example.test`;
  await page.goto(
    `/auth/test-login?email=${encodeURIComponent(email)}&redirectTo=${encodeURIComponent(`/plans/import/${token}`)}`,
  );

  await expect(page).toHaveURL(`/plans/import/${token}`);
  await expect(page.getByRole('heading', { name: planName, exact: true })).toBeVisible();
});
