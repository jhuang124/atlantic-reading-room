import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { PageRasterCache } from '../app/reader/page-raster.ts';
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

test('Shared rasters preserve actual PDF pixels and selectable text at two resolutions', async () => {
  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync('public/reader-assets/202609.pdf')),
    standardFontDataUrl:
      process.cwd() + '/public/reader-assets/pdfjs/standard_fonts/',
    wasmUrl: process.cwd() + '/public/reader-assets/pdfjs/wasm/',
  });
  const pdf = await task.promise;
  const cache = new PageRasterCache(pdf);
  globalThis.document = { createElement: () => createCanvas(1, 1) };
  try {
    const page = await pdf.getPage(70),
      base = page.getViewport({ scale: 1 });
    for (const width of [360, 720]) {
      const viewport = page.getViewport({ scale: width / base.width });
      const reference = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({
        canvas: reference,
        viewport,
        transform: [1, 0, 0, 1, 0, 0],
      }).promise;
      const shared = await cache.get(70, width, 1);
      assert.deepEqual(
        shared.toBuffer('image/png'),
        reference.toBuffer('image/png'),
      );
      assert.equal(await cache.get(70, width, 1), shared);
    }
    assert.ok(
      (await page.getTextContent()).items.some((item) => item.str?.trim()),
    );
  } finally {
    delete globalThis.document;
    cache.dispose();
    await task.destroy();
  }
});
