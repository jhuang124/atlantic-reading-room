import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { columnFit, pageColumns } from '../app/reader/columns.ts';

const pages = JSON.parse(
  gunzipSync(readFileSync('public/reader-assets/202609/index.json.gz')),
);
// Physical page 30 is a two-column prose page of "Did al-Qaeda Succeed?".
const words = pages[29].words;

test('smart zoom fits the tapped column to the phone width', () => {
  const columns = pageColumns(words);
  assert.equal(columns.length, 2);
  const left = columnFit(words, 0.25, 359, 359);
  const right = columnFit(words, 0.75, 359, 359);
  assert.ok(left && right);
  assert.equal(left.x, columns[0].x);
  assert.equal(right.x, columns[1].x);
  // The column, magnified, is exactly the target width.
  assert.ok(Math.abs(left.width * 359 * left.zoom - 359) < 0.5);
  assert.ok(left.zoom > 1.8 && left.zoom < 3);
});

test('a tap in the gutter or margin takes the nearest column', () => {
  const columns = pageColumns(words);
  const margin = columnFit(words, 0.005, 359, 359);
  assert.equal(margin?.x, columns[0].x);
  const far = columnFit(words, 0.999, 359, 359);
  assert.equal(far?.x, columns[1].x);
});

test('pages without columns decline, and zoom never passes the cap', () => {
  assert.equal(columnFit([], 0.5, 359, 359), null);
  assert.equal(columnFit(undefined, 0.5, 359, 359), null);
  // The cover has no prose: one wide fallback measure is not worth fitting.
  assert.equal(columnFit(pages[0].words, 0.5, 359, 359), null);
  const capped = columnFit(words, 0.25, 100, 2000);
  assert.equal(capped?.zoom, 4);
});
