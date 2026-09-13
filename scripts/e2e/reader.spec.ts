import { test, expect, type Page } from '@playwright/test';

// Smoke test for the reading loop: archive → reader by hash → first page
// painted → turn → Contents → story → close. Selectors are the ones that
// exist in both the V3 chrome and the V4 contract (V4-PLAN.md, "Test
// contract"), so the suite passes before and after the reader revamp. The
// V4-only assertions live in the skipped block at the bottom; the merge owner
// unskips them once the reader branch lands.

const ISSUE = '202609';
const FIRST_PAINT_MS = 8_000;

/** First page painted: a raster canvas in Spread/Pages, or the continuous
 * surface in Scroll (the phone default in V4). */
const FIRST_PAGE = '.leaf-canvas canvas, .continuous-pages';
const READER = '.reader';
const CONTENTS = '.reader-navigation';
const PHONE_BAR = 'nav[aria-label="Reading controls"]';

const hash = (page: Page) => page.evaluate(() => location.hash);

async function openArchive(page: Page) {
  await page.goto('/#/');
  await expect(
    page.locator('.archive-grid, .atlantic-wordmark').first(),
  ).toBeVisible();
}

async function openReader(page: Page) {
  await page.goto(`/#/${ISSUE}/read`);
  await expect(page.locator(READER)).toBeVisible();
  await expect(page.locator(FIRST_PAGE).first()).toBeVisible({
    timeout: FIRST_PAINT_MS,
  });
}

test('archive renders at #/', async ({ page }) => {
  await openArchive(page);
});

test('reader paints the first page within 8 s', async ({ page }) => {
  await openReader(page);
  // The cover JPEG placeholder stays underneath; the loading card is gone.
  await expect(page.locator('.reader-loading')).toHaveCount(0);
});

test.describe('desktop loop', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop-only keyboard loop');

  test('turn, contents, story, close', async ({ page }) => {
    await openReader(page);
    const atCover = await hash(page);

    // ArrowRight turns to the next spread; the hash gains a /p segment.
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => hash(page), { timeout: 6_000 }).not.toBe(atCover);
    expect(await hash(page)).toMatch(/\/p\d+$/);
    const afterTurn = await hash(page);

    // c opens Contents.
    await page.keyboard.press('c');
    await expect(page.locator(CONTENTS)).toBeVisible();

    // Choosing a story moves the reader and closes the panel.
    await page.locator('.story-destination').first().click();
    await expect.poll(() => hash(page), { timeout: 6_000 }).not.toBe(afterTurn);
    await expect(page.locator(CONTENTS)).toHaveCount(0);

    // Escape closes the reader and returns to the archive route.
    await page.keyboard.press('Escape');
    await expect(page.locator(READER)).toHaveCount(0);
    await expect.poll(() => hash(page)).toBe('#/');
    await expect(
      page.locator('.archive-grid, .atlantic-wordmark').first(),
    ).toBeVisible();
  });
});

test.describe('phone loop', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only chrome');

  test('reading controls exist and toggle on a center tap', async ({
    page,
  }) => {
    await openReader(page);
    const bar = page.locator(PHONE_BAR);
    await expect(bar).toHaveCount(1);
    // Bars start visible on entry.
    await expect(bar).toBeVisible();

    // A deliberate center tap hides them; another brings them back. Single
    // taps resolve after the double-tap window, so poll rather than assert
    // immediately, and space the taps so they do not read as a double-tap.
    // V4 note: this toggle is the Pages-view rule. If the phone default is
    // Scroll after the merge, click the View group's `Pages` button first
    // (see the V4 contract block below) or assert the Scroll reveal rules.
    const viewport = page.locator('.page-viewport');
    await expect(viewport).toBeVisible();
    await viewport.tap({ position: await center(viewport) });
    await expect(bar).toBeHidden({ timeout: 4_000 });
    await page.waitForTimeout(400);
    await viewport.tap({ position: await center(viewport) });
    await expect(bar).toBeVisible({ timeout: 4_000 });
  });
});

async function center(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('viewport has no box');
  return { x: Math.round(box.width / 2), y: Math.round(box.height / 2) };
}

