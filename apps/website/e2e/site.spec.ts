import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectPageErrors } from './pageErrors';
import {
  ClothCanvasTestIds,
  ControlPanelTestIds,
  DocsPageTestIds,
  DocsPagerTestIds,
  DocsSearchTestIds,
  DocsSidebarTestIds,
  ExamplePlaygroundTestIds,
  FabricLabTestIds,
  FabricSwatchPanelTestIds,
  FinderResultTestIds,
  FinderTestIds,
  HeroStageTestIds,
  HomePageTestIds,
  InstallCommandTestIds,
  MenuButtonTestIds,
  ShowreelPlayerTestIds,
  SiteHeaderTestIds,
  StageReadoutTestIds,
  ThemeToggleTestIds,
  WorkerWallPlaygroundTestIds,
} from './testIds';

test('the home page opens on the showreel, keeps the banner further down and links onward', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await expect(page.getByTestId(HomePageTestIds.title)).toBeVisible();
  await expect(page.getByTestId(SiteHeaderTestIds.link('showreel'))).toHaveCount(0);
  await expect(page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.canvas)).toBeVisible();
  const top = async (testId: string): Promise<number> => (await page.getByTestId(testId).boundingBox())?.y ?? Number.NaN;
  expect(await top(ShowreelPlayerTestIds.root)).toBeLessThan(await top(HomePageTestIds.capabilities));
  expect(await top(HomePageTestIds.banner)).toBeGreaterThan(await top(HomePageTestIds.capabilities));
  const banner = page.getByTestId(HomePageTestIds.banner).getByTestId(HeroStageTestIds.root);
  await banner.scrollIntoViewIfNeeded();
  await expect(banner.getByTestId(ClothCanvasTestIds.canvas)).toBeVisible();
  await page.getByTestId(HeroStageTestIds.toggle).click();
  await expect(page.getByTestId(HeroStageTestIds.toggle)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(HomePageTestIds.explore).click();
  await expect(page).toHaveURL(/\/examples\/$/);
  expect(errors).toEqual([]);
});

test('the old showreel and benchmark addresses lead to the home page', async ({ page }) => {
  for (const path of ['/showreel/', '/benchmark/', '/benchmark/details/']) {
    await page.goto(path);
    await expect(page.getByTestId(HomePageTestIds.title), path).toBeVisible();
    await expect(page, path).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  }
});

test('the install command starts on npm and switches package manager', async ({ page }) => {
  await page.goto('/');
  const command = page.getByTestId(InstallCommandTestIds.command);
  await expect(page.getByTestId(InstallCommandTestIds.tab('npm'))).toHaveAttribute('aria-selected', 'true');
  await expect(command).toContainText('npm install smooth-physics');
  await page.getByTestId(InstallCommandTestIds.tab('pnpm')).click();
  await expect(command).toContainText('pnpm add smooth-physics');
  await page.getByTestId(InstallCommandTestIds.tab('yarn')).click();
  await expect(command).toContainText('yarn add smooth-physics');
});

test('the hero simulates in a worker and falls back to the page without one', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await page.getByTestId(HeroStageTestIds.root).scrollIntoViewIfNeeded();
  await expect(page.getByTestId(HeroStageTestIds.thread)).toHaveText('in a worker', { timeout: 15_000 });
  await expect(page.getByTestId(HeroStageTestIds.fps)).toHaveText(/^\d+ fps$/);
  await page.context().route(/heroPhysics\.worker/, (route) => route.abort());
  await page.reload();
  await page.getByTestId(HeroStageTestIds.root).scrollIntoViewIfNeeded();
  await expect(page.getByTestId(HeroStageTestIds.thread)).toHaveText('on the page', { timeout: 15_000 });
  await expect(page.getByTestId(HeroStageTestIds.fps)).toHaveText(/^\d+ fps$/);
  expect(errors).toEqual([]);
});

