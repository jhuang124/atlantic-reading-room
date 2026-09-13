import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { registerHooks } from 'node:module';
import { pageColumns } from '../app/reader/columns.ts';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './model' && context.parentURL?.endsWith('/place.ts'))
      return next('./model.ts', context);
    return next(specifier, context);
  },
});
const { normalizePlace, loadPreferences, loadPlace, storePlace } =
  await import('../app/reader/place.ts');

test('Old page-only places migrate; invalid fields cannot corrupt a reading session', () => {
  const old = normalizePlace({ page: 14 }, 112);
  assert.equal(old.page, 14);
  assert.equal(old.zoom, 1);
  assert.equal(old.mode, 'spread');
  assert.equal(old.left, 0);
  assert.equal(normalizePlace({ page: 'bad' }, 112), null);
  const bad = normalizePlace(
    { page: 999, zoom: 99, left: -3, top: NaN, mode: 'bad', column: 99 },
    112,
  );
  assert.equal(bad.page, 112);
  assert.equal(bad.zoom, 4);
  assert.equal(bad.column, 3);
  assert.equal(bad.left, 0);
  assert.equal(bad.top, 0);
});
test('Places round-trip; retired Page width and Column views migrate to Scroll and Spread', () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
  const place = {
    page: 14,
    zoom: 1.7,
    mode: 'spread',
    left: 1516,
    top: 630,
    column: 1,
    updated: 123,
  };
  storePlace('202609', place);
  assert.deepEqual(loadPlace('202609', 112), place);
  // Page width was page-width reading: it becomes Scroll and keeps its page.
  storePlace('202609', { ...place, mode: 'page', pageOffset: 0.3 });
  const scrolled = loadPlace('202609', 112);
  assert.equal(scrolled.mode, 'scroll');
  assert.equal(scrolled.page, 14);
  assert.equal(scrolled.pageOffset, 0.3);
  // Column lands at Spread, Fit, with a clean frame.
  storePlace('202609', { ...place, mode: 'column' });
  const migrated = loadPlace('202609', 112);
  assert.equal(migrated.mode, 'spread');
  assert.equal(migrated.zoom, 1);
  assert.equal(migrated.left, 0);
  assert.equal(migrated.top, 0);
  assert.equal(migrated.page, 14);
  assert.equal('article' in migrated, false);
  // Article places lose their article field; the print page remains.
  storePlace('202609', { ...place, article: 'blue-book', articleTop: 740 });
  assert.deepEqual(loadPlace('202609', 112), place);
  // The view is a preference per device class: phones default to Scroll.
  assert.deepEqual(loadPreferences(), {
    warm: true,
    motion: 'curl',
    pinned: true,
    viewDesktop: 'spread',
    viewPhone: 'scroll',
  });
  data.set(
    'atlantic:reader-preferences',
    JSON.stringify({
      fontSize: 26,
      mobileControls: 'always',
      motion: 'simple',
      pinned: false,
      warm: false,
      viewDesktop: 'scroll',
      viewPhone: 'page',
    }),
  );
  assert.deepEqual(loadPreferences(), {
    warm: false,
    motion: 'simple',
    pinned: false,
    viewDesktop: 'scroll',
    viewPhone: 'scroll',
  });
  delete globalThis.localStorage;
});
test('Actual print page 12 has four usable columns; sparse artwork stays one region', () => {
  const pages = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        new URL(
          '../public/reader-assets/202609/index.json.gz',
          import.meta.url,
        ),
      ),
    ),
  );
  const columns = pageColumns(pages[13].words);
  assert.equal(columns.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.ok(columns[i].width > 0.18 && columns[i].width < 0.3);
    if (i) assert.ok(columns[i].x > columns[i - 1].x);
  }
  assert.equal(pageColumns([]).length, 1);
});
test('An illustrated opener enlarges actual prose without treating its headline as a column', () => {
  const pages = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        new URL(
          '../public/reader-assets/202511/index.json.gz',
          import.meta.url,
        ),
      ),
    ),
  );
  const columns = pageColumns(pages[27].words);
  assert.equal(columns.length, 3);
  for (const c of columns) {
    assert.ok(c.width < 0.36);
    assert.ok(c.y > 0.6);
  }
});
