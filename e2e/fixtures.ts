import { type Page, test as base, expect } from '@playwright/test';

/**
 * The e2e server keeps everything in memory for the life of one process, so
 * specs cannot rely on starting from an empty database. Isolation comes from
 * identity instead: every test signs in as a freshly generated athlete, and
 * all application data is scoped by `userId`.
 *
 * The exceptions are the two things the domain deliberately shares. Sample
 * rows (a null `userId`) are never created here, since nothing seeds them
 * in-memory. Equipment names are globally unique - see
 * `EquipmentRepository.findByName` - so a spec that creates equipment has to
 * name it with `uniqueName`, or it will collide with a parallel worker.
 */

/** A signed-in athlete, unique to one test. */
export type Athlete = {
  email: string;
  name: string;
};

let counter = 0;

/**
 * A value no parallel worker will generate twice. The PID separates workers,
 * the counter separates calls within one, and both are needed - a worker is
 * a process, and a test may ask for several names.
 */
export function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}-${process.pid}-${counter}`;
}

/**
 * Blocks until React has hydrated the server-rendered markup.
 *
 * Every page here is SSR'd, so buttons are visible - and therefore
 * "actionable" as far as Playwright is concerned - a beat before React
 * attaches to them. A dialog trigger clicked in that window does nothing at
 * all, which surfaces later as an unexplained timeout on the dialog. React
 * hangs a `__reactFiber$…` property off each host node as it hydrates, so the
 * header carrying one is proof the document is live, not merely painted.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const header = document.querySelector('header');
    return !!header && Object.keys(header).some((key) => key.startsWith('__reactFiber$'));
  });
}

/**
 * Signs the browser context in, creating the account on first use, and lands
 * on /today. `asAdministrator` only takes effect for an email the server has
 * never seen - which every generated one is.
 */
export async function signIn(
  page: Page,
  details: { email: string; name: string; asAdministrator?: boolean },
): Promise<Athlete> {
  const query = new URLSearchParams({ email: details.email, name: details.name });
  if (details.asAdministrator) query.set('admin', 'true');

  const response = await page.goto(`/auth/test-login?${query}`);
  expect(response?.ok(), 'test login should succeed - is ENABLE_TEST_LOGIN set?').toBe(true);

  return { email: details.email, name: details.name };
}

/** A fresh athlete, signed in - an administrator when `asAdministrator`. */
export async function newAthlete(page: Page, options: { asAdministrator?: boolean } = {}): Promise<Athlete> {
  return signIn(page, {
    email: `${uniqueName('athlete')}@example.test`,
    name: uniqueName('Athlete'),
    ...options,
  });
}

export const test = base.extend<{ athlete: Athlete; administrator: Athlete }>({
  // Folds the hydration wait into navigation so no spec has to remember it.
  // A `<Form method="post">` submit goes through neither `goto` nor
  // `reload` - it transitions client-side rather than navigating - so
  // `submitForm` waits explicitly instead.
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);

    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await waitForHydration(page);
      return response;
    };

    page.reload = async (options) => {
      const response = await reload(options);
      await waitForHydration(page);
      return response;
    };

    await use(page);
  },

  athlete: async ({ page }, use) => {
    await use(await newAthlete(page));
  },

  // The /admin area needs an account nothing in the UI can create: the first
  // administrator. `admin=true` on the test-login route is how a spec gets
  // one, and it is gated on ENABLE_TEST_LOGIN like the rest of that route.
  administrator: async ({ page }, use) => {
    await use(await newAthlete(page, { asAdministrator: true }));
  },
});

export { expect } from '@playwright/test';
