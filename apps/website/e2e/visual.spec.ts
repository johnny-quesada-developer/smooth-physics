// Appearance of the main pages in both themes. Live canvases are masked: they animate.
import { expect, test } from '@playwright/test';
import { ClothCanvasTestIds, ShowreelPlayerTestIds, StageReadoutTestIds, WorkerWallPlaygroundTestIds } from './testIds';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'examples', path: '/examples/' },
  { name: 'example-curtain', path: '/examples/curtain/' },
  { name: 'example-fabric-lab', path: '/examples/fabric-lab/' },
  { name: 'docs-settings', path: '/docs/settings/' },
];

for (const theme of ['light', 'dark'] as const) {
  for (const { name, path } of PAGES) {
    test(`${name} in the ${theme} theme @visual`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
        fullPage: true,
        animations: 'disabled',
        mask: [
          page.getByTestId(ClothCanvasTestIds.canvas),
          page.getByTestId(WorkerWallPlaygroundTestIds.canvas),
          page.getByTestId(StageReadoutTestIds.root),
          page.getByTestId(ShowreelPlayerTestIds.readout),
        ],
      });
    });
  }
}