test('the theme switch applies at once and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId(ThemeToggleTestIds.root).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByTestId(ThemeToggleTestIds.root)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the menu opens on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The menu button exists on narrow screens only.');
  await page.goto('/');
  await expect(page.getByTestId(SiteHeaderTestIds.link('docs'))).toBeHidden();
  await page.getByTestId(MenuButtonTestIds.root).click();
  await expect(page.getByTestId(MenuButtonTestIds.root)).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId(SiteHeaderTestIds.link('docs')).click();
  await expect(page).toHaveURL(/\/docs\/getting-started\/$/);
});

test('the finder ranks pages by similarity and forgives typos', async ({ page }) => {
  await page.goto('/examples/');
  const results = page.getByTestId(FinderTestIds.results).locator('li');
  const total = await results.count();
  expect(total).toBe(25);
  await page.getByTestId(FinderTestIds.query).fill('coliders');
  await expect(page.getByTestId(FinderTestIds.count)).toContainText('most similar first');
  await expect(results.first().getByTestId(FinderResultTestIds.root('doc-colliders'))).toBeVisible();
  await page.getByTestId(FinderTestIds.facet({ facet: 'kind', value: 'example' })).click();
  await expect(results.first().getByTestId(FinderResultTestIds.root('example-dress-form'))).toBeVisible();
  await page.getByTestId(FinderTestIds.clear).click();
  await expect(results).toHaveCount(total);
});

