import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
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
test('A complete print and article place round-trips with 26px text preference', () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
  const place = {
    page: 14,
    zoom: 1.7,
    mode: 'column',
    left: 1516,
    top: 630,
    column: 1,
    updated: 123,
    article: 'blue-book',
    articleTop: 740,
  };
  storePlace('202609', place);
  assert.deepEqual(loadPlace('202609', 112), place);
  data.set(
    'atlantic:reader-preferences',
    JSON.stringify({
      fontSize: 26,
      motion: 'simple',
      pinned: false,
      warm: false,
    }),
  );
  assert.deepEqual(loadPreferences(), {
    fontSize: 26,
    motion: 'simple',
    pinned: false,
    warm: false,
  });
  delete globalThis.localStorage;
});
test('Actual print page 12 has four usable columns; sparse artwork stays one region', () => {
  const pages = JSON.parse(
    gunzipSync(fs.readFileSync(
      new URL('../public/reader-assets/202609/index.json.gz', import.meta.url),
    )),
  );
  const columns = pageColumns(pages[13].words);
  assert.equal(columns.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.ok(columns[i].width > 0.18 && columns[i].width < 0.3);
    if (i) assert.ok(columns[i].x > columns[i - 1].x);
  }
  assert.equal(pageColumns([]).length, 1);
});
test('Selected article editions preserve source pages and remove opener extraction artifacts', () => {
  for (const id of [
    'blue-book',
    'look-closer-september',
    'look-closer-august',
  ]) {
    const a = JSON.parse(
      fs.readFileSync(
        new URL(`../public/reader-assets/articles/${id}.json`, import.meta.url),
      ),
    );
    assert.ok(
      a.sections.every(
        (s) =>
          a.pages.includes(s.page) && s.paragraphs.every((p) => p.length > 30),
      ),
    );
    if (id === 'blue-book') {
      assert.ok(
        a.sections[0].paragraphs[0].includes('Abstraction in Modern Art'),
      );
      assert.ok(a.sections[0].paragraphs[0].includes('Neurobiology'));
      assert.ok(
        a.sections
          .at(-1)
          .paragraphs.at(-1)
          .endsWith('All they have to do is write it.'),
      );
    }
  }
});
