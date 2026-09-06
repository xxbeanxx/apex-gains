import { expect, test } from './fixtures';

/**
 * `/` renders for an anonymous visitor (see CLAUDE.md's Auth section), so
 * these run with no `athlete` fixture - the manifest link and icons must be
 * reachable before anyone signs in.
 */

test('links the manifest and apple touch icon from the page head', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
});

test('serves the manifest and every icon it references', async ({ page, request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();

  expect(manifest.start_url).toBe('/today');
  expect(manifest.display).toBe('standalone');

  const iconPaths = (manifest.icons as { src: string }[]).map((icon) => icon.src);
  for (const path of [...iconPaths, '/apple-touch-icon.png']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});