test('a playground simulates, retunes and pauses', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/examples/hanging-chains/');
  const physics = page.getByTestId(StageReadoutTestIds.value('physics'));
  await expect(physics).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
  await expect(page.getByTestId(StageReadoutTestIds.value('particles'))).toHaveText('124');
  await page.getByTestId(ControlPanelTestIds.control('gravity')).fill('12');
  await page.getByTestId(ControlPanelTestIds.control('push')).click();
  await page.getByTestId(ExamplePlaygroundTestIds.colliders).click();
  await expect(page.getByTestId(ExamplePlaygroundTestIds.colliders)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(ExamplePlaygroundTestIds.pause).click();
  await expect(page.getByTestId(ExamplePlaygroundTestIds.pause)).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('every main-thread example starts without problems', async ({ page }) => {
  const errors = collectPageErrors(page);
  for (const slug of ['curtain', 'dress-form', 'fringe-lamp', 'ribbon-baton', 'banner-field']) {
    await page.goto(`/examples/${slug}/`);
    await expect(page.getByTestId(StageReadoutTestIds.value('physics')), slug).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
    await expect(page.getByTestId(ClothCanvasTestIds.problem), slug).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('the wall runs in a worker and on the main thread', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/examples/worker-wall/');
  await expect(page.getByTestId(WorkerWallPlaygroundTestIds.value('particles'))).toHaveText('896', { timeout: 15_000 });
  await expect(page.getByTestId(WorkerWallPlaygroundTestIds.value('physics'))).toHaveText(/\d+\.\d+ ms/);
  await page.getByTestId(WorkerWallPlaygroundTestIds.thread('main')).check({ force: true });
  await expect(page.getByTestId(WorkerWallPlaygroundTestIds.value('main-thread'))).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
  await expect(page.getByTestId(WorkerWallPlaygroundTestIds.problem)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('every fabric swatch keeps its own state', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/examples/fabric-lab/');
  const first = page.getByTestId(FabricSwatchPanelTestIds.root(1)),
    second = page.getByTestId(FabricSwatchPanelTestIds.root(2));
  await expect(first.getByTestId(FabricSwatchPanelTestIds.physics)).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
  await expect(first.getByTestId(FabricSwatchPanelTestIds.name)).toHaveText('Silk');
  await expect(second.getByTestId(FabricSwatchPanelTestIds.name)).toHaveText('Linen');
  await first.getByTestId(FabricSwatchPanelTestIds.control('gravity')).fill('12');
  await expect(first.getByTestId(FabricSwatchPanelTestIds.control('gravity'))).toHaveValue('12');
  await expect(second.getByTestId(FabricSwatchPanelTestIds.control('gravity'))).toHaveValue('5');
  await first.getByTestId(FabricSwatchPanelTestIds.pause).click();
  await expect(first.getByTestId(FabricSwatchPanelTestIds.pause)).toHaveAttribute('aria-pressed', 'true');
  await expect(second.getByTestId(FabricSwatchPanelTestIds.pause)).toHaveAttribute('aria-pressed', 'false');
  // A fourth swatch of the same fabric gets a fresh store of its own.
  await page.getByTestId(FabricLabTestIds.add).click();
  const fourth = page.getByTestId(FabricSwatchPanelTestIds.root(4));
  await expect(fourth.getByTestId(FabricSwatchPanelTestIds.name)).toHaveText('Silk');
  await expect(fourth.getByTestId(FabricSwatchPanelTestIds.control('gravity'))).toHaveValue('5');
  await expect(page.getByTestId(FabricLabTestIds.add)).toBeDisabled();
  await first.getByTestId(FabricSwatchPanelTestIds.reset).click();
  await expect(first.getByTestId(FabricSwatchPanelTestIds.control('gravity'))).toHaveValue('5');
  await fourth.getByTestId(FabricSwatchPanelTestIds.remove).click();
  await expect(fourth).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the docs render, lead to the next page and find pages despite typos', async ({ page, isMobile }) => {
  await page.goto('/docs/getting-started/');
  await expect(page.getByTestId(DocsPageTestIds.title)).toHaveText('Getting started');
  await expect(page.getByTestId(DocsPageTestIds.example)).toHaveAttribute('href', '/examples/hanging-chains/');
  await expect(page.getByTestId(DocsPageTestIds.install).getByTestId(InstallCommandTestIds.root)).toBeVisible();
  await page.getByTestId(DocsPagerTestIds.next).click();
  await expect(page.getByTestId(DocsPageTestIds.title)).toHaveText('Cloths, bones and particles');
  if (isMobile) await page.getByTestId(DocsSidebarTestIds.toggle).click();
  await page.getByTestId(DocsSearchTestIds.query).fill('coliders');
  await expect(page.getByTestId(DocsSearchTestIds.result('doc-colliders'))).toBeVisible();
});

test('the showreel plays live, jumps to a clip and pauses', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  // Off screen the stage does not run, and on a phone the headline comes first.
  await page.getByTestId(ShowreelPlayerTestIds.root).scrollIntoViewIfNeeded();
  await expect(page.getByTestId(ShowreelPlayerTestIds.framesPerSecond)).toHaveText(/\d/, { timeout: 15_000 });
  await page.getByTestId(ShowreelPlayerTestIds.clip('wind')).click();
  await expect(page.getByTestId(ShowreelPlayerTestIds.current)).toContainText('Wind');
  await expect(page.getByTestId(ShowreelPlayerTestIds.toggle)).toHaveText('Pause');
  await page.getByTestId(ShowreelPlayerTestIds.toggle).click();
  await expect(page.getByTestId(ShowreelPlayerTestIds.toggle)).toHaveText('Play');
  await expect(page.getByTestId(ClothCanvasTestIds.problem)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the showreel draws its colliders and runs with the bandana physics off and on again', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  const player = page.getByTestId(ShowreelPlayerTestIds.root);
  const stage = player.getByTestId(ClothCanvasTestIds.root);
  const canvas = stage.getByTestId(ClothCanvasTestIds.canvas);
  const colliders = page.getByTestId(ShowreelPlayerTestIds.colliders);
  const simulation = page.getByTestId(ShowreelPlayerTestIds.bandanaPhysics);
  const physicsTime = page.getByTestId(ShowreelPlayerTestIds.physics);
  await player.scrollIntoViewIfNeeded();
  await expect(physicsTime).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
  await expect(colliders).toHaveAttribute('aria-checked', 'false');
  await expect(simulation).toHaveAttribute('aria-checked', 'true');
  await expect(stage).toHaveAttribute('data-colliders', 'hidden');

  // Paused, the stage redraws only for the switch; the overlays that change on their own are masked.
  await page.getByTestId(ShowreelPlayerTestIds.toggle).click();
  const mask = [player.getByTestId(ShowreelPlayerTestIds.readout), stage.getByTestId(ClothCanvasTestIds.hint)];
  const hidden = await canvas.screenshot({ mask });
  await colliders.click();
  await expect(colliders).toHaveAttribute('aria-checked', 'true');
  await expect(stage).toHaveAttribute('data-colliders', 'shown');
  await expect.poll(async () => Buffer.compare(await canvas.screenshot({ mask }), hidden), { timeout: 5_000 }).not.toBe(0);

  // Without the physics, the tails are not simulated, so the stage spends no time on them.
  await page.getByTestId(ShowreelPlayerTestIds.toggle).click();
  await simulation.click();
  await expect(simulation).toHaveAttribute('aria-checked', 'false');
  await expect(physicsTime).toHaveText('0.00 ms', { timeout: 5_000 });
  // Both switches keep their state from clip to clip.
  await page.getByTestId(ShowreelPlayerTestIds.clip('flip')).click();
  await expect(page.getByTestId(ShowreelPlayerTestIds.current)).toContainText('Leap and flip');
  await expect(colliders).toHaveAttribute('aria-checked', 'true');
  await expect(simulation).toHaveAttribute('aria-checked', 'false');
  await expect(physicsTime).toHaveText('0.00 ms', { timeout: 5_000 });
  await simulation.click();
  await expect(simulation).toHaveAttribute('aria-checked', 'true');
  await expect(physicsTime).not.toHaveText('0.00 ms', { timeout: 5_000 });
  await expect(stage.getByTestId(ClothCanvasTestIds.problem)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the showreel goes full screen with its controls and returns to its place', async ({ page, isMobile }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  const stage = page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root);
  const canvas = stage.getByTestId(ClothCanvasTestIds.canvas);
  const button = stage.getByTestId(ClothCanvasTestIds.fullscreen);
  await expect(page.getByTestId(ShowreelPlayerTestIds.framesPerSecond)).toHaveText(/\d/, { timeout: 15_000 });
  const before = await canvas.boundingBox();
  await expect(button).toHaveAccessibleName('Enter full screen');
  await button.click();
  await expect(button).toHaveAccessibleName('Exit full screen');
  // The Fullscreen API where the browser offers it, and otherwise the layer over the page.
  const fullscreen = await page.evaluate(() => document.fullscreenElement !== null);
  if (!fullscreen) await expect(stage).toHaveAttribute('data-immersive', 'true');
  const viewport = page.viewportSize();
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(viewport?.width);
  // A bar under the stage on a phone held upright, a rail down the right edge on a wide screen.
  await expect(stage.getByTestId(ClothCanvasTestIds.controls)).toHaveAttribute('data-dock', isMobile ? 'bar' : 'rail');

  const controls = stage.getByTestId(ShowreelPlayerTestIds.stageControls);
  await expect(controls).toBeVisible();
  await controls.getByTestId(ShowreelPlayerTestIds.stageClip('wind')).click();
  await expect(page.getByTestId(ShowreelPlayerTestIds.current)).toContainText('Wind');
  await controls.getByTestId(ShowreelPlayerTestIds.stageColliders).click();
  await expect(page.getByTestId(ShowreelPlayerTestIds.colliders)).toHaveAttribute('aria-checked', 'true');
  await controls.getByTestId(ShowreelPlayerTestIds.stageBandanaPhysics).click();
  await expect(page.getByTestId(ShowreelPlayerTestIds.bandanaPhysics)).toHaveAttribute('aria-checked', 'false');
  await stage.getByTestId(ClothCanvasTestIds.pause).click();
  await expect(page.getByTestId(ShowreelPlayerTestIds.toggle)).toHaveText('Play');

  await button.click();
  await expect(button).toHaveAccessibleName('Enter full screen');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(stage).not.toHaveAttribute('data-immersive');
  await expect(controls).toHaveCount(0);
  await expect.poll(async () => await canvas.boundingBox()).toEqual(before);
  expect(errors).toEqual([]);
});

test('an example stage goes full screen and keeps its pause button', async ({ page }) => {
  await page.goto('/examples/curtain/');
  await expect(page.getByTestId(StageReadoutTestIds.value('physics'))).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
  const button = page.getByTestId(ClothCanvasTestIds.fullscreen);
  await button.click();
  await expect(button).toHaveAccessibleName('Exit full screen');
  await page.getByTestId(ClothCanvasTestIds.pause).click();
  await expect(page.getByTestId(ExamplePlaygroundTestIds.pause)).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAccessibleName('Enter full screen');
  await expect(page.getByTestId(ClothCanvasTestIds.pause)).toHaveCount(0);
});

// The layer is what shows at the corners and the middle of the screen, and its box is the viewport, by both the window
// and the visual viewport.
async function expectScreenCover(layer: Locator, size: { readonly width: number; readonly height: number }): Promise<void> {
  const cover = await layer.evaluate((element) => {
    const box = element.getBoundingClientRect(),
      [width, height] = [innerWidth, innerHeight];
    const points = [
      [1, 1],
      [width - 1, 1],
      [1, height - 1],
      [width - 1, height - 1],
      [width / 2, height / 2],
    ];
    return {
      box: [box.x, box.y, box.width, box.height],
      window: [width, height],
      visual: [visualViewport?.width, visualViewport?.height],
      topLayer: element.matches(':popover-open'),
      covered: points.every(([x = 0, y = 0]) => element.contains(document.elementFromPoint(x, y))),
    };
  });
  expect(cover).toEqual({
    box: [0, 0, size.width, size.height],
    window: [size.width, size.height],
    visual: [size.width, size.height],
    topLayer: true,
    covered: true,
  });
}

// Moves the pointer over the stage, which brings back full-screen controls that stepped aside.
async function wakeControls(page: Page): Promise<void> {
  await page.mouse.move(5, 5);
  await page.mouse.move(6, 6);
}

test('on a phone, the full-screen button lays the stage over the whole screen and holds the page still behind it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Elsewhere the stage goes full screen with the Fullscreen API.');
  const errors = collectPageErrors(page);
  await page.goto('/');
  const stage = page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root);
  const layer = stage.getByTestId(ClothCanvasTestIds.layer);
  const button = stage.getByTestId(ClothCanvasTestIds.fullscreen);
  const turnHint = stage.getByTestId(ClothCanvasTestIds.turnHint);
  const header = page.getByTestId(SiteHeaderTestIds.root);
  await expect(page.getByTestId(ShowreelPlayerTestIds.framesPerSecond)).toHaveText(/\d/, { timeout: 15_000 });
  await page.evaluate(() => scrollTo(0, 150));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(150);
  const before = await stage.boundingBox();
  const portrait = page.viewportSize() ?? { width: 393, height: 659 };

  await button.click();
  // iPhone Safari offers the Fullscreen API for video only.
  await expect(stage).toHaveAttribute('data-immersive', 'true');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expectScreenCover(layer, portrait);
  await expect(header).toBeHidden();
  await expect(turnHint).toHaveText('Turn your phone sideways for full screen');
  await expect(layer).toHaveCSS('touch-action', 'none');
  expect(
    await page.evaluate(() =>
      [document.documentElement, document.body].map((element) => [getComputedStyle(element).overflow, getComputedStyle(element).overscrollBehavior]),
    ),
  ).toEqual([
    ['hidden', 'none'],
    ['hidden', 'none'],
  ]);
  await page.keyboard.press('PageDown');
  await page.keyboard.press('End');
  expect(await page.evaluate(() => scrollY)).toBe(150);

  // Turned sideways, the layer stays open and fills the new screen; turned back, it stays until the reader closes it.
  const landscape = { width: portrait.height, height: portrait.width };
  await page.setViewportSize(landscape);
  await expect(turnHint).toHaveCount(0);
  await expect(stage).toHaveAttribute('data-immersive', 'true');
  await expect(stage.getByTestId(ClothCanvasTestIds.controls)).toHaveAttribute('data-dock', 'rail');
  await expectScreenCover(layer, landscape);
  await page.setViewportSize(portrait);
  await expect(turnHint).toBeVisible();
  await expect(stage).toHaveAttribute('data-immersive', 'true');
  await expect(stage.getByTestId(ClothCanvasTestIds.controls)).toHaveAttribute('data-dock', 'bar');
  await expectScreenCover(layer, portrait);

  await wakeControls(page);
  await button.click();
  await expect(stage).not.toHaveAttribute('data-immersive');
  await expect(header).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(150);
  await expect.poll(async () => await stage.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('visible');
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});

// Reads an element's screenshot in the page, which needs no image library: the share of its middle that clearly
// differs from its top-left corner, where the background shows, and the box of its dark pixels, the fighters and their
// bandanas on a light page, in screenshot pixels.
async function readStage(page: Page, element: Locator): Promise<{ middle: number; width: number; height: number; dark: readonly number[] | null }> {
  const png = (await element.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The page has no 2D canvas to read the screenshot with.');
    context.drawImage(image, 0, 0);
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    const channel = (x: number, y: number, offset: number): number => pixels[(y * width + x) * 4 + offset] ?? 0;
    let differing = 0,
      total = 0,
      dark: number[] | null = null;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (0.2126 * channel(x, y, 0) + 0.7152 * channel(x, y, 1) + 0.0722 * channel(x, y, 2) < 150)
          dark = dark ? [Math.min(dark[0] ?? x, x), Math.min(dark[1] ?? y, y), Math.max(dark[2] ?? x, x), Math.max(dark[3] ?? y, y)] : [x, y, x, y];
        if (x < width / 4 || x >= (width * 3) / 4 || y < height / 4 || y >= (height * 3) / 4) continue;
        total++;
        const distance = [0, 1, 2].reduce((sum, offset) => sum + Math.abs(channel(x, y, offset) - channel(1, 1, offset)), 0);
        if (distance > 96) differing++;
      }
    return { middle: differing / total, width, height, dark };
  }, png);
}

// In the layer a phone shows full screen, the stage takes the whole visible screen in either orientation and its
// controls lie over it.
test('upright on a phone, the full-screen showreel fills the visible screen under its controls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Only a phone holds the screen upright.');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const own = page.viewportSize() ?? { width: 393, height: 659 };
  for (const size of [own, { width: 390, height: 844 }]) {
    const screen = `${size.width}×${size.height}`;
    await page.setViewportSize(size);
    await page.goto('/');
    const stage = page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root);
    const canvas = stage.getByTestId(ClothCanvasTestIds.canvas);
    await stage.getByTestId(ClothCanvasTestIds.fullscreen).click();
    await expect(stage, screen).toHaveAttribute('data-immersive', 'true');
    await expect(stage.getByTestId(ClothCanvasTestIds.controls), screen).toHaveAttribute('data-dock', 'bar');
    const visible = await page.evaluate(() => [visualViewport?.width ?? innerWidth, visualViewport?.height ?? innerHeight]);
    await expect.poll(async () => Object.values((await canvas.boundingBox()) ?? {}), screen).toEqual([0, 0, ...visible]);
    for (const control of [ClothCanvasTestIds.fullscreen, ClothCanvasTestIds.turnHint, ClothCanvasTestIds.controls]) {
      const box = await stage.getByTestId(control).boundingBox();
      expect(box && box.y >= 0 && box.y + box.height <= (visible[1] ?? 0), `${control} at ${screen}`).toBe(true);
    }
    // Readers who prefer less motion get a still stage, so the fighter stands in the middle of it.
    expect((await readStage(page, canvas)).middle, screen).toBeGreaterThan(0.02);
  }
});

