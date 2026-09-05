import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollLayout, pageAtOffset, scrollWindow, scrollDestination } from '../app/reader/scroll-layout.ts';
import { normalizePlace } from '../app/reader/place.ts';

test('Continuous layout includes every page once, with stable gaps and variable page ratios', () => {
  const { pages, height } = scrollLayout(112, 360, [1, 1.5]);
  assert.equal(pages.length, 112);
  assert.equal(pages[0].top, 12);
  assert.equal(pages[0].height, 360);
  assert.equal(pages[1].height, 540);
  for (let i = 1; i < pages.length; i++) {
    assert.equal(pages[i].page, i + 1);
    assert.equal(pages[i].top, pages[i - 1].top + pages[i - 1].height + 24);
  }
  assert.equal(height, pages.at(-1).top + pages.at(-1).height + 12);
});
test('Far story jumps mount only the local reading window on phone and desktop', () => {
  for (const width of [366, 900]) {
    const { pages } = scrollLayout(112, width, []);
    for (let page = 1; page <= pages.length; page++) {
      const top = scrollDestination(pages, page);
      assert.equal(pageAtOffset(pages, top), page - 1);
      const range = scrollWindow(pages, top, 700);
      assert.ok(range.first <= page - 1 && range.last >= page - 1);
      assert.ok(range.last - range.first + 1 <= 5);
    }
  }
});
test('Resume stores a page-relative scroll position that survives a viewport resize', () => {
  const value = { page: 70, mode: 'scroll', zoom: 1, pageOffset: .4 };
  const place = normalizePlace(value, 112);
  assert.equal(place.mode, 'scroll');
  assert.equal(place.pageOffset, .4);
  for (const width of [366, 900]) {
    const { pages } = scrollLayout(112, width, []);
    const top = scrollDestination(pages, place.page, place.pageOffset);
    assert.equal(pageAtOffset(pages, top), 69);
    assert.ok(Math.abs((top - pages[69].top) / pages[69].height - .4) < 1e-10);
  }
  assert.equal(normalizePlace({...value, pageOffset: Infinity}, 112).pageOffset, 0);
  assert.equal(normalizePlace({...value, pageOffset: 20}, 112).pageOffset, 1);
});
