import { createRoutine, createTemplate, orderedRows, selectOption, submitForm } from './helpers';
import { expect, test, uniqueName } from './fixtures';

// Chrome DevTools' responsive mode, with no device preset picked, is desktop
// emulation at a phone size: a mouse pointer and a real scrollbar. That is a
// different layout from `isMobile`, which is what the earlier run measured.
for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile emulation' : 'desktop emulation (scrollbar)', () => {
    test.use({
      viewport: { width: 412, height: 924 },
      hasTouch: mobile,
      isMobile: mobile,
      colorScheme: 'dark',
    });

    test('measure', async ({ page, athlete }) => {
      const template = uniqueName('Push');
      await createTemplate(page, template);

      await createRoutine(page, 'My Routine');
      for (let i = 0; i < 4; i++) {
        await selectOption(page.getByLabel('Day type'), i % 2 === 0 ? template : 'Rest day');
        await submitForm(page.getByRole('button', { name: 'Add', exact: true }));
        await expect(orderedRows(page)).toHaveCount(i + 1);
      }
      await submitForm(page.getByRole('button', { name: 'Set active' }));

      await submitForm(page.getByRole('button', { name: 'Share', exact: true }));
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForTimeout(700);

      const report = await page.evaluate(() => {
        const icb = document.documentElement.clientWidth;
        const rows: string[] = [
          `innerWidth=${window.innerWidth} clientWidth=${icb} scrollbar=${window.innerWidth - icb}`,
          `docScrollW=${document.documentElement.scrollWidth} bodyPadRight=${getComputedStyle(document.body).paddingRight}`,
        ];
        const d = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
        const r = d.getBoundingClientRect();
        rows.push(
          `dialog left=${r.left.toFixed(1)} right=${r.right.toFixed(1)} w=${r.width.toFixed(1)} overflowRight=${(r.right - window.innerWidth).toFixed(1)}`,
        );
        for (const el of document.querySelectorAll('*')) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && (b.right > window.innerWidth + 0.5 || b.left < -0.5)) {
            rows.push(
              `OVER ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 45)} l=${b.left.toFixed(1)} r=${b.right.toFixed(1)}`,
            );
          }
        }
        return rows.join('\n');
      });
      console.log('\n===MEASURE===\n' + report + '\n=============\n');
      await page.screenshot({ path: `/tmp/claude-1000/dlg-${mobile ? 'mobile' : 'desktop'}.png` });
    });
  });
}