// The flip leaps highest and the sprint runs widest; through both, nothing dark reaches an edge of the stage in either
// orientation. The controls are hidden so only the scene is read.
test('in phone full screen, the fighters and their bandanas stay in frame', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The fitted framing belongs to the layer a phone shows full screen.');
  test.setTimeout(90_000);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const stage = page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root);
  const canvas = stage.getByTestId(ClothCanvasTestIds.canvas);
  await expect(page.getByTestId(ShowreelPlayerTestIds.framesPerSecond)).toHaveText(/\d/, { timeout: 15_000 });
  await stage.getByTestId(ClothCanvasTestIds.fullscreen).click();
  await expect(stage).toHaveAttribute('data-immersive', 'true');
  await page.addStyleTag({ content: `[data-testid="${ClothCanvasTestIds.chrome}"] { visibility: hidden !important; }` });
  const portrait = page.viewportSize() ?? { width: 393, height: 659 };
  for (const size of [portrait, { width: portrait.height, height: portrait.width }]) {
    await page.setViewportSize(size);
    for (const [clip, seconds] of [
      ['flip', 5],
      ['sprint', 4],
    ] as const) {
      await stage.getByTestId(ShowreelPlayerTestIds.stageClip(clip)).dispatchEvent('click');
      const end = Date.now() + seconds * 1000;
      let frames = 0;
      while (Date.now() < end) {
        const { width, height, dark } = await readStage(page, canvas);
        const where = `${clip} at ${size.width}×${size.height}, frame ${frames++}`;
        expect(dark, where).not.toBeNull();
        const [left = 0, top = 0, right = 0, bottom = 0] = dark ?? [];
        expect([left > 2, top > 2, right < width - 3, bottom < height - 3], where).toEqual([true, true, true, true]);
      }
    }
  }
});

