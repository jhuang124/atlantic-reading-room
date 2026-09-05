import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PageRasterCache,
  warmTurnPages,
  pageRasters,
} from '../app/reader/page-raster.ts';

globalThis.devicePixelRatio = 1;
globalThis.document = { createElement: () => ({ width: 0, height: 0 }) };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fakePDF(render = () => ({ promise: Promise.resolve(), cancel() {} })) {
  let renders = 0;
  return {
    numPages: 100,
    get renders() {
      return renders;
    },
    async getPage(number) {
      return {
        getViewport: ({ scale }) => ({
          width: 100 * scale,
          height: 100 * scale,
        }),
        render: (options) => {
          renders++;
          return render(number, options);
        },
      };
    },
  };
}
test('Visible page, prefetch, and curl share a single raster, including in-flight work', async () => {
  let finish;
  const pdf = fakePDF(() => ({
    promise: new Promise((r) => {
      finish = r;
    }),
    cancel() {},
  }));
  const cache = pageRasters(pdf);
  const visible = cache.get(1, 100);
  const curl = cache.get(1, 100);
  assert.equal(visible, curl);
  await tick();
  assert.equal(pdf.renders, 1);
  finish();
  const canvas = await visible;
  assert.equal(await cache.get(1, 100), canvas);
  assert.equal(cache.peek(1), canvas);
  assert.equal(pdf.renders, 1);
  cache.dispose();
});
test('Raster size and display density remain part of the cache key', async () => {
  const pdf = fakePDF(),
    cache = pageRasters(pdf);
  assert.equal((await cache.get(1, 100, 1)).width, 100);
  assert.equal((await cache.get(1, 100, 2)).width, 200);
  assert.equal((await cache.get(1, 150, 2)).width, 300);
  assert.equal(pdf.renders, 3);
});
test('Working set evicts least recently used pages and honors a byte budget', async () => {
  const pdf = fakePDF(),
    cache = new PageRasterCache(pdf, 100_000, 12);
  await cache.get(1, 100);
  await cache.get(2, 100); // 80 KB
  await cache.get(1, 100); // retain recently visited page
  await cache.get(3, 100);
  assert.ok(cache.peek(1));
  assert.equal(cache.peek(2), undefined);
  assert.ok(cache.peek(3));
  await cache.get(2, 100);
  assert.equal(pdf.renders, 4);
  const limited = new PageRasterCache(pdf, 1_000_000, 1);
  await limited.get(1, 100);
  await limited.get(2, 100);
  assert.equal(limited.peek(1), undefined);
});
test('Failed render can be retried instead of poisoning the cache', async () => {
  let fail = true;
  const pdf = fakePDF(() => ({
    promise: fail ? Promise.reject(Error('transient')) : Promise.resolve(),
    cancel() {},
  }));
  const cache = pageRasters(pdf);
  await assert.rejects(cache.get(1, 100), /transient/);
  fail = false;
  assert.ok(await cache.get(1, 100));
  assert.equal(pdf.renders, 2);
});
test('Closing a PDF cancels active work and cannot repopulate the cache', async () => {
  let reject,
    cancelled = 0;
  const pdf = fakePDF(() => ({
    promise: new Promise((_, r) => {
      reject = r;
    }),
    cancel() {
      cancelled++;
      reject(Error('cancelled'));
    },
  }));
  const cache = pageRasters(pdf),
    pending = cache.get(1, 100);
  const rejected = assert.rejects(pending, /cancelled/);
  await tick();
  cache.dispose();
  await rejected;
  assert.equal(cancelled, 1);
  assert.equal(cache.peek(1), undefined);
  await assert.rejects(cache.get(1, 100), /closed/);
});
test('Cancelling speculative warmup stops the next pages, not a shared visible render', async () => {
  const abort = new AbortController();
  let finish;
  const pdf = fakePDF(() => ({
    promise: new Promise((r) => {
      finish = r;
    }),
    cancel() {
      assert.fail('shared work must not be cancelled');
    },
  }));
  const warmed = warmTurnPages(pdf, [0, 1, 1, 2, 3, 101], 100, abort.signal);
  await tick();
  const visible = pageRasters(pdf).get(1, 100);
  abort.abort();
  finish();
  await warmed;
  await visible;
  assert.equal(pdf.renders, 1);
});
