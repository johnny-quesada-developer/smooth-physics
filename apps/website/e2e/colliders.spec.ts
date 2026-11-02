import { expect, test } from '@playwright/test';
import { ClothCanvasTestIds, ExamplePlaygroundTestIds, StageReadoutTestIds } from './testIds';

const WITH_COLLIDERS = ['hanging-chains', 'curtain', 'dress-form'];
const WITHOUT_COLLIDERS = ['fringe-lamp', 'ribbon-baton', 'banner-field'];

for (const slug of WITHOUT_COLLIDERS) {
  test(`no collider switch on ${slug}`, async ({ page }) => {
    await page.goto(`/examples/${slug}/`);
    await expect(page.getByTestId(StageReadoutTestIds.value('physics'))).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
    await expect(page.getByTestId(ExamplePlaygroundTestIds.colliders)).toHaveCount(0);
  });
}

for (const slug of WITH_COLLIDERS) {
  test(`show colliders on ${slug}`, async ({ page }) => {
    await page.goto(`/examples/${slug}/`);
    await expect(page.getByTestId(StageReadoutTestIds.value('physics'))).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
    const toggle = page.getByTestId(ExamplePlaygroundTestIds.colliders);
    await page.getByTestId(ExamplePlaygroundTestIds.pause).click();
    const canvas = page.getByTestId(ClothCanvasTestIds.canvas);
    const hidden = await canvas.screenshot();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => Buffer.compare(await canvas.screenshot(), hidden), { timeout: 5_000 }).not.toBe(0);
  });
}