// ---------------------------------------------------------------------------
// V4 contract (V4-PLAN.md → "Test contract"). Written against the aria
// contract; enable by changing `describe.skip` to `describe` after the
// `v4/reader` branch merges.
// ---------------------------------------------------------------------------
test.describe('V4 contract', () => {
  test.describe('desktop', () => {
    test.skip(({ isMobile }) => !!isMobile);

    test('top bar, View group, Zoom group, story strip', async ({ page }) => {
      await openReader(page);
      const bar = page.locator('nav[aria-label="Reader"]');
      await expect(bar).toBeVisible();
      for (const label of ['Contents', 'Reading settings', 'Focus', 'Save page'])
        await expect(bar.locator(`button[aria-label="${label}"]`)).toBeVisible();

      const view = page.locator('[role=group][aria-label="View"]');
      await expect(view.getByRole('button', { name: 'Spread' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await view.getByRole('button', { name: 'Scroll' }).click();
      await expect(page.locator('.continuous-pages')).toBeVisible();
      await expect(page.locator('button[aria-label="Previous page"]')).toHaveCount(0);
      await view.getByRole('button', { name: 'Spread' }).click();
      await expect(page.locator('.leaf-canvas canvas').first()).toBeVisible();

      const zoom = page.locator('[role=group][aria-label="Zoom"]');
      await expect(zoom.locator('button[aria-label="Zoom out"]')).toBeDisabled();
      await zoom.locator('button[aria-label="Zoom in"]').click();
      await expect(zoom.locator('button.zoom-fit')).toHaveText('125%');
      await zoom.locator('button.zoom-fit').click();
      await expect(zoom.locator('button.zoom-fit')).toHaveText('Fit');

      const strip = page.locator('.story-strip');
      await expect(strip).toBeVisible();
      await expect(strip.locator('button[aria-label="Next story"]')).toBeEnabled();
    });

    test('Go to page and story stepping', async ({ page }) => {
      await openReader(page);
      const folio = page.locator('input[aria-label="Go to page"]');
      // Printed 8 is the first page of a story, so Next then Previous lands
      // back on it; from mid-story, Previous goes to the story's start.
      await folio.fill('8');
      await folio.press('Enter');
      await expect.poll(() => hash(page)).toMatch(/\/p\d+$/);
      const before = await hash(page);
      await page.locator('button[aria-label="Next story"]').click();
      await expect.poll(() => hash(page)).not.toBe(before);
      await expect(page.locator('button[aria-label="Previous story"]')).toBeEnabled();
      await page.locator('button[aria-label="Previous story"]').click();
      await expect.poll(() => hash(page)).toBe(before);
    });

    test('edge arrows turn pages', async ({ page }) => {
      await openReader(page);
      const before = await hash(page);
      await page.locator('.page-viewport').hover();
      await page.locator('button[aria-label="Next page"]').click();
      await expect.poll(() => hash(page)).not.toBe(before);
      await page.locator('button[aria-label="Previous page"]').click();
      await expect.poll(() => hash(page)).toBe(before);
    });
  });

  test.describe('phone', () => {
    test.skip(({ isMobile }) => !isMobile);

    test('Issue bar, Reading controls, Pages/Scroll, Go to page', async ({
      page,
    }) => {
      await openReader(page);
      await expect(page.locator('nav[aria-label="Issue"]')).toBeVisible();
      const bar = page.locator(PHONE_BAR);
      await expect(bar).toBeVisible();

      // Scroll is the phone default; Pages mounts the fitted single page.
      const view = bar.locator('[role=group][aria-label="View"]');
      await expect(view.getByRole('button', { name: 'Scroll' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('.continuous-pages')).toBeVisible();
      await view.getByRole('button', { name: 'Pages' }).click();
      await expect(page.locator('.leaf-canvas canvas').first()).toBeVisible();

      // In Pages a center tap hides both bars and a second tap restores them.
      const viewport = page.locator('.page-viewport');
      await viewport.tap({ position: await center(viewport) });
      await expect(bar).toBeHidden();
      await expect(page.locator('nav[aria-label="Issue"]')).toBeHidden();
      await page.waitForTimeout(400);
      await viewport.tap({ position: await center(viewport) });
      await expect(bar).toBeVisible();

      const folio = bar.locator('input[aria-label="Go to page"]');
      await folio.fill('10');
      await folio.press('Enter');
      await expect.poll(() => hash(page)).toMatch(/\/p\d+$/);

      await view.getByRole('button', { name: 'Scroll' }).click();
      await expect(page.locator('.continuous-pages')).toBeVisible();
    });
  });
});
