// Links, buttons and fields are at least 44 px tall on every page. Links inside running text are exempt, as WCAG
// exempts inline targets.
import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/examples/',
  '/examples/curtain/',
  '/examples/worker-wall/',
  '/examples/fabric-lab/',
  '/docs/getting-started/',
  '/docs/settings/',
  '/docs/settings-reference/',
];

for (const path of PAGES) {
  test(`touch targets on ${path}`, async ({ page }) => {
    await page.goto(path);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('a[href], button, input, select, textarea')]
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null && !element.closest('p, li > code, td'))
        .filter((element) => getComputedStyle(element).position !== 'absolute' || element.getBoundingClientRect().width > 2)
        .map((element) => ({ text: (element.textContent ?? '').trim().slice(0, 40) || element.tagName, height: element.getBoundingClientRect().height }))
        .filter(({ height }) => height > 2 && height < 43.5),
    );
    expect(small).toEqual([]);
  });
}