test('full-screen controls step aside when idle and a tap brings them back without pressing one', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Taps need a touch screen.');
  await page.goto('/');
  const stage = page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root);
  const layer = stage.getByTestId(ClothCanvasTestIds.layer);
  const chrome = stage.getByTestId(ClothCanvasTestIds.chrome);
  const flip = stage.getByTestId(ShowreelPlayerTestIds.stageClip('flip'));
  await expect(page.getByTestId(ShowreelPlayerTestIds.framesPerSecond)).toHaveText(/\d/, { timeout: 15_000 });
  await stage.getByTestId(ClothCanvasTestIds.fullscreen).click();
  await expect(layer).toHaveAttribute('data-controls', 'shown');
  await expect(chrome).toHaveCSS('transition-duration', '0.3s');
  await expect(layer).toHaveAttribute('data-controls', 'hidden', { timeout: 5_000 });
  await expect(chrome).toHaveCSS('opacity', '0');
  const box = await flip.boundingBox();
  if (!box) throw new Error('The hidden scene button has no box.');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(layer).toHaveAttribute('data-controls', 'shown');
  await expect(flip).not.toHaveAttribute('aria-current');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(flip).toHaveAttribute('aria-current', 'true');
  // Readers who prefer less motion see the controls go and come back without a fade (styles/global.css).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => chrome.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(0.001);
});

