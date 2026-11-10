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

// V6: the two ways in that do not start from a cover.
test('issue page lists the stories and opens the reader at one', async ({
  page,
}) => {
  await page.goto(`/#/${ISSUE}`);
  const rows = page.locator('.issue-contents li button');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(8);
  // The neighbouring issue is named, not counted.
  await expect(
    page.locator('.issue-splash-navigation button').first(),
  ).toContainText(/20\d\d/);
  await rows.nth(3).click();
  await expect(page.locator(READER)).toBeVisible();
  await expect.poll(() => hash(page)).toMatch(/\/read\/p\d+$/);
});

test('shelf search lists matching stories and opens one', async ({ page }) => {
  await openArchive(page);
  await page.locator('.archive-search input').fill('graeme wood');
  const hits = page.locator('.search-stories li button');
  await expect(hits.first()).toBeVisible();
  await expect(hits.first().locator('mark')).toHaveText(/graeme wood/i);
  await hits.first().click();
  await expect(page.locator(READER)).toBeVisible();
  await expect.poll(() => hash(page)).toMatch(/^#\/\d{6}\/read\/p\d+$/);
});

test.describe('phone smart zoom', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only gesture');

  test('double-tap fits a column and the bars stay on screen', async ({
    page,
  }) => {
    // Physical page 30 is two columns of prose; Scroll is the phone default.
    await page.goto(`/#/${ISSUE}/read/p30`);
    const leaf = page.locator('.reader-leaf[data-page="30"]');
    await expect(leaf.locator('canvas').first()).toBeVisible({
      timeout: FIRST_PAINT_MS,
    });
    // Let the word index arrive: smart zoom reads the page's columns from it.
    await page.waitForTimeout(800);
    const before = await leaf.boundingBox();
    if (!before) throw new Error('page 30 has no box');
    const screen = page.viewportSize()!.width;
    // Double-tap in the left column, a third of the way down the page.
    const x = before.x + before.width * 0.25,
      y = Math.min(before.y + before.height * 0.35, 600);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(90);
    await page.touchscreen.tap(x, y);
    // The page grows until one column is about as wide as the screen.
    await expect
      .poll(async () => (await leaf.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before.width * 1.8);
    const report = await page.evaluate(() => {
      const visual = window.visualViewport!;
      const rect = (selector: string) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        // Client rects are layout-viewport relative; subtract the visual
        // viewport's offset to get what the reader sees.
        return box
          ? { left: box.left - visual.offsetLeft, right: box.right - visual.offsetLeft }
          : null;
      };
      return {
        width: visual.width,
        leaf: rect('.reader-leaf[data-page="30"]'),
        chip: rect('.mobile-fit-chip'),
      };
    });
    expect(report.width).toBeCloseTo(screen, 0);
    // The left column starts near the screen's left edge: the page's own
    // left margin (about 6% of its width) is off-screen to the left.
    expect(report.leaf!.left).toBeLessThan(0);
    expect(report.leaf!.left).toBeGreaterThan(-0.2 * (report.leaf!.right - report.leaf!.left));
    // The way back is on screen.
    expect(report.chip).not.toBeNull();
    expect(report.chip!.left).toBeGreaterThan(0);
    expect(report.chip!.right).toBeLessThanOrEqual(screen + 1);
    await page.locator('.mobile-fit-chip').tap();
    await expect
      .poll(async () => (await leaf.boundingBox())?.width ?? 0)
      .toBeLessThan(before.width * 1.05);
  });
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

      // V6: the bar is the thumb's bar (Contents, page, Save, Settings).
      // Pages/Scroll is a set-once choice in Reading settings, and choosing
      // a view closes the sheet. Scroll is the phone default; Pages mounts
      // the fitted single page.
      await expect(bar.locator('button[aria-label="Contents"]')).toBeVisible();
      const settings = bar.locator('button[aria-label="Reading settings"]');
      const sheet = page.locator('.appearance-popover');
      const view = sheet.getByRole('group', { name: 'View' });
      await settings.click();
      await expect(view.getByRole('button', { name: 'Scroll' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('.continuous-pages')).toBeVisible();
      await view.getByRole('button', { name: 'Pages' }).click();
      await expect(sheet).toHaveCount(0);
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

      await settings.click();
      await view.getByRole('button', { name: 'Scroll' }).click();
      await expect(page.locator('.continuous-pages')).toBeVisible();
    });
  });
});