test('keyboard focus keeps full-screen controls in view', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Safari on iPhone moves focus by keyboard only between fields.');
  await page.goto('/');
  const stage = page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root);
  const layer = stage.getByTestId(ClothCanvasTestIds.layer);
  await expect(page.getByTestId(ShowreelPlayerTestIds.framesPerSecond)).toHaveText(/\d/, { timeout: 15_000 });
  await stage.getByTestId(ClothCanvasTestIds.fullscreen).click();
  await expect(layer).toHaveAttribute('data-controls', 'hidden', { timeout: 5_000 });
  await page.keyboard.press('Tab');
  await expect(layer).toHaveAttribute('data-controls', 'shown');
  await page.waitForTimeout(3_500);
  await expect(layer).toHaveAttribute('data-controls', 'shown');
  const rail = await stage.getByTestId(ClothCanvasTestIds.controls).boundingBox();
  const viewport = page.viewportSize();
  // The rail is slim and keeps to the right edge, so the stage keeps its width.
  expect(rail?.width).toBeLessThan((viewport?.width ?? 0) * 0.1);
  expect((rail?.x ?? 0) + (rail?.width ?? 0)).toBeGreaterThan((viewport?.width ?? 0) - 24);
});

// Where the showreel stage starts, as a share of the screen height, and how much of it shows: on a phone the whole
// stage, above the toolbar that covers about 90 px of an 844 px tall iPhone screen; on a laptop the upper four fifths,
// where the fighters move. A 720 px tall screen only has to show its top.
test('the showreel starts in the first screen', async ({ page, isMobile }) => {
  const own = page.viewportSize() ?? { width: 393, height: 659 };
  const screens = isMobile
    ? [
        { ...own, top: 0.5, shown: 1, covered: 0 },
        { width: 390, height: 844, top: 0.5, shown: 1, covered: 90 },
      ]
    : [
        { ...own, top: 0.45, shown: 0.8, covered: 0 },
        { width: 1366, height: 768, top: 0.45, shown: 0.8, covered: 0 },
        { width: 1280, height: 720, top: 1, shown: 0, covered: 0 },
      ];
  for (const { width, height, top, shown, covered } of screens) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const box = await page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root).boundingBox();
    const screen = `${width}×${height}`;
    expect(box?.y, screen).toBeLessThan(height * top);
    expect((box?.y ?? 0) + (box?.height ?? 0) * shown, screen).toBeLessThan(height - covered);
  }
});

test('the showreel starts paused for readers who prefer reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByTestId(ShowreelPlayerTestIds.toggle)).toHaveText('Play');
});

test('a stage hint says how to move the camera and stays away once the reader has dragged a stage', async ({ page, isMobile }) => {
  await page.goto('/');
  const showreel = page.getByTestId(ShowreelPlayerTestIds.root);
  const hint = showreel.getByTestId(ClothCanvasTestIds.hint);
  await showreel.scrollIntoViewIfNeeded();
  await expect(hint).toHaveAttribute('data-shown', 'true');
  await expect(hint).toHaveText(isMobile ? 'Drag to rotate · pinch to zoom' : 'Drag to orbit');
  await showreel.getByTestId(ClothCanvasTestIds.canvas).click();
  await expect(hint).toHaveAttribute('data-shown', 'false');
  await page.goto('/examples/curtain/');
  await expect(page.getByTestId(StageReadoutTestIds.value('physics'))).toHaveText(/\d+\.\d+ ms/, { timeout: 15_000 });
  await expect(page.getByTestId(ClothCanvasTestIds.hint)).toHaveAttribute('data-shown', 'false');
});

test('a phone turned to landscape shows the stage in view across the screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Only a phone, with a coarse pointer and a small screen, switches to the full-screen view.');
  const errors = collectPageErrors(page);
  await page.goto('/');
  const showreel = page.getByTestId(ShowreelPlayerTestIds.root).getByTestId(ClothCanvasTestIds.root);
  const banner = page.getByTestId(HeroStageTestIds.root).getByTestId(ClothCanvasTestIds.root);
  await banner.scrollIntoViewIfNeeded();
  await expect(page.getByTestId(HeroStageTestIds.fps)).toHaveText(/^\d+ fps$/, { timeout: 15_000 });
  const scrolled = await page.evaluate(() => scrollY);
  const portrait = page.viewportSize() ?? { width: 393, height: 659 };
  const landscape = { width: portrait.height, height: portrait.width };
  await page.setViewportSize(landscape);
  await expect(banner).toHaveAttribute('data-immersive', 'true');
  await expect(showreel).not.toHaveAttribute('data-immersive');
  const surface = await banner.getByTestId(ClothCanvasTestIds.canvas).boundingBox();
  expect([surface?.x, surface?.y, surface?.width, surface?.height]).toEqual([0, 0, landscape.width, landscape.height]);
  await expectScreenCover(banner.getByTestId(ClothCanvasTestIds.layer), landscape);
  await expect(page.getByTestId(SiteHeaderTestIds.root)).toBeHidden();
  await page.getByTestId(ClothCanvasTestIds.pause).click();
  await expect(page.getByTestId(HeroStageTestIds.toggle)).toHaveAttribute('aria-pressed', 'true');
  // Turning back restores the page where the reader left it.
  await page.setViewportSize(portrait);
  await expect(banner).not.toHaveAttribute('data-immersive');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scrolled, -1);
  await expect(banner).toBeInViewport();
  // In landscape, the full-screen button leaves the full-screen view too.
  await page.setViewportSize(landscape);
  await expect(banner).toHaveAttribute('data-immersive', 'true');
  await expect(banner.getByTestId(ClothCanvasTestIds.fullscreen)).toHaveAccessibleName('Exit full screen');
  await banner.getByTestId(ClothCanvasTestIds.fullscreen).click();
  await expect(banner).not.toHaveAttribute('data-immersive');
  await expect(banner).toBeInViewport();
  expect(errors).toEqual([]);
});
